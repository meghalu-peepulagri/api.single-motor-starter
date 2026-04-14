import { and, eq, ne, sql } from "drizzle-orm";
import db from "../../database/configuration.js";
import type { Gateway } from "../../database/schemas/gateways.js";
import { gateways, type GatewayTable } from "../../database/schemas/gateways.js";
import BadRequestException from "../../exceptions/bad-request-exception.js";
import { GATEWAY_ALREADY_ASSIGNED } from "../../constants/app-constants.js";
import { getSingleRecordConditionallyWithOr, updateRecordById } from "./base-db-services.js";
import type { OrderByQueryData } from "../../types/db-types.js";
import { prepareOrderByQueryConditions } from "../../utils/db-utils.js";


export async function getGatewaysList(whereQueryData: any, orderQueryData: OrderByQueryData<GatewayTable>) {
  const whereQuery = whereQueryData && whereQueryData.length > 0 ? and(...whereQueryData) : undefined;

  const orderQuery = prepareOrderByQueryConditions<GatewayTable>(gateways, orderQueryData);

  const records = await db.query.gateways.findMany({
    where: whereQuery,
    orderBy: orderQuery,
    columns: {
      id: true,
      name: true,
      gateway_number: true,
      label: true,
      mac_address: true,
      pcb_number: true,
      status: true,
      created_at: true,
    },
    with: {
      location: {
        columns: {
          id: true,
          name: true,
        },
      },
      user: {
        columns: {
          id: true,
          full_name: true,
        },
      },
    },
  });

  const [gatewaysCount] = await db.select({
    gateways_count: sql<number>`
        CAST(count(*) AS INTEGER) `,
  }).from(gateways).where(whereQuery);

  return {
    gateways_count: gatewaysCount.gateways_count,
    records,
  };
}


export async function getGatewayDetails(gatewayId: number) {
  return await db.query.gateways.findFirst({
    where: and(
      sql`${gateways.id} = ${gatewayId}`,
      sql`${gateways.status} != 'ARCHIVED'`,
    ),
    columns: {
      id: true,
      name: true,
      gateway_number: true,
      label: true,
      mac_address: true,
      pcb_number: true,
      status: true,
      created_at: true,
      updated_at: true,
    },
    with: {
      location: {
        columns: {
          id: true,
          name: true,
        },
      },
      user: {
        columns: {
          id: true,
          full_name: true,
        },
      },
    },
  });
}

export async function getGatewayForOwnerAction<C extends keyof Gateway>(
  gatewayId: number,
  userId: number,
  columnsToSelect: C[],
): Promise<Pick<Gateway, C> | null> {
  const gateway = await getSingleRecordConditionallyWithOr(
    gateways,
    {
      columns: ["id", "status"],
      relations: ["=", "!="],
      values: [gatewayId, "ARCHIVED"],
      or: [
        { columns: ["user_id"], relations: ["="], values: [userId] },
        { columns: ["created_by"], relations: ["="], values: [userId] },
      ],
    },
    columnsToSelect,
  );

  return gateway as Pick<Gateway, C> | null;
}

export async function assignGatewayToUser(data: {
  mac_address?: string;
  pcb_number?: string;
  gateway_number?: string;
  name?: string;
  targetUserId: number;
  performedByUserId: number;
}, trx?: any): Promise<{ gateway_id: number; name: string; old_user_id: number | null } | null> {
  const queryBuilder = trx || db;

  const conditions: any[] = [ne(gateways.status, "ARCHIVED")];
  if (data.mac_address) conditions.push(eq(gateways.mac_address, data.mac_address));
  if (data.pcb_number) conditions.push(eq(gateways.pcb_number, data.pcb_number));
  if (data.gateway_number) conditions.push(sql`lower(${gateways.gateway_number}) = ${data.gateway_number.toLowerCase()}`);
  if (data.name) conditions.push(sql`lower(${gateways.name}) = ${data.name.toLowerCase()}`);

  const matched = await queryBuilder
    .select({
      id: gateways.id,
      name: gateways.name,
      user_id: gateways.user_id,
    })
    .from(gateways)
    .where(and(...conditions));

  if (matched.length === 0) return null;
  if (matched.length > 1) {
    throw new BadRequestException("Multiple gateways found with given identifiers");
  }

  const gateway = matched[0];
  if (gateway.user_id && gateway.user_id !== data.targetUserId) {
    throw new BadRequestException(GATEWAY_ALREADY_ASSIGNED);
  }

  await updateRecordById<GatewayTable>(gateways, gateway.id, { user_id: data.targetUserId }, trx);

  return { gateway_id: gateway.id, name: gateway.name, old_user_id: gateway.user_id };
}
