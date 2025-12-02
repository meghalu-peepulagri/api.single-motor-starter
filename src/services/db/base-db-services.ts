import type { SQL } from "drizzle-orm";
import { and, asc, count, desc, eq, getTableName, inArray, sql } from "drizzle-orm";
import { DB_ID_INVALID, DB_SAVE_DATA_FAILED, DB_UPDATE_DATA_FAILED } from "../../constants/app-constants.js";
import db from "../../database/configuration.js";
import UnprocessableEntityException from "../../exceptions/unprocessable-entity-exception.js";
import type { DBNewRecord, DBRecord, DBTable, InQueryData, OrderByQueryData, PaginationInfo, Relations, UpdateRecordData, WhereQueryData } from "../../types/db-types.js";
import { executeQuery, prepareInQueryCondition, prepareOrderByQueryConditions, prepareSelectColumnsForQuery, prepareWhereQueryConditions } from "../../utils/db-utils.js";

async function getRecordById<T extends DBTable, C extends keyof DBRecord<T> = keyof DBRecord<T>>(table: T, id: number, columnsToSelect?: any): Promise<DBRecord<T> | Pick<DBRecord<T>, C> | null> {
  const columnsRequired = prepareSelectColumnsForQuery(table, columnsToSelect);
  const columnInfo = sql.raw(`${getTableName(table)}.id`);
  const result = columnsRequired
    ? await db.select(columnsRequired).from(table as any).where(eq(columnInfo, id))
    : await db.select().from(table as any).where(eq(columnInfo, id));

  if (result.length === 0) {
    return null;
  }

  if (columnsRequired) {
    return result[0] as Pick<DBRecord<T>, C>;
  }

  return result[0] as DBRecord<T>;
}

async function getRecordsConditionally<T extends DBTable, C extends keyof DBRecord<T> = keyof DBRecord<T>>(table: T, whereQueryData?: WhereQueryData<T>, columnsToSelect?: any, orderByQueryData?: OrderByQueryData<T>, inQueryData?: InQueryData<T>) {
  const columnsRequired = prepareSelectColumnsForQuery(table, columnsToSelect);
  const whereConditions = prepareWhereQueryConditions(table, whereQueryData);
  const inQueryCondition = prepareInQueryCondition(table, inQueryData);
  const orderByConditions = prepareOrderByQueryConditions(table, orderByQueryData);

  const whereQuery = whereConditions ? and(...whereConditions) : null;

  const results = await executeQuery<T, C>(table, whereQuery, columnsRequired, orderByConditions, inQueryCondition);

  return results;
}

async function getPaginatedRecordsConditionally<T extends DBTable, C extends keyof DBRecord<T> = keyof DBRecord<T>>(table: T, page: number, pageSize: number, orderByQueryData?: OrderByQueryData<T>, whereQueryData?: WhereQueryData<T>, columnsToSelect?: any, inQueryData?: InQueryData<T>) {
  const columnInfo = sql.raw(`${getTableName(table)}.id`);
  let countQuery = db.select({ total: count(columnInfo) }).from(table as any).$dynamic();

  if (whereQueryData && inQueryData) {
    // Case 1: Both where and in query data exist
    const whereConditions = prepareWhereQueryConditions(table, whereQueryData);
    const inQueryCondition = prepareInQueryCondition(table, inQueryData);

    if (whereConditions && whereConditions.length > 0 && inQueryCondition) {
      // Both conditions are valid - combine them with AND
      countQuery = countQuery.where(and(and(...whereConditions), inQueryCondition));
    }
  }
  else if (whereQueryData) {
    // Case 2: Only where query data exists
    const whereConditions = prepareWhereQueryConditions(table, whereQueryData);
    if (whereConditions && whereConditions.length > 0) {
      countQuery = countQuery.where(and(...whereConditions));
    }
  }

  const recordsCount = await countQuery;
  const total_records = recordsCount[0]?.total || 0;
  const total_pages = Math.ceil(total_records / pageSize) || 1;

  const pagination_info: PaginationInfo = {
    total_records,
    total_pages,
    page_size: pageSize,
    current_page: page > total_pages ? total_pages : page,
    next_page: page >= total_pages ? null : page + 1,
    prev_page: page <= 1 ? null : page - 1,
  };

  if (total_records === 0) {
    return {
      pagination_info,
      records: [],
    };
  }

  const columnsRequired = prepareSelectColumnsForQuery(table, columnsToSelect);
  const whereConditions = prepareWhereQueryConditions(table, whereQueryData);
  const orderByConditions = prepareOrderByQueryConditions(table, orderByQueryData);
  const inQueryCondition = prepareInQueryCondition(table, inQueryData);

  const whereQuery = whereConditions ? and(...whereConditions) : null;

  const paginationData = { page, pageSize };
  const results = await executeQuery<T, C>(table, whereQuery, columnsRequired, orderByConditions, inQueryCondition, paginationData);

  return {
    pagination_info,
    records: results,
  };
}

