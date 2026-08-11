import { and, desc, eq, ne, sql } from "drizzle-orm";
import db from "../../database/configuration.js";
import { motors, type Motor, type MotorsTable, type NewMotor } from "../../database/schemas/motors.js";
import { starterBoxes, type StarterBox, type StarterBoxTable } from "../../database/schemas/starter-boxes.js";
import { starterSettings } from "../../database/schemas/starter-settings.js";
import { starterDefaultSettings } from "../../database/schemas/starter-default-settings.js";
import { perMotorFields } from "../../helpers/multi-motor-settings-payload-helper.js";
import { clearSettingsSyncAttempts } from "../../helpers/ack-tracker-hepler.js";
import { logger } from "../../utils/logger.js";
import { saveSingleRecord, updateRecordById } from "./base-db-services.js";
import { ActivityService } from "./activity-service.js";
import type { MotorSettingsBlock, MultiMotorSettingsConfig } from "../../types/multi-motor-settings-types.js";
import type { validatedAddMotorToStarter } from "../../validations/schema/motor-validations.js";

// The second motor always lands in slot 2: a box being converted has exactly one motor,
// at index 1. Computing max+1 would silently produce index 3 on inconsistent data and
// then fail on the unique_starter_motor_index constraint with a database error instead
// of a clear one.
const SECOND_MOTOR_INDEX = 2;
const SECOND_MOTOR_REFERENCE = "m2";

/**
 * Builds the multi_motor_config that a converted box needs.
 *
 * A single-motor box keeps its motor settings in the FLAT starter_settings columns, and
 * the V2.0 payload builder projects them into `m1` at publish time. That projection
 * cannot express two motors — one set of flat columns, two motors needing independent
 * FLC and current protection — so conversion is the one point where the data genuinely
 * has to be migrated into the JSON block.
 *
 * M1's block is built from the same flat columns that already feed its `m1` payload, so
 * the running motor's behaviour does not change. M2 starts from the global default row,
 * the same source a brand-new box's settings come from.
 *
 * Both blocks are written acknowledgement:"FALSE" — the device has not seen either in
 * this shape yet, and pre-acknowledging M1 would let the box report as synced while it
 * is still running a single-motor payload.
 */
function buildConvertedConfig(
  flatSettings: Record<string, any>,
  defaultSettings: Record<string, any> | undefined,
  existingMotor: Motor,
  newMotorId: number,
): MultiMotorSettingsConfig {
  // The defaults row may carry a ready-made per-motor template; fall back to its own flat
  // columns when it doesn't (nothing writes multi_motor_defaults today).
  const defaultsSource = (defaultSettings?.multi_motor_defaults?.motor ?? defaultSettings ?? {}) as Record<string, any>;

  const m1: MotorSettingsBlock = {
    // Built through the SAME perMotorFields the publish path uses, with nothing added on
    // top: the m1 block a converted box publishes must equal the one the projection
    // produced before conversion, or the running motor's behaviour changes. In particular
    // flt_en is NOT seeded from allflt_en — that is a box-level field published separately,
    // and mapping it into the per-motor slot would add a key m1 never carried.
    ...perMotorFields(flatSettings),
    motor_id: existingMotor.id,
    motor_index: existingMotor.motor_index ?? 1,
    motor_reference: existingMotor.motor_reference ?? "m1",
    acknowledgement: "FALSE",
  };

  const m2: MotorSettingsBlock = {
    ...perMotorFields(defaultsSource),
    motor_id: newMotorId,
    motor_index: SECOND_MOTOR_INDEX,
    motor_reference: SECOND_MOTOR_REFERENCE,
    acknowledgement: "FALSE",
  };

  return {
    // v_flt_en exists only inside multi_motor_config — there is no flat column to carry a
    // single-motor box's value forward, so it starts at 0, matching the fallback
    // publishMultiMotorDeviceSettings already uses for a box with no block.
    v_flt_en: (defaultSettings?.multi_motor_defaults?.v_flt_en as number | undefined) ?? 0,
    sd_time: flatSettings.start_time ?? 0,
    motors: [m1, m2],
  };
}

