import { and, eq, inArray, ne, notInArray, or } from "drizzle-orm";
import { STARTER_BOX_NOT_FOUND, UNASSIGN_DEVICE_NOT_ASSIGNED } from "../../constants/app-constants.js";
import db from "../../database/configuration.js";
import { motorSchedules } from "../../database/schemas/motor-schedules.js";
import { motors, type MotorsTable } from "../../database/schemas/motors.js";
import { starterBoxes, type StarterBox, type StarterBoxTable } from "../../database/schemas/starter-boxes.js";
import { subUserPermissions } from "../../database/schemas/sub-user-permissions.js";
import type { User } from "../../database/schemas/users.js";
import ConflictException from "../../exceptions/conflict-exception.js";
import NotFoundException from "../../exceptions/not-found-exception.js";
import { ActivityService } from "./activity-service.js";
import { saveSingleRecord, updateRecordById } from "./base-db-services.js";
import { SLOT_FREE_STATUSES } from "./motor-schedules-services.js";

/**
 * Super Admin "Unassign": takes an ASSIGNED device away from its user and puts it back in
 * the Deployable pool (device_status: DEPLOYED), ready to be assigned to someone else with
 * the normal assign flow.
 *
 * In one transaction:
 *  - the customer's upcoming schedules on the device are deleted (they must not run for
 *    the next owner);
 *  - sub-users lose their access to the device and its motors;
 *  - the customer's motors are archived and one fresh motor is created per slot the box
 *    had (M1, or M1 + M2), so a dual box stays dual. Archiving instead of editing keeps
 *    the old customer's telemetry, faults and run time on the archived motor ids and out
 *    of the next owner's view;
 *  - the device's user, location and installation details are cleared and it goes back
 *    to DEPLOYED.
 *
 * Device settings are kept: they belong to the hardware and the next owner starts from them.
 */
export async function unassignStarterWithTransaction(starterId: number, performer: User): Promise<StarterBox> {
  return await db.transaction(async (trx) => {
    // Row lock: two admins (or an unassign racing an assign / replacement) queue up here.
    const [starter] = await trx.select().from(starterBoxes)
      .where(and(eq(starterBoxes.id, starterId), ne(starterBoxes.status, "ARCHIVED")))
      .for("update");
    if (!starter) throw new NotFoundException(STARTER_BOX_NOT_FOUND);
    if (starter.device_status !== "ASSIGNED" || !starter.user_id) {
      throw new ConflictException(UNASSIGN_DEVICE_NOT_ASSIGNED);
    }

    const liveMotors = await trx.select({ id: motors.id, motor_index: motors.motor_index, motor_reference: motors.motor_reference })
      .from(motors)
      .where(and(eq(motors.starter_id, starter.id), ne(motors.status, "ARCHIVED")))
      .orderBy(motors.motor_index);
    const liveMotorIds = liveMotors.map((m) => m.id);
    const now = new Date();

    // 1. Upcoming / running schedules of this customer. Finished ones stay as history.
    await trx.update(motorSchedules)
      .set({ schedule_status: "DELETED", status: "ARCHIVED", enabled: false, deleted_by: performer.id, deleted_at: now, updated_at: now })
      .where(and(
        eq(motorSchedules.starter_id, starter.id),
        ne(motorSchedules.status, "ARCHIVED"),
        notInArray(motorSchedules.schedule_status, [...SLOT_FREE_STATUSES]),
      ));

    // 2. Sub-user access granted on this device or any of its motors.
    await trx.delete(subUserPermissions).where(
      liveMotorIds.length > 0
        ? or(eq(subUserPermissions.starter_id, starter.id), inArray(subUserPermissions.motor_id, liveMotorIds))
        : eq(subUserPermissions.starter_id, starter.id),
    );

    // 3. Archive the customer's motors BEFORE creating the fresh ones: unique_starter_motor_index
    //    is a live-rows-only unique index on (starter_id, motor_index).
    if (liveMotorIds.length > 0) {
      await trx.update(motors)
        .set({ status: "ARCHIVED", state: 0, updated_at: now })
        .where(inArray(motors.id, liveMotorIds));
    }
    const motorSlots = liveMotors.length > 0 ? liveMotors : [{ motor_index: 1, motor_reference: null }];
    for (const slot of motorSlots) {
      const motorIndex = slot.motor_index ?? 1;
      await saveSingleRecord<MotorsTable>(motors, {
        name: `Pump ${motorIndex} - ${starter.pcb_number}`,
        hp: String(2),
        starter_id: starter.id,
        motor_index: motorIndex,
        motor_reference: slot.motor_reference ?? undefined,
      }, trx);
    }

    // 4. Back to the Deployable pool.
    const updated = await updateRecordById<StarterBoxTable>(starterBoxes, starter.id, {
      user_id: null,
      location_id: null,
      device_status: "DEPLOYED",
      assigned_at: null,
      alias_name: null,
      device_installed_location: null,
      installation_photo_key: null,
    }, trx) as StarterBox;

    await ActivityService.logActivity({
      performedBy: performer.id,
      action: "DEVICE_UNASSIGNED",
      entityType: "STARTER",
      entityId: starter.id,
      oldData: { user_id: starter.user_id, location_id: starter.location_id, device_status: starter.device_status },
      newData: { pcb_number: starter.pcb_number, starter_number: starter.starter_number, device_status: "DEPLOYED" },
    }, trx as any);

    return updated;
  });
}
