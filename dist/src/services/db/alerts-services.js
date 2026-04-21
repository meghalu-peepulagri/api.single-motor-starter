import { sql } from "drizzle-orm";
import db from "../../database/configuration.js";
// export async function getConsecutiveGroupsPaginated(
//   starterId: number,
//   motorId: number,
//   offset: number,
//   limit: number,
//   type: "alert" | "fault",
//   assigned_at: Date | null = null
// ) {
//   const codeColumn = type === "alert" ? "alert_code" : "fault_code";
//   const descColumn = type === "alert" ? "alert_description" : "fault_description";
//   const excludeValues =
//     type === "alert"
//       ? ["Unknown Alert", "No Alert"]
//       : ["Unknown Fault", "No Fault"];
//   const clearedLabel = "Fault cleared - No more faults";
//   // For fault type: include fault_code=0 in the island-gap so cleared records
//   // get the same consecutive grouping (MAX timestamp per consecutive run of 0s).
//   // For alert type: no cleared concept — filter out 0 and bad descriptions as before.
//   const innerFilter = type === "fault"
//     ? sql`
//         AND fault_code IS NOT NULL
//         AND (
//           fault_code = 0
//           OR (
//             fault_code <> 0
//             AND fault_description IS NOT NULL
//             AND fault_description NOT IN (${sql.join(excludeValues, sql`, `)})
//           )
//         )
//       `
//     : sql`
//         AND ${sql.raw(codeColumn)} IS NOT NULL
//         AND ${sql.raw(codeColumn)} <> 0
//         AND ${sql.raw(descColumn)} IS NOT NULL
//         AND ${sql.raw(descColumn)} NOT IN (${sql.join(excludeValues, sql`, `)})
//       `;
//   const descExpr = type === "fault"
//     ? sql`CASE WHEN fault_code = 0 THEN ${clearedLabel} ELSE fault_description END`
//     : sql`${sql.raw(descColumn)}`;
//   const query = sql`
//     SELECT
//       MAX(id) AS id,
//       starter_id,
//       motor_id,
//       ${sql.raw(codeColumn)} AS code,
//       ${descExpr} AS description,
//       MAX(timestamp) AS timestamp
//     FROM (
//       SELECT *,
//         (
//           row_number() OVER (
//             PARTITION BY starter_id, motor_id, ${sql.raw(codeColumn)}
//             ORDER BY timestamp
//           ) -
//           row_number() OVER (
//             PARTITION BY starter_id, motor_id
//             ORDER BY timestamp
//           )
//         ) AS grp
//       FROM alerts_faults
//       WHERE starter_id = ${starterId}
//         AND motor_id = ${motorId}
//         ${innerFilter}
//         ${assigned_at ? sql`AND created_at >= ${assigned_at}` : sql``}
//     ) t
//     GROUP BY
//       starter_id,
//       motor_id,
//       ${sql.raw(codeColumn)},
//       ${descExpr},
//       grp
//     ORDER BY MAX(timestamp) DESC
//     LIMIT ${limit}
//     OFFSET ${offset}
//   `;
//   const results = await db.execute(query);
//   return results.rows ?? results;
// }
export async function getConsecutiveGroupsPaginated(starterId, motorId, offset, limit, type, assigned_at = null) {
    const codeColumn = type === "alert" ? "alert_code" : "fault_code";
    const descColumn = type === "alert" ? "alert_description" : "fault_description";
    const clearedLabel = type === "alert"
        ? "Alert cleared - No more alerts"
        : "Fault cleared - No more faults";
    const innerFilter = sql `
    AND ${sql.raw(codeColumn)} IS NOT NULL
    AND ${sql.raw(codeColumn)} >= 0
  `;
    // ✅ FIX: use MAX() here
    const descExpr = sql `
    MAX(
      CASE 
        WHEN ${sql.raw(codeColumn)} = 0 THEN ${clearedLabel}
        ELSE COALESCE(${sql.raw(descColumn)}, '')
      END
    )
  `;
    const query = sql `
    SELECT
      MAX(id) AS id,
      starter_id,
      motor_id,
      ${sql.raw(codeColumn)} AS code,
      ${descExpr} AS description,
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
        ${innerFilter}
        ${assigned_at ? sql `AND created_at >= ${assigned_at}` : sql ``}
    ) t
    GROUP BY
      starter_id,
      motor_id,
      ${sql.raw(codeColumn)},
      grp
    ORDER BY MAX(timestamp) DESC
    LIMIT ${limit}
    OFFSET ${offset}
  `;
    const results = await db.execute(query);
    return results.rows ?? results;
}
/**
 * Returns raw record counts from alerts_faults before grouping — used for diagnostics.
 */
