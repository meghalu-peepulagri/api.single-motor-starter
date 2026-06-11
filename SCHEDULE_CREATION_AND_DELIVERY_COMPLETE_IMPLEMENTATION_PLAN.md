# Schedule Creation and Delivery — Complete Implementation Plan

## Overview

This document covers the full end-to-end flow of how motor schedules are created on the frontend, prepared as payloads, delivered to devices via MQTT, and how the backend handles retry, batch gating, and future-date delivery via heartbeat.

---

## The Two Logics That Work Together

```
FRONTEND                          BACKEND
─────────────────────────────     ─────────────────────────────
1. Payload Preparation            1. Anchor Check (batch gate)
   - ID allocation                   - findMaxAckedEndDatePerStarter
   - Row expansion                   - today > maxEndDate → release
   - 3-day window check              - else → withhold next batch

2. Immediate MQTT publish         2. Heartbeat retry
   - Publishes within today+3        - Sends what frontend couldn't
   - ACK → SCHEDULED                 - Sends future-date schedules
   - No ACK → stays PENDING          - Retries until ACK received
```

---

## Phase 1 — Frontend: Payload Preparation

### Step 1 — Fetch existing records
Fetch all current schedules for this motor from DB before creating anything.

```
allDeviceRecords = [
  { id:10, schedule_id:1, device_schedule_id:1, schedule_status:"SCHEDULED" },
  { id:11, schedule_id:2, device_schedule_id:2, schedule_status:"COMPLETED" },
  { id:12, schedule_id:3, device_schedule_id:3, schedule_status:"FAILED" },
  { id:13, schedule_id:4, device_schedule_id:4, schedule_status:"RUNNING" },
]
```

### Step 2 — Separate terminal vs non-terminal

| Status | Terminal? | Slot reusable? |
|---|---|---|
| `FAILED` | YES | ✅ |
| `DELETED` | YES | ✅ |
| `RUNNING` | NO | ✗ |
| `SCHEDULED` | NO | ✗ |
| `COMPLETED` | NO | ✗ |
| `PENDING` | NO | ✗ |
| `MISSED` | NO | ✗ |

### Step 3 — allocateUniqueIds for `schedule_id`

```
takenIds = non-terminal schedule_ids = { 1, 2, 4 }

walk 1→64, pick smallest free IDs:
  candidate=1 → taken, skip
  candidate=2 → taken, skip
  candidate=3 → FREE ✓
  candidate=4 → taken, skip
  candidate=5 → FREE ✓
  candidate=6 → FREE ✓

allocatedIds = [3, 5, 6]
```

### Step 4 — allocateUniqueIds for `device_schedule_id` (independent)

```
takenDeviceIds = non-terminal device_schedule_ids = { 1, 2, 4 }
allocatedDeviceIds = [3, 5, 6]   ← same logic, independent allocation
```

Max capacity = **64 slots**. If full → save blocked with error toast.

### Step 5 — Delete stale terminal rows before reusing IDs

```
staleRecordIds = rows where:
  motor_id === motorId
  AND isTerminalStatus(schedule_status) === true
  AND schedule_id IN allocatedIds

→ bulkDeleteSchedulesAPI(staleRecordIds)
```

### Step 6 — Expand rows (dates × entries)

```
startDate=260611, endDate=260613, selectedDays=[Mon, Wed]
entries = [
  { startTime:"06:00", endTime:"18:00" },
  { startTime:"20:00", endTime:"22:00" }
]

Walk June 11 → June 13, keep Mon/Wed only:
  June 11 = Wed ✓
  June 12 = Thu ✗ skip
  June 13 = Mon ✓

Cross-product (dates outer, entries inner):
  Row 1: date=260611, start=0600, end=1800
  Row 2: date=260611, start=2000, end=2200
  Row 3: date=260613, start=0600, end=1800
  Row 4: date=260613, start=2000, end=2200
```

### Step 7 — Attach allocated IDs to each row

```
Row 1 → schedule_id=3,  device_schedule_id=3
Row 2 → schedule_id=5,  device_schedule_id=5
Row 3 → schedule_id=6,  device_schedule_id=6
Row 4 → schedule_id=7,  device_schedule_id=7
```

### Step 8 — POST /motor-schedules

Backend saves all rows as `schedule_status=PENDING`, `acknowledgement=0`.

---

