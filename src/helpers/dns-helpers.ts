import { parse, isValid, startOfDay, endOfDay } from "date-fns";
import { toZonedTime, fromZonedTime } from "date-fns-tz";

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

  let fromIST = toZonedTime(new Date(fromDate), IST_TIMEZONE);
  let toIST = toZonedTime(new Date(toDate), IST_TIMEZONE);

  if (applyDayBoundary) {
    fromIST = startOfDay(fromIST);
    toIST = endOfDay(toIST);
  }

  return {
    startOfDayUTC: fromZonedTime(fromIST, IST_TIMEZONE).toISOString(),
    endOfDayUTC: fromZonedTime(toIST, IST_TIMEZONE).toISOString(),
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
  const nowIST = toZonedTime(new Date(), IST);

  // Default → today (IST day)
  if (!fromDate || !toDate) {
    const startOfToday = startOfDay(nowIST);
    const endOfToday = endOfDay(nowIST);
    return {
      fromDateUTC: fromZonedTime(startOfToday, IST).toISOString(),
      toDateUTC: fromZonedTime(endOfToday, IST).toISOString(),
    };
  }

  const fromIST = startOfDay(toZonedTime(new Date(fromDate), IST));
  const toIST = endOfDay(toZonedTime(new Date(toDate), IST));

  return {
    fromDateUTC: fromZonedTime(fromIST, IST).toISOString(),
    toDateUTC: fromZonedTime(toIST, IST).toISOString(),
  };
}


export const parseDurationToSeconds = (duration: string): number => {
  if (!duration) return 0;

  const match = duration.match(/(\d+)\s*h\s*(\d+)\s*m\s*(\d+)\s*sec/);
  if (!match) return 0;

  const [, h, m, s] = match.map(Number);
  return h * 3600 + m * 60 + s;
};
