import { and, desc, eq, ne, sql } from "drizzle-orm";
import db from "../../database/configuration.js";
import { starterDefaultSettings } from "../../database/schemas/starter-default-settings.js";
import { starterSettings, type StarterSettingsTable } from "../../database/schemas/starter-settings.js";
import { DEVICE_SCHEMA } from "../../constants/app-constants.js";
import { starterBoxes, type StarterBoxTable } from "../../database/schemas/starter-boxes.js";
import { getSingleRecordByMultipleColumnValues, saveSingleRecord, updateRecordById } from "./base-db-services.js";
import { prepareDeviceConfigurationPayload } from "../../helpers/heart-beat-prepared-payload-helper.js";
import { randomSequenceNumber } from "../../helpers/mqtt-helpers.js";
import { REQUEST_TYPES } from "../../helpers/packet-types-helper.js";
import { publishMultipleTimesInBackground } from "../../helpers/settings-helpers.js";
import { logger } from "../../utils/logger.js";
import { motors } from "../../database/schemas/motors.js";
import { parseMotorKey } from "../../helpers/motor-control-payload-helper.js";
import { sendMultiMotorSettingsCommand } from "../../helpers/multi-motor-settings-sync-helper.js";
import { getMotorsForStarterControl } from "./motor-services.js";
import type { MultiMotorSettingsConfig } from "../../types/multi-motor-settings-types.js";
import { publishingMap } from "../../helpers/ack-tracker-hepler.js";
import { isDualMotor, isV2Payload } from "../../helpers/payload-version-helper.js";

export async function getStarterDefaultSettings() {
  return await db.select().from(starterDefaultSettings).limit(1);
}

