import { SQL, sql } from "drizzle-orm";
import db from "../../database/configuration.js";

export async function bulkMotorsUpdate(motorsToUpdate: Array<{ id: number; name?: string | null; hp?: number | null }>, trx?: any): Promise<void> {
  if (!motorsToUpdate || motorsToUpdate.length === 0) return;

  const queryBuilder = trx || db;
  const ids = motorsToUpdate.map(m => m.id);

  // Prepare CASE statements for each column
  const nameCases: SQL[] = [];
  const hpCases: SQL[] = [];

  for (const m of motorsToUpdate) {
    // Name column
    if (m.name !== undefined) {
      const value = m.name === null ? sql`NULL` : m.name;
      nameCases.push(sql`WHEN ${m.id} THEN ${value}`);
    }

    // HP column (numeric) – preserve integers and decimals
    if (m.hp !== undefined) {
      const value = m.hp === null ? sql`NULL` : sql`${m.hp}::numeric`;
      hpCases.push(sql`WHEN ${m.id} THEN ${value}`);
    }

  }

  const setClauses: SQL[] = [];

  if (nameCases.length > 0) {
    setClauses.push(sql`name = CASE "motors".id ${sql.join(nameCases, sql` `)} END`);
  }
  if (hpCases.length > 0) {
    setClauses.push(sql`hp = CASE "motors".id ${sql.join(hpCases, sql` `)} END`);
  }
  

  // Always update timestamp
  setClauses.push(sql`updated_at = NOW()`);

  // Final bulk update query
  const query = sql`
    UPDATE "motors"
    SET ${sql.join(setClauses, sql`, `)}
    WHERE "motors".id IN (${sql.join(ids.map(id => sql`${id}`), sql`, `)})
    RETURNING *;
  `;

  await queryBuilder.execute(query);
}
