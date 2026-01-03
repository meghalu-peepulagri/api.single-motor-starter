import db from "../../database/configuration.js";
import { starterDefaultSettings } from "../../database/schemas/starter-default-settings.js";
export async function getStarterDefaultSettings() {
    return await db.select().from(starterDefaultSettings).limit(1);
}
