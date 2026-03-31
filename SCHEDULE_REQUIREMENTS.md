# Motor Scheduling — Requirements & Flow Document

## 1. System Actors

| Actor | Role |
|---|---|
| **Cloud Server** | Stores schedules in DB, sends MQTT commands to device, receives ACKs and live data |
| **PCB Device** | Executes schedules autonomously, responds to commands, publishes live telemetry |
| **User App** | Creates/manages schedules via Cloud API |

---

## 2. MQTT Topic Structure

| Direction | Topic | Purpose |
|---|---|---|
| Cloud → Device | `peepul/<MAC>/cmd` | Send commands (schedule, motor control, settings) |
| Device → Cloud | `peepul/<MAC>/status` | Send ACKs, live data, heartbeat, alerts |

`<MAC>` = device MAC address (testing) or PCB number (production allocation)

---

## 3. T Type Codes (Numeric)

### Cloud → Device (Requests)
| T | Name | Description |
|---|---|---|
| 1 | MOTOR_CONTROL | Turn motor on/off manually |
| 2 | MODE_CHANGE | Switch Manual / Auto mode |
| 3 | SCHEDULING | Create schedules OR stop/restart/delete schedules |
| 7 | SCHEDULING_DATA_REQUEST | Ask device to report its stored schedules |

### Device → Cloud (ACKs / Data)
| T | Name | Description |
|---|---|---|
| 33 | SCHEDULING_ACK | ACK for schedule create / update |
| 37 | SCHEDULING_DATA_REQUEST_ACK | Device reports its current schedule list |
| 40 | HEARTBEAT | Periodic keep-alive from device |
| 41 | LIVE_DATA | Motor telemetry (voltage, current, runtime) |
| 31 | MOTOR_CONTROL_ACK | ACK for motor on/off command |

---

## 4. Schedule Types

### 4.1 Time-Based (One-Time)
Motor runs continuously from `st` to `et` on the given date range.
- Optional: `pwr_rec=1` → if power cut happens, extend the run to compensate lost time (up to `plr` minutes)

```
06:00 ──────────────────────── 07:00
        Motor ON continuously
```

### 4.2 Cyclic
Motor alternates ON/OFF within the time window using `on` and `off` minutes.

```
06:00                                   07:00
  ON 10min | OFF 5min | ON 10min | OFF 5min | ON ...
```

- `pwr_rec` is always `0` for cyclic schedules

---

## 5. Schedule Payload Fields

| Field | Type | Example | Description |
|---|---|---|---|
| `id` | int | `3` | Per-device schedule ID (1–16) |
| `sd` | int | `260606` | Start date YYMMDD |
| `ed` | int | `260606` | End date YYMMDD |
| `st` | int | `600` | Start time HHMM (600 = 06:00) |
| `et` | int | `700` | End time HHMM (700 = 07:00) |
| `en` | 0/1 | `1` | Enable/disable this schedule |
| `cy` | 0/1 | `1` | 0 = Time-Based, 1 = Cyclic |
| `on` | int | `10` | Cyclic: motor ON duration (minutes) |
| `off` | int | `5` | Cyclic: motor OFF duration (minutes) |
| `pwr_rec` | 0/1 | `1` | Power loss recovery (Time-Based only) |

### Outer Payload Fields (D level)

| Field | Description |
|---|---|
| `idx` | Chunk index (1, 2, 3...) for large batches |
| `last` | `1` = this is the final chunk, `0` = more chunks follow |
| `sch_cnt` | Total number of schedules being sent across all chunks |
| `plr` | Max power loss recovery runtime in minutes (device-level) |
| `m1` | Array of schedule objects for Motor 1 |

---

## 6. Flow: Create Schedules

### Step-by-step

```
User App                Cloud Server              Device
   │                        │                       │
   │── POST /schedules ─────▶│                       │
   │                        │── Save to DB (PENDING) │
   │                        │                       │
   │        [Cron runs every N minutes]             │
   │                        │                       │
   │                        │── Fetch PENDING ───── │
   │                        │   schedules           │
   │                        │── Publish T=3 ────────▶│
   │                        │   {idx,last,sch_cnt,  │
   │                        │    plr, m1:[...]}     │
   │                        │                       │── Store in Flash/EEPROM
   │                        │◀── T=33, D:4 ─────────│ (ACK)
   │                        │                       │
   │                        │── Update DB ──────────│
   │                        │   PENDING→SCHEDULED   │
```

### Example: 3 schedules for June 6, split into 2 chunks (max 2 per chunk for demo)

