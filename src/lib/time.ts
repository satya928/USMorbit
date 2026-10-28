/** All timestamps are stored in UTC and displayed in the relevant site's (or tenant's) time zone. */

export function formatDateTime(d: Date | string | null | undefined, timeZone = "UTC", opts: { withZone?: boolean } = {}) {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    ...(opts.withZone === false ? {} : { timeZoneName: "short" }),
  }).format(date);
}

export function formatDate(d: Date | string | null | undefined, timeZone = "UTC") {
  if (!d) return "—";
  // Date-only strings (YYYY-MM-DD) are calendar dates and must not be shifted by time zone.
  if (typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
    const [y, m, day] = d.split("-").map(Number);
    return new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", day: "2-digit", month: "short", year: "numeric" }).format(
      new Date(Date.UTC(y, m - 1, day)),
    );
  }
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("en-GB", { timeZone, day: "2-digit", month: "short", year: "numeric" }).format(date);
}

/** ISO-like local timestamp for CSV exports: "2026-10-23 14:05 AEDT". */
export function formatExportDateTime(d: Date | null | undefined, timeZone = "UTC") {
  if (!d) return "";
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZoneName: "short",
    })
      .formatToParts(d)
      .map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour === "24" ? "00" : parts.hour}:${parts.minute} ${parts.timeZoneName}`;
}

export function relativeTime(d: Date, now = new Date()) {
  const diff = d.getTime() - now.getTime();
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  if (abs < 3_600_000) return rtf.format(Math.round(diff / 60_000), "minute");
  if (abs < 86_400_000) return rtf.format(Math.round(diff / 3_600_000), "hour");
  return rtf.format(Math.round(diff / 86_400_000), "day");
}

/** Parse a YYYY-MM-DD filter value as the start of that day in UTC. */
export function parseDateParam(v: string | undefined | null): Date | undefined {
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return undefined;
  const d = new Date(`${v}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export function addDays(d: Date, days: number) {
  return new Date(d.getTime() + days * 86_400_000);
}

function tzOffsetMs(date: Date, timeZone: string) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
      .formatToParts(date)
      .map((x) => [x.type, x.value]),
  );
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** Convert a datetime-local value ("YYYY-MM-DDTHH:mm") entered in `timeZone` to a UTC Date. */
export function zonedInputToUtc(local: string, timeZone: string): Date | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(local);
  if (!m) return undefined;
  const guess = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  let utc = guess - tzOffsetMs(new Date(guess), timeZone);
  const second = guess - tzOffsetMs(new Date(utc), timeZone);
  if (second !== utc) utc = second;
  return new Date(utc);
}

/** Format a UTC Date as a datetime-local value in `timeZone`. */
export function utcToZonedInput(d: Date | null | undefined, timeZone: string) {
  if (!d) return "";
  return new Date(d.getTime() + tzOffsetMs(d, timeZone)).toISOString().slice(0, 16);
}
