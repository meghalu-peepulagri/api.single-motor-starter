// Motor schedule helper functions
// Schedule-specific helpers are located in motor-helper.ts:
// - timeToMinutes()
// - doTimeRangesOverlap()
// - areTimeRangesTooClose()
// - checkMotorScheduleConflict()
// - validateScheduleAdvanceTime()
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function formatHHMM(hhmm) {
    if (!hhmm || hhmm.length < 4)
        return '—';
    return `${hhmm.slice(0, 2)}:${hhmm.slice(2, 4)}`;
}
export function formatYYMMDD(yymmdd) {
    if (!yymmdd)
        return '—';
    const s = String(yymmdd).padStart(6, '0');
    const year = 2000 + parseInt(s.slice(0, 2), 10);
    const month = parseInt(s.slice(2, 4), 10) - 1;
    const day = parseInt(s.slice(4, 6), 10);
    return `${String(day).padStart(2, '0')}-${MONTHS[month]}-${year}`;
}
export function formatScheduleDateTime(yymmdd, hhmm) {
    if (!yymmdd || !hhmm)
        return null;
    return `${formatYYMMDD(yymmdd)} ${formatHHMM(hhmm)}`;
}