async function getMultipleRecordsByAColumnValue<T extends DBTable, C extends keyof DBRecord<T> = keyof DBRecord<T>>(table: T, column: C, relation: Relations, value: any, columnsToSelect?: any, orderByQueryData?: OrderByQueryData<T>, inQueryData?: InQueryData<T>) {
  const whereQueryData: WhereQueryData<T> = {
    columns: [column],
    relations: [relation],
    values: [value],
  };

  const results = await getRecordsConditionally<T, C>(table, whereQueryData, columnsToSelect, orderByQueryData, inQueryData);
  return results;
}

async function getMultipleRecordsByMultipleColumnValues<T extends DBTable, C extends keyof DBRecord<T> = keyof DBRecord<T>>(table: T, columns: C[], relations: Relations[], values: any[], columnsToSelect?: any, orderByQueryData?: OrderByQueryData<T>, inQueryData?: InQueryData<T>) {
  const whereQueryData: WhereQueryData<T> = {
    columns,
    relations,
    values,
  };

  const results = await getRecordsConditionally<T, C>(table, whereQueryData, columnsToSelect, orderByQueryData, inQueryData);

  return results;
}

async function getSingleRecordByAColumnValue<T extends DBTable, C extends keyof DBRecord<T> = keyof DBRecord<T>>(table: T, column: C, relation: Relations, value: any, columnsToSelect?: any, orderByQueryData?: OrderByQueryData<T>, inQueryData?: InQueryData<T>): Promise<DBRecord<T> | null> {
  const whereQueryData: WhereQueryData<T> = {
    columns: [column],
    relations: [relation],
    values: [value],
  };

  const results = await getRecordsConditionally<T, C>(table, whereQueryData, columnsToSelect, orderByQueryData, inQueryData);

  if (!results) {
    return null;
  }
  return results[0] as DBRecord<T>;
}

export async function getRecordByPrimaryKey<
  T extends DBTable,
  C extends keyof DBRecord<T> = keyof DBRecord<T>,
>(
  table: T,
  id: number,
  columnsToSelect?: readonly C[],
): Promise<Pick<DBRecord<T>, C> | null> {
  if (Number.isNaN(id) || id <= 0) {
    throw new UnprocessableEntityException(DB_ID_INVALID);
  }
  const columnInfo = sql.raw(`${getTableName(table)}.id`);
  const columnsRequired = _prepareSelectColumnsForQuery<T>(table, columnsToSelect);
  const baseQuery = columnsRequired
    ? db.select(columnsRequired).from(table as any).$dynamic()
    : db.select().from(table as any).$dynamic();
  const query = baseQuery.where(eq(columnInfo, id));
  const result = await query;
  return Array.isArray(result) && result.length > 0
    ? result[0] as Pick<DBRecord<T>, C>
    : null;
}

function _prepareSelectColumnsForQuery<T extends DBTable>(
  table: T,
  columnsToSelect?: readonly (keyof DBRecord<T>)[],
): Record<string, SQL> | null {
  if (!columnsToSelect) {
    return null;
  }

  if (columnsToSelect.length === 0) {
    return {};
  }

  const columnsForQuery: Record<string, SQL> = {};
  columnsToSelect.forEach((column) => {
    columnsForQuery[column as string] = sql.raw(
      `${getTableName(table)}.${column as string}`,
    );
  });
  return columnsForQuery;
}

