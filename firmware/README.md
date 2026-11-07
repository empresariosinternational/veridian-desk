# Veridian Desk node

The node is a physical echo of the desk's state, not a second brain. It shows when the desk is listening, working, filed or urgent. It never records audio: voice in and voice out are the laptop plus Deepgram, push-to-talk only.

**The SunFounder Universal Maker Sensor Kit (ASIN B0D3GWJK82) has no microcontroller and no microphone.** Add a Raspberry Pi Pico W or an ESP32 to wire it. With no board, the on-screen node at `/desk` is the device. The laptop works the same with the node unplugged.

## Wiring (Pico W pins; change the numbers at the top of `desk_node.py` for an ESP32)

| Part | Pin | Notes |
|---|---|---|
| Button module | GP14 → GND | Internal pull-up. Press = arm / disarm. |
| PIR HC-SR501 | OUT → GP15, VCC → VBUS (5 V), GND | Presence banner only. It never starts the mic. |
| RGB LED (common cathode) | R → GP16, G → GP17, B → GP18 | Kit modules carry their own resistors; a bare LED needs 220 Ω per leg. Or a traffic-light module on the same pins with `LED_MODE = "traffic"`. |
| SSD1306 OLED 128×64 (I²C 0x3C) | SDA → GP4, SCL → GP5, VCC → 3V3, GND | `mpremote mip install ssd1306` first. |
| Passive buzzer | GP19, GND | One chirp per new urgent card. |

Leave the flame sensor, MQ-2 gas sensor, pump, motor and heart-rate sensor in the box. They are not part of this product.

## Run

1. On the laptop: `cd web && npm run dev -- -H 0.0.0.0`, then note the laptop's LAN IP.
2. In `desk_node.py`, set `WIFI_SSID`, `WIFI_PASS` and `DESK = "http://<laptop-ip>:3000"`.
3. Copy it to the board as `main.py` (Thonny, or `mpremote cp desk_node.py :main.py`) and reset the board.

## Protocol

| Call | Body | What happens |
|---|---|---|
| `GET /api/desk/state?view=node` | — | Polled every 1 s. Returns `{ status, line, lineAscii, color, blink, urgent, urgentId, presence, armed }` and nothing else. |
| `POST /api/desk/node?view=node` | `{"event":"button"}` | Toggles arm / disarm. Also accepts `"arm"`, `"disarm"` and `"presence"`. |

| Desk status | LED | OLED |
|---|---|---|
| `IDLE` | white (traffic: off) | `Veridian Desk`, or the urgent line |
| `LISTENING` (after Arm) | red | `Listening - Tidepath desk` |
| `WORKING` | amber | `Working - <name>` |
| `FILED` (about 2.5 s, then `IDLE`) | green | `Filed once - <name>` |
| any status + urgent | blinks | `URGENT: driver today` until someone accepts the shift |

The state machine follows `docs/node-clip.md`: IDLE → ARMED (consent) → LISTENING → WORKING → FILED → IDLE. Disarm returns to IDLE from anywhere and drops unfiled audio. An armed window that goes unused expires after 2 minutes.
