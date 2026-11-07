# Veridian Desk node — MicroPython for a Raspberry Pi Pico W or an ESP32.
#
# A physical echo of the desk, not a second brain. It never records audio:
# voice stays on the laptop (push-to-talk + Deepgram).
#   - Button: arm / disarm (consent)        -> POST /api/desk/node {"event":"button"}
#   - LED: idle white/off, listening red, working amber, filed green, urgent blink
#   - OLED (SSD1306 128x64, I2C 0x3C): one status line
#   - PIR (HC-SR501): "someone is at the desk" banner only, never the mic
#   - Passive buzzer: one short chirp when an urgent card appears
#
# Copy ssd1306.py to the board first:  mpremote mip install ssd1306

import time
import network
import ujson
import urequests as requests
from machine import I2C, PWM, Pin

WIFI_SSID = "YOUR_WIFI"
WIFI_PASS = "YOUR_PASSWORD"
DESK = "http://192.168.1.50:3000"  # the laptop running: npm run dev -- -H 0.0.0.0

LED_MODE = "rgb"  # "rgb" (common-cathode RGB module) or "traffic" (red/yellow/green module)
PIN_BUTTON, PIN_PIR, PIN_BUZZ = 14, 15, 19
PIN_R, PIN_G, PIN_B = 16, 17, 18  # traffic mode: red, yellow, green
I2C_SDA, I2C_SCL = 4, 5

RGB = {"white": (30000, 30000, 30000), "red": (65535, 0, 0), "amber": (65535, 18000, 0), "green": (0, 45000, 0), "off": (0, 0, 0)}
TRAFFIC = {"white": (0, 0, 0), "red": (1, 0, 0), "amber": (0, 1, 0), "green": (0, 0, 1), "off": (0, 0, 0)}

button = Pin(PIN_BUTTON, Pin.IN, Pin.PULL_UP)
pir = Pin(PIN_PIR, Pin.IN)
buzz = PWM(Pin(PIN_BUZZ))
buzz.duty_u16(0)
if LED_MODE == "rgb":
    leds = [PWM(Pin(p)) for p in (PIN_R, PIN_G, PIN_B)]
    for led in leds:
        led.freq(1000)
else:
    leds = [Pin(p, Pin.OUT) for p in (PIN_R, PIN_G, PIN_B)]

try:
    import ssd1306

    oled = ssd1306.SSD1306_I2C(128, 64, I2C(0, sda=Pin(I2C_SDA), scl=Pin(I2C_SCL)))
except Exception:
    oled = None  # fail soft: the LED still works without a screen


def set_led(color):
    if LED_MODE == "rgb":
        for led, duty in zip(leds, RGB.get(color, RGB["off"])):
            led.duty_u16(duty)
    else:
        for led, on in zip(leds, TRAFFIC.get(color, TRAFFIC["off"])):
            led.value(on)


def screen(status, line):
    if not oled:
        return
    oled.fill(0)
    oled.text("Veridian Desk", 0, 0)
    oled.text(status, 0, 16)
    for i in range(0, min(len(line), 48), 16):
        oled.text(line[i : i + 16], 0, 32 + (i // 16) * 10)
    oled.show()


def chirp():
    buzz.freq(2200)
    buzz.duty_u16(20000)
    time.sleep_ms(120)
    buzz.duty_u16(0)


def wifi():
    wlan = network.WLAN(network.STA_IF)
    wlan.active(True)
    if not wlan.isconnected():
        wlan.connect(WIFI_SSID, WIFI_PASS)
        for _ in range(60):
            if wlan.isconnected():
                break
            time.sleep_ms(250)
    return wlan.isconnected()


def call(method, path, body=None):
    try:
        if method == "GET":
            r = requests.get(DESK + path)
        else:
            r = requests.post(DESK + path, data=ujson.dumps(body), headers={"Content-Type": "application/json"})
        view = r.json()
        r.close()
        return view
    except Exception:
        return None


screen("booting", "")
set_led("white")
wifi()

view = None
last_poll = 0
last_press = 0
last_presence = 0
pir_was = 0
blink_on = True
chirped_for = None
prev_button = 1

while True:
    now = time.ticks_ms()

    pressed = button.value() == 0 and prev_button == 1
    prev_button = button.value()
    if pressed and time.ticks_diff(now, last_press) > 300:
        last_press = now
        view = call("POST", "/api/desk/node?view=node", {"event": "button"}) or view

    occupied = pir.value()
    if occupied and not pir_was and time.ticks_diff(now, last_presence) > 30000:
        last_presence = now
        call("POST", "/api/desk/node?view=node", {"event": "presence"})
    pir_was = occupied

    if time.ticks_diff(now, last_poll) > 1000:
        last_poll = now
        blink_on = not blink_on
        if not wifi():
            view = None
        else:
            view = call("GET", "/api/desk/state?view=node") or view
        if view:
            if view.get("urgent") and view.get("urgentId") != chirped_for:
                chirped_for = view.get("urgentId")
                chirp()
            color = view.get("color", "white")
            set_led("off" if view.get("blink") and not blink_on else color)
            screen(view.get("status", ""), view.get("lineAscii", ""))
        else:
            set_led("off" if blink_on else "white")
            screen("OFFLINE", "laptop not found - desk still works")

    time.sleep_ms(40)
