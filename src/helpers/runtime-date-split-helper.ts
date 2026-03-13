import type { RuntimeRecord, SplitRuntimeRecord } from "../types/app-types.js";
import { formatDuration } from "./dns-helpers.js";

/**
 * Clamps runtime records to the requested date range.
 *
 * - Records fully outside the range are excluded.
 * - Records that overlap the range are clamped: start_time and end_time
 *   are adjusted to fit within fromDate–toDate, and duration is recalculated.
 * - Records with no end_time are only included if start_time falls within the range.
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

    // If no end_time, only include if start_time falls within the requested date range
    if (!endTime) {
      if (startTime >= fromDate && startTime <= toDate) {
        result.push({
          ...record,
          start_time: startTime,
          end_time: endTime,
          duration: null,
        });
      }
      continue;
    }

    // Skip records fully outside the date range
    if (endTime < fromDate || startTime > toDate) continue;

    // Clamp start and end to the requested range
    const clampedStart = startTime > fromDate ? startTime : fromDate;
    const clampedEnd = endTime < toDate ? endTime : toDate;
    const durationMs = clampedEnd.getTime() - clampedStart.getTime();

    result.push({
      ...record,
      start_time: clampedStart,
      end_time: clampedEnd,
      duration: formatDuration(durationMs),
    });
  }

  return result;
}
