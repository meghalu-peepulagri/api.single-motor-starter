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


export function buildActivityActionFilter(logTypes: string[]) {
  const includeOn = logTypes.includes("on");
  const includeOff = logTypes.includes("off");
  const includeModeChange = logTypes.includes("mode");
  const includeAllActivity = logTypes.includes("activity");

  // If only "activity" is present with no specific sub-types, return all activities
  if (includeAllActivity && !includeOn && !includeOff && !includeModeChange) return sql``;

  // Build OR conditions for specific activity sub-types
  const conditions: ReturnType<typeof sql>[] = [];

  if (includeOn) {
    conditions.push(sql`(action IN ('MOTOR_STATE_SYNC', 'MOTOR_CONTROL_ACK') AND new_data::text LIKE '%"state":1%')`);
  }
  if (includeOff) {
    conditions.push(sql`(action IN ('MOTOR_STATE_SYNC', 'MOTOR_CONTROL_ACK') AND new_data::text LIKE '%"state":0%')`);
  }
  if (includeModeChange) {
    conditions.push(sql`(action IN ('MOTOR_MODE_SYNC', 'MOTOR_MODE_ACK', 'MOTOR_MODE_UPDATED'))`);
  }
  if (includeAllActivity) {
    // "activity" combined with specific sub-types: include everything else too
    conditions.push(sql`(action NOT IN ('MOTOR_STATE_SYNC', 'MOTOR_CONTROL_ACK', 'MOTOR_MODE_SYNC', 'MOTOR_MODE_ACK', 'MOTOR_MODE_UPDATED'))`);
  }

  if (conditions.length === 0) return null; // no activity sub-types requested
  if (conditions.length === 1) return sql`AND ${conditions[0]}`;

  return sql`AND (${conditions.reduce((acc, cond, i) => i === 0 ? cond : sql`${acc} OR ${cond}`)})`;
}

export async function getUnifiedLogsPaginated(
  starterId: number,
  motorId: number,
  offset: number,
  limit: number,
  assignedAt: Date | null = null,
  logTypes: string[] | null = null
) {
  // If no logTypes provided, include everything
  const types = logTypes && logTypes.length > 0 ? logTypes : ["alert", "fault", "activity"];

  const includeAlert = types.includes("alert");
  const includeFault = types.includes("fault");

  // Check if any activity sub-type is requested
  const hasActivityType = types.includes("activity") || types.includes("on") || types.includes("off") || types.includes("mode");
  const activityActionFilter = hasActivityType ? buildActivityActionFilter(types) : null;
  const includeActivity = activityActionFilter !== null;

  const assignedAtFilter = assignedAt ? sql`AND created_at >= ${assignedAt}` : sql``;

  const parts: ReturnType<typeof sql>[] = [];

  if (includeActivity) {
    parts.push(sql`
      SELECT
        id,
        'activity' AS log_type,
        action,
        entity_type,
        message,
        NULL::integer AS code,
        NULL AS description,
        performed_by,
        created_at AS timestamp
      FROM user_activity_logs
      WHERE device_id = ${starterId}
        AND (entity_type = 'STARTER' OR entity_id = ${motorId})
        ${assignedAtFilter}
        ${activityActionFilter}
    `);
  }

  if (includeAlert) {
    parts.push(sql`
      SELECT
        MAX(id) AS id,
        'alert' AS log_type,
        'ALERT' AS action,
        'STARTER' AS entity_type,
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
    `);
  }

  if (includeFault) {
    parts.push(sql`
      SELECT
        MAX(id) AS id,
        'fault' AS log_type,
        'FAULT' AS action,
        'STARTER' AS entity_type,
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
    `);
  }

  if (parts.length === 0) return [];

  const unionQuery = parts.length === 1
    ? parts[0]
    : parts.reduce((acc, part, i) => i === 0 ? part : sql`${acc} UNION ALL ${part}`);

  const query = sql`
    SELECT * FROM (
      ${unionQuery}
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
  logTypes: string[] | null = null
) {
  const types = logTypes && logTypes.length > 0 ? logTypes : ["alert", "fault", "activity"];

  const includeAlert = types.includes("alert");
  const includeFault = types.includes("fault");

  const hasActivityType = types.includes("activity") || types.includes("on") || types.includes("off") || types.includes("mode");
  const activityActionFilter = hasActivityType ? buildActivityActionFilter(types) : null;
  const includeActivity = activityActionFilter !== null;

  const assignedAtFilter = assignedAt ? sql`AND created_at >= ${assignedAt}` : sql``;

  const parts: ReturnType<typeof sql>[] = [];

  if (includeActivity) {
    parts.push(sql`
      SELECT id, message
      FROM user_activity_logs
      WHERE device_id = ${starterId}
        AND (entity_type = 'STARTER' OR entity_id = ${motorId})
        AND message IS NOT NULL
        ${assignedAtFilter}
        ${activityActionFilter}
    `);
  }

  if (includeAlert) {
    parts.push(sql`
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
    `);
  }

  if (includeFault) {
    parts.push(sql`
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
    `);
  }

  if (parts.length === 0) return 0;

  const unionQuery = parts.length === 1
    ? parts[0]
    : parts.reduce((acc, part, i) => i === 0 ? part : sql`${acc} UNION ALL ${part}`);

  const countQuery = sql`
    SELECT COUNT(*) AS total FROM (
      ${unionQuery}
    ) unified
  `;

  const countRes = await db.execute(countQuery);
  return Number((countRes.rows?.[0] as any)?.total ?? 0);
}
