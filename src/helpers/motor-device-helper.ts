import { eq, ne } from "drizzle-orm";
import {
  MAX_MULTI_MOTOR_LIMIT_REACHED,
  MAX_SINGLE_MOTOR_LIMIT_REACHED,
  MOTOR_REFERENCE_NOT_SUPPORTED,
} from "../constants/app-constants.js";
import { motors } from "../database/schemas/motors.js";
import type { StarterBox } from "../database/schemas/starter-boxes.js";
import BadRequestException from "../exceptions/bad-request-exception.js";
import ConflictException from "../exceptions/conflict-exception.js";
import { getRecordsCount } from "../services/db/base-db-services.js";

/**
 * Checks whether the target device can accept one more motor.
 *
 * Case 1 — SINGLE_MOTOR device: max 1 active motor allowed.
 * Case 2 — MULTIPLE_MOTORS device: max 2 active motors allowed.
 *
 * Throws ConflictException when the limit is already reached.
 */
export async function checkDeviceMotorCapacity(targetStarter: StarterBox, excludeMotorId?: number): Promise<void> {
  const filters: any[] = [
    eq(motors.starter_id, targetStarter.id),
    ne(motors.status, "ARCHIVED"),
  ];
  if (excludeMotorId !== undefined) filters.push(ne(motors.id, excludeMotorId));
  const motorCount = await getRecordsCount(motors, filters);

  const maxAllowed = targetStarter.motor_support_type === "SINGLE_MOTOR" ? 1 : 2;

  if (motorCount >= maxAllowed) {
    throw new ConflictException(
      targetStarter.motor_support_type === "SINGLE_MOTOR"
        ? MAX_SINGLE_MOTOR_LIMIT_REACHED
        : MAX_MULTI_MOTOR_LIMIT_REACHED,
    );
  }
}

/**
 * Resolves the motor slot (m1 / m2) and motor_index to assign on the target device.
 *
 * --- Reference requested (motor_reference in body) ---
 *
 * Case 1 — "m2" requested on a SINGLE_MOTOR device:
 *   Not allowed. SINGLE_MOTOR only has the m1 slot.
 *   → throws BadRequestException (MOTOR_REFERENCE_NOT_SUPPORTED)
 *
 * Case 2 — "m1" requested and m1 slot is already occupied:
 *   Cannot assign two motors to the same slot.
 *   → throws ConflictException (MOTOR_REFERENCE_SLOT_TAKEN)
 *
 * Case 3 — "m2" requested and m2 slot is already occupied:
 *   Cannot assign two motors to the same slot.
 *   → throws ConflictException (MOTOR_REFERENCE_SLOT_TAKEN)
 *
 * Case 4 — requested slot is free:
 *   Assign the requested reference and its index (m1→1, m2→2).
 *
 * --- No reference in body (auto-assign) ---
 *
 * Case 5 — m1 slot is free:
 *   Auto-assign m1 (index 1). Always prefer m1 first.
 *
 * Case 6 — m1 slot is taken, m2 slot is free:
 *   Auto-assign m2 (index 2).
 *   Only reachable on MULTIPLE_MOTORS devices because capacity check
 *   already blocks this path on SINGLE_MOTOR devices.
 *
 * --- Replace scenario (old device slot cleanup) ---
 *
 * When a motor is moved from device A to device B, its starter_id FK
 * is updated to point to device B. This implicitly frees the slot on
 * device A — no explicit update to device A is needed. The old
 * reference (m1/m2) is captured in the activity log oldData for audit.
 */
export async function resolveMotorSlot(
  targetStarter: StarterBox,
  requestedReference?: string | null,
  excludeMotorId?: number,
): Promise<{ motorReference: string; motorIndex: number }> {
  const activeFilters: any[] = [
    eq(motors.starter_id, targetStarter.id),
    ne(motors.status, "ARCHIVED"),
  ];
  if (excludeMotorId !== undefined) activeFilters.push(ne(motors.id, excludeMotorId));

  if (requestedReference) {
    // Case 1: m2 not supported on SINGLE_MOTOR devices
    if (requestedReference === "m2" && targetStarter.motor_support_type === "SINGLE_MOTOR") {
      throw new BadRequestException(MOTOR_REFERENCE_NOT_SUPPORTED);
    }

    // Case 2 / 3: requested slot is already occupied
    const slotCount = await getRecordsCount(motors, [
      ...activeFilters,
      eq(motors.motor_reference, requestedReference),
    ]);
    if (slotCount > 0) {
      throw new ConflictException(
        `Slot ${requestedReference.toUpperCase()} is already occupied on this device`,
      );
    }

    // Case 4: slot is free — honour the request
    return {
      motorReference: requestedReference,
      motorIndex: requestedReference === "m1" ? 1 : 2,
    };
  }

  // Case 5 / 6: auto-assign — m1 first, fall back to m2
  const m1Count = await getRecordsCount(motors, [...activeFilters, eq(motors.motor_reference, "m1")]);
  const motorReference = m1Count === 0 ? "m1" : "m2";
  return {
    motorReference,
    motorIndex: motorReference === "m1" ? 1 : 2,
  };
}
