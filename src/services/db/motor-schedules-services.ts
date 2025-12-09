import { and, eq, gt, inArray, lt, ne } from "drizzle-orm";
import db from "../../database/configuration.js";
import { motorSchedules } from "../../database/schemas/motor-schedules.js";

export async function getOneTimeMotorSchedules(motorId: number, scheduleDate: string, startTime: string, endTime: string) {
  return await db.query.motorSchedules.findFirst({
    where:
      and(
        eq(motorSchedules.motor_id, motorId),
        eq(motorSchedules.schedule_type, "ONE_TIME"),
        eq(motorSchedules.schedule_date, scheduleDate),
        lt(motorSchedules.start_time, endTime),
        gt(motorSchedules.end_time, startTime),
        inArray(motorSchedules.schedule_status, ["RUNNING", "PENDING"]),
      ),
    columns: {
      id: true,
      start_time: true,
      end_time: true,
      schedule_date: true,
    },
  });
};

export async function getMotorSchedulesWeekly(motorId: number, scheduleType: "DAILY" | "WEEKLY", startTime: string, endTime: string, daysOfWeek?: any) {
  return await db.query.motorSchedules.findFirst({
    where:
      and(
        eq(motorSchedules.motor_id, motorId),
        eq(motorSchedules.schedule_type, scheduleType),
        inArray(motorSchedules.days_of_week, [daysOfWeek]),
        lt(motorSchedules.start_time, endTime),
        gt(motorSchedules.end_time, startTime),
        inArray(motorSchedules.schedule_status, ["RUNNING", "PENDING"]),
      ),
    columns: {
      id: true,
      start_time: true,
      end_time: true,
      schedule_date: true,
    },
  });
};


export async function getOneTimeMotorSchedulesUpdate(motorId: number, scheduleDate: string, startTime: string, endTime: string, scheduledId: number) {
  return await db.query.motorSchedules.findFirst({
    where:
      and(
        eq(motorSchedules.motor_id, motorId),
        eq(motorSchedules.schedule_type, "ONE_TIME"),
        eq(motorSchedules.schedule_date, scheduleDate),
        lt(motorSchedules.start_time, endTime),
        gt(motorSchedules.end_time, startTime),
        inArray(motorSchedules.schedule_status, ["RUNNING", "PENDING"]),
        ne(motorSchedules.id, scheduledId),
      ),
    columns: {
      id: true,
      start_time: true,
      end_time: true,
      schedule_date: true,
    },
  });
};

export async function getMotorSchedulesWeeklyUpdate (motorId: number, scheduleType: "DAILY" | "WEEKLY", startTime: string, endTime: string, scheduledId: number, daysOfWeek?: any) {
  return await db.query.motorSchedules.findFirst({
    where:
      and(
        eq(motorSchedules.motor_id, motorId),
        eq(motorSchedules.schedule_type, scheduleType),
        inArray(motorSchedules.days_of_week, [daysOfWeek]),
        lt(motorSchedules.start_time, endTime),
        gt(motorSchedules.end_time, startTime),
        inArray(motorSchedules.schedule_status, ["RUNNING", "PENDING"]),
        ne(motorSchedules.id, scheduledId),
      ),
    columns: {
      id: true,
      start_time: true,
      end_time: true,
      schedule_date: true,
    },
  });
};

