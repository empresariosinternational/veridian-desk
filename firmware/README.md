# Veridian Desk — Arduino node

Open [desk_node/desk_node.ino](desk_node/desk_node.ino) in Arduino IDE. The node connects to the laptop over USB, displays desk status, and uses a hand gesture at the sonar to start the web application's microphone. Moving the hand away stops capture. The laptop supplies the microphone and handles browser speech recognition; the Arduino sends start and release events. Re-upload the updated sketch if the board previously used timed eight-second clips.

## Wiring

Target: **Arduino Uno R3 or classic 5 V Nano (ATmega328P)**, an **HC-SR04 ultrasonic sensor**, and an **I²C Adafruit SSD1306 OLED**. The sketch defaults to 128×64; change `SCREEN_HEIGHT` to `32` for a 128×32 display. It automatically checks addresses `0x3C` and `0x3D`.

| Part | Arduino pin | Notes |
|---|---|---|
| OLED SCK / SCL | **A5** | I²C clock; configure the display for I²C, rather than SPI. |
| OLED SDA | **A4** | I²C data. |
| OLED VCC / GND | Supply / GND | Use the supply voltage specified for your OLED breakout. |
| Sonar Trig | **7** | HC-SR04 trigger input. |
| Sonar Echo | **6** | HC-SR04 echo output. |
| Sonar VCC / GND | 5 V / GND | Common ground with the Arduino and OLED. |
| Status LED anode | **5 through 220–330 Ω** | LED cathode to GND; active high. |

A5 is the hardware **SCL** pin on these boards. An OLED marked SCK must support I²C mode for this wiring. The HC-SR04 echo is 5 V; a 3.3 V board would need level conversion and different board-specific I²C setup.

## Setup

1. In Arduino IDE Library Manager, install **Adafruit SSD1306** and **Adafruit GFX Library**, accepting the **Adafruit BusIO** dependency.
2. Open `desk_node/desk_node.ino`, select your Uno or classic Nano and serial port, then upload. Close Serial Monitor afterward so the browser can open the port.
3. Run the web app: `cd web && npm install && npm run dev`. Open **http://localhost:3000/desk** in desktop **Chrome or Edge**. A hosted app must use HTTPS; plain HTTP over a LAN IP does not provide the required browser APIs.
4. Click **Connect Arduino** and select the board's USB serial port. The app sends status heartbeats at **115200 baud**; the board may reset when the port opens.
5. Select the speaker and spoken language. Click **Arm**, then move your hand **2–20 cm** in front of the sonar. Allow microphone access when the browser asks.
6. Keep your hand near the sonar while speaking. Move it at least **30 cm** away, or out of sensor range, to **stop and file**. Five clear samples debounce the release (about **400 ms**). **Stop and file** also finishes capture. Browser recognition may end sooner and has a 60-second limit. **Disarm**, loss of browser focus, or USB disconnection discards a pending sonar capture.

Move the hand away (at least **30 cm**, or out of sensor range) before another gesture. Each successful filing consumes the armed window: click Arm again for the next note. An unused arm expires after two minutes. Holding a hand near the sensor before arming does not start capture; move it away and make a fresh gesture. Manual **Hold to talk** remains available without hardware.

The OLED is optional: if it is absent or allocation fails, sonar and the LED still work. There is no Wi-Fi setup or separate serial bridge service. No application API key is needed for browser speech recognition; the browser may use its own speech service. Only recognized text goes to the desk.

## Status LED on pin 5

| State | LED | OLED |
|---|---|---|
| Idle / disconnected | Off | `IDLE` / `OFFLINE` |
| Armed, waiting for a gesture | Brief pulse once per second | `ARMED` |
| Microphone capture active | Solid on | `LISTENING` |
| Finishing recognition / processing | Fast blink | `WORKING` |
| Filed | Solid on for the app's filed interval | `FILED` |
| Urgent work | Fast blink, except while listening or showing filed | Current state + `URGENT` |

If browser heartbeats stop for **3.5 seconds**, the board displays `OFFLINE`, switches the LED off and stops issuing triggers. The app cancels capture when its server becomes unreachable. Recording indicators reflect browser capture state; the Arduino does not contain or electrically control a microphone.

## USB serial protocol

Each frame ends in a newline; the baud rate is **115200**. Do not leave Serial Monitor connected while using the app.

Arduino → browser:

```json
{"event":"ready"}
{"event":"sonar"}
{"event":"sonar-release"}
```

The sonar emits a single `sonar` event after **three consecutive near readings**, only when the browser reports `ARMED`. After a triggered gesture, **five consecutive clear readings** (at least 30 cm away or no echo) emit one `sonar-release` event and re-enable the gesture. Release is sent even if the browser has not yet reported `LISTENING`, so moving away during a microphone permission prompt cancels that pending capture. Gestures have a 1.5-second minimum interval. Sampling runs every 80 ms with a bounded 25 ms echo timeout; the 20–30 cm gap provides hysteresis against sensor noise.

Browser → Arduino, on state changes and every second:

```text
STATE|ARMED|0|Wave near sonar or hold to talk
STATE|LISTENING|0|Listening - speak now
STATE|WORKING|0|Working
STATE|FILED|1|Filed once - Marisol
```

Fields: `STATE|status|urgent (0 or 1)|ASCII display text`. Status is `IDLE`, `ARMED`, `LISTENING`, `WORKING`, `FILED` or `OFFLINE`. Text is capped at 44 ASCII characters so even a `LISTENING` frame fits the Uno's 64-byte serial receive buffer. Firmware uses fixed buffers, rejects malformed/oversize commands, and stores constant status strings in flash to leave room for the SSD1306 framebuffer on the Uno/Nano's 2 KB SRAM.

The server's existing `LISTENING` status denotes an armed capture window. The USB bridge displays `ARMED` until browser recognition actually starts, then `LISTENING`. Sonar events stay local to the connected tab; the server never opens a microphone.

References: [Arduino Uno I²C pin assignments](https://docs.arduino.cc/retired/boards/arduino-uno-rev3-with-long-pins/), [Adafruit SSD1306 setup](https://learn.adafruit.com/monochrome-oled-breakouts/arduino-library-and-examples), [Chrome Web Serial API](https://developer.chrome.com/docs/capabilities/serial).