**Chunk 1:**
```json
{
  "T": 3,
  "S": 1,
  "D": {
    "idx": 1,
    "last": 0,
    "sch_cnt": 3,
    "plr": 30,
    "m1": [
      { "id": 1, "sd": 260606, "ed": 260606, "st": 600, "et": 700, "en": 1, "pwr_rec": 1 },
      { "id": 2, "sd": 260606, "ed": 260606, "st": 800, "et": 900, "en": 1, "pwr_rec": 1 }
    ]
  }
}
```

**Chunk 2 (last):**
```json
{
  "T": 3,
  "S": 2,
  "D": {
    "idx": 2,
    "last": 1,
    "sch_cnt": 3,
    "plr": 30,
    "m1": [
      { "id": 3, "sd": 260606, "ed": 260606, "st": 1000, "et": 1100, "en": 1, "cy": 1, "on": 10, "off": 5, "pwr_rec": 0 }
    ]
  }
}
```

**Device ACK (for each chunk):**
```json
{ "T": 33, "S": 1, "D": 4 }
```

---

## 7. Flow: Stop / Restart / Delete a Schedule

### The `ids` Field is a 16-bit Bitmask

The device supports up to **16 schedules per motor**. The `ids` field encodes which schedules to target:

```
ids = 1 << (schedule_id - 1)

Schedule 1  → ids = 1
Schedule 2  → ids = 2
Schedule 3  → ids = 4
Schedule 4  → ids = 8
Schedule 5  → ids = 16
Schedule 10 → ids = 512
Schedule 16 → ids = 32768
```

To target **multiple schedules in one command**, OR the values:
```
Stop schedule 2 and 4 → ids = 2 | 8 = 10
Delete schedules 1, 3, 5 → ids = 1 | 4 | 16 = 21
```

### Command Codes

| cmd | Action | Device Behavior |
|---|---|---|
| 1 | Stop / Pause | Halts schedule. Motor stops if running this schedule. Schedule stays in device memory. |
| 2 | Restart / Resume | Resumes a paused schedule. |
| 3 | Delete | Removes schedule from device Flash/EEPROM permanently. |

### Stop Schedule Example

**Cloud → Device:**
```json
{ "T": 3, "S": 5, "D": { "cmd": 1, "ids": 4 } }
```
*(ids=4 = schedule_id 3)*

**Device → Cloud (ACK):**
```json
{ "T": 33, "S": 5, "D": { "ids": 4, "ack": 1 } }
```

### Delete Multiple Schedules Example

**Cloud → Device:**
```json
{ "T": 3, "S": 6, "D": { "cmd": 3, "ids": 11 } }
```
*(ids=11 = binary 1011 = schedules 1, 2, 4)*

**Device → Cloud (ACK):**
```json
{ "T": 33, "S": 6, "D": { "ids": 11, "ack": 3 } }
```

---

## 8. How to Skip a Schedule on a Specific Date

The device has no "skip date" concept. The approach is:

1. **Before the unwanted day** → User pauses the schedule via the app (cmd=1)
2. **After the day passes** → User resumes the schedule (cmd=2)

This is intentional: keeps device firmware simple. Skip management is handled at the user/cloud level.

---

## 9. Flow: Live Data While Schedule is Running

Device publishes live telemetry every **2 minutes** when a schedule is active.

```json
{
  "T": 41,
  "S": 85,
  "D": {
    "G01": {
      "p_v": 2,
      "pwr": 1,
      "llv": [220.5, 219.8, 221.2],
      "m1": {
        "mode": 1,
        "m_s": 1,
        "amp": [5.2, 5.1, 5.3],
        "id": 3,
        "st": 1000,
        "cy": 0,
        "rt": 40,
        "flt": 4095,
        "alt": 4095,
        "l_on": 1,
        "l_of": 0
      }
    },
    "ct": "26/06/06,10:42:00"
  }
}
```

### Live Data Fields

| Field | Description |
|---|---|
| `G01` | Group (device gateway identifier) |
| `p_v` | Phase voltage type (1P / 3P) |
| `pwr` | Power availability (1=available) |
| `llv` | Line-to-Line voltages [R-Y, Y-B, B-R] |
| `m1.mode` | Motor mode (0=Manual, 1=Auto/Schedule) |
| `m1.m_s` | Motor state (0=OFF, 1=ON) |
| `m1.amp` | Phase currents [R, Y, B] |
| `m1.id` | **Schedule ID currently running** ← links telemetry to schedule |
| `m1.st` | Schedule start time |
| `m1.cy` | Cyclic (1) or Time-Based (0) |
| `m1.rt` | Runtime so far (minutes) |
| `m1.flt` | Fault bitmask |
| `m1.alt` | Alert bitmask |
| `m1.l_on` | Last ON duration |
| `m1.l_of` | Last OFF duration |
| `ct` | Device timestamp (YY/MM/DD,HH:MM:SS) |

