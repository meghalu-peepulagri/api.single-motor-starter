import { and, desc, eq, ne, isNull, sql } from "drizzle-orm";
import { REPLACE_DEVICE_ASSIGNED, REPLACE_PCB_DUPLICATE, REPLACE_PCB_MOTOR_TYPE_MISMATCH, REPLACE_PCB_SAME_AS_CURRENT, REPLACE_SPARE_DEVICE_ASSIGNED, REPLACE_STARTER_NUMBER_DUPLICATE, STARTER_BOX_NOT_FOUND, type ReplacementReason } from "../../constants/app-constants.js";
import db from "../../database/configuration.js";
import { motors, type Motor, type MotorsTable } from "../../database/schemas/motors.js";
import { starterBoxes, type StarterBox, type StarterBoxTable } from "../../database/schemas/starter-boxes.js";
import { starterDispatch } from "../../database/schemas/starter-dispatch.js";
import { StarterDefaultSettingsLimits } from "../../database/schemas/starter-default-settings-limits.js";
import { starterSettingsLimits, type StarterSettingsLimitsTable } from "../../database/schemas/starter-settings-limits.js";
import { starterSettings, type StarterSettings, type StarterSettingsTable } from "../../database/schemas/starter-settings.js";
import type { User } from "../../database/schemas/users.js";
import BaseException from "../../exceptions/base-exception.js";
import ConflictException from "../../exceptions/conflict-exception.js";
import ForbiddenException from "../../exceptions/forbidden-exception.js";
import NotFoundException from "../../exceptions/not-found-exception.js";
import UnprocessableEntityException from "../../exceptions/unprocessable-entity-exception.js";
import type { ReplacementResult, ReplacementType } from "../../helpers/activity-helper.js";
import { perMotorFields } from "../../helpers/multi-motor-settings-payload-helper.js";
import { logger } from "../../utils/logger.js";
import type { MotorSettingsBlock, MultiMotorSettingsConfig } from "../../types/multi-motor-settings-types.js";
import { ActivityService } from "./activity-service.js";
import { saveSingleRecord, updateRecordById } from "./base-db-services.js";
import { getStarterDefaultSettings } from "./settings-services.js";

type ReplaceDeviceInput = {
  starterId: number;
  newPcbNumber: string;
  newStarterNumber?: string; // Box replacement only
  reason: ReplacementReason;
  reasonNote?: string | null;
  performer: User;
};

/**
 * A replacement attempt that was refused on business rules (assigned device, duplicate or
 * unchanged number). Carries what the device log needs (`result`, `failureReason`, the
 * device row as it was when the check ran) and the HTTP exception the caller should get.
 */
class ReplacementAttemptError extends Error {
  constructor(
    readonly result: Exclude<ReplacementResult, "SUCCESS">,
    readonly failureReason: string,
    readonly httpError: BaseException,
    readonly starter: StarterBox,
  ) {
    super(httpError.message);
  }
}

const isAdminOnlyOnReadyOrTest = (performer: User, starter: StarterBox) =>
  performer.user_type === "ADMIN" && starter.device_status !== "READY" && starter.device_status !== "TEST";

/**
 * Locks the device row for the rest of the transaction and re-checks eligibility, so an
 * assignment that lands between the admin opening the dialog and saving is caught here.
 * The row lock also makes two admins replacing the same device queue up instead of racing.
 */
async function lockReplaceableStarter(trx: any, starterId: number, performer: User): Promise<StarterBox> {
  const [starter] = await trx.select().from(starterBoxes)
    .where(and(eq(starterBoxes.id, starterId), ne(starterBoxes.status, "ARCHIVED")))
    .for("update") as StarterBox[];
  if (!starter) throw new NotFoundException(STARTER_BOX_NOT_FOUND);

  if (starter.device_status === "ASSIGNED") {
    throw new ReplacementAttemptError("BLOCKED", "device is assigned to a user", new ConflictException(REPLACE_DEVICE_ASSIGNED), starter);
  }

  // Same gating as Edit/Delete: an admin only touches READY / TEST devices. Not logged as a
  // blocked attempt — it is a permission denial, not an eligibility one.
  if (isAdminOnlyOnReadyOrTest(performer, starter)) {
    throw new ForbiddenException("You do not have permission to replace this device.");
  }
  return starter;
}

