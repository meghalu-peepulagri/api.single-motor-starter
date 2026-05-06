import BadRequestException from "../exceptions/bad-request-exception.js";
import { MOTOR_ID_REQUIRED, STARTER_ID_REQUIRED } from "../constants/app-constants.js";

export interface ScheduleHistoryFilters {
  motor_id: number;
  starter_id: number;
  from_date?: Date;
  to_date?: Date;
}

export function buildScheduleHistoryFilters(query: Record<string, string>): ScheduleHistoryFilters {
  const motorId = +query.motor_id;
  const starterId = +query.starter_id;

  if (!motorId || Number.isNaN(motorId) || motorId <= 0) throw new BadRequestException(MOTOR_ID_REQUIRED);
  if (!starterId || Number.isNaN(starterId) || starterId <= 0) throw new BadRequestException(STARTER_ID_REQUIRED);

  let from_date: Date | undefined;
  let to_date: Date | undefined;

  if (query.from_date) {
    from_date = new Date(query.from_date);
    if (isNaN(from_date.getTime())) throw new BadRequestException("Invalid from_date. Use YYYY-MM-DD format");
    from_date.setHours(0, 0, 0, 0);
  }

  if (query.to_date) {
    to_date = new Date(query.to_date);
    if (isNaN(to_date.getTime())) throw new BadRequestException("Invalid to_date. Use YYYY-MM-DD format");
    to_date.setHours(23, 59, 59, 999);
  }

  return { motor_id: motorId, starter_id: starterId, from_date, to_date };
}

export interface MotorScheduleFilters {
  starter_id?: number;
  motor_id?: number;
  status?: string;
  type?: string;
  schedule_start_date?: number;
  schedule_end_date?: number;
  repeat?: number;
  enabled?: boolean;
  day_of_week?: number;
  schedule_status?: string;
}

export function buildMotorScheduleFilters(query: Record<string, string>): MotorScheduleFilters {
  const filters: MotorScheduleFilters = {};

  if (query.starter_id) {
    const starterId = +query.starter_id;
    if (Number.isNaN(starterId) || starterId <= 0) {
      throw new BadRequestException("Invalid starter id");
    }
    filters.starter_id = starterId;
  }

  if (query.motor_id) {
    const motorId = +query.motor_id;
    if (Number.isNaN(motorId) || motorId <= 0) {
      throw new BadRequestException("Invalid motor id");
    }
    filters.motor_id = motorId;
  }

  if (query.status) {
    filters.status = query.status;
  }

  if (query.type) {
    filters.type = query.type;
  }

  if (query.schedule_start_date) {
    const sd = +query.schedule_start_date;
    if (!Number.isNaN(sd) && Number.isInteger(sd)) {
      filters.schedule_start_date = sd;
    }
  }

  if (query.schedule_end_date) {
    const ed = +query.schedule_end_date;
    if (!Number.isNaN(ed) && Number.isInteger(ed)) {
      filters.schedule_end_date = ed;
    }
  }

  if (query.repeat !== undefined) {
    const repeat = +query.repeat;
    if (repeat === 0 || repeat === 1) {
      filters.repeat = repeat;
    }
  }

  if (query.enabled !== undefined) {
    filters.enabled = query.enabled === "true";
  }

  if (query.day_of_week !== undefined) {
    const day = +query.day_of_week;
    if (!Number.isNaN(day) && day >= 0 && day <= 6) {
      filters.day_of_week = day;
    }
  }

  if (query.schedule_status) {
    filters.schedule_status = query.schedule_status;
  }

  return filters;
}