export async function starterAcknowledgedSettings(starterId: number, filter?: any) {
  return db.query.starterSettings.findFirst({
    where: and(eq(starterSettings.starter_id, starterId), eq(starterSettings.acknowledgement, "TRUE"), eq(starterSettings.is_new_configuration_saved, 1)),
    orderBy: desc(starterSettings.created_at),
    with: {
      starter: {
        where: ne(starterBoxes.status, "ARCHIVED"),
        columns: {
          id: true,
          name: true,
          pcb_number: true,
          mac_address: true,
          device_allocation: true,
          motor_starter_type: true,
          motor_support_type: true,
          payload_version: true,
        },
        with: {
          motors: {
            where: ne(motors.status, "ARCHIVED"),
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
  } as any);
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


export async function updateLatestStarterSettingsFlc(starterId: number, avgCurrent: number) {
  if (!starterId) return null;

  return db
    .update(starterSettings)
    .set({
      flc: avgCurrent,
    })
    .where(
      sql`
        ${starterSettings.starter_id} = ${starterId}
        AND ${starterSettings.acknowledgement} = 'TRUE'
        AND ${starterSettings.created_at} = (
          SELECT MAX(created_at)
          FROM starter_settings
          WHERE starter_id = ${starterId}
          AND acknowledgement = 'TRUE'
        )
      `
    );
}


export async function getAcknowledgedStarterSettings(starterId: number, columns?: Record<string, boolean>) {
  return db.query.starterSettings.findFirst({
    where: and(
      eq(starterSettings.starter_id, starterId),
      eq(starterSettings.acknowledgement, "TRUE"),
      eq(starterSettings.is_new_configuration_saved, 1)
    ),
    orderBy: desc(starterSettings.created_at),
    columns,
    with: {
      starter: {
        where: ne(starterBoxes.status, "ARCHIVED"),
        columns: {
          id: true,
          name: true,
          pcb_number: true,
          mac_address: true,
        },
        with: {
          motors: {
            where: ne(motors.status, "ARCHIVED"),
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
  } as any);
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

export async function syncQuery(batchSize: number) {
  return await db.transaction(async (trx) => {
    await trx.execute(sql`
      WITH records_to_move AS (
          SELECT *,
                 MAX(created_at) OVER (PARTITION BY starter_id, motor_id) - INTERVAL '1 hours' AS cutoff_time
          FROM starter_parameters
      )
      INSERT INTO benched_starter_parameters (
             id, payload_version, packet_number,
             line_voltage_r, line_voltage_s, line_voltage_b, avg_voltage,
             current_r, current_s, current_b, avg_current,
             power_present,
             motor_mode, mode_description, motor_state, motor_description,
             alert, alert_description, fault, fault_description,
             last_on_code, last_on_description, last_off_code, last_off_description,
             time_stamp,
             starter_id, motor_id, gateway_id, user_id,
             payload_valid, payload_errors, group_id, temperature,
             schedule_id, schedule_start_time, schedule_end_time, schedule_runtime_minutes,
             schedule_type, schedule_missed_minutes, schedule_failure_at, schedule_failure_reason, schedule_failure_code,
             schedule_status,
             created_at, updated_at
      )
      SELECT id, payload_version, packet_number,
             line_voltage_r, line_voltage_s, line_voltage_b, avg_voltage,
             current_r, current_s, current_b, avg_current,
             power_present,
             motor_mode, mode_description, motor_state, motor_description,
             alert, alert_description, fault, fault_description,
             last_on_code, last_on_description, last_off_code, last_off_description,
             time_stamp,
             starter_id, motor_id, gateway_id, user_id,
             payload_valid, payload_errors, group_id, temperature,
             schedule_id, schedule_start_time, schedule_end_time, schedule_runtime_minutes,
             schedule_type, schedule_missed_minutes, schedule_failure_at, schedule_failure_reason, schedule_failure_code,
             schedule_status,
             created_at, updated_at
      FROM records_to_move
      WHERE created_at < cutoff_time
      LIMIT ${batchSize};
    `);

    const deleteResult = await trx.execute(sql`
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

export async function publishDeviceSettings(starter: any) {
  // The board's payload_version decides the grammar — NOT starter_type, which describes
  // what the box is rather than what its firmware can parse. V2.0 boxes carry per-motor
  // blocks and a per-motor ack; V1.0 falls through to the flat body below, untouched.
  //
  // A dual box on V1.0 has no payload shape (nowhere to put m2). That pair is rejected at
  // the API and by the schema, so reaching it here is a bug — publish V2.0 rather than a
  // flat payload that would silently drop a motor.
  if (isV2Payload(starter) || isDualMotor(starter)) {
    if (!isV2Payload(starter)) {
      logger.error(`[payload-version] starter=${starter.id} is dual-motor but marked ${starter.payload_version}; publishing V2.0 to avoid dropping a motor`);
    }
    return publishMultiMotorDeviceSettings(starter);
  }

  try {
    const ackSettings = await getSingleRecordByMultipleColumnValues<StarterSettingsTable>(starterSettings,
      ["starter_id", "acknowledgement", "is_new_configuration_saved"], ["=", "=", "="], [starter.id, "TRUE", "1"]
    );

    // If no settings found, throw or return
    if (!ackSettings) {
      console.warn(`No ACK settings found for starter ${starter.id}`);
      return;
    }

    const preparedPayload = prepareDeviceConfigurationPayload(ackSettings);
    const formattedPayload = { T: REQUEST_TYPES.CALIBRATION, S: randomSequenceNumber(), ...preparedPayload };

    const { id: _, is_new_configuration_saved, created_at, updated_at, starter_id, ...ackWithoutId } = ackSettings;

    // Save to DB and publish in background
    setImmediate(async () => {
      try {
        await saveSingleRecord<StarterSettingsTable>(starterSettings,
          { ...ackWithoutId, is_new_configuration_saved: 0, starter_id: starter.id },
        );

        const ackReceived = await publishMultipleTimesInBackground(formattedPayload, starter);

        if (ackReceived) {
          // ACK received with matching MAC/PCB and sequence number, D === 1
          await updateLatestStarterSettings(starter.id, 1);

          if (starter.synced_settings_status === "false") {
            await updateRecordById<StarterBoxTable>(
              starterBoxes,
              starter.id,
              { synced_settings_status: "true" }
            );
          }
        }
      } catch (error) {
        logger.error("Publish device settings synced at heartbeat:", error);
        console.error("Publish device settings synced at heartbeat:", error);
      }
    });
  } catch (error: any) {
    logger.error("Error in publishDeviceSettings:", error);
    console.error("Error in publishDeviceSettings:", error);
  }
}

// MULTI_STARTER counterpart of publishDeviceSettings above — same "insert a pending
// copy, publish, let the inbound ack write the DB" shape, but the ack is per-motor
// (resolved via sendMultiMotorSettingsCommand + settingsControlPendingAckMap instead
// of the boolean publishMultipleTimesInBackground/pendingAckMap pair) and the DB
// write on success (updateMultiMotorSettingsAck, below) happens once the device's
// T:34 response lands, in deviceSyncUpdate (mqtt-db-services.ts).
export async function publishMultiMotorDeviceSettings(starter: any) {
  // Prevent overlapping publishes for the same starter. A heartbeat-driven publish
  // waits up to ~30s for the device's T:34 ack; without this lock every subsequent
  // heartbeat in that window would fire another publish with a NEW sequence number,
  // overwriting the pending-ack entry so the device's ack no longer matches
  // (sequence mismatch) — the box then never gets marked synced and it republishes
  // forever. Mirrors the SINGLE_STARTER guard in publishMultipleTimesInBackground.
  if (publishingMap.get(starter.id)) {
    logger.warn(`Multi-motor settings publish already in progress for starter ${starter.id}, skipping this request.`);
    return;
  }
  publishingMap.set(starter.id, true);

  let scheduled = false;
  try {
    const ackSettings = await getSingleRecordByMultipleColumnValues<StarterSettingsTable>(starterSettings,
      ["starter_id", "acknowledgement", "is_new_configuration_saved"], ["=", "=", "="], [starter.id, "TRUE", "1"]
    );

    // A single-motor V2.0 box has no multi_motor_config — its motor settings live in the
    // flat columns and are projected into m1 at publish time. Only a dual box actually
    // requires the JSON block.
    const singleMotor = !isDualMotor(starter);

    if (!ackSettings || (!singleMotor && !ackSettings.multi_motor_config)) {
      console.warn(`No multi-motor ACK settings found for starter ${starter.id}`);
      return;
    }

    const multiMotorConfig = ackSettings.multi_motor_config;
    const { id: _, is_new_configuration_saved, created_at, updated_at, starter_id, acknowledgement, ...ackWithoutId } = ackSettings;

    const motorIndexByMotorId = new Map<number, number>(
      (starter.motors ?? []).map((m: any) => [m.id, m.motor_index ?? 1])
    );

    scheduled = true;
    setImmediate(async () => {
      try {
        // Pending "in flight" copy — every motor starts unacknowledged, same as the
        // single-motor pending row's is_new_configuration_saved:0. A single-motor box
        // carries no config to reset, so its pending row keeps multi_motor_config null
        // and the flat row's own acknowledgement is what the T:34 ack flips.
        const pendingConfig: MultiMotorSettingsConfig | null = multiMotorConfig
          ? { ...multiMotorConfig, motors: multiMotorConfig.motors.map((m) => ({ ...m, acknowledgement: "FALSE" as const })) }
          : null;

        const pendingRow = await saveSingleRecord<StarterSettingsTable>(starterSettings, {
          ...ackWithoutId,
          starter_id: starter.id,
          is_new_configuration_saved: 0,
          acknowledgement: "FALSE",
          multi_motor_config: pendingConfig,
        });

        await sendMultiMotorSettingsCommand(starter, pendingRow, motorIndexByMotorId, { singleMotor });
        // No further action here on success/timeout — deviceSyncUpdate applies the
        // authoritative per-motor ack outcome to pendingRow once (and if) the
        // device's T:34 response lands, same division of labour as the
        // SINGLE_STARTER path (deviceSyncUpdate also writes updateLatestStarterSettings).
      } catch (error) {
        logger.error("Publish multi-motor device settings synced at heartbeat:", error);
        console.error("Publish multi-motor device settings synced at heartbeat:", error);
      } finally {
        // Release the lock only after the full publish+ack window completes, so the
        // next heartbeat can retry if this cycle didn't get acked.
        publishingMap.delete(starter.id);
      }
    });
  } catch (error: any) {
    logger.error("Error in publishMultiMotorDeviceSettings:", error);
    console.error("Error in publishMultiMotorDeviceSettings:", error);
  } finally {
    // If we returned/threw before scheduling the async publish, release here — otherwise
    // the setImmediate above owns releasing the lock when its ack window finishes.
    if (!scheduled) publishingMap.delete(starter.id);
  }
}

export async function getLatestStarterSettingsRow(starterId: number) {
  const rows = await db.select().from(starterSettings)
    .where(eq(starterSettings.starter_id, starterId))
    .orderBy(desc(starterSettings.created_at))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Applies a MULTI_STARTER settings ack (T:34, D:{m1,m2,...}) to the latest
 * starter_settings row's multi_motor_config, per motor — the multi-motor
 * counterpart of updateLatestStarterSettings above, which flips a whole row.
 * Per-motor ack code convention mirrors the legacy scalar CALIBRATION_ACK (1 =
 * acknowledged, anything else = not) — not yet confirmed against firmware, see the
 * plan's open items.
 * Returns true once every motor in the config has been acknowledged, so the caller
 * knows whether to mark the starter box as synced.
 */
export async function updateMultiMotorSettingsAck(starterId: number, ackData: Record<string, number>): Promise<boolean> {
  const latestRow = await getLatestStarterSettingsRow(starterId);
  if (!latestRow) return false;

  // A single-motor V2.0 box acks per-motor ({ m1: 1 }) but has no multi_motor_config to
  // write into — its settings live in the flat columns. Flip the flat row instead, so
  // the box gets marked synced rather than republishing forever.
  if (!latestRow.multi_motor_config) {
    const codes = Object.values(ackData).map(Number);
    const allAcked = codes.length > 0 && codes.every((code) => code === 1);
    if (allAcked) await updateLatestStarterSettings(starterId, 1);
    return allAcked;
  }

  const starterMotors = await getMotorsForStarterControl(starterId);
  const motorIdByIndex = new Map(starterMotors.map((m) => [m.motor_index ?? 1, m.id]));

  const ackedMotorIds = new Set<number>();
  for (const [key, code] of Object.entries(ackData)) {
    const index = parseMotorKey(key);
    const motorId = index !== null ? motorIdByIndex.get(index) : undefined;
    if (motorId !== undefined && Number(code) === 1) ackedMotorIds.add(motorId);
  }

  const updatedMotors = latestRow.multi_motor_config.motors.map((motorBlock) => (
    ackedMotorIds.has(motorBlock.motor_id)
      ? { ...motorBlock, acknowledgement: "TRUE" as const }
      : motorBlock
  ));

  const allAcked = updatedMotors.length > 0 && updatedMotors.every((m) => m.acknowledgement === "TRUE");

  await db.update(starterSettings)
    .set({
      multi_motor_config: { ...latestRow.multi_motor_config, motors: updatedMotors },
      is_new_configuration_saved: allAcked ? 1 : 0,
      acknowledgement: allAcked ? "TRUE" : "FALSE",
      updated_at: sql`CURRENT_TIMESTAMP`,
    })
    .where(eq(starterSettings.id, latestRow.id));

  return allAcked;
}