async function ensurePcbNumberAvailable(trx: any, starter: StarterBox, newPcbNumber: string) {
  if (newPcbNumber.toLowerCase() === (starter.pcb_number ?? "").toLowerCase()) {
    throw new ReplacementAttemptError("FAILED", "new PCB Number is the same as the current one", new UnprocessableEntityException(REPLACE_PCB_SAME_AS_CURRENT, { new_pcb_number: REPLACE_PCB_SAME_AS_CURRENT }), starter);
  }
  const [used] = await trx.select({ id: starterBoxes.id }).from(starterBoxes)
    .where(and(ne(starterBoxes.status, "ARCHIVED"), sql`lower(${starterBoxes.pcb_number}) = ${newPcbNumber.toLowerCase()}`))
    .limit(1);
  if (used) {
    throw new ReplacementAttemptError("FAILED", `PCB Number ${newPcbNumber} is already used by another device`, new ConflictException(REPLACE_PCB_DUPLICATE, { field: "pcb_number" }), starter);
  }
}

/**
 * Box replacement only — PCB replacement never calls this, since it doesn't change the
 * device's motor type (or the device at all) and works the same for single and dual boxes.
 *
 * A PCB number is real hardware: a dual-motor board is wired with two relay outputs and a
 * single-motor board with one, and that never changes. If `newPcbNumber` was ever used on
 * ANY device before (including an archived one — an archived device's pcb_number is free
 * to reuse, see ensurePcbNumberAvailable above), that device's motor_support_type is this
 * PCB's real, fixed type, and it must match the device being replaced. A PCB number with no
 * prior history has nothing to check — it simply becomes whatever type the replacement box
 * is (already inherited from `old` in replaceBoxWithTransaction).
 */
async function ensureNewPcbMatchesMotorType(trx: any, old: StarterBox, newPcbNumber: string) {
  const [previous] = await trx.select().from(starterBoxes)
    .where(sql`lower(${starterBoxes.pcb_number}) = ${newPcbNumber.toLowerCase()}`)
    .limit(1) as StarterBox[];

  if (!previous) return;

  const [previousArity, oldArity] = await Promise.all([
    deviceMotorArity(trx, previous),
    deviceMotorArity(trx, old),
  ]);

  if (previousArity !== oldArity) {
    throw new ReplacementAttemptError(
      "FAILED",
      `PCB Number ${newPcbNumber} was previously used on a ${motorTypeLabel(previousArity)} device and cannot replace a ${motorTypeLabel(oldArity)} device`,
      new ConflictException(REPLACE_PCB_MOTOR_TYPE_MISMATCH, { field: "pcb_number" }),
      old,
    );
  }
}

async function ensureStarterNumberAvailable(trx: any, starter: StarterBox, newStarterNumber: string) {
  const [used] = await trx.select({ id: starterBoxes.id }).from(starterBoxes)
    .where(and(ne(starterBoxes.status, "ARCHIVED"), sql`lower(${starterBoxes.starter_number}) = ${newStarterNumber.toLowerCase()}`))
    .limit(1);
  if (used) {
    throw new ReplacementAttemptError("FAILED", `Starter Number ${newStarterNumber} is already used by another device`, new ConflictException(REPLACE_STARTER_NUMBER_DUPLICATE, { field: "starter_number" }), starter);
  }
}

const motorTypeLabel = (t: string) => (t === "MULTIPLE_MOTORS" ? "dual-motor" : "single-motor");

/**
 * A device's REAL motor arity, from its actual motor rows — not the motor_support_type
 * column, which can drift out of sync (e.g. a motor removed without the column being
 * corrected back to SINGLE_MOTOR). Same rule starterFilters' ?motor_type= search param
 * already applies, for the same reason.
 *
 * A live (non-archived) device is counted by its LIVE motors — that's its current, real
 * state. An archived device's motors were archived alongside it (retireOldDeviceAndMotors),
 * so "live" would always read zero there; count every motor row it ever had instead — an
 * archived device never gets new motors after retirement, so that count is stable and
 * reflects what it actually was.
 */
