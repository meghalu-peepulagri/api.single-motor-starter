/**
 * PCB Device Simulator
 *
 * Simulates a physical starter box (PCB) connected to the MQTT broker.
 * Use this to test scheduling flows without real hardware.
 *
 * Usage:
 *   npx tsx src/scripts/device-simulator.ts <DEVICE_MAC>
 *
 * Example:
 *   npx tsx src/scripts/device-simulator.ts AA:BB:CC:DD:EE:FF
 *
 * The simulator will:
 *   - Connect to EMQX using your .env credentials
 *   - Subscribe to peepul/<MAC>/cmd
 *   - Respond with proper ACKs on peepul/<MAC>/status
 *   - Automatically execute schedules and publish live data every 2 minutes
 *   - Send heartbeat every 30 seconds
 */

import mqtt from "mqtt";
import * as dotenv from "dotenv";
dotenv.config();

// ─── Config ─────────────────────────────────────────────────────────────────

const DEVICE_MAC = process.argv[2] || "AA:BB:CC:11:22:33";
const BROKER_URL = process.env.EMQX_API_KEY!;
const USERNAME   = process.env.EMQX_USERNAME!;
const PASSWORD   = process.env.EMQX_PASSWORD!;

if (!BROKER_URL) {
  console.error("[SIM] ERROR: EMQX_API_KEY not set in .env");
  process.exit(1);
}

const CMD_TOPIC    = `peepul/${DEVICE_MAC}/cmd`;    // Cloud → Device
const STATUS_TOPIC = `peepul/${DEVICE_MAC}/status`; // Device → Cloud

// ─── T Type Codes ─────────────────────────────────────────────────────────────

const T = {
  // Cloud sends these
  MOTOR_CONTROL:            1,
  MODE_CHANGE:              2,
  SCHEDULING:               3,
  SCHEDULING_DATA_REQUEST:  7,

  // Device sends these
  MOTOR_CONTROL_ACK:        31,
  SCHEDULING_ACK:           33,
  SCHEDULING_DATA_ACK:      37,
  HEARTBEAT:                40,
  LIVE_DATA:                41,
};

// ─── Device State ─────────────────────────────────────────────────────────────

interface StoredSchedule {
  id: number;        // schedule_id (1–16)
  sd: number;        // start date YYMMDD
  ed: number;        // end date YYMMDD
  st: number;        // start time HHMM as number (e.g. 600 = 06:00)
  et: number;        // end time HHMM as number
  en: number;        // enabled
  cy?: number;       // cyclic
  on?: number;       // cycle on minutes
  off?: number;      // cycle off minutes
  pwr_rec?: number;  // power loss recovery
  paused: boolean;
}

const deviceMemory = {
  schedules: new Map<number, StoredSchedule>(),  // schedule_id → schedule
  motorState: { m1: 0, m2: 0 },                  // 0=OFF, 1=ON
  currentScheduleId: null as number | null,       // schedule running right now
  runtimeMinutes: 0,
};

let seqCounter = 1;
const seq = () => seqCounter++;

// ─── MQTT Client ──────────────────────────────────────────────────────────────

const client = mqtt.connect(BROKER_URL, {
  username: USERNAME,
  password: PASSWORD,
  clientId: `pcb_sim_${DEVICE_MAC.replace(/:/g, "")}_${Date.now()}`,
  clean: true,
});

printBanner();

client.on("connect", () => {
  log("Connected to MQTT broker");
  client.subscribe(CMD_TOPIC, { qos: 1 }, (err) => {
    if (err) log(`ERROR subscribing: ${err.message}`);
    else     log(`Subscribed to: ${CMD_TOPIC}`);
  });

  // Boot: send device sync request
  setTimeout(sendBootSyncRequest, 1000);

  // Heartbeat every 30s
  setInterval(sendHeartbeat, 30_000);

  // Live data check every 2 minutes
  setInterval(tickLiveData, 120_000);

  // First live data tick after 5 seconds
  setTimeout(tickLiveData, 5_000);
});