export async function getRawAlertFaultCounts(starterId, motorId, type, assigned_at = null) {
    const codeColumn = type === "alert" ? "alert_code" : "fault_code";
    const descColumn = type === "alert" ? "alert_description" : "fault_description";
    const excludeValues = type === "alert" ? ["Unknown Alert", "No Alert"] : ["Unknown Fault", "No Fault"];
    const rawCountQuery = sql `
    SELECT
      COUNT(*) AS total_raw,
      COUNT(DISTINCT ${sql.raw(codeColumn)}) AS distinct_codes,
      MIN(timestamp) AS earliest,
      MAX(timestamp) AS latest
    FROM alerts_faults
    WHERE starter_id = ${starterId}
      AND motor_id = ${motorId}
      AND ${sql.raw(codeColumn)} IS NOT NULL
      AND ${sql.raw(codeColumn)} <> 0
      AND ${sql.raw(descColumn)} IS NOT NULL
      AND ${sql.raw(descColumn)} NOT IN (${sql.join(excludeValues, sql `, `)})
      ${assigned_at ? sql `AND created_at >= ${assigned_at}` : sql ``}
  `;
    const res = await db.execute(rawCountQuery);
    return (res.rows?.[0] ?? {});
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
    const clearedLabel = "Fault cleared - No more faults";
    const innerFilter = type === "fault"
        ? sql `
        AND fault_code IS NOT NULL
        AND (
          fault_code = 0
          OR (
            fault_code <> 0
            AND fault_description IS NOT NULL
            AND fault_description NOT IN (${sql.join(excludeValues, sql `, `)})
          )
        )
      `
        : sql `
        AND ${sql.raw(codeColumn)} IS NOT NULL
        AND ${sql.raw(codeColumn)} <> 0
        AND ${sql.raw(descColumn)} IS NOT NULL
        AND ${sql.raw(descColumn)} NOT IN (${sql.join(excludeValues, sql `, `)})
      `;
    const descExpr = type === "fault"
        ? sql `CASE WHEN fault_code = 0 THEN ${clearedLabel} ELSE fault_description END`
        : sql `${sql.raw(descColumn)}`;
    const countQuery = sql `
    SELECT COUNT(*) AS total_groups
    FROM (
      SELECT DISTINCT ${sql.raw(codeColumn)}, grp
      FROM (
        SELECT
          ${sql.raw(codeColumn)},
          ${descExpr} AS description,
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
          ${innerFilter}
          ${assigned_at ? sql `AND created_at >= ${assigned_at}` : sql ``}
      ) t
    ) grouped
  `;
    const countRes = await db.execute(countQuery);
    return Number(countRes.rows?.[0]?.total_groups ?? 0);
}
export function buildActivityActionFilter(logTypes) {
    const includeOn = logTypes.includes("on");
    const includeOff = logTypes.includes("off");
    const includeModeChange = logTypes.includes("mode");
    const includeAllActivity = logTypes.includes("activity");
    // If only "activity" is present with no specific sub-types, return all activities
    if (includeAllActivity && !includeOn && !includeOff && !includeModeChange)
        return sql ``;
    // Build OR conditions for specific activity sub-types
    const conditions = [];
    if (includeOn) {
        conditions.push(sql `(action IN ('MOTOR_STATE_SYNC', 'MOTOR_CONTROL_ACK') AND new_data::text LIKE '%"state":1%')`);
    }
    if (includeOff) {
        conditions.push(sql `(action IN ('MOTOR_STATE_SYNC', 'MOTOR_CONTROL_ACK') AND new_data::text LIKE '%"state":0%')`);
    }
    if (includeModeChange) {
        conditions.push(sql `(action IN ('MOTOR_MODE_SYNC', 'MOTOR_MODE_ACK', 'MOTOR_MODE_UPDATED'))`);
    }
    if (includeAllActivity) {
        // "activity" combined with specific sub-types: include everything else too
        conditions.push(sql `(action NOT IN ('MOTOR_STATE_SYNC', 'MOTOR_CONTROL_ACK', 'MOTOR_MODE_SYNC', 'MOTOR_MODE_ACK', 'MOTOR_MODE_UPDATED'))`);
    }
    if (conditions.length === 0)
        return null; // no activity sub-types requested
    if (conditions.length === 1)
        return sql `AND ${conditions[0]}`;
    return sql `AND (${conditions.reduce((acc, cond, i) => i === 0 ? cond : sql `${acc} OR ${cond}`)})`;
}
export async function getUnifiedLogsPaginated(starterId, motorId, offset, limit, assignedAt = null, logTypes = null) {
    // If no logTypes provided, include everything
    const types = logTypes && logTypes.length > 0 ? logTypes : ["alert", "fault", "activity"];
    const includeAlert = types.includes("alert");
    const includeFault = types.includes("fault");
    // Check if any activity sub-type is requested
    const hasActivityType = types.includes("activity") || types.includes("on") || types.includes("off") || types.includes("mode");
    const activityActionFilter = hasActivityType ? buildActivityActionFilter(types) : null;
    const includeActivity = activityActionFilter !== null;
    const assignedAtFilter = assignedAt ? sql `AND created_at >= ${assignedAt}` : sql ``;
    const parts = [];
    if (includeActivity) {
        // All activity logs except FAULT_CLEARED — returned individually as-is
        parts.push(sql `
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
        AND action <> 'FAULT_CLEARED'
        ${assignedAtFilter}
        ${activityActionFilter}
    `);
        // FAULT_CLEARED from activity logs — island-gap grouping, code=0 hardcoded
        if (types.includes("activity")) {
            parts.push(sql `
        SELECT
          MAX(id) AS id,
          'activity' AS log_type,
          action,
          entity_type,
          message,
          0::integer AS code,
          'Fault cleared - No more faults' AS description,
          MAX(performed_by) AS performed_by,
          MAX(created_at) AS timestamp
        FROM (
          SELECT *,
            (
              row_number() OVER (
                PARTITION BY device_id, entity_id, action
                ORDER BY created_at
              ) -
              row_number() OVER (
                PARTITION BY device_id, entity_id
                ORDER BY created_at
              )
            ) AS grp
          FROM user_activity_logs
          WHERE device_id = ${starterId}
            AND entity_id = ${motorId}
            AND action = 'FAULT_CLEARED'
            AND message IS NOT NULL
            ${assignedAtFilter}
        ) fc
        GROUP BY action, entity_type, message, grp
      `);
        }
    }
    if (includeAlert) {
        parts.push(sql `
  SELECT
    MAX(id) AS id,
    'alert' AS log_type,
    CASE WHEN alert_code = 0 THEN 'ALERT_CLEARED' ELSE 'ALERT' END AS action,
    'STARTER' AS entity_type,
    CASE 
      WHEN alert_code = 0 THEN 'Alert cleared - No more alerts'
      ELSE COALESCE(alert_description, '')
    END AS message,
    alert_code AS code,
    CASE 
      WHEN alert_code = 0 THEN 'Alert cleared - No more alerts'
      ELSE COALESCE(alert_description, '')
    END AS description,
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
      AND alert_code >= 0
      ${assignedAt ? sql `AND created_at >= ${assignedAt}` : sql ``}
  ) alert_groups
  GROUP BY
    starter_id,
    motor_id,
    alert_code,
    CASE 
      WHEN alert_code = 0 THEN 'Alert cleared - No more alerts'
      ELSE COALESCE(alert_description, '')
    END,
    grp
`);
    }
    if (includeFault) {
        // fault_code=0 (cleared) goes through the same island-gap consecutive grouping as non-zero codes
        parts.push(sql `
  SELECT
    MAX(id) AS id,
    'fault' AS log_type,
    CASE WHEN fault_code = 0 THEN 'FAULT_CLEARED' ELSE 'FAULT' END AS action,
    'STARTER' AS entity_type,
    CASE 
      WHEN fault_code = 0 THEN 'Fault cleared - No more faults'
      ELSE COALESCE(fault_description, '')
    END AS message,
    fault_code AS code,
    CASE 
      WHEN fault_code = 0 THEN 'Fault cleared - No more faults'
      ELSE COALESCE(fault_description, '')
    END AS description,
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
      AND fault_code >= 0
      ${assignedAt ? sql `AND created_at >= ${assignedAt}` : sql ``}
  ) fault_groups
  GROUP BY
    starter_id,
    motor_id,
    fault_code,
    CASE 
      WHEN fault_code = 0 THEN 'Fault cleared - No more faults'
      ELSE COALESCE(fault_description, '')
    END,
    grp
`);
    }
    if (parts.length === 0)
        return [];
    const unionQuery = parts.length === 1
        ? parts[0]
        : parts.reduce((acc, part, i) => i === 0 ? part : sql `${acc} UNION ALL ${part}`);
    const query = sql `
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
export async function getUnifiedLogsCount(starterId, motorId, assignedAt = null, logTypes = null) {
    const types = logTypes && logTypes.length > 0 ? logTypes : ["alert", "fault", "activity"];
    const includeAlert = types.includes("alert");
    const includeFault = types.includes("fault");
    const hasActivityType = types.includes("activity") || types.includes("on") || types.includes("off") || types.includes("mode");
    const activityActionFilter = hasActivityType ? buildActivityActionFilter(types) : null;
    const includeActivity = activityActionFilter !== null;
    const assignedAtFilter = assignedAt ? sql `AND created_at >= ${assignedAt}` : sql ``;
    const parts = [];
    if (includeActivity) {
        parts.push(sql `
      SELECT id, message
      FROM user_activity_logs
      WHERE device_id = ${starterId}
        AND (entity_type = 'STARTER' OR entity_id = ${motorId})
        AND action <> 'FAULT_CLEARED'
        AND message IS NOT NULL
        ${assignedAtFilter}
        ${activityActionFilter}
    `);
        if (types.includes("activity")) {
            parts.push(sql `
        SELECT MAX(id) AS id, message
        FROM (
          SELECT *,
            (
              row_number() OVER (
                PARTITION BY device_id, entity_id, action
                ORDER BY created_at
              ) -
              row_number() OVER (
                PARTITION BY device_id, entity_id
                ORDER BY created_at
              )
            ) AS grp
          FROM user_activity_logs
          WHERE device_id = ${starterId}
            AND entity_id = ${motorId}
            AND action = 'FAULT_CLEARED'
            AND message IS NOT NULL
            ${assignedAtFilter}
        ) fc
        GROUP BY action, entity_type, message, grp
      `);
        }
    }
    if (includeAlert) {
        parts.push(sql `
      SELECT
        MAX(id) AS id,
        CASE WHEN alert_code = 0 THEN 'Alert cleared - No more alerts' ELSE COALESCE(alert_description, '') END AS message
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
          AND alert_code >= 0
          ${assignedAt ? sql `AND created_at >= ${assignedAt}` : sql ``}
      ) alert_groups
      GROUP BY
        starter_id, motor_id, alert_code,
        CASE WHEN alert_code = 0 THEN 'Alert cleared - No more alerts' ELSE COALESCE(alert_description, '') END,
        grp
    `);
    }
    if (includeFault) {
        parts.push(sql `
      SELECT
        MAX(id) AS id,
        CASE WHEN fault_code = 0 THEN 'Fault cleared - No more faults' ELSE COALESCE(fault_description, '') END AS message
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
          AND fault_code >= 0
          ${assignedAt ? sql `AND created_at >= ${assignedAt}` : sql ``}
      ) fault_groups
      GROUP BY
        starter_id, motor_id, fault_code,
        CASE WHEN fault_code = 0 THEN 'Fault cleared - No more faults' ELSE COALESCE(fault_description, '') END,
        grp
    `);
    }
    if (parts.length === 0)
        return 0;
    const unionQuery = parts.length === 1
        ? parts[0]
        : parts.reduce((acc, part, i) => i === 0 ? part : sql `${acc} UNION ALL ${part}`);
    const countQuery = sql `
    SELECT COUNT(*) AS total FROM (
      ${unionQuery}
    ) unified
  `;
    const countRes = await db.execute(countQuery);
    return Number(countRes.rows?.[0]?.total ?? 0);
}
