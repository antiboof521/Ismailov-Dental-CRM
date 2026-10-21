/**
 * cron.ts — rejalashtirilgan vazifalar (tashqi kutubxonasiz, oddiy interval)
 * - Har 10 daqiqada: navbati 30 daqiqa ichida kelayotgan bemorlarga xabar
 * - Har kuni 08:00 (klinika TZ): ertangi navbatlar uchun eslatma
 * - Har kuni 10:00: muddati kelgan reminders'larni yuborish
 */

import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";
import { TZ, CLINIC_NAME } from "./config.js";
import {
  notifyUpcomingAppointments,
  sendReminderTelegram,
  BotAppointment,
  BotPatient,
} from "./bot.js";

dayjs.extend(utc);
dayjs.extend(timezone);

export interface CronContext {
  getAppointments: () => BotAppointment[];
  getPatients: () => BotPatient[];
  getReminders: () => Array<{
    id: number;
    patient_id: number;
    patient_name: string;
    telegram_id?: string;
    due_date: string;
    reason: string;
    status: "pending" | "sent" | "done";
  }>;
  onReminderSent?: (reminderId: number) => void;
}

let lastRunDate: string | null = null;
let lastRemindDate: string | null = null;
let lastTurnCheck = 0;
let cronInterval: NodeJS.Timeout | null = null;

export function startCron(ctx: CronContext) {
  if (cronInterval) {
    clearInterval(cronInterval);
  }

  cronInterval = setInterval(async () => {
    try {
      const now = dayjs().tz(TZ);
      const hhmm = now.format("HH:mm");
      const today = now.format("YYYY-MM-DD");

      // Har 1 daqiqada — navbatiga 1 soat va 30 daqiqa qolgan bemorlarga xabar
      if (Date.now() - lastTurnCheck >= 50 * 1000) {
        lastTurnCheck = Date.now();
        const appts = ctx.getAppointments();
        const patients = ctx.getPatients();
        await notifyUpcomingAppointments(appts, patients);
      }

      // 08:00 — ertangi navbat eslatmalari
      if (hhmm === "08:00" && lastRunDate !== today) {
        lastRunDate = today;
        const tomorrow = now.add(1, "day").format("YYYY-MM-DD");
        const appts = ctx.getAppointments();
        const patients = ctx.getPatients();
        let sent = 0;

        for (const a of appts) {
          if (a.date === tomorrow && a.status === "scheduled") {
            const p = patients.find((pt) => pt.id === a.patient_id);
            if (p?.telegram_id) {
              const msg = `⏰ Eslatma: Sizda ertaga soat ${a.time} da navbat bor!\n👨‍⚕️ Shifokor: ${a.staff_name || "—"}\n📅 Sana: ${a.date}\n\nSizni kutamiz!\n🏥 ${CLINIC_NAME}`;
              const ok = await sendReminderTelegram(p.telegram_id, msg);
              if (ok) sent++;
            }
          }
        }
        if (sent > 0) {
          console.log(`📬 Ertangi navbat eslatmalari yuborildi: ${sent} ta`);
        }
      }

      // 10:00 — muddati kelgan reminders (implantatsiya eslatmasi, profilaktika va h.k.)
      if (hhmm === "10:00" && lastRemindDate !== today) {
        lastRemindDate = today;
        const reminders = ctx.getReminders();
        const patients = ctx.getPatients();
        let sent = 0;

        for (const r of reminders) {
          if (r.status === "pending" && r.due_date <= today) {
            const tgId = r.telegram_id || patients.find((p) => p.id === r.patient_id)?.telegram_id;
            if (tgId) {
              const ok = await sendReminderTelegram(tgId, r.reason);
              if (ok) {
                r.status = "sent";
                ctx.onReminderSent?.(r.id);
                sent++;
              }
            }
          }
        }
        if (sent > 0) {
          console.log(`📬 Muddati kelgan eslatmalar yuborildi: ${sent} ta`);
        }
      }
    } catch (e: any) {
      console.error("Cron xato:", e.message);
    }
  }, 60 * 1000);

  console.log("⏰ Cron ishga tushdi (eslatmalar har daqiqa tekshiriladi, navbat xabari har 10 daqiqada)");
}

/** Qo'lda tekshirish (Settings dagi Test tugmasi uchun) */
export async function triggerManualCheck(ctx: CronContext): Promise<number> {
  const appts = ctx.getAppointments();
  const patients = ctx.getPatients();
  return await notifyUpcomingAppointments(appts, patients);
}