client.on("message", (topic, raw) => {
  let payload: any;
  try {
    payload = JSON.parse(raw.toString());
  } catch {
    log(`WARN: Could not parse message on ${topic}`);
    return;
  }

  log(`\n◀ RECEIVED [T=${payload.T}]:\n${JSON.stringify(payload, null, 2)}`);
  handleCommand(payload);
});

client.on("error", (err) => log(`ERROR: ${err.message}`));
client.on("offline", () => log("WARN: Client went offline"));

// ─── Command Handler ──────────────────────────────────────────────────────────

function handleCommand(payload: any) {
  switch (payload.T) {
    case T.SCHEDULING:
      handleScheduling(payload);
      break;
    case T.MOTOR_CONTROL:
      handleMotorControl(payload);
      break;
    case T.SCHEDULING_DATA_REQUEST:
      handleScheduleDataRequest(payload);
      break;
    default:
      log(`WARN: Unknown T=${payload.T}, ignoring`);
  }
}

// ─── Schedule Creation / Update ───────────────────────────────────────────────

function handleScheduling(payload: any) {
  const { D, S } = payload;

  // Distinguish: creation has m1 array; update has cmd field
  if (D?.cmd !== undefined) {
    handleScheduleUpdate(S, D);
  } else if (Array.isArray(D?.m1)) {
    handleScheduleCreation(S, D);
  } else {
    log("WARN: Unrecognised SCHEDULING payload structure");
  }
}

function handleScheduleCreation(S: number, D: any) {
  const schedules: any[] = D.m1;
  log(`▶ SCHEDULE CREATION: chunk idx=${D.idx}, last=${D.last}, sch_cnt=${D.sch_cnt}, plr=${D.plr}`);

  for (const s of schedules) {
    deviceMemory.schedules.set(s.id, { ...s, paused: false });
    log(`  Stored id=${s.id}  ${formatDate(s.sd)} → ${formatDate(s.ed)}  ${formatTime(s.st)}–${formatTime(s.et)}${s.cy ? `  [CYCLIC on=${s.on}m off=${s.off}m]` : "  [TIME-BASED]"}`);
  }

  // ACK after ~500ms simulated processing delay
  setTimeout(() => {
    publish({ T: T.SCHEDULING_ACK, S, D: 4 });
    log(`▶ SENT ACK for schedule creation (chunk idx=${D.idx})`);
  }, 500);
}

function handleScheduleUpdate(S: number, D: any) {
  const { cmd, ids } = D;
  const cmdLabel = cmd === 1 ? "STOP" : cmd === 2 ? "RESTART" : cmd === 3 ? "DELETE" : `cmd=${cmd}`;
  const targets = decodeBitmask(ids);

  log(`▶ SCHEDULE UPDATE [${cmdLabel}]: ids=${ids} (binary: ${ids.toString(2).padStart(16, "0")}) → targets: [${targets.join(", ")}]`);

  for (const id of targets) {
    const sch = deviceMemory.schedules.get(id);
    if (!sch) {
      log(`  WARN: Schedule id=${id} not found in device memory`);
      continue;
    }

    if (cmd === 1) {
      sch.paused = true;
      if (deviceMemory.currentScheduleId === id) {
        deviceMemory.motorState.m1 = 0;
        deviceMemory.currentScheduleId = null;
        log(`  Motor stopped (was running schedule ${id})`);
      }
      log(`  Paused schedule id=${id}`);
    } else if (cmd === 2) {
      sch.paused = false;
      log(`  Restarted schedule id=${id}`);
    } else if (cmd === 3) {
      deviceMemory.schedules.delete(id);
      log(`  Deleted schedule id=${id} from device memory`);
    }
  }

  // ACK after ~300ms
  setTimeout(() => {
    publish({ T: T.SCHEDULING_ACK, S, D: { ids, ack: cmd } });
    log(`▶ SENT ACK for schedule update [${cmdLabel}]`);
  }, 300);
}