async function getSingleRecordByMultipleColumnValues<T extends DBTable, C extends keyof DBRecord<T> = keyof DBRecord<T>>(
  table: T,
  columns: C[],
  relations: Relations[],
  values: any[],
  columnsToSelect?: any,
  orderByQueryData?: OrderByQueryData<T>,
  inQueryData?: InQueryData<T>,
): Promise<DBRecord<T> | null> {
  const whereQueryData: WhereQueryData<T> = {
    columns,
    relations,
    values,
  };

  const results = await getRecordsConditionally<T, C>(table, whereQueryData, columnsToSelect, orderByQueryData, inQueryData);

  if (!results) {
    return null;
  }
  return results[0] as DBRecord<T>;
}


async function saveSingleRecord<T extends DBTable>(table: T, record: DBNewRecord<T>, trx?: any) {
  const query = trx ? trx.insert(table).values(record).returning() : db.insert(table).values(record as any).returning();
  const recordSaved = await query;
  return recordSaved[0] as T;
}

async function saveRecords<T extends DBTable>(table: T, records: DBNewRecord<T>[], trx?: any) {
  const query = trx ? trx.insert(table).values(records).returning() : db.insert(table).values(records as any).returning();
  const recordsSaved = await query;
  return recordsSaved as T[];
}

async function updateRecordById<T extends DBTable>(table: T, id: number, record: UpdateRecordData<T>): Promise<DBRecord<T>> {
  const dataWithTimeStamps = { ...record, updated_at: new Date() };
  const recordUpdated = await db
    .update(table)
    .set(dataWithTimeStamps as any)
    .where(eq(table.id, id))
    .returning();
  if (!Array.isArray(recordUpdated)) {
    throw new UnprocessableEntityException(DB_SAVE_DATA_FAILED);
  }
  return recordUpdated[0] as DBRecord<T>;
}

async function deleteRecordById<T extends DBTable>(table: T, id: number) {
  const columnInfo = sql.raw(`${getTableName(table)}.id`);
  const deletedRecord = await db.delete(table).where(eq(columnInfo, id)).returning();
  return deletedRecord[0] as DBRecord<T>;
}

async function deleteRecordsByAColumnValue<T extends DBTable, C extends keyof DBRecord<T>>(table: T, column: C, value: any): Promise<DBRecord<T>> {
  const columnInfo = sql.raw(`${getTableName(table)}.${column as string}`);
  const deletedRecord = await db.delete(table).where(eq(columnInfo, value)).returning();
  return deletedRecord[0] as DBRecord<T>;
}

async function deleteRecordsByMultipleColumnValues<T extends DBTable, C extends keyof DBRecord<T> = keyof DBRecord<T>>(
  table: T,
  columns: C[],
  relations: Relations[],
  values: any[],
): Promise<DBRecord<T> | null> {
  const whereQueryData: WhereQueryData<T> = {
    columns,
    relations,
    values,
  };
  const whereConditions = prepareWhereQueryConditions<T>(table, whereQueryData);
  const whereQuery = whereConditions ? and(...whereConditions) : null;
  if (!whereQuery) {
    return null;
  }
  const deletedRecord = await db.delete(table).where(whereQuery).returning();
  return deletedRecord[0] as DBRecord<T>;
}

async function softDeleteRecordById<T extends DBTable>(table: T, id: number, record: UpdateRecordData<T>) {
  const columnInfo = sql.raw(`${getTableName(table)}.id`);

  const result = await db
    .update(table)
    .set(record as any)
    .where(eq(columnInfo, id))
    .returning();
  return result;
}



async function updateRecordByIdWithTrx<T extends DBTable>(table: T, id: number, record: UpdateRecordData<T>, trx?: any) {
  const dataWithTimeStamps = { ...record };

    const queryBuilder = trx || db;

  const [updatedRecord] = await queryBuilder
    .update(table)
    .set(dataWithTimeStamps)
    .where(eq(table.id, id))
    .returning();

  return updatedRecord as T;
}

