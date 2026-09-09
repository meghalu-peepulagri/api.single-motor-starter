# Schedule Logic — How It Actually Works

This describes the real behavior of motor scheduling today: how a schedule gets created, how it's sent to the device, how the app decides what happened to it, and where the actual limits/rules live. Written in plain terms — no API endpoints or database internals — so anyone (app, hardware, support) can use it to reason about a specific schedule's behavior.

---

## 1. Creating a schedule

A schedule is either **time-based** (runs between a start time and an end time) or **cyclic** (repeats an ON-duration / OFF-duration pattern within a window). Each schedule belongs to exactly one motor, and can optionally repeat on specific days of the week.

Every schedule needs a **device slot** — a number from **1 to 15** — because the device only has 15 storage slots per motor for schedules. This is a hard hardware limit, not a software choice.

**How slots are assigned:**
- The app looks at which slots (1–15) are currently occupied by that motor's *active* schedules — a schedule that's been deleted or failed no longer counts as occupying its slot.
- It picks the **lowest free number** in that range for the new schedule.
- If all 15 slots are genuinely full of active schedules, creating a 16th is rejected outright rather than silently assigning an invalid slot number.

This means slot numbers get reused over time as old schedules finish or get deleted — you won't see slot numbers climb past 15 in normal use. (This was a real bug until recently — a version of this logic used to just keep counting upward forever, so a motor with a long history could end up with schedules numbered 16, 17, 18... which don't correspond to any real slot on the device. That's fixed — slots are now always picked from the actual 1–15 pool.)

---

## 2. Sending schedules to the device

Schedules aren't sent to the device the instant they're created — they get pushed in batches:

- Up to **12 schedules per motor** are considered for sending in one sync round.
- Because a single MQTT message can't carry that many at once, they're split into **packets of at most 6 schedules each**. So 12 schedules become 2 packets; 6 or fewer schedules go out in a single packet.
- Each packet is tagged with its position (first/last) so the device knows when it's received the complete batch.
- **Multi-motor devices** send each motor's batch independently — M1 and M2 have entirely separate slot numbering and separate sync batches, since they're independent slot tables on the device.

The device is expected to acknowledge receiving each packet. If it doesn't acknowledge in time, the app retries sending it.

---

## 3. What happens after a schedule starts running

Once a schedule's start time arrives, the app doesn't get a special "it's running" message — it just watches the device's normal, ongoing status updates (voltage/current/state) and checks whether the motor's state and current schedule match what was expected.

**When the schedule's end time passes**, the app looks back at what actually happened and settles on one of these outcomes:

| Outcome | What it means |
|---|---|
| **Completed** | The motor ran for the full planned duration |
| **Partial** | The motor started, but stopped before running the full planned time |
| **Missed** | The window came and went, but the motor never actually started |
| **Failed** | The device never even confirmed it received the schedule in the first place |

The difference between **Missed** and **Failed** matters: Missed means the device had the schedule and was supposed to run it, but for whatever reason (power loss, manual override, a fault) it didn't. Failed means the schedule never even made it onto the device successfully — a communication problem, not a runtime one.

---

## 4. Manual actions

A user (or the app on their behalf) can directly:

- **Stop** a running/upcoming schedule
- **Restart** a stopped schedule (it goes back to being scheduled/pending, ready to run again)
- **Delete** a schedule — if the device already has it, a delete command is sent to remove it from that slot; if the device never got it in the first place, it's just removed from our records with nothing to tell the device

Every one of these actions is logged with a timestamp and who/what triggered it (a person, the device, or the system itself evaluating outcomes automatically) — so there's always a clear trail for "why did this schedule get stopped" type questions.

---

## 5. Cyclic schedules — a slightly different rule

For a cyclic schedule (repeating ON/OFF pattern within a window, rather than one continuous run), "did it complete" isn't about the whole window running — it's about whether the **total ON time** across all the cycles added up to what was planned. A cyclic schedule that got interrupted partway through its cycles is judged the same way: full planned ON-time reached → Completed, partial → Partial, nothing → Missed.

---

## 6. Repeat days

A schedule that repeats on specific days doesn't need a new schedule created for each day — one schedule carries the full set of active days. Removing a single day from an already-repeating schedule doesn't delete the whole schedule; it just turns that one day off while keeping the rest active. If every day gets removed one by one, the schedule is then considered fully done and gets marked deleted.

---

## Summary of the hard limits

| Limit | Value | Why |
|---|---|---|
| Device slots per motor | 15 | Physical firmware storage limit |
| Schedules considered per sync round | 12 | App-side batching choice |
| Schedules per MQTT packet | 6 | Message-size practicality |
