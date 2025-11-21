import type { SQL, SQLWrapper } from "drizzle-orm";

import { and, getTableName, inArray, isNull, sql } from "drizzle-orm";

import type { DBRecord, DBTable, DBTableColumns, InQueryData, OrderByQueryData, SortDirection, WhereQueryData } from "../types/db-types.js";
import { db } from "../database/configuration.js";


function prepareSelectColumnsForQuery(table: DBTable, columnsToSelect?: any) {
  if (!columnsToSelect) {
    return null;
  }

  if (columnsToSelect.length === 0) {
    return {};
  }

  const columnsForQuery: Record<string, SQL> = {};
  // loop through columns and prepare the select query object
  columnsToSelect.map((column: string) => {
    return columnsForQuery[column as string] = sql.raw(`${getTableName(table)}.${column as string}`);
  });
  return columnsForQuery;
}

function prepareWhereQueryConditions<T extends DBTable>(table: T, whereQueryData?: WhereQueryData<T>): SQL[] | null {
  if (!whereQueryData || Object.keys(whereQueryData).length < 1 || whereQueryData.columns.length < 1) {
    return null;
  }
  const { columns, values, relations } = whereQueryData;
  const whereQueries: SQL[] = [];
  const orQueries: SQL[] = [];
  for (let i = 0; i < columns.length; i++) {
    const columnInfo = table[columns[i] as keyof typeof table] as unknown as SQLWrapper;
    const value = values[i];
    const relation = relations?.[i] ?? "=";
    switch (relation) {
      case "=":
        whereQueries.push(sql`${columnInfo} = ${value}`);
        break;

      case "!=":
        whereQueries.push(sql`${columnInfo} != ${value}`);
        break;

      case "<":
        whereQueries.push(sql`${columnInfo} < ${value}`);
        break;

      case "<=":
        whereQueries.push(sql`${columnInfo} <= ${value}`);
        break;

      case ">":
        whereQueries.push(sql`${columnInfo} > ${value}`);
        break;

      case ">=":
        whereQueries.push(sql`${columnInfo} >= ${value}`);
        break;

      case "ILIKE":
        whereQueries.push(sql`${columnInfo} ILIKE ${value}`);
        break;

      case "IS NULL":
        whereQueries.push(isNull(columnInfo));
        break;

      case "contains":
        orQueries.push(sql`${columnInfo} ILIKE ${`%${value}%`}`);
        break;

      case "BETWEEN":
        if (typeof value === "object" && value !== null && "gte" in value && "lte" in value) {
          whereQueries.push(sql`${columnInfo} BETWEEN ${value.gte} AND ${value.lte}`);
        }
        break;

      case "IN":
        if (Array.isArray(value) && value.length > 0) {
          whereQueries.push(sql`${columnInfo} IN (${sql.join(value, sql`, `)})`);
        }
        else {
          whereQueries.push(sql`FALSE`);
        }
        break;

      default:
        break;
    }
  }
  if (orQueries.length > 0) {
    whereQueries.push(sql`(${sql.join(orQueries, sql` OR `)})`);
  }
  return whereQueries;
}

function prepareOrderByQueryConditions<T extends DBTable>(
  table: DBTable,
  orderByQueryData?: OrderByQueryData<T>,
) {
  const orderByQueries: SQL[] = [];

  if (!orderByQueryData || orderByQueryData.columns.length === 0) {
    const columnInfo = table["id" as keyof typeof table] as unknown as SQLWrapper;
    const orderByQuery = sql`${columnInfo} desc`;
    orderByQueries.push(orderByQuery);
  }
  else {
    const { columns, values } = orderByQueryData;

    for (let i = 0; i < columns.length; i++) {
      const columnName = columns[i] as keyof typeof table;
      const direction = values[i] as "asc" | "desc";

      const columnInfo = table[columnName] as unknown as SQLWrapper;
      const orderByQuery = sql`${columnInfo} ${sql.raw(direction)}`;
      orderByQueries.push(orderByQuery);
    }
  }

  return orderByQueries;
}

function prepareInQueryCondition<T extends DBTable>(table: T, inQueryData?: InQueryData<T>) {
  if (inQueryData && Object.keys(inQueryData).length > 0 && inQueryData.values.length > 0) {
    const columnInfo = sql.raw(`${getTableName(table)}.${inQueryData.key as string}`);
    const inQuery = inArray(columnInfo, inQueryData.values);
    return inQuery;
  }
  return null;
}

async function executeQuery<T extends DBTable, C extends keyof DBRecord<T> = keyof DBRecord<T>>(table: T, whereQuery: SQL | undefined | null, columnsRequired: Record<string, SQL> | null, orderByConditions: SQL[], inQueryCondition: SQL | null, paginationData?: { page: number; pageSize: number }) {
  let dQuery = columnsRequired
    ? db.select(columnsRequired).from(table as any).$dynamic()
    : db.select().from(table as any).$dynamic();

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
    return results as Pick<DBRecord<T>, C>[];
  }
  return results as T[];
}

function parseOrderByQuery<T extends DBTable>(orderBy: string | undefined, defaultColumn: DBTableColumns<T> = "created_at" as DBTableColumns<T>, defaultDirection: SortDirection = "desc"): OrderByQueryData<T> {
  let orderByQueryData: OrderByQueryData<T> = {
    columns: [defaultColumn],
    values: [defaultDirection],
  };

  if (!orderBy) {
    return orderByQueryData;
  }

  const orderByColumns: DBTableColumns<T>[] = [];
  const orderByValues: SortDirection[] = [];
  const queryStrings = orderBy.split(",");

  queryStrings.forEach((queryString) => {
    const [column, value] = queryString.split(":");
    orderByColumns.push(column as DBTableColumns<T>);
    orderByValues.push(value as SortDirection);
  });

  orderByQueryData = {
    columns: orderByColumns,
    values: orderByValues,
  };
  return orderByQueryData;
}

function parseOrderByQueryCondition<T extends DBTable>(orderBy: string | null, orderType: string | null, defaultColumn: DBTableColumns<T> = "created_at" as DBTableColumns<T>, defaultDirection: SortDirection = "desc"): OrderByQueryData<T> {
  let orderByQueryData: OrderByQueryData<T> = {
    columns: [defaultColumn],
    values: [defaultDirection],
  };

  if (!orderBy || !orderType) {
    return orderByQueryData;
  }

  const orderByColumns: DBTableColumns<T>[] = [];
  const orderByValues: SortDirection[] = [];

  orderByColumns.push(orderBy as DBTableColumns<T>);
  orderByValues.push(orderType as SortDirection);

  orderByQueryData = {
    columns: orderByColumns,
    values: orderByValues,
  };

  return orderByQueryData;
}

export {
  executeQuery,
  parseOrderByQuery,
  parseOrderByQueryCondition,
  prepareInQueryCondition,
  prepareOrderByQueryConditions,
  prepareSelectColumnsForQuery,
  prepareWhereQueryConditions,
};
