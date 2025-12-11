import { and, eq, ne } from "drizzle-orm";
import db from "../../database/configuration.js";
import { motors, type MotorsTable } from "../../database/schemas/motors.js";
import { starterBoxes, type StarterBox, type StarterBoxTable } from "../../database/schemas/starter-boxes.js";
import type { User } from "../../database/schemas/users.js";
import { prepareStarterData } from "../../helpers/starter-hepler.js";
import type { AssignStarterType, starterBoxPayloadType } from "../../types/app-types.js";
import { saveSingleRecord, updateRecordByIdWithTrx } from "./base-db-services.js";


export async function addStarterWithTransaction(starterBoxPayload: starterBoxPayloadType, userPayload: User) {
  const preparedStarerData: any = prepareStarterData(starterBoxPayload, userPayload);
  await saveSingleRecord<StarterBoxTable>(starterBoxes, preparedStarerData);
}

export async function assignStarterWithTransaction(payload: AssignStarterType, userPayload: User, starterBoxPayload: StarterBox) {
  return await db.transaction(async (trx) => {
    await updateRecordByIdWithTrx<StarterBoxTable>(starterBoxes, starterBoxPayload.id, {
      user_id: userPayload.id, device_status: "ASSIGNED", location_id: payload.location_id
    }, trx);
    await saveSingleRecord<MotorsTable>(motors, {
      name: payload.motor_name, hp: String(payload.hp), starter_id: starterBoxPayload.id,
      location_id: payload.location_id, created_by: userPayload.id,
    }, trx);
  });
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
      power: true,
      signal_quality: true,
      network_type: true
    },
    with: {
      motors: {
        columns: {
          id: true,
          name: true,
          hp: true,
          state: true,
          mode: true
        },
      },
    },
  });
}