async function deviceMotorArity(trx: any, device: StarterBox): Promise<"SINGLE_MOTOR" | "MULTIPLE_MOTORS"> {
  const motorFilter = device.status === "ARCHIVED"
    ? eq(motors.starter_id, device.id)
    : and(eq(motors.starter_id, device.id), ne(motors.status, "ARCHIVED"));
  const [row] = await trx.select({ count: sql<number>`count(*)` }).from(motors).where(motorFilter);
  return Number(row?.count ?? 0) >= 2 ? "MULTIPLE_MOTORS" : "SINGLE_MOTOR";
}

/**
 * Box replacement only. The New Starter Number / New PCB Number fields are filled from a
 * dropdown of existing devices (a deliberate frontend design — see the Replace Device
 * dialog), so a normal admin flow sends both fields belonging to the SAME real, existing
 * device together, not a hand-typed brand-new pair. That combination is a "swap in this
 * spare device" request, not a "create a device with these numbers" one, and must be
 * checked BEFORE ensurePcbNumberAvailable / ensureStarterNumberAvailable — those two
 * would otherwise reject it as a plain duplicate (it correctly IS one; it's just not an
 * error in this specific case).
 *
 * Returns the matching device only when the numbers agree on ONE single existing,
 * non-archived, non-`old` device. A pair that only partially matches (e.g. the starter
 * number belongs to one device and the PCB number to a different one, or a typo) is left
 * for the existing per-field duplicate checks to reject with their normal messages.
 */
async function findExactSpareDeviceMatch(trx: any, oldId: number, newStarterNumber: string, newPcbNumber: string): Promise<StarterBox | undefined> {
  const [match] = await trx.select().from(starterBoxes)
    .where(and(
      ne(starterBoxes.status, "ARCHIVED"),
      ne(starterBoxes.id, oldId),
      sql`lower(${starterBoxes.starter_number}) = ${newStarterNumber.toLowerCase()}`,
      sql`lower(${starterBoxes.pcb_number}) = ${newPcbNumber.toLowerCase()}`,
    ))
    .limit(1) as StarterBox[];
  return match;
}

/** Shared by both box-replacement paths: retires the old device's motors, then the device itself. */
async function retireOldDeviceAndMotors(trx: any, old: StarterBox) {
  const oldMotors = await trx.select({ id: motors.id }).from(motors)
    .where(and(eq(motors.starter_id, old.id), ne(motors.status, "ARCHIVED")));
  if (oldMotors.length > 0) {
    await trx.update(motors).set({ status: "ARCHIVED" }).where(and(eq(motors.starter_id, old.id), ne(motors.status, "ARCHIVED")));
  }
  // device_status: "REPLACED" (on top of status: "ARCHIVED") is what lets a "Replaced"
  // filter find devices retired specifically by a Box replacement — a plain delete
  // (deleteStarterBoxHandler) only ever sets status, leaving device_status untouched, so
  // it never shows up here.
  await updateRecordById<StarterBoxTable>(starterBoxes, old.id, { status: "ARCHIVED", device_status: "REPLACED" }, trx);
}

/**
 * Client's answer to Open Question 1 (box replacement and settings): keep ADC/ATMEL/PT100
 * calibration fresh (per new PCB, never copied — that's board-specific hardware), and copy
 * everything about FLC, fault/alert thresholds and fault-enables from the old device,
 * conditional on the same HP motor being reconnected.
 *
 * These are the box-level (flat starter_settings columns) fields that carry over — FLC,
 * every trip/fault/alert/recovery timing and threshold, and every fault-enable flag.
 * Deliberately excluded: all calibration groups (ATMEL/ADC/PT100), MQTT/IVRS/frequency
 * config, feature enables, star-delta timing (step_delay/start_time/transfer_time) and
 * as_dly — none of those are about the motor or a fault condition.
 */
