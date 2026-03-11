import type { RuntimeRecord, SplitRuntimeRecord } from "../types/app-types.js";
import { formatDuration } from "./dns-helpers.js";

/**
 * Splits runtime records that span across midnight into separate per-day segments.
 *
 * Example: A record from March 9 12:48 PM → March 10 05:11 AM becomes:
 *   - March 9: 12:48 PM → 11:59:59.999 PM
 *   - March 10: 12:00:00 AM → 05:11 AM
 *
 * Records that start and end on the same date are returned as-is.
 * Records with no end_time (still running) are not split.
 */
export function splitRuntimeRecordsByDate(
  records: RuntimeRecord[],
  fromDate: Date,
  toDate: Date,
): SplitRuntimeRecord[] {
  const result: SplitRuntimeRecord[] = [];

  for (const record of records) {
    const startTime = new Date(record.start_time);
    const endTime = record.end_time ? new Date(record.end_time) : null;

    // If no end_time or same date, no split needed
    if (!endTime || isSameDate(startTime, endTime)) {
      result.push({
        ...record,
        start_time: startTime,
        end_time: endTime,
        is_split: false,
      });
      continue;
    }

    // Split across date boundaries
    const segments = splitAcrossDays(startTime, endTime, record);

    // Filter segments to only include those within the requested date range
    for (const segment of segments) {
      if (segment.end_time && segment.end_time < fromDate) continue;
      if (segment.start_time > toDate) continue;
      result.push(segment);
    }
  }

  return result;
}

function isSameDate(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function splitAcrossDays(
  startTime: Date,
  endTime: Date,
  record: RuntimeRecord,
): SplitRuntimeRecord[] {
  const segments: SplitRuntimeRecord[] = [];
  let currentStart = new Date(startTime);

  while (!isSameDate(currentStart, endTime)) {
    // End of current day: 23:59:59.999
    const endOfDay = new Date(currentStart);
    endOfDay.setHours(23, 59, 59, 999);

    const segmentDurationMs = endOfDay.getTime() - currentStart.getTime();

    segments.push({
      id: record.id,
      start_time: currentStart,
      end_time: endOfDay,
      duration: formatDuration(segmentDurationMs),
      time_stamp: record.time_stamp,
      motor_state: record.motor_state,
      power_start: record.power_start,
      power_end: record.power_end,
      power_duration: record.power_duration,
      power_state: record.power_state,
      is_split: true,
    });

    // Start of next day: 00:00:00.000
    const nextDay = new Date(currentStart);
    nextDay.setDate(nextDay.getDate() + 1);
    nextDay.setHours(0, 0, 0, 0);
    currentStart = nextDay;
  }

  // Final segment: from start of last day to actual end_time
  const finalDurationMs = endTime.getTime() - currentStart.getTime();
  segments.push({
    id: record.id,
    start_time: currentStart,
    end_time: endTime,
    duration: formatDuration(finalDurationMs),
    time_stamp: record.time_stamp,
    motor_state: record.motor_state,
    power_start: record.power_start,
    power_end: record.power_end,
    power_duration: record.power_duration,
    power_state: record.power_state,
    is_split: true,
  });

  return segments;
}
