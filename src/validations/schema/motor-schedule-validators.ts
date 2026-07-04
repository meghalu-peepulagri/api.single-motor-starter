import * as v from "valibot";
import { todayAsYYMMDD } from "../../helpers/motor-schedule-payload-helper.js";
import {
  CYCLE_OFF_MINUTES_MIN,
  CYCLE_ON_MINUTES_REQUIRED,
  DAYS_OF_WEEK_ENUM,
  DAYS_OF_WEEK_REQUIRED_FOR_REPEAT,
  DAYS_OF_WEEK_REQUIRED_FOR_REPEAT_SCHEDULE,
  INVALID_DAYS_WEEK,
  INVALID_SCHEDULED_STATUS,
  INVALID_SCHEDULED_TYPE,
  MOTOR_ID_REQUIRED,
  REPEAT_REQUIRES_CYCLE,
  RUNTIME_MINUTES_MIN,
  SCHEDULE_DATE_REQUIRED_FOR_ONE_TIME,
  SCHEDULE_END_TIME_INVALID,
  SCHEDULE_END_TIME_REQUIRED,
  SCHEDULE_START_DATE_FORMAT,
  SCHEDULE_END_DATE_FORMAT,
  SCHEDULE_START_DATE_REQUIRED,
  SCHEDULE_END_DATE_REQUIRED,
  SCHEDULE_START_TIME_INVALID,
  SCHEDULE_START_TIME_REQUIRED,
  SCHEDULE_STATUS,
  SCHEDULE_TYPE_IS_REQUIRED,
  SCHEDULE_TYPES,
  START_TIME_BEFORE_END_TIME,
  SCHEDULE_DATE_PAST,
  SCHEDULE_END_DATE_PAST,
  SCHEDULE_END_DATE_BEFORE_START,
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

    starter_id:
      v.pipe(
        v.number(STARTER_ID_REQUIRED),
        v.custom(
          (value: unknown) => typeof value === "number" && Number.isInteger(value) && value > 0,
          "Invalid starter id",
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
      v.regex(/^([01]\d|2[0-3])([0-5]\d)$/, SCHEDULE_START_TIME_INVALID),
    ),

    end_time: v.pipe(
      v.string(SCHEDULE_END_TIME_REQUIRED),
      v.nonEmpty(SCHEDULE_END_TIME_REQUIRED),
      v.regex(/^([01]\d|2[0-3])([0-5]\d)$/, SCHEDULE_END_TIME_INVALID),
    ),

    // Optional for one-time date-based schedules; required for repeat schedules
    days_of_week: v.nullish(
      v.pipe(
        v.array(v.number()),
        v.custom(
          (val: unknown) =>
            Array.isArray(val) && val.every((day) => DAYS_OF_WEEK_ENUM.includes(day as any)),
          INVALID_DAYS_WEEK,
        ),
      ),
    ),

    // Schedule start date (numeric YYMMDD, e.g., 260415)
    schedule_start_date:
      v.pipe(
        v.number(SCHEDULE_START_DATE_REQUIRED),
        v.custom(
          (val: unknown) => typeof val === "number" && Number.isInteger(val) && val >= 0 && val <= 991231,
          SCHEDULE_START_DATE_FORMAT,
        ),
      ),

    // Schedule end date (numeric YYMMDD, e.g., 260416)
    schedule_end_date:
      v.pipe(
        v.number(SCHEDULE_END_DATE_REQUIRED),
        v.custom(
          (val: unknown) => typeof val === "number" && Number.isInteger(val) && val >= 0 && val <= 991231,
          SCHEDULE_END_DATE_FORMAT,
        ),
      ),

    // TIME_BASED: optional runtime quota in minutes
    runtime_minutes: v.nullish(
      v.pipe(
        v.number(),
        v.custom(
          (val: unknown) => typeof val === "number" && Number.isInteger(val) && val >= 1,
          RUNTIME_MINUTES_MIN,
        ),
      ),
    ),

    // CYCLIC: ON/OFF durations in minutes
    cycle_on_minutes: v.nullish(
      v.pipe(
        v.number(),
        v.custom(
          (val: unknown) => typeof val === "number" && Number.isInteger(val) && val >= 1,
          CYCLE_OFF_MINUTES_MIN,
        ),
      ),
    ),

    cycle_off_minutes: v.nullish(
      v.pipe(
        v.number(),
        v.custom(
          (val: unknown) => typeof val === "number" && Number.isInteger(val) && val >= 1,
          CYCLE_OFF_MINUTES_MIN,
        ),
      ),
    ),

    power_loss_recovery: v.nullish(v.boolean()),

    schedule_status: v.nullish(v.picklist(SCHEDULE_STATUS, INVALID_SCHEDULED_STATUS)),
    repeat: v.optional(v.union([v.literal(0), v.literal(1)], "Repeat must be 0 or 1")),
    enabled: v.optional(v.boolean()),
    bit_wise_days: v.nullish(v.number()),
    power_loss_recovery_time: v.optional(v.pipe(
      v.number(),
      v.custom(
        (val: unknown) => typeof val === "number" && Number.isInteger(val) && val >= 1,
        "Power loss recovery time requires minimum of 1 minute",
      )
    )),
    schedule_id: v.pipe(
      v.number("Schedule ID must be a number"),
      v.custom(
        (val: unknown) => typeof val === "number" && Number.isInteger(val) && val >= 1,
        "Schedule ID must be a positive integer",
      ),
    ),
  }),

  // Cross-field: CYCLIC schedules require cycle_on_minutes and cycle_off_minutes
  v.custom((data: any) => {
    if (data.schedule_type === "CYCLIC") {
      return !!data.cycle_on_minutes && !!data.cycle_off_minutes;
    }
    return true;
  }, CYCLE_ON_MINUTES_REQUIRED),

  // Cross-field: repeat=1 (Repeat Schedule with Cycle) requires days_of_week and cycle fields
  v.custom((data: any) => {
    if (data.repeat === 1) {
      return Array.isArray(data.days_of_week) && data.days_of_week.length >= 1;
    }
    return true;
  }, DAYS_OF_WEEK_REQUIRED_FOR_REPEAT_SCHEDULE),

  // Cross-field: repeat=1 with CYCLIC schedule must have cycle fields
  v.custom((data: any) => {
    if (data.repeat === 1 && data.schedule_type === "CYCLIC") {
      return !!data.cycle_on_minutes && !!data.cycle_off_minutes;
    }
    return true;
  }, REPEAT_REQUIRES_CYCLE),

  // Cross-field: one-time schedules (repeat=0 or not set) need either schedule_start_date or days_of_week
  v.custom((data: any) => {
    if (!data.repeat || data.repeat === 0) {
      const hasDate = !!data.schedule_start_date;
      const hasDays = Array.isArray(data.days_of_week) && data.days_of_week.length >= 1;
      return hasDate || hasDays;
    }
    return true;
  }, SCHEDULE_DATE_REQUIRED_FOR_ONE_TIME),

  // Cross-field: schedule_start_date must not be in the past
  v.custom((data: any) => {
    if (data.schedule_start_date) {
      return data.schedule_start_date >= todayAsYYMMDD();
    }
    return true;
  }, SCHEDULE_DATE_PAST),

  // Cross-field: schedule_end_date must not be in the past
  v.custom((data: any) => {
    if (data.schedule_end_date) {
      return data.schedule_end_date >= todayAsYYMMDD();
    }
    return true;
  }, SCHEDULE_END_DATE_PAST),

  // Cross-field: schedule_end_date must be on or after schedule_start_date
  v.custom((data: any) => {
    if (data.schedule_start_date && data.schedule_end_date) {
      return data.schedule_end_date >= data.schedule_start_date;
    }
    return true;
  }, SCHEDULE_END_DATE_BEFORE_START),

  // Cross-field: start_time must not equal end_time
  v.custom((data: any) => {
    return data.start_time !== data.end_time;
  }, START_TIME_BEFORE_END_TIME),

  // Cross-field: auto-calculate runtime_minutes and set power_loss_recovery_time defaults
  v.transform((data: any) => {
    const sh = parseInt(data.start_time.substring(0, 2), 10);
    const sm = parseInt(data.start_time.substring(2, 4), 10);
    const eh = parseInt(data.end_time.substring(0, 2), 10);
    const em = parseInt(data.end_time.substring(2, 4), 10);
    let diff = (eh * 60 + em) - (sh * 60 + sm);
    if (diff <= 0) diff += 24 * 60;

    // Default power_loss_recovery_time: CYCLIC = 0, TIME_BASED = 30
    const defaultRecoveryTime = data.schedule_type === "CYCLIC" ? 0 : 30;
    const power_loss_recovery_time = data.power_loss_recovery_time ?? defaultRecoveryTime;

    return { ...data, runtime_minutes: diff, power_loss_recovery_time };
  }),
);

