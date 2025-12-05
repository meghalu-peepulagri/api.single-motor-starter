import { and, Column, eq, ne } from "drizzle-orm";
import db from "../../database/configuration.js";
import { starterBoxes, type StarterBoxTable } from "../../database/schemas/starter-boxes.js";
import type { User } from "../../database/schemas/users.js";
import { prepareStarterData } from "../../helpers/starter-hepler.js";
import type { starterBoxPayloadType } from "../../types/app-types.js";
import { saveSingleRecord } from "./base-db-services.js";


export async function addStarterWithTransaction(starterBoxPayload: starterBoxPayloadType, userPayload: User) {
  const preparedStarerData = prepareStarterData(starterBoxPayload, userPayload);
  await saveSingleRecord<StarterBoxTable>(starterBoxes, preparedStarerData);

}

export async function getStarterByMacWithMotor(mac: string) {
  return await db.query.starterBoxes.findFirst({
    where: and(
      eq(starterBoxes.mac_address, mac.trim().toUpperCase()),
      ne(starterBoxes.status, 'ARCHIVED')
    ),
    columns: {
      id: true,
      created_by: true,
      gateway_id: true,

    },
    with: {
      motors: {
        columns: {
          id: true,
        },
      },
    },
  });
}