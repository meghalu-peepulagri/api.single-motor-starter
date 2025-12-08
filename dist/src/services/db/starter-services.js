import { and, Column, eq, ne } from "drizzle-orm";
import db from "../../database/configuration.js";
import { starterBoxes } from "../../database/schemas/starter-boxes.js";
import { prepareStarterData } from "../../helpers/starter-hepler.js";
import { saveSingleRecord } from "./base-db-services.js";
export async function addStarterWithTransaction(starterBoxPayload, userPayload) {
    const preparedStarerData = prepareStarterData(starterBoxPayload, userPayload);
    await saveSingleRecord(starterBoxes, preparedStarerData);
}
export async function getStarterByMacWithMotor(mac) {
    return await db.query.starterBoxes.findFirst({
        where: and(eq(starterBoxes.mac_address, mac.trim().toUpperCase()), ne(starterBoxes.status, 'ARCHIVED')),
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
