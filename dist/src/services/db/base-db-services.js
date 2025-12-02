import { and, asc, count, desc, eq, getTableName, inArray, sql } from "drizzle-orm";
import { DB_ID_INVALID, DB_SAVE_DATA_FAILED, DB_UPDATE_DATA_FAILED } from "../../constants/app-constants.js";
import db from "../../database/configuration.js";
import UnprocessableEntityException from "../../exceptions/unprocessable-entity-exception.js";
import { executeQuery, prepareInQueryCondition, prepareOrderByQueryConditions, prepareSelectColumnsForQuery, prepareWhereQueryConditions } from "../../utils/db-utils.js";
async function getRecordById(table, id, columnsToSelect) {
    const columnsRequired = prepareSelectColumnsForQuery(table, columnsToSelect);
    const columnInfo = sql.raw(`${getTableName(table)}.id`);
    const result = columnsRequired
        ? await db.select(columnsRequired).from(table).where(eq(columnInfo, id))
        : await db.select().from(table).where(eq(columnInfo, id));
    if (result.length === 0) {
        return null;
    }
    if (columnsRequired) {
        return result[0];
    }
    return result[0];
}
async function getRecordsConditionally(table, whereQueryData, columnsToSelect, orderByQueryData, inQueryData) {
    const columnsRequired = prepareSelectColumnsForQuery(table, columnsToSelect);
    const whereConditions = prepareWhereQueryConditions(table, whereQueryData);
    const inQueryCondition = prepareInQueryCondition(table, inQueryData);
    const orderByConditions = prepareOrderByQueryConditions(table, orderByQueryData);
    const whereQuery = whereConditions ? and(...whereConditions) : null;
    const results = await executeQuery(table, whereQuery, columnsRequired, orderByConditions, inQueryCondition);
    return results;
}
async function getPaginatedRecordsConditionally(table, page, pageSize, orderByQueryData, whereQueryData, columnsToSelect, inQueryData) {
    const columnInfo = sql.raw(`${getTableName(table)}.id`);
    let countQuery = db.select({ total: count(columnInfo) }).from(table).$dynamic();
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
    const pagination_info = {
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
    const results = await executeQuery(table, whereQuery, columnsRequired, orderByConditions, inQueryCondition, paginationData);
    return {
        pagination_info,
        records: results,
    };
}
async function getMultipleRecordsByAColumnValue(table, column, relation, value, columnsToSelect, orderByQueryData, inQueryData) {
    const whereQueryData = {
        columns: [column],
        relations: [relation],
        values: [value],
    };
    const results = await getRecordsConditionally(table, whereQueryData, columnsToSelect, orderByQueryData, inQueryData);
    return results;
}
async function getMultipleRecordsByMultipleColumnValues(table, columns, relations, values, columnsToSelect, orderByQueryData, inQueryData) {
    const whereQueryData = {
        columns,
        relations,
        values,
    };
    const results = await getRecordsConditionally(table, whereQueryData, columnsToSelect, orderByQueryData, inQueryData);
    return results;
}
async function getSingleRecordByAColumnValue(table, column, relation, value, columnsToSelect, orderByQueryData, inQueryData) {
    const whereQueryData = {
        columns: [column],
        relations: [relation],
        values: [value],
    };
    const results = await getRecordsConditionally(table, whereQueryData, columnsToSelect, orderByQueryData, inQueryData);
    if (!results) {
        return null;
    }
    return results[0];
}
export async function getRecordByPrimaryKey(table, id, columnsToSelect) {
    if (Number.isNaN(id) || id <= 0) {
        throw new UnprocessableEntityException(DB_ID_INVALID);
    }
    const columnInfo = sql.raw(`${getTableName(table)}.id`);
    const columnsRequired = _prepareSelectColumnsForQuery(table, columnsToSelect);
    const baseQuery = columnsRequired
        ? db.select(columnsRequired).from(table).$dynamic()
        : db.select().from(table).$dynamic();
    const query = baseQuery.where(eq(columnInfo, id));
    const result = await query;
    return Array.isArray(result) && result.length > 0
        ? result[0]
        : null;
}
function _prepareSelectColumnsForQuery(table, columnsToSelect) {
    if (!columnsToSelect) {
        return null;
    }
    if (columnsToSelect.length === 0) {
        return {};
    }
    const columnsForQuery = {};
    columnsToSelect.forEach((column) => {
        columnsForQuery[column] = sql.raw(`${getTableName(table)}.${column}`);
    });
    return columnsForQuery;
}
async function getSingleRecordByMultipleColumnValues(table, columns, relations, values, columnsToSelect, orderByQueryData, inQueryData) {
    const whereQueryData = {
        columns,
        relations,
        values,
    };
    const results = await getRecordsConditionally(table, whereQueryData, columnsToSelect, orderByQueryData, inQueryData);
    if (!results) {
        return null;
    }
    return results[0];
}
async function saveSingleRecord(table, record, trx) {
    const query = trx ? trx.insert(table).values(record).returning() : db.insert(table).values(record).returning();
    const recordSaved = await query;
    return recordSaved[0];
}
async function saveRecords(table, records, trx) {
    const query = trx ? trx.insert(table).values(records).returning() : db.insert(table).values(records).returning();
    const recordsSaved = await query;
    return recordsSaved;
}
async function updateRecordById(table, id, record) {
    const dataWithTimeStamps = { ...record, updated_at: new Date() };
    const recordUpdated = await db
        .update(table)
        .set(dataWithTimeStamps)
        .where(eq(table.id, id))
        .returning();
    if (!Array.isArray(recordUpdated)) {
        throw new UnprocessableEntityException(DB_SAVE_DATA_FAILED);
    }
    return recordUpdated[0];
}
async function deleteRecordById(table, id) {
    const columnInfo = sql.raw(`${getTableName(table)}.id`);
    const deletedRecord = await db.delete(table).where(eq(columnInfo, id)).returning();
    return deletedRecord[0];
}
async function deleteRecordsByAColumnValue(table, column, value) {
    const columnInfo = sql.raw(`${getTableName(table)}.${column}`);
    const deletedRecord = await db.delete(table).where(eq(columnInfo, value)).returning();
    return deletedRecord[0];
}
async function deleteRecordsByMultipleColumnValues(table, columns, relations, values) {
    const whereQueryData = {
        columns,
        relations,
        values,
    };
    const whereConditions = prepareWhereQueryConditions(table, whereQueryData);
    const whereQuery = whereConditions ? and(...whereConditions) : null;
    if (!whereQuery) {
        return null;
    }
    const deletedRecord = await db.delete(table).where(whereQuery).returning();
    return deletedRecord[0];
}
async function softDeleteRecordById(table, id, record) {
    const columnInfo = sql.raw(`${getTableName(table)}.id`);
    const result = await db
        .update(table)
        .set(record)
        .where(eq(columnInfo, id))
        .returning();
    return result;
}
async function updateRecordByIdWithTrx(table, id, record, trx) {
    const dataWithTimeStamps = { ...record };
    const queryBuilder = trx || db;
    const [updatedRecord] = await queryBuilder
        .update(table)
        .set(dataWithTimeStamps)
        .where(eq(table.id, id))
        .returning();
    return updatedRecord;
}
async function exportData(table, projection, filters) {
    const initialQuery = db.select(projection).from(table);
    let finalQuery;
    if (filters && filters.length > 0) {
        finalQuery = initialQuery.where(and(...filters));
    }
    const result = await finalQuery;
    return result;
}
async function getPaginatedRecords(table, skip, limit, filters, sorting, projection) {
    let initialQuery = db.select(projection).from(table);
    if (filters && filters.length > 0) {
        initialQuery = initialQuery.where(and(...filters));
    }
    if (sorting) {
        const columnExpression = table[sorting.sort_by];
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
async function getRecordsCount(table, filters) {
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
export async function deleteAllRecords(table) {
    return await db.delete(table);
}
async function updateRecordByColumnValue(table, column, value, record, id) {
    const dataWithTimeStamps = { id, ...record, updated_at: new Date() };
    const columnInfo = sql.raw(`${getTableName(table)}.${column}`);
    return await db.update(table).set(dataWithTimeStamps).where(eq(columnInfo, value));
}
async function updateRecordByMultipleColumnValues(table, columns, relations, values, record, id) {
    const whereQueryData = {
        columns,
        relations,
        values,
    };
    const dataWithTimeStamps = { id, ...record, updated_at: new Date() };
    const whereConditions = whereQueryData.columns.map((column, index) => eq(sql.raw(`${getTableName(table)}.${String(column)}`), whereQueryData.values[index]));
    const result = await db.update(table).set(dataWithTimeStamps).where(and(...whereConditions)).returning();
    if (!Array.isArray(result)) {
        throw new UnprocessableEntityException(DB_UPDATE_DATA_FAILED);
    }
    return result[0];
}
async function updateMultipleRecordsByIds(table, ids, record) {
    const columnInfo = sql.raw(`${getTableName(table)}.id`);
    const updatedRecords = await db.update(table)
        .set(record)
        .where(inArray(columnInfo, ids))
        .returning();
    return updatedRecords.length;
}
export { deleteRecordById, deleteRecordsByAColumnValue, deleteRecordsByMultipleColumnValues, exportData, getMultipleRecordsByAColumnValue, getMultipleRecordsByMultipleColumnValues, getPaginatedRecords, getPaginatedRecordsConditionally, getRecordById, getRecordsConditionally, getRecordsCount, getSingleRecordByAColumnValue, getSingleRecordByMultipleColumnValues, saveRecords, saveSingleRecord, softDeleteRecordById, updateMultipleRecordsByIds, updateRecordByColumnValue, updateRecordById, updateRecordByIdWithTrx, updateRecordByMultipleColumnValues };
