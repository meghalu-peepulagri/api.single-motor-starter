import { parse, isValid } from "date-fns";
import moment from "moment-timezone";
export function parseTimestamp(ct) {
    if (ct) {
        const parsed = parse(ct, "yyyy-MM-dd, HH:mm:ss", new Date());
        if (isValid(parsed)) {
            return parsed.toISOString();
        }
    }
    return new Date().toISOString();
}
export function getUTCFromDateAndToDate(fromDate, toDate) {
    const istTimezone = "Asia/Kolkata";
    const utcTimezone = "UTC";
    const startOfDayIST = moment.tz(fromDate, istTimezone).startOf("day");
    const endOfDayIST = moment.tz(toDate, istTimezone).endOf("day");
    const startOfDayUTC = startOfDayIST.clone().tz(utcTimezone).format();
    const endOfDayUTC = endOfDayIST.clone().tz(utcTimezone).format();
    return {
        startOfDayUTC,
        endOfDayUTC,
    };
}
export const formatDuration = (ms) => {
    const totalSec = Math.floor(ms / 1000);
    const hrs = Math.floor(totalSec / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    const secs = totalSec % 60;
    return `${hrs} h ${mins} m ${secs} sec`;
};
