import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import db from "../../database/configuration.js";
import { starterBoxParameters } from "../../database/schemas/starter-parameters.js";

export interface AnalyticsFilters {
  fromDate?: string;
  toDate?: string;
  starterId?: number;
}

export async function getCompletePayloadAnalytics(filters?: AnalyticsFilters) {
  const whereConditions: any[] = [];

  if (filters?.starterId) {
    whereConditions.push(eq(starterBoxParameters.starter_id, filters.starterId));
  }

  if (filters?.fromDate) {
    whereConditions.push(gte(starterBoxParameters.created_at, new Date(filters.fromDate)));
  }

  if (filters?.toDate) {
    whereConditions.push(lte(starterBoxParameters.created_at, new Date(filters.toDate)));
  }

  const   baseWhere = whereConditions.length > 0 ? and(...whereConditions) : undefined;

  // 1. Overall Counts
  const overallStats = await db.select({
    total_records: sql<number>`count(*)::int`,
    valid_records: sql<number>`count(*) filter (where ${starterBoxParameters.payload_valid} = true)::int`,
    invalid_records: sql<number>`count(*) filter (where ${starterBoxParameters.payload_valid} = false)::int`,
  }).from(starterBoxParameters).where(baseWhere);

  const stats = overallStats[0];
  const total = stats.total_records || 0;
  const valid_percentage = total > 0 ? Number(((stats.valid_records / total) * 100).toFixed(2)) : 0;
  const invalid_percentage = total > 0 ? Number(((stats.invalid_records / total) * 100).toFixed(2)) : 0;

  // 2. Group Wise distribution
  const groupWise = await db.select({
    group_id: starterBoxParameters.group_id,
    count: sql<number>`count(*)::int`,
  })
    .from(starterBoxParameters)
    .where(baseWhere)
    .groupBy(starterBoxParameters.group_id);

  // 3. Most Common Errors (unnesting jsonb array)
  // Note: Using raw SQL for unnesting jsonb
  const errorFrequency = await db.execute(sql`
    SELECT error_msg, count(*)::int as frequency
    FROM ${starterBoxParameters}, jsonb_array_elements_text(${starterBoxParameters.payload_errors}) as error_msg
    WHERE ${baseWhere ?? sql`true`}
    GROUP BY error_msg
    ORDER BY frequency DESC
    LIMIT 10
  `);

  // 4. Fault/Alert Analysis
  const commonFaults = await db.select({
    fault: starterBoxParameters.fault_description,
    count: sql<number>`count(*)::int`,
  })
    .from(starterBoxParameters)
    .where(and(baseWhere, sql`${starterBoxParameters.fault} > 0`))
    .groupBy(starterBoxParameters.fault_description)
    .orderBy(desc(sql`count(*)`))
    .limit(10);

  const commonAlerts = await db.select({
    alert: starterBoxParameters.alert_description,
    count: sql<number>`count(*)::int`,
  })
    .from(starterBoxParameters)
    .where(and(baseWhere, sql`${starterBoxParameters.alert_code} > 0`))
    .groupBy(starterBoxParameters.alert_description)
    .orderBy(desc(sql`count(*)`))
    .limit(10);

  return {
    summary: {
      total_records: total,
      valid_records: stats.valid_records,
      invalid_records: stats.invalid_records,
      valid_percentage,
      invalid_percentage,
    },
    group_distribution: groupWise,
    most_frequent_errors: errorFrequency.rows,
    most_frequent_faults: commonFaults,
    most_frequent_alerts: commonAlerts,
  };
}
