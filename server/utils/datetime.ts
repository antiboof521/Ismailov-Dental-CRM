/**
 * datetime.ts — Sana va vaqt yordamchilari
 * Barcha datetime'lar bazada ISO sifatida saqlanadi.
 * Kun chegaralari klinika vaqt zonasida (TZ) JS tomonida hisoblanadi.
 */

import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";

dayjs.extend(utc);
dayjs.extend(timezone);

export const TZ = process.env.TZ || "Asia/Tashkent";

/** "2026-09-20" → { startIso, endIso } (klinika TZ bo'yicha kun boshi/oxiri, UTC ISO) */
export function dayRange(dateStr: string): { startIso: string; endIso: string } {
  const start = dayjs.tz(dateStr, TZ).startOf("day");
  const end = start.endOf("day");
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

/** Bugungi kun "YYYY-MM-DD" (klinika TZ) */
export function todayStr(): string {
  return dayjs().tz(TZ).format("YYYY-MM-DD");
}

/** Hozirgi vaqt ISO (UTC) */
export function nowIso(): string {
  return dayjs().utc().toISOString();
}

/** Ertaga "YYYY-MM-DD" (klinika TZ) — ertalabki eslatmalar uchun */
export function tomorrowStr(): string {
  return dayjs().tz(TZ).add(1, "day").format("YYYY-MM-DD");
}

/** ISO → "YYYY-MM-DD HH:mm" (klinika TZ) — ko'rsatish uchun */
export function fmtDateTime(iso: string | Date): string {
  return dayjs(iso).tz(TZ).format("YYYY-MM-DD HH:mm");
}

/** ISO → "YYYY-MM-DD" (klinika TZ) */
export function fmtDate(iso: string | Date): string {
  return dayjs(iso).tz(TZ).format("YYYY-MM-DD");
}

/** ISO → "HH:mm" (klinika TZ) */
export function fmtTime(iso: string | Date): string {
  return dayjs(iso).tz(TZ).format("HH:mm");
}

/** "YYYY-MM-DD" + "HH:mm" → ISO (klinika TZ) */
export function toIso(dateStr: string, timeStr: string): string {
  return dayjs.tz(`${dateStr} ${timeStr}`, TZ).toISOString();
}
