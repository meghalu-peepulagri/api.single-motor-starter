# Device Protocol & Behavior — For Hardware Team Review

This document describes how the server currently interprets and behaves around three things your firmware directly participates in: **fault/alert bits**, **schedule and motor event exchange**, and **calibration/settings sync**. It's written for the hardware team to confirm the contract matches firmware intent — not as a backend implementation reference, so there are no API endpoints or database tables here, only the actual data exchanged with the device and how the server currently acts on it.

Where something looks like a gap or gets treated in a way that might not match firmware's intent, it's flagged explicitly as **⚠ Please confirm** rather than assumed correct.

---

## 1. Fault & Alert Bit Mapping

The device reports two independent values in its live-data stream: a **fault** byte and an **alert** byte. Both use the same bit layout — each bit is one condition, and the device can report several at once by setting multiple bits together.

| Bit | Hex | Decimal | Meaning |
|---|---|---|---|
| 0 | 0x01 | 1 | Dry Run |
| 1 | 0x02 | 2 | Overload |
| 2 | 0x04 | 4 | Locked Rotor |
| 3 | 0x08 | 8 | Current Imbalance |
| 4 | 0x10 | 16 | Frequent Start |
| 5 | 0x20 | 32 | Phase Failure |
| 6 | 0x40 | 64 | Low Voltage |
| 7 | 0x80 | 128 | High Voltage |
| 8 | 0x100 | 256 | Voltage Imbalance |
| 9 | 0x200 | 512 | Phase Reversal |
| 10 | 0x400 | 1024 | Frequency Deviation |
| **11** | **0x800** | **2048** | **⚠ Please confirm — this bit is not currently mapped to anything on our side. If firmware sets it, tell us what condition it represents so we can add it.** |
| 12 | 0x1000 | 4096 | Output Phase Failure |

A value of `4095` is bits 0–11 set — since bit 11 has no assigned meaning yet, it shows up in the number but not in the fault description. If your firmware never actually sets bit 11, this is a non-issue; if it does, this is a genuine gap we need your input on.

**Alert vs. Fault — same conditions, two severity levels:**
- **Alert** = an early warning. Sent at a looser threshold, motor keeps running.
- **Fault** = the actual trip. Sent at a stricter threshold, motor stops.