async function exportData(table: DBTable, projection?: any, filters?: any) {
  const initialQuery = db.select(projection).from(table);
  let finalQuery;
  if (filters && filters.length > 0) {
    finalQuery = initialQuery.where(and(...filters));
  }
  const result = await finalQuery;
  return result;
}

async function getPaginatedRecords(table: DBTable, skip: number, limit: number, filters?: SQL<unknown>[], sorting?: any, projection?: any) {
  let initialQuery: any = db.select(projection).from(table);
  if (filters && filters.length > 0) {
    initialQuery = initialQuery.where(and(...filters));
  }
  if (sorting) {
    const columnExpression = (table as any)[sorting.sort_by];
    if (sorting.sort_type === "asc") {
      initialQuery = initialQuery.orderBy(asc(columnExpression));
    }
    else {
      initialQuery = initialQuery.orderBy(desc(columnExpression));
    }
  }
  else {
    initialQuery = initialQuery.orderBy(desc(table.created_at));
  }
  const result = await initialQuery.limit(limit).offset(skip);
  return result;
}

async function getRecordsCount(table: DBTable, filters?: SQL<unknown>[]) {
  const initialQuery = db.select({ total: count() }).from(table);
  let finalQuery;
  if (filters && filters.length > 0) {
    finalQuery = initialQuery.where(and(...filters));
  }
  else {
    finalQuery = initialQuery;
  }

  const result = await finalQuery;
  return result[0].total;
}

export async function deleteAllRecords(table: DBTable) {
  return await db.delete(table);
}

async function updateRecordByColumnValue<T extends DBTable>(table: T, column: string, value: string | number, record: UpdateRecordData<T>, id?: number) {
  const dataWithTimeStamps = { id, ...record, updated_at: new Date() };
  const columnInfo = sql.raw(`${getTableName(table)}.${column}`);
  return await db.update(table).set(dataWithTimeStamps as any).where(eq(columnInfo, value));
}

async function updateRecordByMultipleColumnValues<T extends DBTable, C extends keyof DBRecord<T> = keyof DBRecord<T>>(table: T, columns: C[], relations: Relations[], values: any[], record: UpdateRecordData<T>, id?: number): Promise<DBRecord<T>> {
  const whereQueryData: WhereQueryData<T> = {
    columns,
    relations,
    values,
  };

  const dataWithTimeStamps = { id, ...record, updated_at: new Date() };
  const whereConditions = whereQueryData.columns.map((column: unknown, index: number) =>
    eq(sql.raw(`${getTableName(table)}.${String(column as string)}`), whereQueryData.values[index]),
  );

  const result = await db.update(table).set(dataWithTimeStamps as any).where(and(...whereConditions)).returning();
  if (!Array.isArray(result)) {
    throw new UnprocessableEntityException(DB_UPDATE_DATA_FAILED);
  }
  return result[0] as DBRecord<T>;
}

async function updateMultipleRecordsByIds<T extends DBTable>(table: DBTable, ids: number[], record: Partial<T>) {
  const columnInfo = sql.raw(`${getTableName(table)}.id`);
  const updatedRecords = await db.update(table)
    .set(record)
    .where(inArray(columnInfo, ids))
    .returning();

  return updatedRecords.length;
}

export {
  deleteRecordById,
  deleteRecordsByAColumnValue,
  deleteRecordsByMultipleColumnValues,
  exportData,
  getMultipleRecordsByAColumnValue,
  getMultipleRecordsByMultipleColumnValues,
  getPaginatedRecords,
  getPaginatedRecordsConditionally,
  getRecordById,
  getRecordsConditionally,
  getRecordsCount,
  getSingleRecordByAColumnValue,
  getSingleRecordByMultipleColumnValues, saveRecords, saveSingleRecord, softDeleteRecordById,
  updateMultipleRecordsByIds,
  updateRecordByColumnValue,
  updateRecordById, updateRecordByIdWithTrx, updateRecordByMultipleColumnValues
};