/**
 * Converts a single-motor starter into a dual-motor one by adding its second motor.
 *
 * Everything happens in one transaction: a half-converted box — motor row created but
 * settings not seeded — would publish a payload missing m2 and have no way back.
 *
 * The caller is responsible for the preconditions (box exists, is on payload version
 * 2.0, is not already dual); this function assumes they hold.
 */
export async function convertStarterToDualMotor(
  starter: StarterBox,
  existingMotor: Motor,
  payload: validatedAddMotorToStarter,
  performerId: number,
): Promise<{ motor: Motor; settingsSeeded: boolean }> {
  const defaultSettingsRows = await db.select().from(starterDefaultSettings).limit(1);
  const defaultSettings = defaultSettingsRows[0] as Record<string, any> | undefined;

  // The row the publish path reads as the source of what to send. Seeding anywhere else
  // would leave the box publishing its old, block-less settings.
  const ackedSettings = await db.query.starterSettings.findFirst({
    where: and(
      eq(starterSettings.starter_id, starter.id),
      eq(starterSettings.acknowledgement, "TRUE"),
      eq(starterSettings.is_new_configuration_saved, 1),
    ),
    orderBy: desc(starterSettings.created_at),
  });

  return await db.transaction(async (trx) => {
    const newMotorPayload: NewMotor = {
      name: payload.name,
      alias_name: payload.name,
      hp: payload.hp.toString(),
      // Both motors of one box sit at the same site, so the existing motor's location is
      // the default when the caller doesn't send one.
      location_id: payload.location_id ?? existingMotor.location_id,
      starter_id: starter.id,
      motor_index: SECOND_MOTOR_INDEX,
      motor_reference: payload.motor_reference ?? SECOND_MOTOR_REFERENCE,
      created_by: performerId,
      user_id: starter.user_id,
      assigned_at: new Date(),
    };

    const motor = await saveSingleRecord<MotorsTable>(motors, newMotorPayload, trx);

    // Both arity columns are written together. They are read as the motor-count authority
    // in different places, and letting them disagree is what produced the mis-typed boxes
    // found during the payload-version backfill.
    await updateRecordById<StarterBoxTable>(starterBoxes, starter.id, {
      motor_support_type: "MULTIPLE_MOTORS",
      starter_type: "MULTI_STARTER",
      // The device is still running a payload with no m2 — force a republish.
      synced_settings_status: "false",
    }, trx);

    let settingsSeeded = false;
    if (ackedSettings) {
      const config = buildConvertedConfig(
        ackedSettings as unknown as Record<string, any>,
        defaultSettings,
        existingMotor,
        motor.id,
      );

      await trx.update(starterSettings)
        .set({
          multi_motor_config: config,
          // The block is new to the device, so this row is no longer what the box is
          // running — same state a fresh save leaves behind.
          acknowledgement: "FALSE",
          is_new_configuration_saved: 0,
          updated_at: sql`CURRENT_TIMESTAMP`,
        })
        .where(eq(starterSettings.id, ackedSettings.id));

      settingsSeeded = true;
    }

    await ActivityService.writeMotorAddedLog(performerId, motor.id, {
      name: motor.alias_name,
      hp: motor.hp,
      location_id: motor.location_id,
    }, trx);

    return { motor, settingsSeeded };
  });
}

/** The box's single live motor, or null when it has none (or already has more than one). */
export async function findSingleLiveMotor(starterId: number): Promise<{ motors: Motor[]; only: Motor | null }> {
  const liveMotors = await db.select().from(motors)
    .where(and(eq(motors.starter_id, starterId), ne(motors.status, "ARCHIVED")))
    .orderBy(motors.motor_index);

  return { motors: liveMotors, only: liveMotors.length === 1 ? liveMotors[0] : null };
}

/** Drops the bounded-retry counter so the next heartbeat actually republishes. */
export function armSettingsResyncAfterConversion(starterId: number): void {
  clearSettingsSyncAttempts(starterId);
  logger.info(`[dual-motor-conversion] starter=${starterId} converted; settings queued for republish`);
}