**Key**: `m1.id` field directly links every telemetry reading to the schedule that caused it.

---

## 10. Flow: Device Boot Sync

When device boots (power-on or restart):

**Device → Cloud:**
```json
{ "T": "DEVICE SYNCH REQUEST", "S": 1, "D": { "m1": 0, "m2": 0 } }
```

**Cloud → Device (ACK):**
```json
{
  "T": "DEVICE SYNCH REQUEST ACK",
  "D": {
    "rtc": 72235,
    "m1": { "id": 3, "rt": 40, "cy": 0 },
    "m2": { "id": 4, "rt": 40, "cy": 1 }
  }
}
```

Cloud should respond with the currently active schedule per motor and RTC time for clock sync.

---

## 11. Flow: Query Device Schedule State

Cloud can ask the device to report all its stored schedules at any time:

**Cloud → Device:**
```json
{ "T": 7, "S": 1, "D": { "m1": 1 } }
```

**Device → Cloud:**
```json
{
  "T": 37,
  "S": 1,
  "D": {
    "idx": 1, "last": 1, "sch_cnt": 3, "plr": 30,
    "m": [{
      "mid": 1,
      "sch": [
        { "id": 1, "sd": 260606, "ed": 260606, "st": 630, "et": 730, "cy": 0, "ack": 1 },
        { "id": 2, "sd": 260606, "ed": 260606, "st": 900, "et": 1000, "cy": 1, "on": 10, "off": 5, "ack": 1 }
      ]
    }]
  }
}
```

---

## 12. Schedule Status Lifecycle

```
                    ┌─────────┐
          Create    │ PENDING │  Created, not yet sent to device
                    └────┬────┘
                         │ Sent via MQTT + ACK received
                    ┌────▼────┐
                    │SCHEDULED│  Device has the schedule, waiting for start time
                    └────┬────┘
                         │ Start time reached (cron evaluates)
                    ┌────▼────┐
                    │ RUNNING │  Motor is ON per this schedule
                    └────┬────┘
             ┌───────────┼───────────┐
             │           │           │
        ┌────▼───┐  ┌────▼────┐  ┌──▼────────────────┐
        │STOPPED │  │COMPLETED│  │ WAITING_NEXT_CYCLE │  (repeat schedules)
        └────────┘  └─────────┘  └──────────┬─────────┘
        (cmd=1)    (et reached)              │ Next cycle time reached
                                        ┌───▼───┐
                                        │RUNNING│
                                        └───────┘
```

---

## 13. Constraints & Rules

| Constraint | Value |
|---|---|
| Max schedules per device | **16** (16-bit bitmask for `ids`) |
| Schedules per sync chunk | Max 8 per MQTT payload |
| Live data interval | Every 2 minutes while motor is running |
| Heartbeat interval | Every 30 seconds |
| Power loss recovery max | `plr` minutes (default 30) |
| CYCLIC + power_loss_recovery | Not allowed (always false) |
| Schedule IDs | 1–16 per motor, reuse deleted IDs |

---

## 14. Conflict Rules (Server-Side)

Before saving a new schedule, the server checks for time overlap:
- Same motor
- Date range overlaps: `new.sd <= existing.ed AND new.ed >= existing.sd`
- Time window overlaps: `new.st < existing.et AND new.et > existing.st`
- For repeat (weekly) schedules: check `days_of_week` array overlap instead of date range

---

## 15. What Server Must Do (Missing Today)

| Action | Required MQTT | Current Status |
|---|---|---|
| Create schedule | T=3 with m1 array → await T=33 ACK | ✅ Done |
| Stop schedule (cmd=1) | T=3 with cmd=1, ids=bitmask → await T=33 ACK | ❌ Only DB updated |
| Restart schedule (cmd=2) | T=3 with cmd=2, ids=bitmask → await T=33 ACK | ❌ Only DB updated |
| Delete schedule (cmd=3) | T=3 with cmd=3, ids=bitmask → await T=33 ACK | ❌ Only DB updated |
| ids field | Must be `1 << (schedule_id - 1)` | ❌ Not implemented |
| Device boot sync response | Respond to `DEVICE SYNCH REQUEST` | ❓ Needs verification |
| Schedule query response | Respond to T=7 | ❓ Needs verification |
