import * as v from "valibot";
import {
  CYCLE_OFF_MINUTES_MIN,
  CYCLE_ON_MINUTES_REQUIRED,
  DAYS_OF_WEEK_ENUM,
  DAYS_OF_WEEK_REQUIRED_FOR_REPEAT,
  INVALID_DAYS_WEEK,
  INVALID_SCHEDULED_STATUS,
  INVALID_SCHEDULED_TYPE,
  MOTOR_ID_REQUIRED,
  RUNTIME_MINUTES_MIN,
  SCHEDULE_END_TIME_INVALID,
  SCHEDULE_END_TIME_REQUIRED,
  SCHEDULE_START_TIME_INVALID,
  SCHEDULE_START_TIME_REQUIRED,
  SCHEDULE_STATUS,
  SCHEDULE_TYPE_IS_REQUIRED,
  SCHEDULE_TYPES,
  START_TIME_BEFORE_END_TIME,
  STARTER_ID_REQUIRED
} from "../../constants/app-constants.js";

// =================== CREATE SCHEDULE VALIDATOR ===================
export const vAddMotorSchedule = v.pipe(
  v.object({
    motor_id: v.pipe(
      v.number(MOTOR_ID_REQUIRED),
      v.custom(
        (value: unknown) => typeof value === "number" && Number.isInteger(value) && value > 0,
        "Invalid motor id",
      ),
    ),

    starter_id: v.optional(
      v.pipe(
        v.number(STARTER_ID_REQUIRED),
        v.custom(
          (value: unknown) => typeof value === "number" && Number.isInteger(value) && value > 0,
          "Invalid starter id",
        ),
      ),
    ),

    schedule_type: v.pipe(
      v.string(SCHEDULE_TYPE_IS_REQUIRED),
      v.nonEmpty(SCHEDULE_TYPE_IS_REQUIRED),
      v.picklist(SCHEDULE_TYPES, INVALID_SCHEDULED_TYPE),
    ),

    start_time: v.pipe(
      v.string(SCHEDULE_START_TIME_REQUIRED),
      v.nonEmpty(SCHEDULE_START_TIME_REQUIRED),
      v.regex(/^([01]\d|2[0-3]):([0-5]\d)$/, SCHEDULE_START_TIME_INVALID),
    ),

    end_time: v.pipe(
      v.string(SCHEDULE_END_TIME_REQUIRED),
      v.nonEmpty(SCHEDULE_END_TIME_REQUIRED),
      v.regex(/^([01]\d|2[0-3]):([0-5]\d)$/, SCHEDULE_END_TIME_INVALID),
    ),

    days_of_week: v.array(
      v.union(
        DAYS_OF_WEEK_ENUM.map((day) => v.literal(day)) as any,
        INVALID_DAYS_WEEK,
      ),
    ),

    // TIME_BASED: optional runtime quota in minutes
    runtime_minutes: v.optional(
      v.pipe(
        v.number(),
        v.custom(
          (val: unknown) => typeof val === "number" && Number.isInteger(val) && val >= 1,
          RUNTIME_MINUTES_MIN,
        ),
      ),
    ),

    // CYCLIC: ON/OFF durations in minutes
    cycle_on_minutes: v.optional(
      v.pipe(
        v.number(),
        v.custom(
          (val: unknown) => typeof val === "number" && Number.isInteger(val) && val >= 1,
          CYCLE_OFF_MINUTES_MIN,
        ),
      ),
    ),

    cycle_off_minutes: v.optional(
      v.pipe(
        v.number(),
        v.custom(
          (val: unknown) => typeof val === "number" && Number.isInteger(val) && val >= 1,
          CYCLE_OFF_MINUTES_MIN,
        ),
      ),
    ),

    power_loss_recovery: v.optional(v.boolean()),

    schedule_status: v.optional(v.picklist(SCHEDULE_STATUS, INVALID_SCHEDULED_STATUS)),
    repeat: v.optional(v.union([v.literal(0), v.literal(1)], "Repeat must be 0 or 1")),
  }),

  // Cross-field: recurring schedules require at least one day.
  v.custom((data: any) => {
    if (!data.schedule_date && (!data.days_of_week || data.days_of_week.length === 0)) {
      return false;
    }
    return true;
  }, DAYS_OF_WEEK_REQUIRED_FOR_REPEAT),

  // Cross-field: CYCLIC schedules require cycle_on_minutes and cycle_off_minutes
  v.custom((data: any) => {
    if (data.schedule_type === "CYCLIC") {
      return !!data.cycle_on_minutes && !!data.cycle_off_minutes;
    }
    return true;
  }, CYCLE_ON_MINUTES_REQUIRED),

  // Cross-field: start_time must not equal end_time
  v.custom((data: any) => {
    return data.start_time !== data.end_time;
  }, START_TIME_BEFORE_END_TIME),
);

// =================== UPDATE SCHEDULE VALIDATOR ===================
export const vUpdateMotorSchedule = vAddMotorSchedule;

// =================== ADD REPEAT DAYS VALIDATOR ===================
export const vAddRepeatDays = v.object({
  days_of_week: v.pipe(
    v.array(
      v.union(
        DAYS_OF_WEEK_ENUM.map((day) => v.literal(day)) as any,
        INVALID_DAYS_WEEK,
      ),
    ),
    v.custom(
      (val: unknown) => Array.isArray(val) && val.length >= 1,
      DAYS_OF_WEEK_REQUIRED_FOR_REPEAT,
    ),
  ),
});

// =================== BATCH CREATE (for pond) ===================
export const vArrayOfMotorScheduleValidators = v.array(vAddMotorSchedule);

// =================== TYPE EXPORTS ===================
export type ValidatedMotorSchedule = v.InferOutput<typeof vAddMotorSchedule>;
export type ValidatedMotorScheduleArray = ValidatedMotorSchedule[];
export type ValidatedUpdateMotorSchedule = v.InferOutput<typeof vUpdateMotorSchedule>;
export type ValidatedAddRepeatDays = v.InferOutput<typeof vAddRepeatDays>;
