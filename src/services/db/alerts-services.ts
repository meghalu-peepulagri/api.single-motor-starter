import { sql } from "drizzle-orm";
import db from "../../database/configuration.js";


export async function getConsecutiveGroupsPaginated(
  starterId: number,
  motorId: number,
  offset: number,
  limit: number,
  type: "alert" | "fault",
  assigned_at: Date | null = null
) {
  const codeColumn = type === "alert" ? "alert_code" : "fault_code";
  const descColumn = type === "alert" ? "alert_description" : "fault_description";
  const excludeValues =
    type === "alert"
      ? ["Unknown Alert", "No Alert"]
      : ["Unknown Fault", "No Fault"];

  const query = sql`
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
        AND ${sql.raw(descColumn)} NOT IN (${sql.join(excludeValues, sql`, `)})
        ${assigned_at ? sql`AND created_at >= ${assigned_at}` : sql``}
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
export async function getConsecutiveAlertsPaginated(starterId: number, motorId: number, offset: number, limit: number, assigned_at: Date | null = null) {
  return getConsecutiveGroupsPaginated(starterId, motorId, offset, limit, 'alert', assigned_at);
}


export async function getConsecutiveFaultsPaginated(starterId: number, motorId: number, offset: number, limit: number, assigned_at: Date | null = null) {
  return getConsecutiveGroupsPaginated(starterId, motorId, offset, limit, 'fault', assigned_at);
}


export async function getConsecutiveGroupsCount(
  starterId: number,
  motorId: number,
  type: "alert" | "fault",
  assigned_at: Date | null = null
) {
  const codeColumn = type === "alert" ? "alert_code" : "fault_code";
  const descColumn = type === "alert" ? "alert_description" : "fault_description";
  const excludeValues =
    type === "alert"
      ? ["Unknown Alert", "No Alert"]
      : ["Unknown Fault", "No Fault"];

  const countQuery = sql`
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
          AND ${sql.raw(descColumn)} NOT IN (${sql.join(excludeValues, sql`, `)})
          ${assigned_at ? sql`AND created_at >= ${assigned_at}` : sql``}
      ) t
    ) grouped
  `;

  const countRes = await db.execute(countQuery);
  return Number((countRes.rows?.[0] as any)?.total_groups ?? 0);
}


export async function getUnifiedLogsPaginated(
  starterId: number,
  motorId: number,
  offset: number,
  limit: number,
  assignedAt: Date | null = null,
  actionType: string | null = null
) {
  const query = sql`
    SELECT * FROM (
      SELECT
        id,
        'activity' AS log_type,
        action,
        message,
        NULL::integer AS code,
        NULL AS description,
        performed_by,
        created_at AS timestamp
      FROM user_activity_logs
      WHERE device_id = ${starterId}
        AND (entity_type = 'STARTER' OR entity_id = ${motorId})
        ${assignedAt ? sql`AND created_at >= ${assignedAt}` : sql``}
        ${actionType ? sql`AND action = ${actionType}` : sql``}

      UNION ALL

      SELECT
        MAX(id) AS id,
        'alert' AS log_type,
        'ALERT' AS action,
        alert_description AS message,
        alert_code AS code,
        alert_description AS description,
        NULL::integer AS performed_by,
        MAX(timestamp) AS timestamp
      FROM (
        SELECT *,
          (
            row_number() OVER (
              PARTITION BY starter_id, motor_id, alert_code
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
          AND alert_code IS NOT NULL
          AND alert_code <> 0
          AND alert_description IS NOT NULL
          AND alert_description NOT IN ('Unknown Alert', 'No Alert')
          ${assignedAt ? sql`AND created_at >= ${assignedAt}` : sql``}
      ) alert_groups
      GROUP BY starter_id, motor_id, alert_code, alert_description, grp
      ${actionType ? sql`HAVING 'ALERT' = ${actionType}` : sql``}

      UNION ALL

      SELECT
        MAX(id) AS id,
        'fault' AS log_type,
        'FAULT' AS action,
        fault_description AS message,
        fault_code AS code,
        fault_description AS description,
        NULL::integer AS performed_by,
        MAX(timestamp) AS timestamp
      FROM (
        SELECT *,
          (
            row_number() OVER (
              PARTITION BY starter_id, motor_id, fault_code
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
          AND fault_code IS NOT NULL
          AND fault_code <> 0
          AND fault_description IS NOT NULL
          AND fault_description NOT IN ('Unknown Fault', 'No Fault')
          ${assignedAt ? sql`AND created_at >= ${assignedAt}` : sql``}
      ) fault_groups
      GROUP BY starter_id, motor_id, fault_code, fault_description, grp
      ${actionType ? sql`HAVING 'FAULT' = ${actionType}` : sql``}
    ) unified
    WHERE message IS NOT NULL
    ORDER BY timestamp DESC
    LIMIT ${limit}
    OFFSET ${offset}
  `;

  const results = await db.execute(query);
  return results.rows ?? results;
}


export async function getUnifiedLogsCount(
  starterId: number,
  motorId: number,
  assignedAt: Date | null = null,
  actionType: string | null = null
) {
  const countQuery = sql`
    SELECT COUNT(*) AS total FROM (
      SELECT id, message
      FROM user_activity_logs
      WHERE device_id = ${starterId}
        AND (entity_type = 'STARTER' OR entity_id = ${motorId})
        AND message IS NOT NULL
        ${assignedAt ? sql`AND created_at >= ${assignedAt}` : sql``}
        ${actionType ? sql`AND action = ${actionType}` : sql``}

      UNION ALL

      SELECT MAX(id) AS id, alert_description AS message
      FROM (
        SELECT *,
          (
            row_number() OVER (
              PARTITION BY starter_id, motor_id, alert_code
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
          AND alert_code IS NOT NULL
          AND alert_code <> 0
          AND alert_description IS NOT NULL
          AND alert_description NOT IN ('Unknown Alert', 'No Alert')
          ${assignedAt ? sql`AND created_at >= ${assignedAt}` : sql``}
      ) alert_groups
      GROUP BY starter_id, motor_id, alert_code, alert_description, grp
      ${actionType ? sql`HAVING 'ALERT' = ${actionType}` : sql``}

      UNION ALL

      SELECT MAX(id) AS id, fault_description AS message
      FROM (
        SELECT *,
          (
            row_number() OVER (
              PARTITION BY starter_id, motor_id, fault_code
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
          AND fault_code IS NOT NULL
          AND fault_code <> 0
          AND fault_description IS NOT NULL
          AND fault_description NOT IN ('Unknown Fault', 'No Fault')
          ${assignedAt ? sql`AND created_at >= ${assignedAt}` : sql``}
      ) fault_groups
      GROUP BY starter_id, motor_id, fault_code, fault_description, grp
      ${actionType ? sql`HAVING 'FAULT' = ${actionType}` : sql``}
    ) unified
  `;

  const countRes = await db.execute(countQuery);
  return Number((countRes.rows?.[0] as any)?.total ?? 0);
}
