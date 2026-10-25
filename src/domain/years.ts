// Tax years use CE integers. Release target Y is the CE year in Asia/Bangkok at release; Y-1 is also required.
const BANGKOK = "Asia/Bangkok";

export function bangkokCalendarYear(now: Date = new Date()): number {
  const year = new Intl.DateTimeFormat("en-CA", { timeZone: BANGKOK, year: "numeric" }).format(now);
  return Number(year);
}

/** Current Bangkok date as YYYY-MM-DD, used for default record dates without UTC shifts. */
export function bangkokDateString(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: BANGKOK, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function releaseTargetYears(now: Date = new Date()): [number, number] {
  const y = bangkokCalendarYear(now);
  return [y, y - 1];
}

export function buddhistYear(ceYear: number): number {
  return ceYear + 543;
}

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Validates a calendar date string without UTC conversion. */
export function isValidIsoDate(value: string): boolean {
  const match = DATE_PATTERN.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1) return false;
  const daysInMonth = [31, isLeap(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= (daysInMonth[month - 1] ?? 0);
}

function isLeap(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function isSupportedTaxYear(year: number): boolean {
  return Number.isInteger(year) && year >= 1990 && year <= 2600;
}