const CARRY_FORWARD_ON_BOX_REPLACEMENT_FIELDS = [
  "flc",
  "irt_time", "lvt_time", "hvt_time", "ipt_time", "drt_time", "olt_time", "opt_time", "cit_time",
  "tpf",
  "ipf", "lvf", "hvf", "vif", "paminf", "pamaxf", "f_dr", "f_ol", "f_lr", "f_opf", "f_ci",
  "pfa", "lva", "hva", "via", "pamina", "pamaxa", "dr", "ol", "lr", "ci",
  "lvr", "hvr", "olf", "lrf", "opf", "cif", "drf", "olr", "lrr", "cir",
  "allflt_en", "pr_flt_en", "v_en", "c_en",
  "vflt_under_voltage", "vflt_over_voltage", "vflt_voltage_imbalance", "vflt_phase_failure",
  "cflt_dry_run", "cflt_over_current", "cflt_output_phase_fail", "cflt_curr_imbalance",
] as const;

/** Picks only the carry-forward fields that are actually set on the old device's settings. */
function carryForwardBoxLevelSettings(oldSettings: StarterSettings | undefined): Record<string, unknown> {
  if (!oldSettings) return {};
  const out: Record<string, unknown> = {};
  for (const field of CARRY_FORWARD_ON_BOX_REPLACEMENT_FIELDS) {
    const value = (oldSettings as unknown as Record<string, unknown>)[field];
    if (value !== undefined && value !== null) out[field] = value;
  }
  return out;
}

/**
 * Same carry-forward, for a MULTI_STARTER box's per-motor block — the current-related
 * fields (FLC + current-based faults) that live in multi_motor_config.motors[] instead of
 * the flat columns. Reuses perMotorFields, the same 19-field projection the settings-save
 * and publish paths already trust, so this can never drift from what "per-motor" means
 * elsewhere — and it already excludes ig_r/y/b / io_r/y/b (current calibration), matching
 * "keep calibration fresh" without needing a separate exclusion list here.
 * Falls back to the default per-motor template when the old device never had this motor
 * index acknowledged (shouldn't normally happen — box replacement recreates every motor
 * slot the old device already had — but a box with no acknowledged settings at all is
 * possible for a never-configured device).
 */
function carryForwardMultiMotorConfig(
  oldSettings: StarterSettings | undefined,
  defaultMultiMotorDefaults: { v_flt_en?: number; sd_time?: number; motor?: Record<string, unknown> } | null | undefined,
  newMotorsByIndex: Map<number, Motor>,
): MultiMotorSettingsConfig {
  const oldBlocksByIndex = new Map(
    (oldSettings?.multi_motor_config?.motors ?? []).map((block) => [block.motor_index, block])
  );
  const defaultMotorTemplate = defaultMultiMotorDefaults?.motor ?? {};

  const motorBlocks: MotorSettingsBlock[] = [];
  for (const [motorIndex, newMotor] of newMotorsByIndex) {
    const oldBlock = oldBlocksByIndex.get(motorIndex);
    const source = oldBlock ? perMotorFields(oldBlock as unknown as Record<string, any>) : perMotorFields(defaultMotorTemplate);
    motorBlocks.push({
      ...source,
      motor_id: newMotor.id,
      motor_index: motorIndex,
      motor_reference: newMotor.motor_reference ?? undefined,
      // The new device has never seen this block — it must re-sync before it's "current".
      acknowledgement: "FALSE",
    });
  }

  return {
    // v_flt_en is the dual-box fault-enable bit — carries forward with the rest of the
    // fault-enable fields. sd_time (star-delta start time) is unrelated to the motor/FLC
    // and always starts fresh, same as the flat step_delay/start_time/transfer_time fields.
    v_flt_en: (oldSettings?.multi_motor_config?.v_flt_en as number | undefined) ?? defaultMultiMotorDefaults?.v_flt_en ?? 0,
    sd_time: 0,
    motors: motorBlocks,
  };
}

/**
 * Runs `attempt` in one transaction and guarantees exactly one log entry per attempt:
 *  - success: the entry is written INSIDE the transaction (`attempt` calls it), so the change
 *    and its log commit or roll back together;
 *  - blocked / failed: the transaction has rolled back by the time we get here, so the entry
 *    is written on a fresh connection, OUTSIDE it. Writing it inside would have been rolled
 *    back with the change it describes.
 * A failure to write the blocked/failed entry is logged and swallowed so it never hides the
 * real error from the caller. Errors raised before the device was found (404) or for
 * permission (403) have no attempt to record and pass through untouched.
 */
