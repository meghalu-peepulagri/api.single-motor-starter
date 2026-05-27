import BadRequestException from "../exceptions/bad-request-exception.js";
import { MOTOR_ID_REQUIRED, STARTER_ID_REQUIRED } from "../constants/app-constants.js";

export interface ScheduleHistoryFilters {
  motor_id: number;
  starter_id: number;
  from_date?: number;
  to_date?: number;
}

function parseDateToYYMMDD(dateStr: string, field: string): number {
  const parts = dateStr.split("-");
  if (parts.length !== 3) throw new BadRequestException(`Invalid ${field}. Use YYYY-MM-DD format`);
  const yy = parseInt(parts[0], 10) - 2000;
  const mm = parseInt(parts[1], 10);
  const dd = parseInt(parts[2], 10);
  if (isNaN(yy) || isNaN(mm) || isNaN(dd) || mm < 1 || mm > 12 || dd < 1 || dd > 31) {
    throw new BadRequestException(`Invalid ${field}. Use YYYY-MM-DD format`);
  }
  return yy * 10000 + mm * 100 + dd;
}

export function buildScheduleHistoryFilters(query: Record<string, string>): ScheduleHistoryFilters {
  const motorId = +query.motor_id;
  const starterId = +query.starter_id;

  if (!motorId || Number.isNaN(motorId) || motorId <= 0) throw new BadRequestException(MOTOR_ID_REQUIRED);
  if (!starterId || Number.isNaN(starterId) || starterId <= 0) throw new BadRequestException(STARTER_ID_REQUIRED);

  const from_date = query.from_date ? parseDateToYYMMDD(query.from_date, "from_date") : undefined;
  const to_date = query.to_date ? parseDateToYYMMDD(query.to_date, "to_date") : undefined;

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
