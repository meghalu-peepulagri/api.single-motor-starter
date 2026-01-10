import { and, desc, eq, sql } from "drizzle-orm";
import db from "../../database/configuration.js";
import { starterDefaultSettings } from "../../database/schemas/starter-default-settings.js";
import { starterSettings } from "../../database/schemas/starter-settings.js";
import { DEVICE_SCHEMA } from "../../constants/app-constants.js";

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
  if (!starterId) return null;
  return db
    .update(starterSettings)
    .set({
      is_new_configuration_saved: isNewConfigurationSaved,
      acknowledgement: "TRUE",
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

type DeviceCategory = keyof typeof DEVICE_SCHEMA;


export const prepareStarterSettingsData = (
  dynamicPayload: { T: number; S: number; D: Partial<Record<DeviceCategory, any>> }
) => {
  if (!dynamicPayload?.D || Object.keys(dynamicPayload.D).length === 0) {
    return null;
  }

  const filteredD: Partial<Record<DeviceCategory, any>> = {};

  (Object.keys(dynamicPayload.D) as DeviceCategory[]).forEach((category) => {
    const value = dynamicPayload.D?.[category];

    if (
      value &&
      typeof value === "object" &&
      Object.keys(value).length > 0
    ) {
      filteredD[category] = value;
    }
  });

  if (Object.keys(filteredD).length === 0) {
    return null;
  }

  return {
    T: dynamicPayload.T,
    S: dynamicPayload.S,
    D: filteredD,
  };
};
