import { sql } from "drizzle-orm";
import db from "../../database/configuration.js";
export async function getConsecutiveGroupsPaginated(starterId, motorId, offset, limit, type, assigned_at = null) {
    const codeColumn = type === "alert" ? "alert_code" : "fault_code";
    const descColumn = type === "alert" ? "alert_description" : "fault_description";
    const excludeValues = type === "alert"
        ? ["Unknown Alert", "No Alert"]
        : ["Unknown Fault", "No Fault"];
    const query = sql `
    SELECT
      MAX(id) AS id,
      starter_id,
      motor_id,
      ${sql.raw(codeColumn)} AS code,
      ${sql.raw(descColumn)} AS description,
      MAX(timestamp) AS timestamp
    FROM (
      SELECT *,
        (
          row_number() OVER (
            PARTITION BY starter_id, motor_id, ${sql.raw(codeColumn)}
            ORDER BY timestamp
          ) -
          row_number() OVER (
            PARTITION BY starter_id, motor_id
            ORDER BY timestamp
          )
        ) AS grp
      FROM alerts_faults
      WHERE starter_id = ${starterId}
        AND motor_id = ${motorId}
        AND ${sql.raw(codeColumn)} IS NOT NULL
        AND ${sql.raw(codeColumn)} <> 0
        AND ${sql.raw(descColumn)} IS NOT NULL
        AND ${sql.raw(descColumn)} NOT IN (${sql.join(excludeValues, sql `, `)})
        ${assigned_at ? sql `AND created_at >= ${assigned_at}` : sql ``}
    ) t
    GROUP BY
      starter_id,
      motor_id,
      ${sql.raw(codeColumn)},
      ${sql.raw(descColumn)},
      grp
    ORDER BY MAX(timestamp) DESC
    LIMIT ${limit}
    OFFSET ${offset}
  `;
    const results = await db.execute(query);
    return results.rows ?? results;
}
// Backwards compatibility wrappers - now call the consolidated function
export async function getConsecutiveAlertsPaginated(starterId, motorId, offset, limit, assigned_at = null) {
    return getConsecutiveGroupsPaginated(starterId, motorId, offset, limit, 'alert', assigned_at);
}
export async function getConsecutiveFaultsPaginated(starterId, motorId, offset, limit, assigned_at = null) {
    return getConsecutiveGroupsPaginated(starterId, motorId, offset, limit, 'fault', assigned_at);
}
export async function getConsecutiveGroupsCount(starterId, motorId, type, assigned_at = null) {
    const codeColumn = type === "alert" ? "alert_code" : "fault_code";
    const descColumn = type === "alert" ? "alert_description" : "fault_description";
    const excludeValues = type === "alert"
        ? ["Unknown Alert", "No Alert"]
        : ["Unknown Fault", "No Fault"];
    const countQuery = sql `
    SELECT COUNT(*) AS total_groups
    FROM (
      SELECT DISTINCT ${sql.raw(codeColumn)}, grp
      FROM (
        SELECT
          ${sql.raw(codeColumn)},
          (
            row_number() OVER (
              PARTITION BY starter_id, motor_id, ${sql.raw(codeColumn)}
              ORDER BY timestamp
            ) -
            row_number() OVER (
              PARTITION BY starter_id, motor_id
              ORDER BY timestamp
            )
          ) AS grp
        FROM alerts_faults
        WHERE starter_id = ${starterId}
          AND motor_id = ${motorId}
          AND ${sql.raw(codeColumn)} IS NOT NULL
          AND ${sql.raw(codeColumn)} <> 0
          AND ${sql.raw(descColumn)} IS NOT NULL
          AND ${sql.raw(descColumn)} NOT IN (${sql.join(excludeValues, sql `, `)})
          ${assigned_at ? sql `AND created_at >= ${assigned_at}` : sql ``}
      ) t
    ) grouped
  `;
    const countRes = await db.execute(countQuery);
    return Number(countRes.rows?.[0]?.total_groups ?? 0);
}
