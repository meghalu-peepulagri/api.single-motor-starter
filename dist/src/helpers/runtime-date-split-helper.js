import { formatDuration } from "./dns-helpers.js";
/**
 * Clamps runtime records to the requested date range.
 *
 * - Records fully outside the range are excluded.
 * - Records that overlap the range are clamped: start_time and end_time
 *   are adjusted to fit within fromDate–toDate, and duration is recalculated.
 * - Records with no end_time (session not closed) are included but with duration: null.
 *   Only records with an actual end_time contribute to duration/total_run_on_time.
 */
export function splitRuntimeRecordsByDate(records, fromDate, toDate) {
    const result = [];
    for (const record of records) {
        const startTime = new Date(record.start_time);
        const endTime = record.end_time ? new Date(record.end_time) : null;
        // If no end_time (session not closed), include record but don't count duration
        if (!endTime) {
            if (startTime > toDate)
                continue;
            const clampedStart = startTime > fromDate ? startTime : fromDate;
            result.push({
                ...record,
                start_time: clampedStart,
                end_time: null,
                duration: null,
            });
            continue;
        }
        // Skip records fully outside the date range
        if (endTime < fromDate || startTime > toDate)
            continue;
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