## Phase 2 — Frontend: 3-Day Window Decision

```
publishWindowLimit = today + 3 days

For each row:
  schedule_start_date within today+3? → inWindow
  schedule_start_date beyond today+3? → outOfWindow

IF outOfWindow > 0 → show warning dialog
  "X schedules saved as PENDING — device won't receive until date approaches"
  User confirms → proceed

inWindow rows    → MQTT publish now (Phase 3)
outOfWindow rows → stay PENDING in DB → backend delivers later (Phase 5)
```

---

## Phase 3 — Frontend: Immediate MQTT Publish

### MQTT Payload Sent to Device (T:3)

```json
{
  "T": 3,
  "S": 4821,
  "D": {
    "idx": 1,
    "last": 1,
    "sch_cnt": 4,
    "plr": 30,
    "m1": [
      { "id": 3, "sd": 260611, "ed": 260611, "st": 600,  "et": 1800, "st_ep": 1749602400, "ed_ep": 1749645600, "en": 1, "pwr_rec": 0 },
      { "id": 5, "sd": 260611, "ed": 260611, "st": 2000, "et": 2200, "st_ep": 1749650400, "ed_ep": 1749657600, "en": 1, "pwr_rec": 0 }
    ]
  }
}
```

> `m1[].id` = `device_schedule_id` (NOT the DB `schedule_id`)

### Run in parallel after API save

```
mqttPromise  = publishScheduleWrite(deviceId, mqttItems)   → waits ACK 30s
fetchPromise = after 1s, fetch new DB records by schedule_id + date
               → builds pendingRecordIdsRef and pendingSlotUpdatesRef
```

### ACK Result Cases

**Case A — Full ACK (all slots confirmed):**
```
sentIds     = [3, 5, 6, 7]
ackedIds    = [3, 5, 6, 7]
recordIdsToAck = all matched DB record ids
bulkAckScheduleMutation({ ids, slot_map })
→ records PENDING → SCHEDULED ✓
```

**Case B — Partial ACK (some slots confirmed):**
```
sentIds     = [3, 5, 6, 7]
ackedIds    = [3, 5]          ← device only confirmed 2 slots
→ slot 3, 5 → SCHEDULED ✓
→ slot 6, 7 → stay PENDING → backend heartbeat retries
```

**Case C — No ACK / timeout:**
```
Retry dialog shown (up to 3 attempts)
If all fail → records stay PENDING
→ backend heartbeat retries automatically on next device ping
```

**Case D — All dates out of window (skipped):**
```
recordIdsToAck = []
toast.warning "saved as PENDING — outside 3-day window. Use Republish later."
records stay PENDING
```

**Case E — Empty acked list (firmware quirk):**
```
Device sends ACK but with empty confirmed list
→ treat all as success
recordIdsToAck = all pending record ids
→ all SCHEDULED ✓
```

---

## Phase 4 — Backend: Anchor Check (Batch Gate)

Runs on every heartbeat AND every `/sync/pending` call.

### Query

```sql
SELECT starter_id, MAX(schedule_end_date)
FROM motor_schedules
WHERE acknowledgement = 1
  AND schedule_end_date >= today
  AND status != 'ARCHIVED'
  AND schedule_status NOT IN ('DELETED', 'FAILED')
GROUP BY starter_id
```

### Gate Logic

```
maxEndDate = anchorMap.get(starter.id)

today <= maxEndDate?
  YES → device still running current batch → skip, return early
  NO  → current batch expired → release next batch → continue to Phase 5
```

### Example

```
Batch 1 end date = 260615 (June 15)

June 13 → 260613 <= 260615 → TRUE  → Batch 2 withheld
June 14 → 260614 <= 260615 → TRUE  → Batch 2 withheld
June 15 → 260615 <= 260615 → TRUE  → Batch 2 withheld
June 16 → 260616 <= 260615 → FALSE → Batch 2 released ✓
```

---

## Phase 5 — Backend: Pending Schedules Delivery (Heartbeat Driven)

### Step 1 — Fetch pending schedules for this starter

```
findPendingSchedulesForStarter(starter.id)
  WHERE acknowledgement = 0
    AND schedule_status = 'PENDING'
    AND schedule_start_date >= today
```

### Step 2 — Apply today → today+2 window

```
records with start_date <= today+2 → include (send now)
records with start_date >  today+2 → skip   (not yet)
```