// ─── Motor Control ─────────────────────────────────────────────────────────────

function handleMotorControl(payload: any) {
  const { D, S } = payload;
  log(`▶ MOTOR CONTROL: ${JSON.stringify(D)}`);

  // Apply to motor state
  if (D?.m1 !== undefined) deviceMemory.motorState.m1 = D.m1;
  if (D?.m2 !== undefined) deviceMemory.motorState.m2 = D.m2;

  setTimeout(() => {
    publish({ T: T.MOTOR_CONTROL_ACK, S, D: { ...D, ack: 1 } });
    log(`▶ SENT MOTOR CONTROL ACK`);
  }, 200);
}

// ─── Schedule Data Request ─────────────────────────────────────────────────────

function handleScheduleDataRequest(payload: any) {
  const { S } = payload;
  log(`▶ SCHEDULE STATUS REQUEST from cloud`);

  const active = Array.from(deviceMemory.schedules.values());

  publish({
    T: T.SCHEDULING_DATA_ACK,
    S,
    D: {
      idx: 1, last: 1,
      sch_cnt: active.length,
      plr: 30,
      m: [{
        mid: 1,
        sch: active.map(s => ({
          id:  s.id,
          sd:  s.sd,
          ed:  s.ed,
          st:  s.st,
          et:  s.et,
          cy:  s.cy ?? 0,
          ...(s.cy ? { on: s.on, off: s.off } : {}),
          ack: 1,
          paused: s.paused ? 1 : 0,
        })),
      }],
    },
  });

  log(`▶ SENT ${active.length} schedules to cloud`);
}

// ─── Boot Sync ─────────────────────────────────────────────────────────────────

function sendBootSyncRequest() {
  publish({
    T: "DEVICE SYNCH REQUEST",
    S: seq(),
    D: { m1: deviceMemory.motorState.m1, m2: deviceMemory.motorState.m2 },
  });
  log("▶ SENT boot sync request");
}

// ─── Heartbeat ─────────────────────────────────────────────────────────────────

function sendHeartbeat() {
  publish({
    T: T.HEARTBEAT,
    S: seq(),
    D: {
      G01: { p_v: 2, pwr: 1, sig: 20 },
      ct: deviceTimestamp(),
    },
  });
  log("▶ SENT heartbeat");
}

// ─── Live Data Tick ────────────────────────────────────────────────────────────

function tickLiveData() {
  const now = nowAsHHMM();
  const today = todayAsYYMMDD();

  // Find the first active schedule that should be running right now
  let running: StoredSchedule | null = null;
  for (const sch of deviceMemory.schedules.values()) {
    if (sch.paused || !sch.en) continue;
    if (sch.sd > today || sch.ed < today) continue;
    if (now >= sch.st && now < sch.et) {
      running = sch;
      break;
    }
  }

  if (running) {
    deviceMemory.motorState.m1 = 1;
    deviceMemory.currentScheduleId = running.id;
    const elapsed = timeToMinutes(now) - timeToMinutes(running.st);
    deviceMemory.runtimeMinutes = Math.max(0, elapsed);
  } else {
    deviceMemory.motorState.m1 = 0;
    deviceMemory.currentScheduleId = null;
    deviceMemory.runtimeMinutes = 0;
  }

  publishLiveData(running);
}

