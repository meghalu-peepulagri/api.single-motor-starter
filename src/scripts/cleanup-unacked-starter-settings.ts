/**
 * Removes the redundant starter_settings rows left behind by the unbounded
 * heartbeat-driven settings sync.
 *
 * Every publish cycle in publishDeviceSettings / publishMultiMotorDeviceSettings
 * inserts a "pending" copy of the config (is_new_configuration_saved = 0). Before the
 * sync was bounded, a box that never acked accumulated one such row per heartbeat.
 *
 * Deletes: rows with is_new_configuration_saved = 0, EXCEPT the newest one per starter
 * (kept so an ack still in flight has a row to land on).
 * Never touches: any row with is_new_configuration_saved = 1 — those are the acked
 * configs the app and the device sync both read from.
 *
 * Defaults to a dry run. Pass --apply to actually delete.
 *
 *   npx tsx src/scripts/cleanup-unacked-starter-settings.ts
 *   npx tsx src/scripts/cleanup-unacked-starter-settings.ts --apply
 */
import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { sql } from "drizzle-orm";
import fs from "fs";
import { starterSettings } from "../database/schemas/starter-settings.js";

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

const db = drizzle(pool, { schema: { starterSettings } });

const APPLY = process.argv.includes("--apply");

// Stale pending rows: unacked, and not the newest unacked row for their starter.
const staleRowsCte = sql`
  WITH ranked AS (
    SELECT id,
           starter_id,
           created_at,
           ROW_NUMBER() OVER (PARTITION BY starter_id ORDER BY created_at DESC, id DESC) AS rn
    FROM starter_settings
    WHERE is_new_configuration_saved = 0
  )
  SELECT id, starter_id, created_at FROM ranked WHERE rn > 1
`;

async function run() {
  console.log(`Scanning starter_settings for stale unacked rows... (${APPLY ? "APPLY" : "dry run"})`);

  const total = await db.execute(sql`SELECT COUNT(*)::int AS count FROM starter_settings`);
  const stale = await db.execute(staleRowsCte);
  const staleRows = stale.rows as Array<{ id: number; starter_id: number; created_at: Date }>;

  console.log(`  total rows in starter_settings: ${(total.rows[0] as { count: number }).count}`);
  console.log(`  stale unacked rows (deletable): ${staleRows.length}`);

  if (staleRows.length === 0) {
    console.log("Nothing to clean up.");
    await pool.end();
    return;
  }

  const perStarter = new Map<number, number>();
  for (const row of staleRows) {
    perStarter.set(row.starter_id, (perStarter.get(row.starter_id) ?? 0) + 1);
  }

  console.log("  breakdown by starter (top 20 by row count):");
  const worst = [...perStarter.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);
  for (const [starterId, count] of worst) {
    console.log(`    starter_id=${starterId}: ${count} rows`);
  }
  if (perStarter.size > worst.length) {
    console.log(`    ... and ${perStarter.size - worst.length} more starters`);
  }

  if (!APPLY) {
    console.log("\nDry run — nothing deleted. Re-run with --apply to delete the rows above.");
    await pool.end();
    return;
  }

  // Delete exactly the ids reported above, in batches — so what gets removed can never
  // drift from what the scan printed.
  const BATCH_SIZE = 500;
  let deleted = 0;
  for (let i = 0; i < staleRows.length; i += BATCH_SIZE) {
    const ids = staleRows.slice(i, i + BATCH_SIZE).map((row) => row.id);
    const result = await db.execute(
      sql`DELETE FROM starter_settings WHERE id IN (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})`
    );
    deleted += result.rowCount ?? 0;
    console.log(`  deleted ${Math.min(i + BATCH_SIZE, staleRows.length)}/${staleRows.length}`);
  }

  console.log(`\nDeleted ${deleted} rows across ${perStarter.size} starters.`);
  await pool.end();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
