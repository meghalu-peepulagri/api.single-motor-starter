import { and, desc, eq, sql } from "drizzle-orm";
import db from "../../database/configuration.js";
import { starterDefaultSettings } from "../../database/schemas/starter-default-settings.js";
import { starterSettings } from "../../database/schemas/starter-settings.js";
import { DEVICE_SCHEMA } from "../../constants/app-constants.js";
import { getSingleRecordByMultipleColumnValues, saveSingleRecord } from "./base-db-services.js";
import { prepareDeviceConfigurationPayload } from "../../helpers/heart-beat-prepared-payload-helper.js";
import { randomSequenceNumber } from "../../helpers/mqtt-helpers.js";
import { publishMultipleTimesInBackground } from "../../helpers/settings-helpers.js";
import { logger } from "../../utils/logger.js";
export async function getStarterDefaultSettings() {
    return await db.select().from(starterDefaultSettings).limit(1);
}
export async function starterAcknowledgedSettings(starterId, filter) {
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
                with: {
                    motors: {
                        columns: {
                            id: true,
                            name: true,
                            hp: true,
                            alias_name: true,
                        },
                    },
                },
            },
        },
    });
}
export async function updateLatestStarterSettings(starterId, isNewConfigurationSaved) {
    if (!starterId)
        return null;
    return db
        .update(starterSettings)
        .set({
        is_new_configuration_saved: isNewConfigurationSaved,
        acknowledgement: "TRUE",
        updated_at: sql `CURRENT_TIMESTAMP`,
    })
        .where(sql `
        ${starterSettings.starter_id} = ${starterId}
        AND ${starterSettings.created_at} = (
          SELECT MAX(created_at)
          FROM starter_settings
          WHERE starter_id = ${starterId}
        )
      `);
}
export async function updateLatestStarterSettingsFlc(starterId, avgCurrent) {
    if (!starterId)
        return null;
    return db
        .update(starterSettings)
        .set({
        flc: avgCurrent,
    })
        .where(sql `
        ${starterSettings.starter_id} = ${starterId}
        AND ${starterSettings.acknowledgement} = 'TRUE'
        AND ${starterSettings.created_at} = (
          SELECT MAX(created_at)
          FROM starter_settings
          WHERE starter_id = ${starterId}
          AND acknowledgement = 'TRUE'
        )
      `);
}
export async function getAcknowledgedStarterSettings(starterId, columns) {
    return db.query.starterSettings.findFirst({
        where: and(eq(starterSettings.starter_id, starterId), eq(starterSettings.acknowledgement, "TRUE"), eq(starterSettings.is_new_configuration_saved, 1)),
        orderBy: desc(starterSettings.created_at),
        columns,
        with: {
            starter: {
                columns: {
                    id: true,
                    name: true,
                    pcb_number: true,
                    mac_address: true,
                },
                with: {
                    motors: {
                        columns: {
                            id: true,
                            name: true,
                            hp: true,
                            alias_name: true,
                        },
                    },
                },
            },
        },
    });
}
export const prepareStarterSettingsData = (dynamicPayload) => {
    if (!dynamicPayload?.D || Object.keys(dynamicPayload.D).length === 0) {
        return null;
    }
    const filteredD = {};
    Object.keys(dynamicPayload.D).forEach((category) => {
        const value = dynamicPayload.D?.[category];
        if (value &&
            typeof value === "object" &&
            Object.keys(value).length > 0) {
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
export async function syncQuery(batchSize) {
    return await db.transaction(async (trx) => {
        await trx.execute(sql `
      WITH records_to_move AS (
          SELECT *,
                 MAX(created_at) OVER (PARTITION BY starter_id, motor_id) - INTERVAL '1 hours' AS cutoff_time
          FROM starter_parameters
      )
      INSERT INTO benched_starter_parameters
      SELECT id, payload_version, packet_number,
             line_voltage_r, line_voltage_s, line_voltage_b, avg_voltage,
             current_r, current_s, current_b, avg_current,
             power_present,
             motor_mode, mode_description, motor_state, motor_description,
             alert, alert_description, fault, fault_description,
             last_on_code, last_on_description, last_off_code, last_off_description,
             time_stamp,
             starter_id, motor_id, gateway_id, user_id,
             payload_valid, payload_errors, group_id,
             created_at, updated_at
      FROM records_to_move
      WHERE created_at < cutoff_time
      LIMIT ${batchSize};
    `);
        const deleteResult = await trx.execute(sql `
      WITH records_to_delete AS (
          SELECT id, starter_id, motor_id, created_at,
                 MAX(created_at) OVER (PARTITION BY starter_id, motor_id) - INTERVAL '1 hours' AS cutoff_time
          FROM starter_parameters
      )
      DELETE FROM starter_parameters
      WHERE id IN (
          SELECT id
          FROM records_to_delete
          WHERE created_at < cutoff_time
          LIMIT ${batchSize}
      );
    `);
        return deleteResult.rowCount || 0;
    });
}
export async function publishDeviceSettings(starter) {
    try {
        const ackSettings = await getSingleRecordByMultipleColumnValues(starterSettings, ["starter_id", "acknowledgement", "is_new_configuration_saved"], ["=", "=", "="], [starter.id, "TRUE", "1"]);
        // If no settings found, throw or return
        if (!ackSettings) {
            console.warn(`No ACK settings found for starter ${starter.id}`);
            return;
        }
        const preparedPayload = prepareDeviceConfigurationPayload(ackSettings);
        const formattedPayload = { T: 4, S: randomSequenceNumber(), ...preparedPayload };
        const { id: _, is_new_configuration_saved, created_at, updated_at, starter_id, ...ackWithoutId } = ackSettings;
        // Save to DB and publish in background
        setImmediate(async () => {
            try {
                await saveSingleRecord(starterSettings, { ...ackWithoutId, is_new_configuration_saved: 0, starter_id: starter.id });
                await publishMultipleTimesInBackground(formattedPayload, starter);
            }
            catch (error) {
                logger.error("Publish device settings synced at heartbeat:", error);
                console.error("Publish device settings synced at heartbeat:", error);
            }
        });
    }
    catch (error) {
        logger.error("Error in publishDeviceSettings:", error);
        console.error("Error in publishDeviceSettings:", error);
    }
}