Each condition has a matching pair of settings — an alert-level threshold and a fault-level threshold — plus a **trip delay** (how many seconds the condition must persist before it's treated as real, to avoid tripping on a brief blip) and a **recovery value** (the value the reading has to return to before the fault is considered cleared).

| Condition | Alert threshold | Fault threshold | Trip delay |
|---|---|---|---|
| Low Voltage | `lva` | `lvf` | `lvt_time` |
| High Voltage | `hva` | `hvf` | `hvt_time` |
| Dry Run | `dr` | `f_dr` | `drt_time` |
| Overload | `ol` | `f_ol` | `olt_time` |
| Locked Rotor | `lr` | `f_lr` | `irt_time` |
| Current Imbalance | `ci` | `f_ci` | `cit_time` |
| Phase Failure | — | — | `ipt_time` |
| Output Phase Failure | — | `f_opf` | `opt_time` |

(These short codes — `lvf`, `dr`, `f_ol`, etc. — are the actual field names in the settings packet exchanged with the device, so they're included here as the shared contract, not as internal naming.)

Each condition also has an individual on/off switch (can be disabled entirely) and a **recovery** value/time — the point at which a tripped fault is considered cleared and the motor is allowed to restart automatically.

**⚠ Please confirm:** there's also a per-fault bitwise "enable" flag (separate from the individual on/off switches above) that the server stores and forwards to the device untouched — we don't interpret its bits on our side at all, only firmware does. Worth double-checking both sides agree on what each bit in that flag means.

---

## 2. Schedule & Motor Event Exchange

### Schedule lifecycle — what the device is expected to do

1. **App sends a schedule** — one MQTT message per device, telling it: which slot (1–15, each motor has its own independent slot table), start/end time, which days to repeat, and whether it's a simple time-window run or a cyclic on/off pattern.
2. **Device stores it and acknowledges.** If the device can't take any more schedules (all slots in use), that's a real limit — the device only has 15 slots per motor, and the app now enforces this ceiling on its own side too so it won't send a 16th.
3. **At the scheduled time, the device runs the motor and reports it started.** This comes through as part of the device's normal live-data stream, not a separate message — the app watches for the motor's state/current schedule reference to detect a real start.
4. **At the end time, the device stops (or the app calculates it as done).** The app tracks whether the full planned duration was actually run:
   - Ran the full time → marked **Completed**
   - Ran only part of it → marked **Partial**
   - Never started at all when the window passed → marked **Missed**
   - Device never even acknowledged receiving the schedule → marked **Failed**
5. **Stop / Restart / Delete** — each is its own outbound command; the device is expected to acknowledge each one individually.

**⚠ Please confirm:** the app currently detects "did this schedule actually run" purely by watching ordinary live-data telemetry (motor state + whatever schedule reference the device reports), not a dedicated "schedule ran" confirmation message. If firmware has a more explicit way of confirming a schedule executed, we may be under-using it.

### Motor state & mode events — what gets recorded when

Every time the motor's power state (ON/OFF) or mode (Manual/Auto/Schedule) changes, it gets logged as one of two kinds of event:

- **Device-driven** — the device itself changed state (e.g. auto mode turned the motor on because conditions were met, or a schedule fired). This comes in through the normal live-data stream.
- **Command-driven** — the app told the device to change state or mode, and the device acknowledged it (confirmed, rejected, or "already in that state").

Both are recorded with a timestamp so the activity history shows a clear "who/what changed this and when" trail — useful for diagnosing "why did the motor turn off at 2am" type questions.

---

## 3. Calibration & Default Settings

### What "Calibration" actually means here

Two unrelated things share the word "calibration" in different places — worth being precise about which is which:

**(A) Rated-current calibration (Test Run)** — this is the farmer-facing feature: run the motor for a short test, and use the measured current draw to set the motor's rated current (FLC), which then drives all the percentage-based protection thresholds (dry run %, overload %, etc.).

> **⚠ Please confirm — this is the one gap worth flagging most.** As currently implemented, the app does **not** average the current reading over the test — it takes whatever the *most recent* live-data reading was at the moment the test is marked complete. If the motor's current happens to spike or dip right as the test ends, that single reading becomes the permanent rated-current setting. If firmware/product intent was for this to be an averaged reading over the whole test window, this needs fixing on our side.

**(B) Settings sync (historically called "Calibration" in the packet protocol)** — this is a completely different thing: pushing the full set of protection settings (thresholds, delays, enables) down to the device after they've been changed, and getting a confirmation back that the device applied them. Nothing about sensor calibration happens here — it's really "settings push + ack." If the packet-type name "CALIBRATION" for this exchange is intentional/historical from firmware's side, that's fine to keep; just noting it for anyone reading packet logs who might expect calibration data in it and not find any.

**⚠ Please confirm:** the raw sensor calibration constants (voltage/current sensor gain and offset values) exist as settings fields but are **not currently included** in the regular settings-sync packet sent to devices. If firmware expects to receive these routinely, they're currently missing from that exchange — worth checking whether that's intentional or a gap.

### Default settings

Every new device starts with one shared set of standard, safe protection values (voltage limits, trip delays, etc.) — the same starting point for every device before a farmer has configured or calibrated anything. When a single-motor device is later converted to a dual-motor box, the existing motor keeps its own settings unchanged, and the new second motor starts from these same defaults.

### Settings limits shown to the user

The min/max ranges shown in the app for each setting (e.g. "voltage threshold: 300–550V") are for guiding what a person can type in — the app does not currently block a save server-side if a value falls outside that range beyond basic sanity checks (non-negative, correct decimal precision). If firmware enforces its own hard limits on the device side regardless, that's the actual safety net; the app-side ranges are advisory only.

---

