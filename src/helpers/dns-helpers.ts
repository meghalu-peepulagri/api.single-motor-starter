import { parse, isValid } from "date-fns";
import moment from "moment-timezone";

export function parseTimestamp(ct?: string): string {
  if (ct) {
    const parsed = parse(ct, "yyyy-MM-dd, HH:mm:ss", new Date());
    if (isValid(parsed)) {
      return parsed.toISOString();
    }
  }

  return new Date().toISOString();
}

export function getUTCFromDateAndToDate(fromDate: string, toDate: string, applyDayBoundary: boolean = true) {
  const IST_TIMEZONE = "Asia/Kolkata";

  let fromIST = moment.tz(fromDate, IST_TIMEZONE);
  let toIST = moment.tz(toDate, IST_TIMEZONE);

  if (applyDayBoundary) {
    fromIST = fromIST.startOf("day");
    toIST = toIST.endOf("day");
  }

  return {
    startOfDayUTC: fromIST.utc().toISOString(),
    endOfDayUTC: toIST.utc().toISOString(),
  };
}


export const formatDuration = (ms: number): string => {
  const totalSec = Math.floor(ms / 1000);
  const hrs = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  return `${hrs} h ${mins} m ${secs} sec`;
};

export interface UTCDateRange {
  startOfDayUTC: string;
  endOfDayUTC: string;
}

export function parseQueryDates(query: any) {
  let fromDate = query.from_date;
  let toDate = query.to_date;

  const IST = "Asia/Kolkata";
  const now = moment().tz(IST);

  // Default → last 24 hours
  if (!fromDate || !toDate) {
    return {
      fromDateUTC: now.clone().subtract(24, "hours").utc().toISOString(),
      toDateUTC: now.utc().toISOString(),
    };
  }

  const fromIST = moment.tz(fromDate, "YYYY-MM-DD", IST).startOf("day");
  const toIST = moment.tz(toDate, "YYYY-MM-DD", IST).endOf("day");

  return {
    fromDateUTC: fromIST.utc().toISOString(),
    toDateUTC: toIST.utc().toISOString(),
  };
}


export const parseDurationToSeconds = (duration: string): number => {
  if (!duration) return 0;

  const match = duration.match(/(\d+)\s*h\s*(\d+)\s*m\s*(\d+)\s*sec/);
  if (!match) return 0;

  const [, h, m, s] = match.map(Number);
  return h * 3600 + m * 60 + s;
};