async function runLoggedReplacement<T>(type: ReplacementType, input: ReplaceDeviceInput, attempt: (trx: any, remember: (starter: StarterBox) => void) => Promise<T>): Promise<T> {
  let lockedStarter: StarterBox | undefined;

  try {
    return await db.transaction(async (trx: any) => await attempt(trx, (starter) => { lockedStarter = starter; }));
  } catch (error: any) {
    let result: Exclude<ReplacementResult, "SUCCESS"> = "FAILED";
    let failureReason = "unexpected error while replacing the device";
    let httpError: unknown = error;
    let starter = lockedStarter;

    if (error instanceof ReplacementAttemptError) {
      ({ result, failureReason, httpError, starter } = error);
    } else if (error instanceof BaseException) {
      throw error;
    } else {
      // A concurrent insert can still beat the pre-check and hit the unique index.
      const pgError = error?.cause ?? error;
      if (pgError?.code === "23505" && pgError.constraint === "validate_pcb_number") {
        failureReason = `PCB Number ${input.newPcbNumber} is already used by another device`;
        httpError = new ConflictException(REPLACE_PCB_DUPLICATE, { field: "pcb_number" });
      } else if (pgError?.code === "23505" && pgError.constraint === "validate_starter_number") {
        failureReason = `Starter Number ${input.newStarterNumber} is already used by another device`;
        httpError = new ConflictException(REPLACE_STARTER_NUMBER_DUPLICATE, { field: "starter_number" });
      } else {
        logger.error(`Error at ${type} replacement on starter ${input.starterId}`, error);
      }
    }

    if (starter) {
      try {
        await ActivityService.writeDeviceReplacementLog({
          performedBy: input.performer.id,
          performedByName: input.performer.full_name,
          deviceId: starter.id,
          type,
          result,
          old: { starter_id: starter.id, starter_number: starter.starter_number, pcb_number: starter.pcb_number },
          next: type === "BOX"
            ? { starter_number: input.newStarterNumber, pcb_number: input.newPcbNumber }
            : { pcb_number: input.newPcbNumber },
          reason: input.reason,
          reasonNote: input.reasonNote,
          failureReason,
        });
      } catch (logError) {
        logger.error(`Could not write ${result} ${type} replacement log for starter ${starter.id}`, logError);
      }
    }
    throw httpError;
  }
}

/**
 * PCB replacement: only the PCB Number changes on the SAME device record, so the Starter
 * Number, motors, settings, schedules, telemetry and history are untouched.
 */
export async function replacePcbWithTransaction(input: ReplaceDeviceInput): Promise<StarterBox> {
  return await runLoggedReplacement("PCB", input, async (trx, remember) => {
    const starter = await lockReplaceableStarter(trx, input.starterId, input.performer);
    remember(starter);
    await ensurePcbNumberAvailable(trx, starter, input.newPcbNumber);

    const updated = await updateRecordById<StarterBoxTable>(starterBoxes, starter.id, { pcb_number: input.newPcbNumber }, trx);

    // Keep the dispatch record findable by the PCB now fitted, as PATCH /:id/details does.
    await trx.update(starterDispatch).set({ pcb_number: input.newPcbNumber, updated_at: new Date() })
      .where(and(eq(starterDispatch.starter_id, starter.id), ne(starterDispatch.status, "ARCHIVED")));

    await ActivityService.writeDeviceReplacementLog({
      performedBy: input.performer.id,
      performedByName: input.performer.full_name,
      deviceId: starter.id,
      type: "PCB",
      result: "SUCCESS",
      old: { starter_id: starter.id, starter_number: starter.starter_number, pcb_number: starter.pcb_number },
      next: { pcb_number: input.newPcbNumber },
      reason: input.reason,
      reasonNote: input.reasonNote,
    }, trx);

    return updated as StarterBox;
  });
}

/**
 * Box replacement: the old device is retired (ARCHIVED, history kept on its record) and a
 * fresh device takes its place. Telemetry, readings and fault history are NOT copied. What
 * the new device inherits is only the hardware model identity (name, starter/motor type,
 * payload version, one fresh motor per old motor slot); settings start from the defaults,
 * as for any newly added device.
 */
