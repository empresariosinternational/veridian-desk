/*
 * Veridian Desk — Arduino Uno / classic Nano, USB serial at 115200 baud.
 * SSD1306 I2C OLED: clock (SCK/SCL) -> A5, SDA -> A4.
 * HC-SR04 sonar: Trig -> 7, Echo -> 6. Status LED -> 5 via 220 ohms.
 * The laptop records audio; the Arduino sends sonar start/release events.
 * See ../README.md for setup and the serial protocol.
 */
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

const uint8_t PIN_TRIG = 7;
const uint8_t PIN_ECHO = 6;
const uint8_t PIN_LED = 5;
const uint8_t SCREEN_HEIGHT = 64;  // Change to 32 for a 128x32 OLED.
const uint8_t TRIGGER_CM = 20;
const uint8_t RELEASE_CM = 30;
const unsigned long SAMPLE_MS = 80;
const unsigned long HOST_TIMEOUT_MS = 3500;

Adafruit_SSD1306 display(128, SCREEN_HEIGHT, &Wire, -1);
bool oledReady = false;
bool hostConnected = false;
bool urgent = false;
bool gestureLatched = false;
bool gestureTriggered = false;
uint8_t nearSamples = 0;
uint8_t farSamples = 0;
unsigned long lastHost = 0;
unsigned long lastSample = 0;
unsigned long lastScreen = 0;
unsigned long lastTrigger = 0;
unsigned int distanceCm = 0;
char status[10] = "OFFLINE";
char message[45] = "Connect Arduino in /desk";
char command[64];
uint8_t commandLength = 0;
bool commandOverflow = false;

bool isStatus(const char *value) {
  return strcmp_P(value, PSTR("IDLE")) == 0 || strcmp_P(value, PSTR("ARMED")) == 0 ||
         strcmp_P(value, PSTR("LISTENING")) == 0 || strcmp_P(value, PSTR("WORKING")) == 0 ||
         strcmp_P(value, PSTR("FILED")) == 0 || strcmp_P(value, PSTR("OFFLINE")) == 0;
}

void readCommand() {
  // A complete frame fits in the board's small serial receive buffer.
  while (Serial.available()) {
    const char c = Serial.read();
    if (c == '\r') continue;
    if (c != '\n') {
      if (commandLength < sizeof(command) - 1) command[commandLength++] = c;
      else commandOverflow = true;
      continue;
    }
    command[commandLength] = '\0';
    if (!commandOverflow && strncmp_P(command, PSTR("STATE|"), 6) == 0) {
      char *nextStatus = command + 6;
      char *flag = strchr(nextStatus, '|');
      if (flag) {
        *flag++ = '\0';
        char *line = strchr(flag, '|');
        if (line) {
          *line++ = '\0';
          if (isStatus(nextStatus) && (strcmp_P(flag, PSTR("0")) == 0 || strcmp_P(flag, PSTR("1")) == 0)) {
            strcpy(status, nextStatus);
            strncpy(message, line, sizeof(message) - 1);
            message[sizeof(message) - 1] = '\0';
            urgent = flag[0] == '1';
            hostConnected = true;
            lastHost = millis();
          }
        }
      }
    }
    commandLength = 0;
    commandOverflow = false;
  }
}

