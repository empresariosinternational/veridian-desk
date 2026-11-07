"""Exercise the actual sketch with simulated hardware. Requires Python 3 and g++."""
from pathlib import Path
import subprocess
import tempfile


SKETCH = Path(__file__).resolve().parents[1] / "desk_node" / "desk_node.ino"

# The hardware stubs let us compile the whole sketch and advance sensor time
# without sleeping. The gesture logic comes directly from the production sketch.
WIRE = r"""
#pragma once
#include <cstdint>
#include <cstring>
#include <string>
#include <vector>
#define F(value) value
#define PSTR(value) value
#define strcmp_P strcmp
#define strncmp_P strncmp
#define strcpy_P strcpy
#define LOW 0
#define HIGH 1
#define OUTPUT 1
#define INPUT 0
unsigned long fakeTime = 0;
unsigned long fakeEcho = 0;
unsigned long millis() { return fakeTime; }
unsigned long pulseIn(uint8_t, int, unsigned long) { return fakeEcho; }
void pinMode(uint8_t, int) {}
void digitalWrite(uint8_t, int) {}
void delayMicroseconds(int) {}
struct SerialMock {
  std::vector<std::string> events;
  void begin(int) {}
  int available() { return 0; }
  char read() { return 0; }
  void println(const char *value) { events.emplace_back(value); }
} Serial;
struct WireMock {
  void begin() {}
  void beginTransmission(uint8_t) {}
  int endTransmission() { return 1; }
} Wire;
"""

OLED = r"""
#pragma once
#define SSD1306_SWITCHCAPVCC 0
#define SSD1306_WHITE 1
struct Adafruit_SSD1306 {
  Adafruit_SSD1306(int, int, WireMock *, int) {}
  bool begin(int, uint8_t) { return false; }
  void clearDisplay() {}
  void setCursor(int, int) {}
  template<class T> void println(T) {}
  void println() {}
  template<class T> void print(T) {}
  void display() {}
  void setTextSize(int) {}
  void setTextColor(int) {}
  void setTextWrap(bool) {}
};
"""

TESTS = r"""
const std::string START = "{\"event\":\"sonar\"}";
const std::string RELEASE = "{\"event\":\"sonar-release\"}";

void reset(const char *state = "ARMED") {
  fakeTime = fakeEcho = lastSample = lastTrigger = farSince = 0;
  nearSamples = 0;
  gestureLatched = gestureTriggered = farPending = false;
  hostConnected = true;
  strcpy(status, state);
  Serial.events.clear();
}

void sample(unsigned int cm, unsigned long elapsed = SAMPLE_MS) {
  fakeEcho = cm * 58UL;
  fakeTime += elapsed;
  sampleSonar(fakeTime);
}

void readings(unsigned int cm, int count) {
  while (count-- > 0) sample(cm);
}

int main() {
  // Near starts capture; keeping the hand near for ten seconds never releases it.
  reset();
  readings(10, 2);
  assert(Serial.events.empty());
  sample(10);
  assert(Serial.events == std::vector<std::string>{START});
  strcpy(status, "LISTENING");
  readings(10, 125);
  assert(Serial.events.size() == 1);

  // One full second of far readings, independent of the number of samples.
  sample(35);
  sample(35, 920);
  assert(Serial.events.size() == 1);
  sample(35);
  assert(Serial.events == (std::vector<std::string>{START, RELEASE}));
  readings(35, 20);
  assert(Serial.events.size() == 2);

  // A normal 80 ms sampling cadence releases at the first sample after 1 s.
  reset();
  readings(10, 3);
  readings(30, 13);
  assert(Serial.events.size() == 1);
  sample(30);
  assert(Serial.events == (std::vector<std::string>{START, RELEASE}));

  // Brief movement away and intermediate readings reset the full-second timer.
  reset();
  readings(10, 3);
  readings(35, 10);
  sample(10);
  readings(35, 10);
  sample(25);
  readings(0, 13);
  assert(Serial.events.size() == 1);
  sample(0);
  assert(Serial.events == (std::vector<std::string>{START, RELEASE}));

  // Release must reach a pending microphone prompt before LISTENING arrives.
  reset();
  readings(10, 3);
  readings(35, 14);
  assert(strcmp(status, "ARMED") == 0);
  assert(Serial.events == (std::vector<std::string>{START, RELEASE}));

  // Pre-existing hands and disarmed/offline gestures cannot open the mic.
  reset("IDLE");
  readings(10, 3);
  strcpy(status, "ARMED");
  readings(10, 10);
  readings(35, 14);
  assert(Serial.events.empty());
  readings(10, 3);
  assert(Serial.events == std::vector<std::string>{START});
  reset();
  hostConnected = false;
  readings(10, 3);
  readings(35, 14);
  assert(Serial.events.empty());

  // Elapsed-time subtraction continues to work when millis() wraps around.
  reset();
  readings(10, 3);
  fakeTime = ULONG_MAX - 500;
  lastSample = fakeTime - SAMPLE_MS;
  readings(35, 13);
  assert(Serial.events.size() == 1);
  sample(35);
  assert(Serial.events == (std::vector<std::string>{START, RELEASE}));

  std::cout << "Sonar firmware checks passed: near trigger, long hold, one-second "
               "release, noise reset, permission prompt, consent, offline, clock rollover.\n";
}
"""


def main():
    with tempfile.TemporaryDirectory(prefix="veridian-sonar-test-") as directory:
        root = Path(directory)
        (root / "Wire.h").write_text(WIRE)
        (root / "Adafruit_GFX.h").write_text("#pragma once\n")
        (root / "Adafruit_SSD1306.h").write_text(OLED)
        source = '#include <cassert>\n#include <climits>\n#include <iostream>\n'
        source += f'#include "{SKETCH}"\n' + TESTS
        (root / "sonar.cpp").write_text(source)
        executable = root / "sonar-test"
        subprocess.run([
            "g++", "-std=c++17", "-Wall", "-Wextra", "-Werror",
            "-I", str(root), str(root / "sonar.cpp"), "-o", str(executable),
        ], check=True)
        subprocess.run([str(executable)], check=True)


if __name__ == "__main__":
    main()
