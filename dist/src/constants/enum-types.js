import { pgEnum } from "drizzle-orm/pg-core";
export const statusEnum = pgEnum("status_enum", ["ACTIVE", "INACTIVE", "ARCHIVED"]);
export const userTypeEnum = pgEnum("user_type", ["SUPER_ADMIN", "ADMIN", "USER"]);
export const motorScheduleTypeEnum = pgEnum("motor_schedule_type", ["ONE_TIME", "DAILY", "WEEKLY"]);
export const scheduleStatusEnum = pgEnum("schedule_status", ["PENDING", "RUNNING", "SCHEDULED", "COMPLETED", "FAILED", "PAUSED", "CANCELLED", "RESCHEDULED"]);
