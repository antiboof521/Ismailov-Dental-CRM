/**
 * Umumiy sozlamalar — server
 * .env fayli hammasini bekor qiladi
 */

export const DB_MODE = (process.env.DB_MODE || "sqlite").toLowerCase();

// Klinika nomi va telegram username (bot xabarlarida ishlatiladi)
export const CLINIC_NAME = process.env.CLINIC_NAME || "Stomatologiya Klinikasi";
export const CLINIC_TG = process.env.CLINIC_TG || "";
export const CLINIC_PHONE = process.env.CLINIC_PHONE || "+998 (71) 200-00-00";

// JWT kaliti — ishlab chiqarishda albatta o'zgartiring!
export const JWT_SECRET = process.env.JWT_SECRET || "dental-clinic-dev-secret-change-me";

// Admin dasturi uchun API kaliti (server bo'lsa ham lokal ishlashi uchun shart emas)
export const API_KEY = process.env.API_KEY || "";

// Server port
export const PORT = 3000;

// Cron vaqt zonalari (O'zbekiston)
export const TZ = process.env.TZ || "Asia/Tashkent";

// AI (Google Gemini yoki OpenAI)
export const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
export const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
export const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
export const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
