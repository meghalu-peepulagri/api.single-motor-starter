import db from "../../database/configuration.js";
import { starterDefaultSettings } from "../../database/schemas/starter-default-settings.js";
import { starterSettings } from "../../database/schemas/starter-settings.js";
import { and, desc, eq, sql } from "drizzle-orm";

export async function getStarterDefaultSettings() {
  return await db.select().from(starterDefaultSettings).limit(1);
}

export async function starterAcknowledgedSettings(starterId: number) {
  return db.query.starterSettings.findFirst({
    where: and(eq(starterSettings.starter_id, starterId), eq(starterSettings.acknowledgement, "TRUE"), eq(starterSettings.is_new_configuration_saved, 1)),
    orderBy: desc(starterSettings.created_at),
    with: {
      starter: {
        columns: {
          id: true,
          name: true,
          pcb_number: true,
          mac_address: true,
        },
      },
    },
  });
}

export async function updateLatestStarterSettings(starterId: number, isNewConfigurationSaved: number) {
  return db
    .update(starterSettings)
    .set({
      is_new_configuration_saved: isNewConfigurationSaved,
      acknowledgement: true,
      updated_at: sql`CURRENT_TIMESTAMP`,
    })
    .where(
      sql`
        ${starterSettings.starter_id} = ${starterId}
        AND ${starterSettings.created_at} = (
          SELECT MAX(created_at)
          FROM starter_settings
          WHERE starter_id = ${starterId}
        )
      `
    );
}
