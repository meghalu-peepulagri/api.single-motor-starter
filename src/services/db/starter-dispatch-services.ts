import { and, ne, eq, sql, or, count, desc, asc } from "drizzle-orm";
import db from "../../database/configuration.js";
import { starterDispatch } from "../../database/schemas/starter-dispatch.js";
import { users } from "../../database/schemas/users.js";
import { DISPATCH_SORTABLE_COLUMNS } from "../../types/app-types.js";

export async function getStarterDispatchByStarterId(starterId: number) {
  return await db.query.starterDispatch.findFirst({
    where: and(
      eq(starterDispatch.starter_id, starterId),
      ne(starterDispatch.status, "ARCHIVED")
    ),
    with: {
      createdBy: {
        where: ne(users.status, "ARCHIVED"),
        columns: {
          id: true,
          full_name: true,
        },
      },
      updatedBy: {
        where: ne(users.status, "ARCHIVED"),
        columns: {
          id: true,
          full_name: true,
        },
      },
    },
  } as any);
}

function getExpiryCondition(type?: string) {
  const simExpiryCondition = sql`TO_DATE(${starterDispatch.sim_recharge_end_date}, 'DD-MM-YYYY') BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'`;
  const warrantyExpiryCondition = sql`TO_DATE(${starterDispatch.warranty_end_date}, 'DD-MM-YYYY') BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'`;

  if (type === "recharge") return simExpiryCondition;
  if (type === "warranty") return warrantyExpiryCondition;
  return or(simExpiryCondition, warrantyExpiryCondition);
}

export async function getExpiringDispatchesCount(type?: string) {
  const expiryCondition = getExpiryCondition(type);
  const result = await db.select({ total: count() }).from(starterDispatch)
    .where(and(ne(starterDispatch.status, "ARCHIVED"), expiryCondition));
  return result[0]?.total || 0;
}

export async function getExpiringDispatches(
  type?: string,
  offset?: number,
  limit?: number,
  order_by?: string,
  order_type?: string
) {
  const expiryCondition = getExpiryCondition(type);
  const column = (order_by && DISPATCH_SORTABLE_COLUMNS[order_by]) ? DISPATCH_SORTABLE_COLUMNS[order_by] : starterDispatch.created_at;
  const orderByClause = order_type?.toLowerCase() === "asc" ? asc(column) : desc(column);

  return await db.query.starterDispatch.findMany({
    where: and(
      ne(starterDispatch.status, "ARCHIVED"),
      expiryCondition
    ),
    orderBy: orderByClause,
    columns: {
      id: true,
      starter_id: true,
      customer_name: true,
      contact_number: true,
      address: true,
      location: true,
      sim_no: true,
      sim_recharge_end_date: true,
      warranty_end_date: true,
    },
    ...(offset !== undefined && limit !== undefined ? { offset, limit } : {}),
  } as any);
}