export async function replaceBoxWithTransaction(input: ReplaceDeviceInput & { newStarterNumber: string }): Promise<{ device: StarterBox; replacedDeviceId: number }> {
  return await runLoggedReplacement("BOX", input, async (trx, remember) => {
    const old = await lockReplaceableStarter(trx, input.starterId, input.performer);
    remember(old);

    // Path 1: the two fields together name an existing spare device (the normal case when
    // they came from the dropdown) — swap it in as-is. Nothing on the spare is touched; it
    // keeps its own motors, settings and history exactly as they already are. Only the OLD
    // device gets retired here.
    const spare = await findExactSpareDeviceMatch(trx, old.id, input.newStarterNumber, input.newPcbNumber);
    if (spare) {
      if (spare.device_status === "ASSIGNED") {
        throw new ReplacementAttemptError(
          "FAILED",
          `Device ${spare.starter_number} is assigned to a user and cannot be used as a replacement`,
          new ConflictException(REPLACE_SPARE_DEVICE_ASSIGNED, { field: "pcb_number" }),
          old,
        );
      }
      const [spareArity, oldArity] = await Promise.all([
        deviceMotorArity(trx, spare),
        deviceMotorArity(trx, old),
      ]);
      if (spareArity !== oldArity) {
        throw new ReplacementAttemptError(
          "FAILED",
          `Device ${spare.starter_number} is a ${motorTypeLabel(spareArity)} device and cannot replace a ${motorTypeLabel(oldArity)} device`,
          new ConflictException(REPLACE_PCB_MOTOR_TYPE_MISMATCH, { field: "pcb_number" }),
          old,
        );
      }

      await retireOldDeviceAndMotors(trx, old);

      await ActivityService.writeDeviceReplacementLog({
        performedBy: input.performer.id,
        performedByName: input.performer.full_name,
        deviceId: spare.id,
        type: "BOX",
        result: "SUCCESS",
        old: { starter_id: old.id, starter_number: old.starter_number, pcb_number: old.pcb_number },
        next: { starter_id: spare.id, starter_number: spare.starter_number, pcb_number: spare.pcb_number },
        reason: input.reason,
        reasonNote: input.reasonNote,
      }, trx);

      return { device: spare, replacedDeviceId: old.id };
    }

    // Path 2: no single existing device matches both fields — either both are genuinely new
    // (create a fresh device, as before) or only one field matches a DIFFERENT device (a
    // typo/partial match), which the two checks below correctly reject as a duplicate.
    await ensurePcbNumberAvailable(trx, old, input.newPcbNumber);
    await ensureNewPcbMatchesMotorType(trx, old, input.newPcbNumber);
    await ensureStarterNumberAvailable(trx, old, input.newStarterNumber);

    const defaultSettings = await getStarterDefaultSettings();
    const defaultSettingsLimits = await trx.select().from(StarterDefaultSettingsLimits).limit(1);
    if (!defaultSettings[0] || !defaultSettingsLimits[0]) throw new Error("Default starter settings are not configured");
    const { id: _dsId, created_at: _dsCreated, updated_at: _dsUpdated, ...defaultSettingsData } = defaultSettings[0];
    const { id: _dlId, created_at: _dlCreated, updated_at: _dlUpdated, ...defaultSettingsLimitsData } = defaultSettingsLimits[0];

    // hp is carried forward below — the physical motor is normally what stays connected in
    // the field when only the control box is swapped, not the pump — so "same HP motor
    // reconnected" (Open Question 1's condition for copying FLC/thresholds) is satisfied by
    // construction here. There's no payload field today for saying a DIFFERENT-HP motor was
    // also fitted; if that becomes a real case, it needs its own input and this carry-forward
    // would need to be skipped per-motor instead of applied unconditionally.
    const oldMotors = await trx.select({ id: motors.id, motor_index: motors.motor_index, motor_reference: motors.motor_reference, hp: motors.hp }).from(motors)
      .where(and(eq(motors.starter_id, old.id), ne(motors.status, "ARCHIVED")))
      .orderBy(motors.motor_index);

    // The settings the old device last actually ran — the source for the carried-forward
    // fields below. A device that was never configured (no acknowledged row) has nothing to
    // carry forward, and the new device simply gets fresh defaults for everything.
    const oldAckedSettings = await trx.query.starterSettings.findFirst({
      where: and(
        eq(starterSettings.starter_id, old.id),
        eq(starterSettings.acknowledgement, "TRUE"),
        eq(starterSettings.is_new_configuration_saved, 1),
      ),
      orderBy: desc(starterSettings.created_at),
    }) as StarterSettings | undefined;

    // Derived from oldMotors' actual live count, not the old.motor_support_type /
    // old.starter_type columns — those can be stale (see deviceMotorArity above), and
    // copying a stale flag onto the brand-new device would just carry the same bug forward.
    const oldArity = oldMotors.length >= 2 ? "MULTIPLE_MOTORS" : "SINGLE_MOTOR";
    const newStarterType = oldArity === "MULTIPLE_MOTORS" ? "MULTI_STARTER" : "SINGLE_STARTER";

    // Retire the old box first: the live-rows-only unique indexes (name, starter/pcb number,
    // motor slot) must be free before the new rows are inserted.
    await retireOldDeviceAndMotors(trx, old);

    const device = await saveSingleRecord<StarterBoxTable>(starterBoxes, {
      name: old.name,
      alias_name: old.alias_name,
      starter_number: input.newStarterNumber,
      pcb_number: input.newPcbNumber,
      status: "INACTIVE",
      device_status: "READY",
      created_by: input.performer.id,
      starter_type: newStarterType,
      motor_support_type: oldArity,
      motor_starter_type: old.motor_starter_type,
      payload_version: old.payload_version,
    }, trx);

    const motorSlots = oldMotors.length > 0 ? oldMotors : [{ motor_index: 1, motor_reference: null, hp: "2" }];
    const newMotorsByIndex = new Map<number, Motor>();
    for (const slot of motorSlots) {
      const motorIndex = slot.motor_index ?? 1;
      const newMotor = await saveSingleRecord<MotorsTable>(motors, {
        name: `Pump ${motorIndex} - ${input.newPcbNumber}`,
        hp: slot.hp ?? "2",
        starter_id: device.id,
        motor_index: motorIndex,
        motor_reference: slot.motor_reference ?? undefined,
      }, trx);
      newMotorsByIndex.set(motorIndex, newMotor);
    }

    // Open Question 1 (client's answer): ADC/ATMEL/PT100 calibration stays at the fresh
    // default template (it's specific to the exact new PCB's analog hardware, never the old
    // one's) — that's simply defaultSettingsData, untouched below. FLC, every fault/alert
    // threshold and fault-enable carries forward from the old device instead of resetting.
    const carriedFlatFields = carryForwardBoxLevelSettings(oldAckedSettings);
    const multiMotorConfig = oldArity === "MULTIPLE_MOTORS"
      ? carryForwardMultiMotorConfig(oldAckedSettings, (defaultSettingsData as any)?.multi_motor_defaults, newMotorsByIndex)
      : undefined;

    await saveSingleRecord<StarterSettingsTable>(starterSettings, {
      ...defaultSettingsData,
      ...carriedFlatFields,
      ...(multiMotorConfig ? { multi_motor_config: multiMotorConfig } : {}),
      starter_id: device.id,
      created_by: input.performer.id,
      acknowledgement: "TRUE",
    }, trx);
    await saveSingleRecord<StarterSettingsLimitsTable>(starterSettingsLimits,
      { ...defaultSettingsLimitsData, starter_id: device.id }, trx);

    // Same as adding a device: pick up a dispatch record entered ahead of the box.
    await trx.update(starterDispatch).set({ starter_id: device.id })
      .where(and(eq(starterDispatch.box_serial_no, input.newStarterNumber), isNull(starterDispatch.starter_id)));

    await ActivityService.writeDeviceReplacementLog({
      performedBy: input.performer.id,
      performedByName: input.performer.full_name,
      deviceId: device.id,
      type: "BOX",
      result: "SUCCESS",
      old: { starter_id: old.id, starter_number: old.starter_number, pcb_number: old.pcb_number },
      next: { starter_id: device.id, starter_number: input.newStarterNumber, pcb_number: input.newPcbNumber },
      reason: input.reason,
      reasonNote: input.reasonNote,
    }, trx);

    return { device, replacedDeviceId: old.id };
  });
}
