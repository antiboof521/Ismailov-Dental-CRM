/**
 * bot-standalone.ts — 24/7 Mustaqil Telegram Bot Runner
 * 
 * Ushbu skript AI Studio brauzeri yopiq bo'lsa ham yoki tashqi bepul xostingda
 * (Render, Koyeb, Railway, Fly.io, Glitch, VPS) 24/7 uzluksiz ishlash uchun mo'ljallangan.
 * 
 * Ishga tushirish:
 *   npm run bot
 *   yoki npx tsx bot-standalone.ts
 */

import "dotenv/config";
import { initTelegramBot } from "./server/bot.js";
import { storage } from "./server/storage.js";
import { CLINIC_NAME } from "./server/config.js";

async function run() {
  console.log("==================================================");
  console.log(`🤖 DENTAL CLINIC — 24/7 MUSTAQIL TELEGRAM BOT RUNNER`);
  console.log(`🏥 Klinika: ${CLINIC_NAME}`);
  console.log("==================================================");

  // 1. Google Cloud Firestore doimiy bulutli bazasini ulash
  try {
    console.log("☁️ Firestore bulutli bazasiga ulanmoqda...");
    await storage.initCloudSync();
    console.log("✅ Firestore buluti muvaffaqiyatli ulandi va sinxronlandi!");
  } catch (err: any) {
    console.warn("⚠️ Firestore ogohlantirish:", err.message);
  }

  // 2. Telegram botni to'liq boshqaruv funksiyalari bilan ishga tushirish
  const botResult = initTelegramBot({
    getPatients: () => storage.getPatients() as any,
    createPatient: (p) => storage.addPatient(p as any) as any,
    updatePatient: (id, patch) => storage.updatePatient(id, patch as any) as any,
    linkPatientTelegram: (patientId, tgId, username) => storage.linkPatientTelegram(patientId, tgId, username) as any,
    findPatientByConnectCode: (code) => storage.findPatientByConnectCode(code) as any,
    findPatientByPhone: (phone) => storage.findPatientByPhone(phone) as any,
    getAppointments: () => storage.getAppointments() as any,
    createAppointment: (a) => storage.addAppointment(a as any) as any,
    updateAppointment: (id, patch) => storage.updateAppointment(id, patch as any) as any,
    getStaff: () => storage.getStaff() as any,
    createComplaint: (c) => storage.addComplaint(c as any) as any,
    broadcast: (ev, data) => {
      console.log(`🔔 [Bot Event]: ${ev}`, data);
    },
  });

  console.log("🚀 Bot holati:", botResult);

  // 3. Doimiy bulutli zaxira sinxronizatsiyasi (har 5 daqiqada yangi ma'lumotlarni Firestore-ga muhrlash)
  setInterval(async () => {
    try {
      await storage.forcePushToCloud();
    } catch {}
  }, 5 * 60 * 1000);

  // 4. Sog'liqni saqlash yurak urishi (Keep-alive log har 15 daqiqada)
  setInterval(() => {
    console.log(`💓 [24/7 Bot Heartbeat]: ${new Date().toISOString()} — Bot faol va navbatlarni qabul qilmoqda.`);
  }, 15 * 60 * 1000);
}

run().catch((e) => {
  console.error("❌ Botni ishga tushirishda xatolik:", e);
  process.exit(1);
});
