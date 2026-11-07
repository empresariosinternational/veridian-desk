# Veridian Node Clip — hardware spec

A backpack-keychain-sized personal agent node running Veridian as its OS identity.
It is a consent-controlled context and identity gateway — **not** a wearable GPU.

## Gen 0 — leverage AGENC ONE (no custom EE required)

[AGENC ONE](https://agenc-one.com/) is AgenC's own pocket-operator device (Tetsuo
Corp): a Raspberry Pi Zero 2 W (quad Cortex-A53) with a 1.69" IPS Whisplay HAT,
WM8960 audio codec (voice via Grok TTS), PiSugar 3 UPS with 1200 mAh auto-boot
battery, and 256 GB microSD. It registers on-chain on Solana, stakes reputation,
claims marketplace tasks, executes autonomously, and settles SOL rewards through
escrow — with local signer custody and **visible transaction intent before
anything is signed**, which matches our unsigned-tx-approval principle exactly.

Strategy: instead of designing gen-1 hardware first, ship **Veridian as the
software layer on AGENC ONE**:

- Veridian personality/debriefs + Agentscene device pairing on stock AGENC ONE.
- The device's marketplace loop (claim → execute → escrow settle) becomes our
  first physical agent-commerce surface; Agentscene shows live device/task state.
- The screen + speaker give us the visible-consent surface (status, task, intent)
  that the Node Clip spec requires.
- What AGENC ONE does not cover (push-to-talk capture, hardware mic cutoff,
  NFC identity exchange, rotating BLE proximity) stays scoped to gen 1 below.

This gets a real device into demos while the gen-1 wearable is validated.

## Gen 1 — custom clip

## Components

- Low-power MCU with BLE; optional UWB for coarse distance; NFC for deliberate
  profile exchange.
- Secure element for device keys/signing; secure boot; signed A/B OTA firmware.
- Dual MEMS mics, physical push-to-talk button, **hardware mic-cutoff slider**
  (electrically authoritative), RGB recording/status LED, haptic motor.
- USB-C charging, 500–1,000 mAh battery, temporary encrypted audio buffer only.
- Water/dust-resistant enclosure with locking carabiner loop.

## Division of labor

| On the clip | On the phone |
|---|---|
| VAD, push-to-talk, audio buffering | Speech-to-text, speaker segmentation |
| Encryption, device auth | PII tagging, embeddings, small local model |
| Rotating BLE identifiers, NFC | Contact exchange, event/networking mode |
| Haptics, LED indicators | Secure sync, remote inference connection |

An optional larger "Node Pro" puck (Jetson Orin-class, bag-mounted, actively
cooled) can handle local vision/transcription/small-model inference for booths,
events, and vehicles.

## Recording state machine

```
IDLE → USER_REQUESTED → CONSENT_CHECK → RECORDING_WITH_VISIBLE_INDICATOR
→ ENCRYPTED_TRANSFER → TRANSCRIPTION → PII_CLASSIFICATION → EXTRACTION
→ USER_REVIEW → APPROVED_CRM_WRITE → RAW_AUDIO_EXPIRATION
```

No transition may bypass consent or the visible indicator. Extracted data is a
proposal until approved. Users can delete sessions, redact speakers, exclude
from AI memory, and set retention. Recording laws vary by jurisdiction —
production launch requires jurisdiction-specific legal review.

## Proximity networking (consented encounters, not tracking)

1. User enables an event-scoped networking window (explicit start + expiry).
2. Clip broadcasts rotating, unlinkable identifiers.
3. Opted-in devices exchange minimal signed capability cards.
4. Compatibility computed privately (locally or via Arcium confidential compute).
5. Introduction proposed only if both policies permit, with a non-sensitive reason.
6. Both parties accept before identities/contacts are exchanged.

Never store maps of non-consenting people; never infer sensitive attributes;
coarse distance categories only — no exact coordinates exchanged.

## Device protocol (software-first)

Implement `HardwareTransport` + a web/mobile device simulator before any
firmware. Events: connect/disconnect, button, recording lifecycle,
`MIC_HARDWARE_DISABLED`, NFC exchange, proximity sighting, networking-mode
start/expiry, battery, firmware update.
