import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { sql } from "drizzle-orm";
import fs from "fs";
import { motors } from "../database/schemas/motors.js";
import { starterBoxes } from "../database/schemas/starter-boxes.js";
import { motorStatusHistory, } from "../database/schemas/motor-status-history.js";
import { powerStatusHistory, } from "../database/schemas/power-status-history.js";
import { deviceStatusHistory, } from "../database/schemas/device-status-history.js";
const pool = new Pool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: {
        rejectUnauthorized: true,
        ca: fs.readFileSync(`${process.cwd()}/ca.pem`).toString(),
    },
});
const db = drizzle(pool, {
    schema: { motors, starterBoxes, motorStatusHistory, powerStatusHistory, deviceStatusHistory },
});
// ── helpers ──────────────────────────────────────────────────────────────────
function addHours(date, hours) {
    return new Date(date.getTime() + hours * 3_600_000);
}
function rand(min, max) {
    return min + Math.random() * (max - min);
}
function startOfOneMonthAgo() {
    const d = new Date();
    d.setDate(d.getDate() - 1); // yesterday
    d.setMonth(d.getMonth() - 1); // one month back
    d.setHours(0, 0, 0, 0);
    return d;
}
function endOfYesterday() {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    d.setHours(23, 59, 59, 0);
    return d;
}
async function insertInBatches(table, records, batchSize = 200) {
    for (let i = 0; i < records.length; i += batchSize) {
        await db.insert(table).values(records.slice(i, i + batchSize));
    }
}
// ── generators ───────────────────────────────────────────────────────────────
function generateMotorHistory(starterId, motorId, start, end) {
    const records = [];
    let current = new Date(start);
    let status = Math.random() < 0.5 ? "ON" : "OFF";
    while (current <= end) {
        records.push({ starter_id: starterId, motor_id: motorId, status, time_stamp: new Date(current) });
        // ON for 2–8 h, OFF for 2–8 h
        current = addHours(current, rand(2, 8));
        status = status === "ON" ? "OFF" : "ON";
    }
    return records;
}
function generatePowerHistory(starterId, motorId, start, end) {
    const records = [];
    let current = new Date(start);
    let status = "ON"; // power starts ON
    while (current <= end) {
        records.push({ starter_id: starterId, motor_id: motorId, status, time_stamp: new Date(current) });
        // ON for 8–20 h, OFF for 1–4 h
        const hours = status === "ON" ? rand(8, 20) : rand(1, 4);
        current = addHours(current, hours);
        status = status === "ON" ? "OFF" : "ON";
    }
    return records;
}
function generateDeviceHistory(starterId, start, end) {
    const records = [];
    let current = new Date(start);
    let status = "ACTIVE"; // device starts ACTIVE
    while (current <= end) {
        records.push({ starter_id: starterId, motor_id: null, status, time_stamp: new Date(current) });
        // ACTIVE for 3–10 days (72–240 h), INACTIVE for 1–6 h
        const hours = status === "ACTIVE" ? rand(72, 240) : rand(1, 6);
        current = addHours(current, hours);
        status = status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    }
    return records;
}
// ── main ─────────────────────────────────────────────────────────────────────
async function main() {
    const forceReseed = process.argv.includes("--force");
    if (!forceReseed) {
        const [{ count }] = await db
            .select({ count: sql `count(*)::int` })
            .from(motorStatusHistory);
        if (count > 0) {
            console.log(`Status history tables already have data (${count} motor records). ` +
                "Pass --force to re-seed.");
            return;
        }
    }
    const allStarters = await db.select({ id: starterBoxes.id }).from(starterBoxes);
    if (allStarters.length === 0) {
        console.log("No starter boxes found — add starters before seeding history.");
        return;
    }
    const allMotors = await db
        .select({ id: motors.id, starter_id: motors.starter_id })
        .from(motors);
    const start = startOfOneMonthAgo();
    const end = endOfYesterday();
    console.log(`Seeding status history from ${start.toISOString().slice(0, 10)} ` +
        `to ${end.toISOString().slice(0, 10)} …`);
    const motorRecords = [];
    const powerRecords = [];
    const deviceRecords = [];
    for (const starter of allStarters) {
        const starterMotors = allMotors.filter((m) => m.starter_id === starter.id);
        for (const motor of starterMotors) {
            motorRecords.push(...generateMotorHistory(starter.id, motor.id, start, end));
            // Mirror live MQTT writes, which persist power history against the motor when available.
            powerRecords.push(...generatePowerHistory(starter.id, motor.id, start, end));
        }
        if (starterMotors.length === 0) {
            powerRecords.push(...generatePowerHistory(starter.id, null, start, end));
        }
        deviceRecords.push(...generateDeviceHistory(starter.id, start, end));
    }
    console.log(`Inserting ${motorRecords.length} motor status records …`);
    await insertInBatches(motorStatusHistory, motorRecords);
    console.log(`Inserting ${powerRecords.length} power status records …`);
    await insertInBatches(powerStatusHistory, powerRecords);
    console.log(`Inserting ${deviceRecords.length} device status records …`);
    await insertInBatches(deviceStatusHistory, deviceRecords);
    console.log("\nSeed complete.");
    console.log(`  motor_status_history : ${motorRecords.length} rows`);
    console.log(`  power_status_history : ${powerRecords.length} rows`);
    console.log(`  device_status_history: ${deviceRecords.length} rows`);
}
main()
    .catch((err) => {
    console.error("Seed failed:", err);
    process.exitCode = 1;
})
    .finally(() => pool.end());