function publishLiveData(active: StoredSchedule | null) {
  const motorOn = active !== null;

  publish({
    T: T.LIVE_DATA,
    S: seq(),
    D: {
      G01: {
        p_v: 2,
        pwr: 1,
        llv: motorOn ? [220.5, 219.8, 221.2] : [0, 0, 0],
        m1: {
          mode:  1,
          m_s:   motorOn ? 1 : 0,
          amp:   motorOn ? [5.2, 5.1, 5.3] : [0.0, 0.0, 0.0],
          id:    active?.id  ?? 0,
          st:    active?.st  ?? 0,
          cy:    active?.cy  ?? 0,
          rt:    deviceMemory.runtimeMinutes,
          flt:   4095,
          alt:   4095,
          l_on:  motorOn ? 1 : 0,
          l_of:  motorOn ? 0 : 1,
        },
      },
      ct: deviceTimestamp(),
    },
  });

  if (motorOn) {
    log(`▶ LIVE DATA — Motor ON (Schedule id=${active!.id}), runtime=${deviceMemory.runtimeMinutes}min`);
  } else {
    log("▶ LIVE DATA — Motor OFF (no schedule running)");
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function publish(payload: any) {
  client.publish(STATUS_TOPIC, JSON.stringify(payload), { qos: 1 });
}

/** Decode 16-bit bitmask → array of schedule IDs */
function decodeBitmask(mask: number): number[] {
  const ids: number[] = [];
  for (let i = 1; i <= 16; i++) {
    if ((mask & (1 << (i - 1))) !== 0) ids.push(i);
  }
  return ids;
}

/** Current IST time as HHMM number (e.g. 630 = 06:30) */
function nowAsHHMM(): number {
  const ist = toIST(new Date());
  return ist.getUTCHours() * 100 + ist.getUTCMinutes();
}

/** Today as YYMMDD number (e.g. 260606) */
function todayAsYYMMDD(): number {
  const ist = toIST(new Date());
  const yy = ist.getUTCFullYear() - 2000;
  const mm = ist.getUTCMonth() + 1;
  const dd = ist.getUTCDate();
  return yy * 10000 + mm * 100 + dd;
}

function toIST(d: Date): Date {
  return new Date(d.getTime() + 5.5 * 60 * 60 * 1000);
}

/** HHMM number → total minutes */
function timeToMinutes(hhmm: number): number {
  return Math.floor(hhmm / 100) * 60 + (hhmm % 100);
}

/** YYMMDD → readable string */
function formatDate(yymmdd: number): string {
  const s = String(yymmdd).padStart(6, "0");
  return `20${s.slice(0, 2)}-${s.slice(2, 4)}-${s.slice(4, 6)}`;
}

/** HHMM number → HH:MM string */
function formatTime(hhmm: number): string {
  const h = Math.floor(hhmm / 100);
  const m = hhmm % 100;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Device timestamp format: YY/MM/DD,HH:MM:SS */
function deviceTimestamp(): string {
  const ist = toIST(new Date());
  const yy  = String(ist.getUTCFullYear()).slice(2);
  const mm  = String(ist.getUTCMonth() + 1).padStart(2, "0");
  const dd  = String(ist.getUTCDate()).padStart(2, "0");
  const hh  = String(ist.getUTCHours()).padStart(2, "0");
  const mi  = String(ist.getUTCMinutes()).padStart(2, "0");
  const ss  = String(ist.getUTCSeconds()).padStart(2, "0");
  return `${yy}/${mm}/${dd},${hh}:${mi}:${ss}`;
}

function log(msg: string) {
  const ts = new Date().toISOString().replace("T", " ").slice(0, 19);
  console.log(`[${ts}] [SIM:${DEVICE_MAC}] ${msg}`);
}

function printBanner() {
  console.log(`
╔══════════════════════════════════════════════════════╗
║               PCB Device Simulator                   ║
╠══════════════════════════════════════════════════════╣
║  Device MAC : ${DEVICE_MAC.padEnd(38)}║
║  CMD Topic  : ${CMD_TOPIC.padEnd(38)}║
║  STATUS     : ${STATUS_TOPIC.padEnd(38)}║
║  Broker     : ${(BROKER_URL || "").slice(0, 38).padEnd(38)}║
╠══════════════════════════════════════════════════════╣
║  Behaviours:                                         ║
║  • Schedule create  → ACK in ~500ms                  ║
║  • Schedule update  → ACK in ~300ms                  ║
║  • Live data        → every 2 minutes                ║
║  • Heartbeat        → every 30 seconds               ║
║  • Boot sync        → sent on startup                ║
╚══════════════════════════════════════════════════════╝
`);
}
