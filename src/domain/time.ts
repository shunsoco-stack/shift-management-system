import type { ISODate, LocalTime, Weekday } from "./types";

export interface MinuteInterval {
  start: number;
  end: number;
}

const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseTime(time: LocalTime): number | null {
  if (!TIME_PATTERN.test(time)) return null;
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

export function timeToMinutes(time: LocalTime): number {
  const parsed = parseTime(time);
  if (parsed === null) {
    throw new Error(`Invalid local time: ${time}`);
  }
  return parsed;
}

export function minutesToTime(minutes: number): LocalTime {
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > 24 * 60) {
    throw new Error(`Minutes must be an integer between 0 and 1440: ${minutes}`);
  }
  if (minutes === 24 * 60) return "24:00";
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

export function isValidTimeRange(startTime: LocalTime, endTime: LocalTime): boolean {
  const start = parseTime(startTime);
  const end = endTime === "24:00" ? 24 * 60 : parseTime(endTime);
  return start !== null && end !== null && start < end;
}

export function toMinuteInterval(
  startTime: LocalTime,
  endTime: LocalTime,
): MinuteInterval | null {
  if (!isValidTimeRange(startTime, endTime)) return null;
  return {
    start: timeToMinutes(startTime),
    end: endTime === "24:00" ? 24 * 60 : timeToMinutes(endTime),
  };
}

export function intervalsOverlap(a: MinuteInterval, b: MinuteInterval): boolean {
  return a.start < b.end && b.start < a.end;
}

export function intervalContains(container: MinuteInterval, contained: MinuteInterval): boolean {
  return container.start <= contained.start && container.end >= contained.end;
}

export function mergeIntervals(intervals: MinuteInterval[]): MinuteInterval[] {
  const sorted = intervals
    .filter((interval) => interval.start < interval.end)
    .map((interval) => ({ ...interval }))
    .sort((a, b) => a.start - b.start || a.end - b.end);

  const merged: MinuteInterval[] = [];
  for (const interval of sorted) {
    const previous = merged.at(-1);
    if (!previous || interval.start > previous.end) {
      merged.push(interval);
      continue;
    }
    previous.end = Math.max(previous.end, interval.end);
  }
  return merged;
}

export function intervalMinutes(intervals: MinuteInterval[]): number {
  return mergeIntervals(intervals).reduce(
    (total, interval) => total + interval.end - interval.start,
    0,
  );
}

export function intersectInterval(
  a: MinuteInterval,
  b: MinuteInterval,
): MinuteInterval | null {
  const start = Math.max(a.start, b.start);
  const end = Math.min(a.end, b.end);
  return start < end ? { start, end } : null;
}

export function subtractIntervals(
  sources: MinuteInterval[],
  removals: MinuteInterval[],
): MinuteInterval[] {
  let remaining = mergeIntervals(sources);
  for (const removal of mergeIntervals(removals)) {
    const next: MinuteInterval[] = [];
    for (const source of remaining) {
      if (!intervalsOverlap(source, removal)) {
        next.push(source);
        continue;
      }
      if (removal.start > source.start) {
        next.push({ start: source.start, end: Math.min(removal.start, source.end) });
      }
      if (removal.end < source.end) {
        next.push({ start: Math.max(removal.end, source.start), end: source.end });
      }
    }
    remaining = next;
  }
  return remaining;
}

export function parseISODate(date: ISODate): Date | null {
  const match = DATE_PATTERN.exec(date);
  if (!match) return null;
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, monthIndex, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== monthIndex ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }
  return parsed;
}

export function isValidISODate(date: ISODate): boolean {
  return parseISODate(date) !== null;
}

export function getWeekday(date: ISODate): Weekday {
  const parsed = parseISODate(date);
  if (!parsed) throw new Error(`Invalid ISO date: ${date}`);
  return parsed.getUTCDay() as Weekday;
}

export function addDays(date: ISODate, days: number): ISODate {
  const parsed = parseISODate(date);
  if (!parsed || !Number.isInteger(days)) {
    throw new Error(`Invalid date or day offset: ${date}, ${days}`);
  }
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

export function daysBetween(a: ISODate, b: ISODate): number {
  const first = parseISODate(a);
  const second = parseISODate(b);
  if (!first || !second) throw new Error(`Invalid ISO date: ${a} or ${b}`);
  return Math.round((second.getTime() - first.getTime()) / 86_400_000);
}

export function enumerateDates(startDate: ISODate, endDate: ISODate): ISODate[] {
  const span = daysBetween(startDate, endDate);
  if (span < 0) throw new Error("startDate must not be after endDate");
  return Array.from({ length: span + 1 }, (_, index) => addDays(startDate, index));
}

export function datePart(value: ISODate | string | Date): ISODate {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return value.slice(0, 10);
}

