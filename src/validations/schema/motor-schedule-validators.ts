import * as v from "valibot";
import { FIELD_REQUIRED, INVALID_DAYS_WEEK, INVALID_SCHEDULED_STATUS, INVALID_SCHEDULED_TYPE, MOTOR_ID_REQUIRED, SCHEDULE_DATE_FORMAT, SCHEDULE_DATE_REQUIRED, SCHEDULE_END_TIME_INVALID, SCHEDULE_END_TIME_REQUIRED, SCHEDULE_START_TIME_INVALID, SCHEDULE_START_TIME_REQUIRED, SCHEDULE_STATUS, SCHEDULE_TYPE_IS_REQUIRED, SCHEDULE_TYPES } from "../../constants/app-constants.js";

export const vAddMotorSchedule = v.object({
  motor_id: v.pipe(
    v.number(MOTOR_ID_REQUIRED),
    v.custom(
      (value: unknown) =>
        typeof value === "number" && Number.isInteger(value) && value > 0,
      "Invalid motor id",
    ),
  ),

  pond_id: v.pipe(
    v.number(FIELD_REQUIRED),
    v.custom((value: unknown) => typeof value === "number" && Number.isInteger(value) && value > 0, "Invalid pond id",
    ),
  ),
  schedule_type: v.pipe(
    v.string(SCHEDULE_TYPE_IS_REQUIRED),
    v.nonEmpty(SCHEDULE_TYPE_IS_REQUIRED),
    v.picklist(SCHEDULE_TYPES, INVALID_SCHEDULED_TYPE),
  ),

  schedule_date: v.optional(
    v.pipe(
      v.string(SCHEDULE_DATE_REQUIRED),
      v.nonEmpty(SCHEDULE_DATE_REQUIRED),
      v.regex(/^\d{4}-\d{2}-\d{2}$/, SCHEDULE_DATE_FORMAT),
    ),
  ),

  start_time: v.pipe(v.string(SCHEDULE_START_TIME_REQUIRED), v.nonEmpty(SCHEDULE_START_TIME_REQUIRED), v.regex(/^([01]\d|2[0-3]):([0-5]\d)$/, SCHEDULE_START_TIME_INVALID)),
  end_time: v.pipe(v.string(SCHEDULE_END_TIME_REQUIRED), v.nonEmpty(SCHEDULE_END_TIME_REQUIRED), v.regex(/^([01]\d|2[0-3]):([0-5]\d)$/, SCHEDULE_END_TIME_INVALID)),
  days_of_week: v.optional(v.array(v.union([v.literal(0), v.literal(1), v.literal(2), v.literal(3), v.literal(4), v.literal(5), v.literal(6)], INVALID_DAYS_WEEK))),
  schedule_status: v.optional(v.picklist((SCHEDULE_STATUS), INVALID_SCHEDULED_STATUS)),
});

export const vArrayOfMotorScheduleValidators = v.array(vAddMotorSchedule);

export type ValidatedMotorSchedule = v.InferOutput<typeof vAddMotorSchedule>;
export type ValidatedMotorScheduleArray = ValidatedMotorSchedule[];