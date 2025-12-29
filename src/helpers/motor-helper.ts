import { and, eq, gte, lte, sql } from "drizzle-orm";
import { ALREADY_SCHEDULED_EXISTS } from "../constants/app-constants.js";
import { motorsRunTime } from "../database/schemas/motor-runtime.js";
import type { MotorsTable } from "../database/schemas/motors.js";
import { starterBoxParameters } from "../database/schemas/starter-parameters.js";
import ConflictException from "../exceptions/conflict-exception.js";
import type { arrayOfMotorInputType } from "../types/app-types.js";
import type { WhereQueryData } from "../types/db-types.js";
import db from "../database/configuration.js";
import { formatDuration } from "./dns-helpers.js";



export function checkDuplicateMotorTitles(motors: arrayOfMotorInputType[] | undefined) {
  if (!Array.isArray(motors)) return [];
  const titles = motors.map(m => (m?.name ?? "").toString().toLowerCase());
  const duplicateIndexes: number[] = [];

  for (let i = 0; i < titles.length; i++) {
    if (titles.indexOf(titles[i]) !== i) {
      duplicateIndexes.push(i);
    }
  }
  return duplicateIndexes;
}

export function motorFilters(query: any, user: any) {

  const whereQueryData: WhereQueryData<MotorsTable> = {
    columns: ["status"],
    relations: ["!="],
    values: ["ARCHIVED"],
  };

  if (query.search_string?.trim()) {
    const search = query.search_string.trim();
    whereQueryData.columns.push("name");
    whereQueryData.relations.push("contains");
    whereQueryData.values.push(search);
  }

  if (query.status) {
    whereQueryData.columns.push("status");
    whereQueryData.relations.push("=");
    whereQueryData.values.push(query.status);
  }

  if (user.id && user.user_type !== "ADMIN") {
    whereQueryData.columns.push("created_by");
    whereQueryData.relations.push("=");
    whereQueryData.values.push(user.id);
  }

  if (query.location_id) {
    whereQueryData.columns.push("location_id");
    whereQueryData.relations.push("=");
    whereQueryData.values.push(query.location_id);
  }

  return whereQueryData;
}


export function buildAnalyticsFilter(parameter: string) {
  const selectedFieldsMain: any = {
    id: starterBoxParameters.id,
    time_stamp: starterBoxParameters.time_stamp,
  };

  // const selectedFieldsTest: any = {
  //   motor_ref_id: testStarterParameters.motor_ref_id,
  //   time_stamp: testStarterParameters.time_stamp,
  //   id: testStarterParameters.id,
  // };

  if (parameter === "voltage") {
    selectedFieldsMain.line_voltage_r = starterBoxParameters.line_voltage_r ?? 0;
    selectedFieldsMain.line_voltage_y = starterBoxParameters.line_voltage_y ?? 0;
    selectedFieldsMain.line_voltage_b = starterBoxParameters.line_voltage_b ?? 0;
    selectedFieldsMain.avg_voltage = starterBoxParameters.avg_voltage ?? 0;
    // selectedFieldsMain.avg_voltage = starterBoxParameters.avg_voltage ?? 0;
    // selectedFieldsTest.line_voltage_vry = testStarterParameters.line_voltage_vry ?? 0;
    // selectedFieldsTest.line_voltage_vyb = testStarterParameters.line_voltage_vyb ?? 0;
    // selectedFieldsTest.line_voltage_vbr = testStarterParameters.line_voltage_vbr ?? 0;
  }
  else if (parameter === "current") {
    selectedFieldsMain.current_r = starterBoxParameters.current_r ?? 0;
    selectedFieldsMain.current_y = starterBoxParameters.current_y ?? 0;
    selectedFieldsMain.current_b = starterBoxParameters.current_b ?? 0;
    selectedFieldsMain.avg_current = starterBoxParameters.avg_current ?? 0;
    // selectedFieldsMain.avg_current = starterBoxParameters.avg_current ?? 0;
    // selectedFieldsTest.current_i1 = testStarterParameters.current_i1 ?? 0;
    // selectedFieldsTest.current_i2 = testStarterParameters.current_i2 ?? 0;
    // selectedFieldsTest.current_i3 = testStarterParameters.current_i3 ?? 0;
  }
  else {
    selectedFieldsMain.line_voltage_r = starterBoxParameters.line_voltage_r ?? 0;
    selectedFieldsMain.line_voltage_b = starterBoxParameters.line_voltage_b ?? 0;
    selectedFieldsMain.line_voltage_y = starterBoxParameters.line_voltage_y ?? 0;
    selectedFieldsMain.avg_voltage = starterBoxParameters.avg_voltage ?? 0;
    // selectedFieldsMain.avg_voltage = starterBoxParameters.avg_voltage ?? 0;
    selectedFieldsMain.current_r = starterBoxParameters.current_r ?? 0;
    selectedFieldsMain.current_y = starterBoxParameters.current_y ?? 0;
    selectedFieldsMain.current_b = starterBoxParameters.current_b ?? 0;
    selectedFieldsMain.avg_current = starterBoxParameters.avg_current ?? 0;
    // selectedFieldsMain.avg_current = starterBoxParameters.avg_current ?? 0;

    // selectedFieldsTest.line_voltage_vry = testStarterParameters.line_voltage_vry ?? 0;
    // selectedFieldsTest.line_voltage_vyb = testStarterParameters.line_voltage_vyb ?? 0;
    // selectedFieldsTest.line_voltage_vbr = testStarterParameters.line_voltage_vbr ?? 0;
    // selectedFieldsTest.current_i1 = testStarterParameters.current_i1 ?? 0;
    // selectedFieldsTest.current_i2 = testStarterParameters.current_i2 ?? 0;
    // selectedFieldsTest.current_i3 = testStarterParameters.current_i3 ?? 0;
  }

  return { selectedFieldsMain };
}

export function extractPreviousData(previousData: any, motorId: number) {
  const power = previousData?.power ?? null;

  const motor = previousData?.motors?.find((m: any) => m.id === motorId) || {};
  const prevState = motor.state;
  const prevMode = motor.mode ?? null;
  const locationId = motor.location_id ?? null;
  const created_by = motor.created_by ?? null;

  return { power, prevState, prevMode, locationId, created_by };
}

export async function checkMotorScheduleConflict(validatedReqData: any, existingMotorSchedule: any) {
  if (!existingMotorSchedule)
    return;

  const newStart = validatedReqData.output.start_time;
  const newEnd = validatedReqData.output.end_time;
  const existStart = existingMotorSchedule.start_time;
  const existEnd = existingMotorSchedule.end_time;

  // Exact match
  if (newStart === existStart && newEnd === existEnd) {
    throw new ConflictException(ALREADY_SCHEDULED_EXISTS);
  }

  //  Overlap check (if times intersect at all)
  // The only case where there is NO conflict is when:
  const isOverlapping = !(newEnd <= existStart || newStart >= existEnd);

  if (isOverlapping) {
    throw new ConflictException(
      "Schedule overlaps with an existing schedule",
    );
  }
}

export const parseDurationToSeconds = (duration: string): number => {
  if (!duration) return 0;

  const match = duration.match(/(\d+)\s*h\s*(\d+)\s*m\s*(\d+)\s*sec/);
  if (!match) return 0;

  const [, h, m, s] = match.map(Number);
  return h * 3600 + m * 60 + s;
};

