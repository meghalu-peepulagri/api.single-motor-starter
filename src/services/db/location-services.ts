import { and, desc, ne, sql } from "drizzle-orm";
import db from "../../database/configuration.js";
import { locations, type LocationsTable } from "../../database/schemas/locations.js";
import type { OrderByQueryData } from "../../types/db-types.js";
import { prepareOrderByQueryConditions } from "../../utils/db-utils.js";
import { motors } from "../../database/schemas/motors.js";


export async function getLocationsList(whereQueryData: any, orderQueryData: OrderByQueryData<LocationsTable>) {

  const whereQuery = whereQueryData && whereQueryData.length > 0 ? and(...whereQueryData) : undefined;
  const orderQuery = prepareOrderByQueryConditions<LocationsTable>(locations, orderQueryData);

  return await db.query.locations.findMany({
    where: whereQuery,
    orderBy: orderQuery,

    columns: {
      id: true,
      name: true,
      status: true,
    },
    extras: {
      locations_count: sql<number>`(
    SELECT CAST(count(*) AS INTEGER)
    FROM locations
    WHERE locations.status != 'ARCHIVED'
  )`.as("locations_count"),

      total_motors: sql<number>`(
    SELECT CAST(count(*) AS INTEGER)
    FROM motors
    WHERE motors.location_id = ${locations.id}
    AND motors.status != 'ARCHIVED'
  )`.as("total_motors"),

      on_state_count: sql<number>`(
    SELECT CAST(count(*) AS INTEGER)
    FROM motors
    WHERE motors.location_id = ${locations.id}
    AND motors.state = 1
    AND motors.status != 'ARCHIVED'
  )`.as("on_state_count"),

      auto_mode_count: sql<number>`(
    SELECT CAST(count(*) AS INTEGER)
    FROM motors
    WHERE motors.location_id = ${locations.id}
    AND motors.mode = 'AUTO'
    AND motors.status != 'ARCHIVED'
  )`.as("auto_mode_count"),

      manual_mode_count: sql<number>`(
    SELECT CAST(count(*) AS INTEGER)
    FROM motors
    WHERE motors.location_id = ${locations.id}
    AND motors.mode = 'MANUAL'
    AND motors.status != 'ARCHIVED'
  )`.as("manual_mode_count"),
    },

    with: {
      motors: {
        where: ne(motors.status, "ARCHIVED"),
        orderBy: [desc(motors.created_at)],
        columns: {
          id: true,
          name: true,
          hp: true,
          state: true,
          mode: true,
        },
      },
    },
  });

}

export async function locationDropDown(orderByQueries: OrderByQueryData<LocationsTable>, whereQueries: any) {
  const orderBy = prepareOrderByQueryConditions(locations, orderByQueries);

  return await db.query.locations.findMany({
    where: whereQueries.length > 0 ? and(...whereQueries) : undefined,
    orderBy,
    columns: {
      id: true,
      name: true,
    },
  });
}