### Step 3 — Build MQTT payloads

```
buildDeviceSyncPayloads(records)
  → max 12 schedules per device
  → split into chunks of max 8 per MQTT message
  → each chunk: { payload, dbIds, scheduleIds }
```

### Step 4 — For each chunk

```
1. publishingMap.get(starter.id)?
     YES → already in flight → skip (next heartbeat will retry)

2. waitForPublishLock(starter.id)
     Settings sync (T:4) in progress → wait up to 30s
     If still locked after 30s → skip, retry next heartbeat

3. Re-verify still PENDING in DB
     SELECT WHERE id IN dbIds AND acknowledgement = 0
     If empty → already acked by concurrent heartbeat → skip

4. publishMultipleTimesInBackground(payload, starter)
     Attempt 1 → publish → wait 10s for ACK
     Attempt 2 → publish → wait 10s for ACK
     Attempt 3 → publish → wait  3s for ACK
     Returns true (ACK received) or false (all failed)
```

### Step 5 — On ACK success

```
Check schedulePartialAckMap for partial confirmation
  partialIds = confirmed device_schedule_ids from device

IF partialIds exist:
  confirmedSet = Set(partialIds)
  idsToUpdate = stillPending
    .filter(r => confirmedSet.has(r.schedule_id))
    .map(r => r.id)
  unmatched slots → stay PENDING (retry next heartbeat)
ELSE (full ACK):
  idsToUpdate = all stillPending ids

DB UPDATE WHERE id IN idsToUpdate:
  schedule_status = 'SCHEDULED'
  acknowledgement = 1
  acknowledged_at = now()

assignDeviceScheduleIds(starter.id, confirmedRecords)
```

### Step 6 — On failure

```
logs warning
schedulePartialAckMap cleaned up
→ all stay PENDING → retried on next heartbeat automatically
```

---

## Combined Timeline Example

```
Day 1 — June 11:
  User creates:
    Batch A: slots 1,2,3 → dates June 11–15  (inWindow today+3)
    Batch B: slots 4,5,6 → dates June 20–25  (outOfWindow)

  Frontend:
    Batch A → MQTT published immediately → ACK → SCHEDULED ✓
    Batch B → saved as PENDING only (beyond today+3, no MQTT)

Day 3 — June 13:
  Device heartbeat → pushPendingSchedulesForStarter
    anchor check: maxEndDate=260615, today=260613
    260613 <= 260615 → TRUE → Batch B withheld

Day 6 — June 16:
  Device heartbeat
    anchor check: maxEndDate=260615, today=260616
    260616 <= 260615 → FALSE → gate opens ✓
    findPendingSchedulesForStarter → Batch B (start_date=260620)
    today+2 = 260618
    260620 > 260618 → outside window → NOT sent yet

Day 8 — June 18:
  Device heartbeat
    anchor check passes
    today+2 = 260620
    Batch B start_date = 260620 ≤ 260620 → IN WINDOW ✓
    → Batch B published to device → ACK → SCHEDULED ✓
```

---

## ID Flow Summary

```
schedule_id        → DB identifier (frontend allocates, backend validates)
device_schedule_id → physical device slot (frontend allocates, backend assigns)

In MQTT payload:  m1[].id = device_schedule_id   (device sees this)
In DB update:     WHERE id IN dbIds              (server uses DB primary key)

Bridge: stillPending array holds both { id (DB pk), schedule_id (slot) }
        → match ACK by schedule_id → update DB by id
```

---

## Responsibility Matrix

| Responsibility | Frontend | Backend |
|---|---|---|
| Allocate `schedule_id` | ✅ | ✅ validate uniqueness |
| Allocate `device_schedule_id` | ✅ | ✅ assign in slot order |
| Expand dates × entries | ✅ | ✅ also expands |
| 3-day window check | ✅ decides what to send now | ✅ enforces today+2 on heartbeat |
| MQTT publish (immediate) | ✅ | ✗ |
| ACK handling | ✅ partial ACK aware | ✅ partial ACK aware |
| Anchor check (batch gate) | ✗ | ✅ |
| Future date delivery | ✗ | ✅ heartbeat driven |
| Retry on failure | ✅ 3 manual retries | ✅ every heartbeat |
| Duplicate publish guard | ✗ | ✅ publishingMap |
| Race condition guard | ✗ | ✅ re-verify PENDING |
