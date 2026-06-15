import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { sql } from "drizzle-orm";
import fs from "fs";
import { motorSchedules } from "../database/schemas/motor-schedules.js";
import { nextDayYYMMDD, yymmddHhmmToUTCDate } from "../helpers/motor-schedule-payload-helper.js";

const pool = new Pool({
  host: process.env.DB_HOST!,
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USER!,
  password: process.env.DB_PASSWORD!,
  database: process.env.DB_NAME!,
  ssl: {
    rejectUnauthorized: true,
    ca: fs.readFileSync(`${process.cwd()}/ca.pem`).toString(),
  },
});

const db = drizzle(pool, { schema: { motorSchedules } });

const BATCH_SIZE = 100;

function computeEndDate(row: { schedule_start_date: number; schedule_end_date: number | null; start_time: string; end_time: string }): number {
  const baseEndDate = row.schedule_end_date ?? row.schedule_start_date;
  const startMins = parseInt(row.start_time.slice(0, 2), 10) * 60 + parseInt(row.start_time.slice(2, 4), 10);
  const endMins = parseInt(row.end_time.slice(0, 2), 10) * 60 + parseInt(row.end_time.slice(2, 4), 10);
  // Wrap-around window: end time is on the next calendar day after baseEndDate
  return endMins <= startMins ? nextDayYYMMDD(baseEndDate) : baseEndDate;
}

async function run() {
  console.log("Recomputing start_date_time and end_date_time for all schedules...");

  const rows = await db
    .select({
      id: motorSchedules.id,
      schedule_start_date: motorSchedules.schedule_start_date,
      schedule_end_date: motorSchedules.schedule_end_date,
      start_time: motorSchedules.start_time,
      end_time: motorSchedules.end_time,
    })
    .from(motorSchedules);

  console.log(`Found ${rows.length} schedules to process.`);
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

      const endDate = computeEndDate(row as { schedule_start_date: number; schedule_end_date: number | null; start_time: string; end_time: string });
      const startDateTime = yymmddHhmmToUTCDate(row.schedule_start_date, row.start_time);
      const endDateTime = yymmddHhmmToUTCDate(endDate, row.end_time);

      await db
        .update(motorSchedules)
        .set({ start_date_time: startDateTime, end_date_time: endDateTime })
        .where(sql`${motorSchedules.id} = ${row.id}`);

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
