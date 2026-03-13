import moment from "moment-timezone";
import type { RuntimeRecord, SplitRuntimeRecord } from "../types/app-types.js";
import { formatDuration } from "./dns-helpers.js";

const DEFAULT_TIMEZONE = "Asia/Kolkata";

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
  timeZone: string = DEFAULT_TIMEZONE,
): SplitRuntimeRecord[] {
  const result: SplitRuntimeRecord[] = [];

  for (const record of records) {
    const startTime = new Date(record.start_time);
    const endTime = record.end_time ? new Date(record.end_time) : null;

    // If no end_time, only include if start_time falls within the requested date range
    if (!endTime) {
      if (startTime >= fromDate && startTime <= toDate) {
        result.push({
          ...record,
          start_time: startTime,
          end_time: endTime,
          is_split: false,
        });
      }
      continue;
    }

    // Same date, no split needed
    if (isSameDate(startTime, endTime, timeZone)) {
      result.push({
        ...record,
        start_time: startTime,
        end_time: endTime,
        is_split: false,
      });
      continue;
    }

    // Split across date boundaries
    const segments = splitAcrossDays(startTime, endTime, record, timeZone);

    // Filter segments to only include those within the requested date range
    for (const segment of segments) {
      if (segment.end_time && segment.end_time < fromDate) continue;
      if (segment.start_time > toDate) continue;
      result.push(segment);
    }
  }

  return result;
}

function isSameDate(a: Date, b: Date, timeZone: string): boolean {
  const aTz = moment.tz(a, timeZone);
  const bTz = moment.tz(b, timeZone);
  return (
    aTz.year() === bTz.year() &&
    aTz.month() === bTz.month() &&
    aTz.date() === bTz.date()
  );
}

function splitAcrossDays(
  startTime: Date,
  endTime: Date,
  record: RuntimeRecord,
  timeZone: string,
): SplitRuntimeRecord[] {
  const segments: SplitRuntimeRecord[] = [];
  let currentStart = moment.tz(startTime, timeZone);
  const endTimeTz = moment.tz(endTime, timeZone);

  while (!isSameDate(currentStart.toDate(), endTime, timeZone)) {
    // End of current day: 23:59:59.999
    const endOfDay = currentStart.clone().endOf("day").toDate();

    const segmentStart = currentStart.toDate();
    const segmentDurationMs = endOfDay.getTime() - segmentStart.getTime();

    segments.push({
      id: record.id,
      start_time: segmentStart,
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
    currentStart = currentStart.clone().add(1, "day").startOf("day");
  }

  // Final segment: from start of last day to actual end_time
  const finalStart = currentStart.toDate();
  const finalDurationMs = endTime.getTime() - finalStart.getTime();
  segments.push({
    id: record.id,
    start_time: finalStart,
    end_time: endTimeTz.toDate(),
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
