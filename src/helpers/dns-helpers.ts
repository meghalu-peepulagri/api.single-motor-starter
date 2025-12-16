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
  console.log('query: ', query);
  let fromDate = query.from_date;
  let toDate = query.to_date;

  const now = moment().tz("Asia/Kolkata");
  if (!fromDate || !toDate) {
    fromDate = now.clone().subtract(24, "hours").format();
    toDate = now.format();
  }


  // Convert IST to UTC
  const { startOfDayUTC, endOfDayUTC }: any = getUTCFromDateAndToDate(fromDate, toDate, false);
  console.log('endUTC: ', startOfDayUTC);
  console.log('startUTC: ', endOfDayUTC);
  return {
    fromDateUTC: startOfDayUTC,
    toDateUTC: endOfDayUTC,
  };
}