void sampleSonar(unsigned long now) {
  if (now - lastSample < SAMPLE_MS) return;
  lastSample = now;
  digitalWrite(PIN_TRIG, LOW);
  delayMicroseconds(2);
  digitalWrite(PIN_TRIG, HIGH);
  delayMicroseconds(10);
  digitalWrite(PIN_TRIG, LOW);
  // A missing echo must not hang the USB connection. Zero means no reading.
  const unsigned long duration = pulseIn(PIN_ECHO, HIGH, 25000UL);
  distanceCm = duration ? duration / 58UL : 0;

  if (distanceCm >= 2 && distanceCm <= TRIGGER_CM) {
    farSamples = 0;
    if (nearSamples < 3) nearSamples++;
    if (nearSamples == 3 && !gestureLatched) {
      // Latch even while disarmed: arming with a hand already present must
      // not start recording. Move away, then make a new gesture.
      gestureLatched = true;
      if (hostConnected && strcmp_P(status, PSTR("ARMED")) == 0 &&
          (lastTrigger == 0 || now - lastTrigger >= 1500)) {
        lastTrigger = now;
        gestureTriggered = true;
        Serial.println(F("{\"event\":\"sonar\"}"));
      }
    }
  } else {
    nearSamples = 0;
    // Hysteresis and five clear samples prevent chatter at the boundary.
    if (distanceCm == 0 || distanceCm >= RELEASE_CM) {
      if (farSamples < 5) farSamples++;
      if (farSamples == 5 && gestureLatched) {
        gestureLatched = false;
        // Release must reach the browser even before its LISTENING update
        // arrives (for example, while microphone permission is pending).
        if (gestureTriggered) {
          gestureTriggered = false;
          if (hostConnected) Serial.println(F("{\"event\":\"sonar-release\"}"));
        }
      }
    } else farSamples = 0;
  }
}

void updateLed(unsigned long now) {
  bool on = false;
  if (hostConnected && strcmp_P(status, PSTR("OFFLINE")) != 0) {
    if (strcmp_P(status, PSTR("LISTENING")) == 0 || strcmp_P(status, PSTR("FILED")) == 0) on = true;
    else if (urgent) on = (now / 125) % 2;
    else if (strcmp_P(status, PSTR("WORKING")) == 0) on = (now / 150) % 2;
    else if (strcmp_P(status, PSTR("ARMED")) == 0) on = (now % 1000) < 100;
  }
  digitalWrite(PIN_LED, on ? HIGH : LOW);
}

void updateScreen(unsigned long now) {
  if (!oledReady || now - lastScreen < 250) return;
  lastScreen = now;
  display.clearDisplay();
  display.setCursor(0, 0);
  display.println(F("Veridian Desk"));
  display.println(status);
  if (SCREEN_HEIGHT == 64) display.println();
  display.println(message);
  if (SCREEN_HEIGHT == 64) {
    display.setCursor(0, 56);
    if (distanceCm) {
      display.print(distanceCm);
      display.print(F(" cm"));
    } else display.print(F("No echo"));
    if (urgent) display.print(F("  URGENT"));
  }
  display.display();
}

void setup() {
  pinMode(PIN_TRIG, OUTPUT);
  pinMode(PIN_ECHO, INPUT);
  pinMode(PIN_LED, OUTPUT);
  digitalWrite(PIN_TRIG, LOW);
  digitalWrite(PIN_LED, LOW);
  Serial.begin(115200);
  Wire.begin();  // Uno / classic Nano: SDA=A4, SCL=A5.
  // Adafruit boards commonly use 0x3D; other SSD1306 modules use 0x3C.
  for (uint8_t address = 0x3C; address <= 0x3D; address++) {
    Wire.beginTransmission(address);
    if (Wire.endTransmission() == 0) {
      oledReady = display.begin(SSD1306_SWITCHCAPVCC, address);
      break;
    }
  }
  if (oledReady) {
    display.setTextSize(1);
    display.setTextColor(SSD1306_WHITE);
    display.setTextWrap(true);
  }
  Serial.println(F("{\"event\":\"ready\"}"));
}

void loop() {
  readCommand();
  const unsigned long now = millis();
  if (hostConnected && now - lastHost > HOST_TIMEOUT_MS) {
    hostConnected = false;
    urgent = false;
    strcpy_P(status, PSTR("OFFLINE"));
    strcpy_P(message, PSTR("Connect Arduino in /desk"));
  }
  sampleSonar(now);
  updateLed(now);
  updateScreen(now);
}
