import { starterBoxes, type StarterBoxTable } from "../../database/schemas/starter-boxes.js";
import type { User } from "../../database/schemas/users.js";
import { prepareStarterData } from "../../helpers/starter-hepler.js";
import type { starterBoxPayloadType } from "../../types/app-types.js";
import { saveSingleRecord } from "./base-db-services.js";


export async function addStarterWithTransaction(starterBoxPayload: starterBoxPayloadType, userPayload: User) {
  const preparedStarerData = prepareStarterData(starterBoxPayload, userPayload);
  await saveSingleRecord<StarterBoxTable>(starterBoxes, preparedStarerData);

}