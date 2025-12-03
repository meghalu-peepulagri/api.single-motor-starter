import { and, getTableName, inArray, isNull, sql } from "drizzle-orm";
import db from "../database/configuration.js";
function prepareSelectColumnsForQuery(table, columnsToSelect) {
    if (!columnsToSelect) {
        return null;
    }
    if (columnsToSelect.length === 0) {
        return {};
    }
    const columnsForQuery = {};
    // loop through columns and prepare the select query object
    columnsToSelect.map((column) => {
        return columnsForQuery[column] = sql.raw(`${getTableName(table)}.${column}`);
    });
    return columnsForQuery;
}
function prepareWhereQueryConditions(table, whereQueryData) {
    if (!whereQueryData || Object.keys(whereQueryData).length < 1 || whereQueryData.columns.length < 1) {
        return null;
    }
    const { columns, values, relations } = whereQueryData;
    const whereQueries = [];
    for (let i = 0; i < columns.length; i++) {
        const columnInfo = sql.raw(`${getTableName(table)}.${String(columns[i])}`);
        const value = values[i];
        const relation = relations?.[i] ?? "=";
        switch (relation) {
            case "=":
                whereQueries.push(sql `${columnInfo} = ${value}`);
                break;
            case "!=":
                whereQueries.push(sql `${columnInfo} != ${value}`);
                break;
            case "<":
                whereQueries.push(sql `${columnInfo} < ${value}`);
                break;
            case "<=":
                whereQueries.push(sql `${columnInfo} <= ${value}`);
                break;
            case ">":
                whereQueries.push(sql `${columnInfo} > ${value}`);
                break;
            case ">=":
                whereQueries.push(sql `${columnInfo} >= ${value}`);
                break;
            case "ILIKE":
                whereQueries.push(sql `${columnInfo} ILIKE ${value}`);
                break;
            case "IS NULL":
                whereQueries.push(isNull(columnInfo));
                break;
            case "LOWER":
                whereQueries.push(sql `LOWER(${columnInfo}) = ${value}`);
                break;
            case "contains":
                whereQueries.push(sql `${columnInfo} ILIKE ${`%${value}%`}`);
                break;
            case "BETWEEN":
                if (typeof value === "object" && value !== null && "gte" in value && "lte" in value) {
                    whereQueries.push(sql `${columnInfo} BETWEEN ${value.gte} AND ${value.lte}`);
                }
                break;
            case "IN":
                if (Array.isArray(value) && value.length > 0) {
                    whereQueries.push(sql `${columnInfo} IN (${sql.join(value, sql `, `)})`);
                }
                else {
                    whereQueries.push(sql `FALSE`);
                }
                break;
            default:
                break;
        }
    }
    return whereQueries;
}
function prepareOrderByQueryConditions(table, orderByQueryData) {
    const orderByQueries = [];
    if (!orderByQueryData || orderByQueryData.columns.length === 0) {
        const columnInfo = table["id"];
        const orderByQuery = sql `${columnInfo} desc`;
        orderByQueries.push(orderByQuery);
    }
    else {
        const { columns, values } = orderByQueryData;
        for (let i = 0; i < columns.length; i++) {
            const columnName = columns[i];
            const direction = values[i];
            const columnInfo = table[columnName];
            const orderByQuery = sql `${columnInfo} ${sql.raw(direction)}`;
            orderByQueries.push(orderByQuery);
        }
    }
    return orderByQueries;
}
function prepareInQueryCondition(table, inQueryData) {
    if (inQueryData && Object.keys(inQueryData).length > 0 && inQueryData.values.length > 0) {
        const columnInfo = sql.raw(`${getTableName(table)}.${inQueryData.key}`);
        const inQuery = inArray(columnInfo, inQueryData.values);
        return inQuery;
    }
    return null;
}
async function executeQuery(table, whereQuery, columnsRequired, orderByConditions, inQueryCondition, paginationData) {
    let dQuery = columnsRequired
        ? db.select(columnsRequired).from(table).$dynamic()
        : db.select().from(table).$dynamic();
    if (whereQuery && inQueryCondition) {
        dQuery = dQuery.where(and(whereQuery, inQueryCondition));
    }
    else if (whereQuery) {
        dQuery = dQuery.where(whereQuery);
    }
    else if (inQueryCondition) {
        dQuery = dQuery.where(inQueryCondition);
    }
    dQuery = dQuery.orderBy(...orderByConditions);
    if (paginationData) {
        const { page, pageSize } = paginationData;
        dQuery = dQuery.limit(pageSize).offset((page - 1) * pageSize);
    }
    const results = await dQuery;
    if (columnsRequired) {
        return results;
    }
    return results;
}
function parseOrderByQuery(orderBy, defaultColumn = "created_at", defaultDirection = "desc") {
    let orderByQueryData = {
        columns: [defaultColumn],
        values: [defaultDirection],
    };
    if (!orderBy) {
        return orderByQueryData;
    }
    const orderByColumns = [];
    const orderByValues = [];
    const queryStrings = orderBy.split(",");
    queryStrings.forEach((queryString) => {
        const [column, value] = queryString.split(":");
        orderByColumns.push(column);
        orderByValues.push(value);
    });
    orderByQueryData = {
        columns: orderByColumns,
        values: orderByValues,
    };
    return orderByQueryData;
}
function parseOrderByQueryCondition(orderBy, orderType, defaultColumn = "created_at", defaultDirection = "desc") {
    let orderByQueryData = {
        columns: [defaultColumn],
        values: [defaultDirection],
    };
    if (!orderBy || !orderType) {
        return orderByQueryData;
    }
    const orderByColumns = [];
    const orderByValues = [];
    orderByColumns.push(orderBy);
    orderByValues.push(orderType);
    orderByQueryData = {
        columns: orderByColumns,
        values: orderByValues,
    };
    return orderByQueryData;
}
function prepareWhereQueryConditionsWithOr(table, whereQueryData) {
    if (!whereQueryData || whereQueryData.columns.length < 1)
        return null;
    const base = {
        columns: whereQueryData.columns,
        relations: whereQueryData.relations,
        values: whereQueryData.values,
    };
    const conditions = prepareWhereQueryConditions(table, base) || [];
    if (whereQueryData.or && whereQueryData.or.length > 0) {
        const orBlocks = [];
        for (const group of whereQueryData.or) {
            const v1 = {
                columns: group.columns,
                relations: group.relations,
                values: group.values,
            };
            const inner = prepareWhereQueryConditions(table, v1);
            if (inner && inner.length > 0) {
                orBlocks.push(sql `(${sql.join(inner, sql ` OR `)})`);
            }
        }
        if (orBlocks.length > 0) {
            conditions.push(sql `(${sql.join(orBlocks, sql ` OR `)})`);
        }
    }
    return conditions.length ? conditions : null;
}
function prepareWhereQueryConditionsWithAnd(table, whereQueryData) {
    if (!whereQueryData || Object.keys(whereQueryData).length < 1 || whereQueryData.columns.length < 1) {
        return null;
    }
    const whereQueryDataV1 = {
        columns: whereQueryData.columns,
        relations: whereQueryData.relations,
        values: whereQueryData.values,
    };
    const conditions = prepareWhereQueryConditions(table, whereQueryDataV1) || [];
    if (whereQueryData.or && whereQueryData.or.length > 0) {
        const orGroupSQLs = [];
        for (const group of whereQueryData.or) {
            const groupV1 = {
                columns: group.columns,
                relations: group.relations,
                values: group.values,
            };
            const orConditions = prepareWhereQueryConditions(table, groupV1);
            if (orConditions && orConditions.length > 0) {
                orGroupSQLs.push(sql `(${sql.join(orConditions, sql ` AND `)})`);
            }
        }
        if (orGroupSQLs.length > 0) {
            conditions.push(sql `(${sql.join(orGroupSQLs, sql ` OR `)})`);
        }
    }
    return conditions.length > 0 ? conditions : null;
}
export { executeQuery, parseOrderByQuery, parseOrderByQueryCondition, prepareInQueryCondition, prepareOrderByQueryConditions, prepareSelectColumnsForQuery, prepareWhereQueryConditions, prepareWhereQueryConditionsWithOr, prepareWhereQueryConditionsWithAnd };
