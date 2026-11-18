import { and, asc, eq, ne, or, sql, type SQL } from "drizzle-orm";
import db from "../../database/configuration.js";
import { motors, type Motor } from "../../database/schemas/motors.js";
import { starterBoxes, type StarterBox } from "../../database/schemas/starter-boxes.js";

/**
 * Read-only access to devices retired by a Box / PCB replacement.
 *
 * A replacement sets the old device to status: "ARCHIVED" + device_status: "REPLACED"
 * and archives its motors (retireDeviceAndMotors). The device's history (telemetry,
 * faults, run time, settings, schedules) stays under the old starter/motor ids. The
 * helpers here let the read (GET) endpoints open that history again.
 *
 * Writes stay blocked: every write endpoint still looks devices and motors up with
 * status != 'ARCHIVED', so control, mode, settings and schedule changes on a replaced
 * device keep returning "not found".
 */

/**
 * A device a read endpoint may serve: any live device, or one retired by a replacement.
 * A plain delete only sets status: "ARCHIVED" and stays hidden.
 */
export const readableStarterCondition = (): SQL =>
  or(ne(starterBoxes.status, "ARCHIVED"), eq(starterBoxes.device_status, "REPLACED"))!;

/**
 * Motors a read endpoint may serve: live motors, and on a REPLACED device the motors it
 * had when it was retired. Those are the newest motor in each motor slot. A motor deleted
 * earlier (and possibly re-added) in the same slot has a lower id, so it stays hidden.
 *
 * Plain SQL with column references, so it also works inside a relational `with` block
 * (drizzle maps the columns to the relation's alias).
 */
export const visibleMotorCondition = (): SQL =>
  or(
    ne(motors.status, "ARCHIVED"),
    sql`(
      EXISTS (
        SELECT 1 FROM starter_boxes sb
        WHERE sb.id = ${motors.starter_id} AND sb.device_status = 'REPLACED'
      )
      AND ${motors.id} = (
        SELECT max(m2.id) FROM motors m2
        WHERE m2.starter_id = ${motors.starter_id}
          AND coalesce(m2.motor_index, 1) = coalesce(${motors.motor_index}, 1)
      )
    )`,
  )!;

/** The device for a read endpoint: live, or retired by a replacement. */
export async function getReadableStarter(starterId: number): Promise<StarterBox | undefined> {
  const [starter] = await db.select().from(starterBoxes)
    .where(and(eq(starterBoxes.id, starterId), readableStarterCondition()))
    .limit(1);
  return starter;
}

/** The motor for a read endpoint: live, or one a replaced device had when it was retired. */
export async function getReadableMotor(motorId: number): Promise<Motor | undefined> {
  const [motor] = await db.select().from(motors)
    .where(and(eq(motors.id, motorId), visibleMotorCondition()))
    .limit(1);
  return motor;
}

/** The motors a read endpoint shows for a device (see visibleMotorCondition). */
export async function getVisibleMotorsOfStarter(starterId: number): Promise<Pick<Motor, "id" | "motor_index">[]> {
  return await db.select({ id: motors.id, motor_index: motors.motor_index }).from(motors)
    .where(and(eq(motors.starter_id, starterId), visibleMotorCondition()))
    .orderBy(asc(motors.motor_index));
}

/** Tells the client to show this device as history only, with every control hidden. */
export const isReadOnlyDevice = (device: { device_status?: string | null } | null | undefined) =>
  device?.device_status === "REPLACED";
