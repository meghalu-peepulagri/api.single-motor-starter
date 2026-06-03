import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { isNull, or, sql } from "drizzle-orm";
import fs from "fs";
import { motorSchedules } from "../database/schemas/motor-schedules.js";
import { yymmddHhmmToUTCDate } from "../helpers/motor-schedule-payload-helper.js";
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
const db = drizzle(pool, { schema: { motorSchedules } });
const BATCH_SIZE = 100;
async function run() {
    console.log("Fetching schedules with missing start_date_time or end_date_time...");
    const rows = await db
        .select({
        id: motorSchedules.id,
        schedule_start_date: motorSchedules.schedule_start_date,
        schedule_end_date: motorSchedules.schedule_end_date,
        start_time: motorSchedules.start_time,
        end_time: motorSchedules.end_time,
    })
        .from(motorSchedules)
        .where(or(isNull(motorSchedules.start_date_time), isNull(motorSchedules.end_date_time)));
    console.log(`Found ${rows.length} schedules to backfill.`);
    if (rows.length === 0) {
        console.log("Nothing to do.");
        await pool.end();
        return;
    }
    let updated = 0;
    let skipped = 0;
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const batch = rows.slice(i, i + BATCH_SIZE);
        for (const row of batch) {
            if (!row.schedule_start_date || !row.start_time || !row.end_time) {
                console.warn(`  skip id=${row.id}: missing date or time fields`);
                skipped++;
                continue;
            }
            const endDate = row.schedule_end_date ?? row.schedule_start_date;
            const startDateTime = yymmddHhmmToUTCDate(row.schedule_start_date, row.start_time);
            const endDateTime = yymmddHhmmToUTCDate(endDate, row.end_time);
            await db
                .update(motorSchedules)
                .set({ start_date_time: startDateTime, end_date_time: endDateTime })
                .where(sql `${motorSchedules.id} = ${row.id}`);
            updated++;
        }
        console.log(`  processed ${Math.min(i + BATCH_SIZE, rows.length)}/${rows.length}`);
    }
    console.log(`Done. updated=${updated}, skipped=${skipped}`);
    await pool.end();
}
run().catch((err) => {
    console.error(err);
    process.exit(1);
});
