import { starterBoxes } from "../../database/schemas/starter-boxes.js";
import { prepareStarterData } from "../../helpers/starter-hepler.js";
import { saveSingleRecord } from "./base-db-services.js";
export async function addStarterWithTransaction(starterBoxPayload, userPayload) {
    const preparedStarerData = prepareStarterData(starterBoxPayload, userPayload);
    await saveSingleRecord(starterBoxes, preparedStarerData);
}