// =================== UPDATE SCHEDULE VALIDATOR ===================
export const vUpdateMotorSchedule = vAddMotorSchedule;

// =================== ADD REPEAT DAYS VALIDATOR ===================
export const vAddRepeatDays = v.object({
  days_of_week: v.pipe(
    v.array(v.number()),
    v.custom(
      (val: unknown) => Array.isArray(val) && val.length >= 1,
      DAYS_OF_WEEK_REQUIRED_FOR_REPEAT,
    ),
    v.custom(
      (val: unknown) =>
        Array.isArray(val) && val.every((day) => DAYS_OF_WEEK_ENUM.includes(day as any)),
      INVALID_DAYS_WEEK,
    ),
  ),
  bit_wise_days: v.nullish(v.number()),
});

// =================== BATCH CREATE (for pond) ===================
export const vArrayOfMotorScheduleValidators = v.array(vAddMotorSchedule);

// =================== TYPE EXPORTS ===================
export type ValidatedMotorSchedule = v.InferOutput<typeof vAddMotorSchedule>;
export type ValidatedMotorScheduleArray = ValidatedMotorSchedule[];
export type ValidatedUpdateMotorSchedule = v.InferOutput<typeof vUpdateMotorSchedule>;
export type ValidatedAddRepeatDays = v.InferOutput<typeof vAddRepeatDays>;
