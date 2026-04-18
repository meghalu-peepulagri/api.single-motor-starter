import { and, desc, eq, ne, sql } from "drizzle-orm";
import db from "../../database/configuration.js";
import type { Gateway } from "../../database/schemas/gateways.js";
import { gateways, type GatewayTable } from "../../database/schemas/gateways.js";
import BadRequestException from "../../exceptions/bad-request-exception.js";
import { GATEWAY_ALREADY_ASSIGNED, GATEWAY_NOT_FOUND, UNIQUE_INDEX_MESSAGES } from "../../constants/app-constants.js";
import ConflictException from "../../exceptions/conflict-exception.js";
import { getSingleRecordByMultipleColumnValues, getSingleRecordConditionallyWithOr, updateRecordById } from "./base-db-services.js";
import type { OrderByQueryData } from "../../types/db-types.js";
import { prepareOrderByQueryConditions } from "../../utils/db-utils.js";
import { getPaginationData } from "../../helpers/pagination-helper.js";


export async function getGatewaysList(
  whereQueryData: any,
  orderQueryData: OrderByQueryData<GatewayTable>,
  pageParams?: { page: number; pageSize: number; offset: number },
) {
  const whereQuery = whereQueryData && whereQueryData.length > 0 ? and(...whereQueryData) : undefined;

  const orderQuery = prepareOrderByQueryConditions<GatewayTable>(gateways, orderQueryData);

  const records = await db.query.gateways.findMany({
    where: whereQuery,
    orderBy: orderQuery,
    limit: pageParams?.pageSize,
    offset: pageParams?.offset,
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
    pagination_info: pageParams
      ? getPaginationData(pageParams.page, pageParams.pageSize, gatewaysCount.gateways_count)
      : undefined,
    records,
  };
}

export async function getGatewaysDropdownList(
  whereQueryData: any,
  pageParams: { page: number; pageSize: number; offset: number },
) {
  const whereQuery = whereQueryData && whereQueryData.length > 0 ? and(...whereQueryData) : undefined;

  const records = await db.query.gateways.findMany({
    where: whereQuery,
    orderBy: [desc(gateways.created_at)],
    limit: pageParams.pageSize,
    offset: pageParams.offset,
    columns: {
      id: true,
      pcb_number: true,
      mac_address: true,
    },
  });

  const [gatewaysCount] = await db.select({
    gateways_count: sql<number>`CAST(count(*) AS INTEGER)`,
  }).from(gateways).where(whereQuery);

  return {
    gateways_count: gatewaysCount.gateways_count,
    pagination_info: getPaginationData(pageParams.page, pageParams.pageSize, gatewaysCount.gateways_count),
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

export async function gatewayConflicts(gatewayId?: number): Promise<Gateway | null> {
  if (gatewayId == null) {
    return null;
  }

  const existingGateway: Gateway | null = await getSingleRecordByMultipleColumnValues(
    gateways,
    ["id", "status"],
    ["=", "!="],
    [gatewayId, "ARCHIVED"],
  );

  if (!existingGateway) {
    throw new BadRequestException(GATEWAY_NOT_FOUND);
  }

  return existingGateway;
}

export async function assertGatewayIdentifiersUnique(data: {
  nameLower: string;
  macLower: string;
  pcbLower: string;
  gatewayNumberLower: string | null;
}, trx?: any) {
  const queryBuilder = trx || db;

  const orConditions = [
    sql`lower(${gateways.name}) = ${data.nameLower}`,
    sql`lower(${gateways.mac_address}) = ${data.macLower}`,
    sql`lower(${gateways.pcb_number}) = ${data.pcbLower}`,
  ];
  if (data.gatewayNumberLower) {
    orConditions.push(sql`lower(${gateways.gateway_number}) = ${data.gatewayNumberLower}`);
  }

  const matched = await queryBuilder
    .select({
      name: gateways.name,
      mac_address: gateways.mac_address,
      pcb_number: gateways.pcb_number,
      gateway_number: gateways.gateway_number,
    })
    .from(gateways)
    .where(and(
      ne(gateways.status, "ARCHIVED"),
      sql`(${sql.join(orConditions, sql` OR `)})`,
    ))
    .limit(1);

  if (!Array.isArray(matched) || matched.length === 0) {
    return;
  }

  const duplicate = matched[0];
  const existingNameLower = duplicate.name?.trim().toLowerCase() ?? null;
  const existingMacLower = duplicate.mac_address?.trim().toLowerCase() ?? null;
  const existingPcbLower = duplicate.pcb_number?.trim().toLowerCase() ?? null;
  const existingGatewayNumberLower = duplicate.gateway_number?.trim().toLowerCase() ?? null;

  if (existingNameLower === data.nameLower) {
    throw new ConflictException(UNIQUE_INDEX_MESSAGES["validate_gateway_name"]);
  }
  if (data.gatewayNumberLower && existingGatewayNumberLower === data.gatewayNumberLower) {
    throw new ConflictException(UNIQUE_INDEX_MESSAGES["validate_gateway_number"]);
  }
  if (existingPcbLower === data.pcbLower) {
    throw new ConflictException(UNIQUE_INDEX_MESSAGES["validate_gateway_pcb_number"]);
  }
  if (existingMacLower === data.macLower) {
    throw new ConflictException(UNIQUE_INDEX_MESSAGES["validate_gateway_mac_address"]);
  }

  throw new ConflictException();
}
