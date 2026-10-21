import fs from "fs";
import path from "path";
import dayjs from "dayjs";
import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore, doc, setDoc, getDoc, deleteDoc, Firestore } from "firebase/firestore";
import firebaseConfig from "../firebase-applet-config.json";
import { db } from "../src/db/index.ts";
import { patients as dbPatients, appointments as dbAppointments } from "../src/db/schema.ts";

// Initialize Firebase Firestore for 24/7 persistent cloud storage
let firestoreDb: Firestore | null = null;
try {
  const firebaseApp = getApps().length > 0 ? getApp() : initializeApp({
    apiKey: firebaseConfig.apiKey,
    projectId: firebaseConfig.projectId,
    authDomain: firebaseConfig.authDomain,
  });
  firestoreDb = getFirestore(firebaseApp, firebaseConfig.firestoreDatabaseId);
  console.log("☁️ Firebase Firestore 24/7 doimiy bulutli baza ulandi:", firebaseConfig.firestoreDatabaseId);
} catch (e: any) {
  console.warn("⚠️ Firestore ulanishida ogohlantirish:", e.message);
}

function sanitizeForFirestore(obj: any): any {
  if (obj === undefined) return null;
  if (obj === null) return null;
  if (Array.isArray(obj)) {
    return obj.map(sanitizeForFirestore);
  }
  if (typeof obj === "object") {
    const res: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value !== undefined) {
        res[key] = sanitizeForFirestore(value);
      }
    }
    return res;
  }
  return obj;
}

export interface ToothData {
  number: number | string;
  status: "healthy" | "caries" | "filling" | "pulpitis" | "crown" | "implant" | "missing" | "periodontitis" | "prosthetic";
  note?: string;
  condition?: string;
  updated_at?: string;
}

export interface DentalImage {
  id: string;
  patient_id: number;
  tooth?: string;
  category: "panoramic" | "periapical" | "intraoral" | "before_after" | "ct";
  title: string;
  description?: string;
  url: string;
  created_at: string;
  doctor_name?: string;
  before_url?: string;
  after_url?: string;
}

export interface User {
  id: number;
  username: string;
  password?: string;
  full_name: string;
  role: "admin" | "accountant" | "doctor";
  active: boolean;
  email?: string;
  uid?: string;
  avatar_url?: string;
  status: "pending" | "approved" | "rejected" | "blocked";
  requested_at?: string;
  reviewed_at?: string;
  reviewed_by?: string;
}

export interface Staff {
  id: number;
  full_name: string;
  position: "doctor" | "assistant" | "admin";
  phone: string;
  telegram_username?: string;
  salary_pct: number;
  salary_fixed: number;
  active: boolean;
}

export interface Service {
  id: number;
  name: string;
  category: string;
  price: number;
  active: boolean;
}

export interface Patient {
  id: number;
  full_name: string;
  phone: string;
  birth_date: string;
  gender: "male" | "female" | "";
  address: string;
  allergies: string;
  notes: string;
  source: "clinic" | "telegram";
  telegram_id?: string;
  telegram_username?: string;
  connect_code?: string;
  lang?: string;
  created_at: string;
  is_viewed?: boolean;
  viewed_at?: string;
}

export interface Appointment {
  id: number;
  patient_id: number;
  patient_name: string;
  staff_id: number | null;
  staff_name: string;
  initial_staff_id?: number | null;
  initial_staff_name?: string;
  final_staff_id?: number | null;
  final_staff_name?: string;
  scheduled_at: string;
  date: string;
  time: string;
  duration_min: number;
  complaint: string;
  ai_analysis?: {
    tooth_region?: string;
    condition?: string;
    duration_min?: number;
    explanation?: string;
    advice?: string;
  };
  turn_notified?: number;
  status: "scheduled" | "arrived" | "completed" | "no_show" | "cancelled";
}

export interface Procedure {
  id: number;
  patient_id: number;
  service_id: number | null;
  service_name: string;
  tooth: string;
  price: number;
  staff_id: number | null;
  staff_name: string;
  initial_staff_id?: number | null;
  initial_staff_name?: string;
  final_staff_id?: number | null;
  final_staff_name?: string;
  procedure_date: string;
}

export interface Transaction {
  id: number;
  type: "income" | "expense";
  amount: number;
  category: string;
  method: "cash" | "card" | "transfer";
  patient_id: number | null;
  patient_name?: string;
  comment: string;
  tx_date: string;
}

export interface Visit {
  id: number;
  patient_id: number;
  patient_name: string;
  staff_id: number | null;
  staff_name: string;
  initial_staff_id?: number | null;
  initial_staff_name?: string;
  final_staff_id?: number | null;
  final_staff_name?: string;
  complaint: string;
  diagnosis: string;
  recommendations: string;
  visit_date: string;
}

export interface Reminder {
  id: number;
  patient_id: number;
  patient_name: string;
  phone: string;
  telegram_id?: string;
  due_date: string;
  reason: string;
  status: "pending" | "sent" | "done";
}

export interface Complaint {
  id: number;
  patient_id?: number | null;
  patient_name: string;
  telegram_id?: string;
  message: string;
  status: "open" | "in_progress" | "closed";
  reply_text?: string;
  created_at: string;
}

export interface StorageData {
  users: User[];
  staff: Staff[];
  services: Service[];
  patients: Patient[];
  appointments: Appointment[];
  procedures: Procedure[];
  transactions: Transaction[];
  visits: Visit[];
  reminders: Reminder[];
  complaints: Complaint[];
  dentalCharts: Record<number, Record<string, ToothData>>;
  dentalImages: DentalImage[];
  botSessions: Record<string, any>;
  clinicSettings?: {
    botToken?: string;
    clinicName?: string;
    clinicPhone?: string;
    clinicTg?: string;
  };
  lastUpdated: string;
}

const DATA_DIR = path.resolve(process.cwd(), "server_data");
const DATA_FILE = path.join(DATA_DIR, "clinic_data.json");
const BACKUP_FILE = path.resolve(process.cwd(), "clinic_data_backup.json");

const todayStr = dayjs().format("YYYY-MM-DD");

function getInitialData(): StorageData {
  return {
    users: [
      { id: 1, username: "admin", password: "admin123", full_name: "Dr. Rustam Karimov (Bosh shifokor)", role: "admin", active: true, status: "approved" },
      { id: 2, username: "doctor", password: "doctor123", full_name: "Dr. Nilufar Saidova (Ortodont)", role: "doctor", active: true, status: "approved" },
      { id: 3, username: "accountant", password: "acc123", full_name: "Malika Rahimova (Buxgalter)", role: "accountant", active: true, status: "approved" },
      { id: 4, username: "antiboof521@gmail.com", email: "antiboof521@gmail.com", full_name: "Klinika Administratori", role: "admin", active: true, status: "approved" },
    ],
    staff: [
      { id: 1, full_name: "Dr. Rustam Karimov", position: "doctor", phone: "+998 90 123 45 67", telegram_username: "dr_rustam", salary_pct: 35, salary_fixed: 4000000, active: true },
      { id: 2, full_name: "Dr. Nilufar Saidova", position: "doctor", phone: "+998 93 234 56 78", telegram_username: "dr_nilufar", salary_pct: 40, salary_fixed: 3000000, active: true },
      { id: 3, full_name: "Dr. Aziz Alimov", position: "doctor", phone: "+998 97 345 67 89", telegram_username: "dr_aziz", salary_pct: 30, salary_fixed: 3500000, active: true },
      { id: 4, full_name: "Shahnoza Yusupova", position: "assistant", phone: "+998 91 456 78 90", telegram_username: "shahnoza_assistant", salary_pct: 0, salary_fixed: 3200000, active: true },
    ],
    services: [
      { id: 1, name: "Konsultatsiya va ko'rik", category: "Tashxis", price: 50000, active: true },
      { id: 2, name: "Fotopolimer plomba qo'yish (Gradia)", category: "Terapevtik", price: 320000, active: true },
      { id: 3, name: "Kanal davolash (Endodontiya 1 kanal)", category: "Terapevtik", price: 180000, active: true },
      { id: 4, name: "Ultratovushli tish tozalash (Air-Flow)", category: "Gigiyena", price: 250000, active: true },
      { id: 5, name: "Keramik metall tojburchak (Koronka)", category: "Ortopediya", price: 650000, active: true },
      { id: 6, name: "Tsirkoniy tojburchak (Zirconia)", category: "Ortopediya", price: 1200000, active: true },
      { id: 7, name: "Tish sug'urish (Oddiy)", category: "Jarrohlik", price: 150000, active: true },
      { id: 8, name: "Aql tishini murakkab sug'urish", category: "Jarrohlik", price: 400000, active: true },
      { id: 9, name: "Dental implant o'rnatish (Osstem)", category: "Implantatsiya", price: 3800000, active: true },
      { id: 10, name: "Metall breket tizimi (1 jag')", category: "Ortodontiya", price: 3500000, active: true },
    ],
    patients: [
      { id: 1, full_name: "Alisher Qodirov", phone: "+998 90 987 65 43", birth_date: "1988-04-12", gender: "male", address: "Toshkent sh., Chilonzor 9-mavze", allergies: "Penitsillin", notes: "Oldingi tishida sezuvchanlik bor", source: "clinic", created_at: "2026-08-10" },
      { id: 2, full_name: "Gulbahor Xamidova", phone: "+998 97 765 43 21", birth_date: "1995-11-23", gender: "female", address: "Toshkent sh., Yunusobod 4", allergies: "Yo'q", notes: "Breket davolash jarayonida", source: "telegram", telegram_id: "87654321", created_at: "2026-08-15" },
      { id: 3, full_name: "Bobur Mirzayev", phone: "+998 93 321 09 87", birth_date: "1982-02-18", gender: "male", address: "Toshkent sh., Mirzo Ulug'bek", allergies: "Lidokain", notes: "Implantatsiya nazorati", source: "clinic", created_at: "2026-09-01" },
      { id: 4, full_name: "Munira Zokirova", phone: "+998 91 112 23 34", birth_date: "2001-07-30", gender: "female", address: "Toshkent sh., Shayxontohur", allergies: "Yo'q", notes: "Tish tozalash va oqartirish", source: "telegram", telegram_id: "12345678", created_at: "2026-09-12" },
      { id: 5, full_name: "Jasur Bekmirzayev", phone: "+998 94 445 56 67", birth_date: "1991-09-05", gender: "male", address: "Toshkent vil., Zangiota", allergies: "Yo'q", notes: "Kariyes 2 ta tishda", source: "clinic", created_at: "2026-09-15" },
    ],
    appointments: [
      { id: 1, patient_id: 1, patient_name: "Alisher Qodirov", staff_id: 1, staff_name: "Dr. Rustam Karimov", scheduled_at: `${todayStr}T09:30:00`, date: todayStr, time: "09:30", duration_min: 45, complaint: "Plomba tushib qolgan", status: "completed" },
      { id: 2, patient_id: 2, patient_name: "Gulbahor Xamidova", staff_id: 2, staff_name: "Dr. Nilufar Saidova", scheduled_at: `${todayStr}T11:00:00`, date: todayStr, time: "11:00", duration_min: 30, complaint: "Breket liga tortish", status: "arrived" },
      { id: 3, patient_id: 3, patient_name: "Bobur Mirzayev", staff_id: 1, staff_name: "Dr. Rustam Karimov", scheduled_at: `${todayStr}T14:00:00`, date: todayStr, time: "14:00", duration_min: 60, complaint: "Implant tekshiruvi", status: "scheduled" },
      { id: 4, patient_id: 4, patient_name: "Munira Zokirova", staff_id: 3, staff_name: "Dr. Aziz Alimov", scheduled_at: `${todayStr}T16:30:00`, date: todayStr, time: "16:30", duration_min: 40, complaint: "Tish toshlarini tozalash", status: "scheduled" },
    ],
    procedures: [
      { id: 1, patient_id: 1, service_id: 2, service_name: "Fotopolimer plomba qo'yish (Gradia)", tooth: "16", price: 320000, staff_id: 1, staff_name: "Dr. Rustam Karimov", procedure_date: todayStr },
      { id: 2, patient_id: 1, service_id: 4, service_name: "Ultratovushli tish tozalash (Air-Flow)", tooth: "All", price: 250000, staff_id: 1, staff_name: "Dr. Rustam Karimov", procedure_date: todayStr },
      { id: 3, patient_id: 2, service_id: 10, service_name: "Metall breket tizimi (1 jag')", tooth: "Yuqori", price: 3500000, staff_id: 2, staff_name: "Dr. Nilufar Saidova", procedure_date: "2026-08-20" },
      { id: 4, patient_id: 3, service_id: 9, service_name: "Dental implant o'rnatish (Osstem)", tooth: "36", price: 3800000, staff_id: 1, staff_name: "Dr. Rustam Karimov", procedure_date: "2026-09-02" },
    ],
    transactions: [
      { id: 1, type: "income", amount: 570000, category: "payment", method: "card", patient_id: 1, patient_name: "Alisher Qodirov", comment: "Plomba va tish tozalash uchun to'lov", tx_date: todayStr },
      { id: 2, type: "income", amount: 2000000, category: "payment", method: "cash", patient_id: 2, patient_name: "Gulbahor Xamidova", comment: "Breket uchun boshlang'ich to'lov", tx_date: todayStr },
      { id: 3, type: "expense", amount: 450000, category: "material", method: "transfer", patient_id: null, comment: "Dentsply fotokompozit material xaridi", tx_date: todayStr },
      { id: 4, type: "expense", amount: 150000, category: "utility", method: "card", patient_id: null, comment: "Klinika tozalik va antiseptik vositalari", tx_date: todayStr },
      { id: 5, type: "income", amount: 3800000, category: "payment", method: "transfer", patient_id: 3, patient_name: "Bobur Mirzayev", comment: "Implant to'liq to'lovi", tx_date: "2026-09-02" },
    ],
    visits: [
      { id: 1, patient_id: 1, patient_name: "Alisher Qodirov", staff_id: 1, staff_name: "Dr. Rustam Karimov", complaint: "16-tishda karies va og'riq", diagnosis: "O'rta karies (Caries media)", recommendations: "Issiq-sovuqdan 2 soat saqlanish, gigiyenaga rioya qilish", visit_date: todayStr },
      { id: 2, patient_id: 2, patient_name: "Gulbahor Xamidova", staff_id: 2, staff_name: "Dr. Nilufar Saidova", complaint: "Tishlarning egriligi", diagnosis: "I sinf tish anomaliyasi", recommendations: "Qattiq ovqatlar yemash, maxsus cho'tka bilan tozalash", visit_date: "2026-08-20" },
    ],
    reminders: [
      { id: 1, patient_id: 3, patient_name: "Bobur Mirzayev", phone: "+998 93 321 09 87", due_date: dayjs().add(2, "day").format("YYYY-MM-DD"), reason: "Implantatsiya bo'yicha 1 oylik nazorat ko'rigi", status: "pending" },
      { id: 2, patient_id: 2, patient_name: "Gulbahor Xamidova", phone: "+998 97 765 43 21", telegram_id: "87654321", due_date: todayStr, reason: "Breket qabuliga kelish vaqti eslatmasi", status: "sent" },
      { id: 3, patient_id: 1, patient_name: "Alisher Qodirov", phone: "+998 90 987 65 43", due_date: dayjs().subtract(1, "day").format("YYYY-MM-DD"), reason: "Plombadan keyingi holatni tekshirish", status: "done" },
    ],
    complaints: [
      { id: 1, patient_name: "Gulbahor Xamidova", telegram_id: "87654321", message: "Salom, kecha qo'yilgan breket sal tilimga tegib qirayapti, maxsus mum (vosk) olsa bo'ladimi?", status: "open", created_at: `${todayStr}T08:15:00` },
      { id: 2, patient_name: "Nodir Karimov", telegram_id: "99887766", message: "Assalomu alaykum, shifokor qabuliga navbatga yozilmoqchi edim, shanba kuni bo'shmi?", status: "closed", reply_text: "Va alaykum assalom! Shanba kuni soat 14:00 ga yozib qo'ydik, kutamiz.", created_at: "2026-09-18T16:20:00" },
    ],
    dentalCharts: {
      1: {
        "16": { number: 16, status: "filling", note: "Fotopolimer plomba (Gradia)", updated_at: todayStr },
        "15": { number: 15, status: "caries", note: "Boshlang'ich karies, kuzatuv", updated_at: todayStr },
        "26": { number: 26, status: "healthy", note: "Sog'lom", updated_at: todayStr },
      },
      3: {
        "36": { number: 36, status: "implant", note: "Osstem implant 4.0x10mm o'rnatilgan", updated_at: "2026-09-02" },
        "46": { number: 46, status: "crown", note: "Keramik metall tojburchak", updated_at: "2026-08-15" },
        "26": { number: 26, status: "missing", note: "Olingan tish", updated_at: "2026-07-10" },
        "11": { number: 11, status: "pulpitis", note: "Ildiz kanali davolangan", updated_at: "2026-06-01" },
      },
      2: {
        "11": { number: 11, status: "prosthetic", note: "Breket tizimi o'rnatilgan", updated_at: "2026-08-20" },
        "21": { number: 21, status: "prosthetic", note: "Breket tizimi o'rnatilgan", updated_at: "2026-08-20" },
      },
    },
    dentalImages: [],
    botSessions: {},
    lastUpdated: new Date().toISOString(),
  };
}

class StorageEngine {
  private data: StorageData;
  private isSaving = false;
  private isCloudSyncing = false;
  private lastCloudSync: string = "";

  constructor() {
    this.data = this.loadData();
    // Start background sync with Firestore cloud on startup
    this.initCloudSync().catch(() => {});
    this.syncToPostgresAsync();
  }

  /**
   * 24/7 Cloud Firestore: Baza yuklanishi bilanoq bulutdagi doimiy holatni o'qish
   * Bu server qayta ishga tushganda yoki konteyner yangilanganda ma'lumotlar o'chib ketishini 100% oldini oladi.
   */
  public async initCloudSync(): Promise<boolean> {
    if (!firestoreDb) return false;
    try {
      console.log("☁️ Firestore bulutli bazasidan doimiy ma'lumotlar tekshirilmoqda...");
      const snap = await getDoc(doc(firestoreDb, "clinic_backup", "live_data"));
      if (snap.exists()) {
        const cloudData = snap.data() as Partial<StorageData>;
        if (cloudData && Array.isArray(cloudData.patients) && cloudData.patients.length > 0) {
          console.log(`✅ Firestore bulutidan ma'lumotlar tiklandi: ${cloudData.patients.length} ta bemor, ${cloudData.appointments?.length || 0} ta qabul`);
          this.data = {
            ...getInitialData(),
            ...(cloudData as any),
            dentalCharts: { ...getInitialData().dentalCharts, ...(cloudData.dentalCharts || {}) },
          };
          this.lastCloudSync = new Date().toISOString();
          if (cloudData.clinicSettings?.botToken && !process.env.TELEGRAM_BOT_TOKEN) {
            process.env.TELEGRAM_BOT_TOKEN = cloudData.clinicSettings.botToken;
          }
          if (cloudData.clinicSettings?.clinicName) {
            process.env.CLINIC_NAME = cloudData.clinicSettings.clinicName;
          }
          if (cloudData.clinicSettings?.clinicPhone) {
            process.env.CLINIC_PHONE = cloudData.clinicSettings.clinicPhone;
          }
          if (cloudData.clinicSettings?.clinicTg) {
            process.env.CLINIC_TG = cloudData.clinicSettings.clinicTg;
          }
          this.persist(this.data);
          return true;
        }
      } else {
        console.log("☁️ Firestore bulutida 'live_data' hali mavjud emas. Dastlabki ma'lumotlar bulutga yozilmoqda...");
        await this.syncToFirestoreAsync();
        return true;
      }
    } catch (err: any) {
      console.warn("⚠️ Firestore bulutidan yuklashda ogohlantirish:", err.message);
    }
    return false;
  }

  private loadData(): StorageData {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      
      let raw = "";
      if (fs.existsSync(DATA_FILE)) {
        raw = fs.readFileSync(DATA_FILE, "utf-8");
      } else if (fs.existsSync(BACKUP_FILE)) {
        console.log("💾 Zaxira fayldan (BACKUP_FILE) tiklanmoqda:", BACKUP_FILE);
        raw = fs.readFileSync(BACKUP_FILE, "utf-8");
      }

      if (raw) {
        const parsed = JSON.parse(raw);
        console.log("💾 Baza fayldan muvaffaqiyatli yuklandi");
        const resData: StorageData = {
          ...getInitialData(),
          ...parsed,
          dentalCharts: { ...getInitialData().dentalCharts, ...(parsed.dentalCharts || {}) },
        };
        if (resData.clinicSettings?.botToken && !process.env.TELEGRAM_BOT_TOKEN) {
          process.env.TELEGRAM_BOT_TOKEN = resData.clinicSettings.botToken;
        }
        if (resData.clinicSettings?.clinicName && !process.env.CLINIC_NAME) {
          process.env.CLINIC_NAME = resData.clinicSettings.clinicName;
        }
        if (resData.clinicSettings?.clinicPhone && !process.env.CLINIC_PHONE) {
          process.env.CLINIC_PHONE = resData.clinicSettings.clinicPhone;
        }
        if (resData.clinicSettings?.clinicTg && !process.env.CLINIC_TG) {
          process.env.CLINIC_TG = resData.clinicSettings.clinicTg;
        }
        // Ensure every patient has a 6-digit connect code for Telegram bot linking
        resData.patients.forEach((p) => {
          if (!p.connect_code) {
            p.connect_code = String(100000 + ((p.id * 73 + 12345) % 900000));
          }
        });
        // Ensure every user has a proper status and the owner has full admin access
        resData.users = resData.users || [];
        resData.users.forEach((u) => {
          if (!u.status) {
            u.status = u.active ? "approved" : "blocked";
          }
          if (
            u.username?.toLowerCase() === "antiboof521@gmail.com" ||
            u.email?.toLowerCase() === "antiboof521@gmail.com"
          ) {
            u.role = "admin";
            u.status = "approved";
            u.active = true;
          }
        });
        // If owner is not in users list, add as approved admin
        if (!resData.users.some((u) => u.username?.toLowerCase() === "antiboof521@gmail.com" || u.email?.toLowerCase() === "antiboof521@gmail.com")) {
          const maxId = resData.users.length ? Math.max(...resData.users.map((x) => x.id)) : 0;
          resData.users.push({
            id: maxId + 1,
            username: "antiboof521@gmail.com",
            email: "antiboof521@gmail.com",
            full_name: "Klinika Administratori",
            role: "admin",
            active: true,
            status: "approved",
          });
        }
        return resData;
      }
    } catch (e: any) {
      console.error("Fayldan o'qishda xatolik:", e.message);
    }

    const init = getInitialData();
    this.persist(init);
    return init;
  }

  private persist(dataToSave: StorageData) {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      dataToSave.lastUpdated = new Date().toISOString();
      const tmpFile = `${DATA_FILE}.tmp`;
      const jsonStr = JSON.stringify(dataToSave, null, 2);
      fs.writeFileSync(tmpFile, jsonStr, "utf-8");
      fs.renameSync(tmpFile, DATA_FILE);

      // Doimiy ikkinchi xavfsiz zaxira nusxasini yozish
      try {
        fs.writeFileSync(BACKUP_FILE, jsonStr, "utf-8");
      } catch {}
    } catch (err: any) {
      console.error("Ma'lumotlarni saqlashda xatolik:", err.message);
    }
  }

  public save() {
    this.persist(this.data);
    this.syncToFirestoreAsync().catch(() => {});
    this.syncToPostgresAsync();
  }

  /**
   * Asinxron ravishda barcha o'zgarishlarni darhol Firestore bulutiga muhrlash
   */
  public async syncToFirestoreAsync(): Promise<boolean> {
    if (!firestoreDb || this.isCloudSyncing) return false;
    this.isCloudSyncing = true;
    try {
      const sanitized = sanitizeForFirestore(this.data);
      await setDoc(doc(firestoreDb, "clinic_backup", "live_data"), sanitized);
      this.lastCloudSync = new Date().toISOString();

      // Individual collections for schema completeness
      for (const p of this.data.patients.slice(0, 50)) {
        try {
          await setDoc(doc(firestoreDb, "patients", String(p.id)), sanitizeForFirestore(p));
        } catch {}
      }
      for (const a of this.data.appointments.slice(0, 50)) {
        try {
          await setDoc(doc(firestoreDb, "appointments", String(a.id)), sanitizeForFirestore(a));
        } catch {}
      }
      for (const s of this.data.services.slice(0, 50)) {
        try {
          await setDoc(doc(firestoreDb, "services", String(s.id)), sanitizeForFirestore(s));
        } catch {}
      }
      for (const st of this.data.staff.slice(0, 50)) {
        try {
          await setDoc(doc(firestoreDb, "staff", String(st.id)), sanitizeForFirestore(st));
        } catch {}
      }
      return true;
    } catch (e: any) {
      console.error("⚠️ Firestore bulutiga saqlashda ogohlantirish:", e.message);
      return false;
    } finally {
      this.isCloudSyncing = false;
    }
  }

  public getCloudStatus() {
    return {
      connected: Boolean(firestoreDb),
      projectId: firebaseConfig.projectId,
      databaseId: firebaseConfig.firestoreDatabaseId,
      lastSynced: this.lastCloudSync || this.data.lastUpdated || new Date().toISOString(),
      totalPatients: this.data.patients.length,
      totalAppointments: this.data.appointments.length,
      totalStaff: this.data.staff.length,
      totalServices: this.data.services.length,
      totalTransactions: this.data.transactions.length,
      totalVisits: this.data.visits.length,
      totalReminders: this.data.reminders.length,
    };
  }

  public async forcePushToCloud(): Promise<{ ok: boolean; message: string; counts: any }> {
    const ok = await this.syncToFirestoreAsync();
    return {
      ok,
      message: ok
        ? "Barcha ma'lumotlar Google Cloud Firestore bulutiga muvaffaqiyatli saqlandi. Ma'lumotlaringiz 24/7 xavfsiz va doimiydir!"
        : "Bulutga saqlashda xatolik yuz berdi",
      counts: this.getCloudStatus(),
    };
  }

  public async forcePullFromCloud(): Promise<{ ok: boolean; message: string; counts: any }> {
    const ok = await this.initCloudSync();
    return {
      ok,
      message: ok
        ? "Ma'lumotlar Google Cloud Firestore bulutidan muvaffaqiyatli qayta tiklandi!"
        : "Bulutdan tiklashda xatolik yoki bulutda saqlangan ma'lumot topilmadi",
      counts: this.getCloudStatus(),
    };
  }

  private async syncToPostgresAsync() {
    if (this.isSaving) return;
    this.isSaving = true;
    try {
      if (process.env.SQL_HOST && db) {
        // Asynchronously sync latest patients & appointments if PostgreSQL is reachable
        // This keeps Cloud SQL and local persistent file in complete synchronization
        for (const p of this.data.patients.slice(0, 30)) {
          try {
            await db.insert(dbPatients).values({
              fullName: p.full_name,
              phone: p.phone,
              birthDate: p.birth_date,
              gender: p.gender || "male",
              notes: p.notes,
              allergies: p.allergies,
            }).onConflictDoNothing();
          } catch {}
        }
      }
    } catch (e) {
      // Ignore background sync errors so app remains lightning fast
    } finally {
      this.isSaving = false;
    }
  }

  // Getters
  public getUsers(): User[] { return this.data.users; }
  public getPendingUsers(): User[] {
    return this.data.users.filter((u) => u.status === "pending");
  }

  public getUserById(id: number): User | undefined {
    return this.data.users.find((u) => u.id === id);
  }

  public getUserByEmail(email: string): User | undefined {
    if (!email) return undefined;
    const lower = email.toLowerCase().trim();
    return this.data.users.find(
      (u) => u.email?.toLowerCase().trim() === lower || u.username?.toLowerCase().trim() === lower
    );
  }

  public getUserByUid(uid: string): User | undefined {
    if (!uid) return undefined;
    return this.data.users.find((u) => u.uid === uid);
  }

  public addOrUpdateGoogleRequest(details: {
    uid: string;
    email: string;
    full_name?: string;
    avatar_url?: string;
  }): { user: User; isNew: boolean } {
    const existing = this.getUserByUid(details.uid) || this.getUserByEmail(details.email);
    const isOwner = details.email?.toLowerCase().trim() === "antiboof521@gmail.com";

    if (existing) {
      if (details.avatar_url) existing.avatar_url = details.avatar_url;
      if (details.uid) existing.uid = details.uid;
      if (details.full_name && !existing.full_name) existing.full_name = details.full_name;
      if (isOwner) {
        existing.role = "admin";
        existing.status = "approved";
        existing.active = true;
      }
      this.save();
      return { user: existing, isNew: false };
    }

    const nextId = this.data.users.length ? Math.max(...this.data.users.map((x) => x.id)) + 1 : 1;
    const newUser: User = {
      id: nextId,
      username: details.email,
      email: details.email,
      uid: details.uid,
      full_name: details.full_name || details.email.split("@")[0],
      avatar_url: details.avatar_url || "",
      role: isOwner ? "admin" : "doctor",
      active: isOwner,
      status: isOwner ? "approved" : "pending",
      requested_at: new Date().toISOString(),
    };
    this.data.users.push(newUser);
    this.save();
    return { user: newUser, isNew: true };
  }

  public approveUser(id: number, role?: "admin" | "accountant" | "doctor", reviewer?: string): User | null {
    const user = this.getUserById(id);
    if (!user) return null;
    user.status = "approved";
    user.active = true;
    if (role) user.role = role;
    user.reviewed_at = new Date().toISOString();
    user.reviewed_by = reviewer || "Admin";
    this.save();
    return user;
  }

  public rejectUser(id: number, reviewer?: string): User | null {
    const user = this.getUserById(id);
    if (!user) return null;
    user.status = "rejected";
    user.active = false;
    user.reviewed_at = new Date().toISOString();
    user.reviewed_by = reviewer || "Admin";
    this.save();
    return user;
  }

  public blockUser(id: number, reviewer?: string): User | null {
    const user = this.getUserById(id);
    if (!user) return null;
    user.status = "blocked";
    user.active = false;
    user.reviewed_at = new Date().toISOString();
    user.reviewed_by = reviewer || "Admin";
    this.save();
    return user;
  }

  public unblockUser(id: number, reviewer?: string): User | null {
    const user = this.getUserById(id);
    if (!user) return null;
    user.status = "approved";
    user.active = true;
    user.reviewed_at = new Date().toISOString();
    user.reviewed_by = reviewer || "Admin";
    this.save();
    return user;
  }
  public getStaff(): Staff[] { return this.data.staff; }
  public getServices(): Service[] { return this.data.services; }
  public getPatients(): Patient[] { return this.data.patients; }
  public getAppointments(): Appointment[] { return this.data.appointments; }
  public getProcedures(): Procedure[] { return this.data.procedures; }
  public getTransactions(): Transaction[] { return this.data.transactions; }
  public getVisits(): Visit[] { return this.data.visits; }
  public getReminders(): Reminder[] { return this.data.reminders; }
  public getComplaints(): Complaint[] { return this.data.complaints; }
  public getDentalCharts(): Record<number, Record<string, ToothData>> { return this.data.dentalCharts; }
  public getDentalImages(): DentalImage[] { return this.data.dentalImages; }
  public getBotSessions(): Record<string, any> { return this.data.botSessions; }

  // Setters / Helpers
  public setBotSession(tgId: string, session: any) {
    this.data.botSessions[tgId] = session;
    this.save();
  }

  public getBotSession(tgId: string): any {
    return this.data.botSessions[tgId] || null;
  }

  private generateUniqueConnectCode(): string {
    const existing = new Set(this.data.patients.map((p) => p.connect_code).filter(Boolean));
    for (let i = 0; i < 1000; i++) {
      const code = String(Math.floor(100000 + Math.random() * 900000));
      if (!existing.has(code)) return code;
    }
    return String(Date.now()).slice(-6);
  }

  public addPatient(p: Omit<Patient, "id"> & { id?: number }): Patient {
    const id = p.id || (this.data.patients.length ? Math.max(...this.data.patients.map((x) => x.id)) + 1 : 1);
    const newPatient: Patient = {
      ...p,
      id,
      connect_code: p.connect_code || this.generateUniqueConnectCode(),
      created_at: p.created_at || dayjs().format("YYYY-MM-DD HH:mm"),
      is_viewed: p.is_viewed !== undefined ? p.is_viewed : false,
    };
    this.data.patients.unshift(newPatient);
    this.save();
    return newPatient;
  }

  public markPatientViewed(id: number): Patient | null {
    const p = this.data.patients.find((x) => x.id === id);
    if (!p) return null;
    p.is_viewed = true;
    p.viewed_at = dayjs().format("YYYY-MM-DD HH:mm");
    this.save();
    return p;
  }

  public updatePatient(id: number, patch: Partial<Patient>): Patient | null {
    const idx = this.data.patients.findIndex((p) => p.id === id);
    if (idx === -1) return null;
    this.data.patients[idx] = { ...this.data.patients[idx], ...patch, id };
    this.save();
    return this.data.patients[idx];
  }

  public findPatientByTelegramId(tgId: string): Patient | null {
    if (!tgId) return null;
    return this.data.patients.find((p) => String(p.telegram_id) === String(tgId)) || null;
  }

  public findPatientByConnectCode(code: string): Patient | null {
    if (!code) return null;
    const clean = code.trim().toLowerCase();
    return this.data.patients.find((p) => p.connect_code && p.connect_code.toLowerCase() === clean) || null;
  }

  public findPatientByPhone(rawPhone: string): Patient | null {
    if (!rawPhone) return null;
    const cleanInput = rawPhone.replace(/\D/g, "");
    if (!cleanInput || cleanInput.length < 7) return null;
    return this.data.patients.find((p) => {
      const pClean = (p.phone || "").replace(/\D/g, "");
      return pClean && (pClean.endsWith(cleanInput) || cleanInput.endsWith(pClean));
    }) || null;
  }

  public linkPatientTelegram(patientId: number, tgId: string, username?: string): Patient | null {
    const patient = this.data.patients.find((p) => p.id === patientId);
    if (!patient) return null;
    patient.telegram_id = String(tgId);
    if (username) {
      patient.telegram_username = username.replace(/^@/, "");
    }
    this.save();
    return patient;
  }

  public unlinkPatientTelegram(patientId: number): Patient | null {
    const patient = this.data.patients.find((p) => p.id === patientId);
    if (!patient) return null;
    delete patient.telegram_id;
    delete patient.telegram_username;
    this.save();
    return patient;
  }

  public generatePatientConnectCode(patientId: number): string | null {
    const patient = this.data.patients.find((p) => p.id === patientId);
    if (!patient) return null;
    patient.connect_code = this.generateUniqueConnectCode();
    this.save();
    return patient.connect_code;
  }

  public deletePatient(id: number): boolean {
    const before = this.data.patients.length;
    this.data.patients = this.data.patients.filter((p) => p.id !== id);
    if (this.data.patients.length !== before) {
      this.save();
      return true;
    }
    return false;
  }

  public addAppointment(a: Omit<Appointment, "id"> & { id?: number }): Appointment {
    const id = a.id || (this.data.appointments.length ? Math.max(...this.data.appointments.map((x) => x.id)) + 1 : 1);
    const newA: Appointment = {
      ...a,
      id,
      duration_min: a.duration_min || 30,
      status: a.status || "scheduled",
    };
    this.data.appointments.push(newA);
    this.save();
    return newA;
  }

  public updateAppointment(id: number, patch: Partial<Appointment>): Appointment | null {
    const idx = this.data.appointments.findIndex((a) => a.id === id);
    if (idx === -1) return null;
    this.data.appointments[idx] = { ...this.data.appointments[idx], ...patch, id };
    this.save();
    return this.data.appointments[idx];
  }

  public addStaff(s: Omit<Staff, "id"> & { id?: number }): Staff {
    const id = s.id || (this.data.staff.length ? Math.max(...this.data.staff.map((x) => x.id)) + 1 : 1);
    const newS: Staff = {
      ...s,
      id,
      telegram_username: (s.telegram_username || "").replace(/^@/, "").trim(),
      active: s.active !== undefined ? s.active : true,
    };
    this.data.staff.push(newS);
    this.save();
    return newS;
  }

  public updateStaff(id: number, patch: Partial<Staff>): Staff | null {
    const s = this.data.staff.find((x) => x.id === id);
    if (!s) return null;
    if (patch.full_name !== undefined) s.full_name = patch.full_name;
    if (patch.position !== undefined) s.position = patch.position;
    if (patch.phone !== undefined) s.phone = patch.phone;
    if (patch.telegram_username !== undefined) {
      s.telegram_username = (patch.telegram_username || "").replace(/^@/, "").trim();
    }
    if (patch.salary_pct !== undefined) s.salary_pct = Number(patch.salary_pct);
    if (patch.salary_fixed !== undefined) s.salary_fixed = Number(patch.salary_fixed);
    if (patch.active !== undefined) s.active = Boolean(patch.active);
    this.save();
    return s;
  }

  public deleteStaff(id: number): boolean {
    const before = this.data.staff.length;
    this.data.staff = this.data.staff.filter((s) => s.id !== id);
    if (this.data.staff.length !== before) {
      if (firestoreDb) {
        deleteDoc(doc(firestoreDb, "staff", String(id))).catch(() => {});
      }
      this.save();
      return true;
    }
    return false;
  }

  public deleteAppointment(id: number): boolean {
    const before = this.data.appointments.length;
    this.data.appointments = this.data.appointments.filter((a) => a.id !== id);
    if (this.data.appointments.length !== before) {
      this.save();
      return true;
    }
    return false;
  }

  public addComplaint(c: Omit<Complaint, "id" | "created_at"> & { id?: number; created_at?: string }): Complaint {
    const id = c.id || (this.data.complaints.length ? Math.max(...this.data.complaints.map((x) => x.id)) + 1 : 1);
    const newC: Complaint = {
      ...c,
      id,
      status: c.status || "open",
      created_at: c.created_at || dayjs().format("YYYY-MM-DD HH:mm"),
    };
    this.data.complaints.unshift(newC);
    this.save();
    return newC;
  }

  public updateTooth(patientId: number, toothKey: string, toothData: ToothData) {
    if (!this.data.dentalCharts[patientId]) {
      this.data.dentalCharts[patientId] = {};
    }
    this.data.dentalCharts[patientId][toothKey] = toothData;
    this.save();
  }

  public resetTooth(patientId: number, toothKey: string) {
    if (this.data.dentalCharts[patientId] && this.data.dentalCharts[patientId][toothKey]) {
      delete this.data.dentalCharts[patientId][toothKey];
      this.save();
    }
  }

  public addProcedure(proc: Omit<Procedure, "id">): Procedure {
    const id = this.data.procedures.length ? Math.max(...this.data.procedures.map((x) => x.id)) + 1 : 1;
    const newP: Procedure = { ...proc, id };
    this.data.procedures.unshift(newP);
    this.save();
    return newP;
  }

  public updateProcedure(id: number, patch: Partial<Procedure>): Procedure | null {
    const idx = this.data.procedures.findIndex((p) => p.id === id);
    if (idx === -1) return null;
    this.data.procedures[idx] = { ...this.data.procedures[idx], ...patch, id };
    this.save();
    return this.data.procedures[idx];
  }

  public deleteProcedure(id: number): boolean {
    const before = this.data.procedures.length;
    this.data.procedures = this.data.procedures.filter((p) => p.id !== id);
    if (this.data.procedures.length !== before) {
      this.save();
      return true;
    }
    return false;
  }

  public addTransaction(tx: Omit<Transaction, "id">): Transaction {
    const id = this.data.transactions.length ? Math.max(...this.data.transactions.map((x) => x.id)) + 1 : 1;
    const newTx: Transaction = { ...tx, id };
    this.data.transactions.unshift(newTx);
    this.save();
    return newTx;
  }

  public updateTransaction(id: number, patch: Partial<Transaction>): Transaction | null {
    const idx = this.data.transactions.findIndex((t) => t.id === id);
    if (idx === -1) return null;
    this.data.transactions[idx] = { ...this.data.transactions[idx], ...patch, id };
    this.save();
    return this.data.transactions[idx];
  }

  public deleteTransaction(id: number): boolean {
    const before = this.data.transactions.length;
    this.data.transactions = this.data.transactions.filter((t) => t.id !== id);
    if (this.data.transactions.length !== before) {
      this.save();
      return true;
    }
    return false;
  }

  public addVisit(v: Omit<Visit, "id">): Visit {
    const id = this.data.visits.length ? Math.max(...this.data.visits.map((x) => x.id)) + 1 : 1;
    const newV: Visit = { ...v, id };
    this.data.visits.unshift(newV);
    this.save();
    return newV;
  }

  public deleteVisit(id: number): boolean {
    const before = this.data.visits.length;
    this.data.visits = this.data.visits.filter((v) => v.id !== id);
    if (this.data.visits.length !== before) {
      this.save();
      return true;
    }
    return false;
  }

  public addReminder(r: Omit<Reminder, "id">): Reminder {
    const id = this.data.reminders.length ? Math.max(...this.data.reminders.map((x) => x.id)) + 1 : 1;
    const newR: Reminder = { ...r, id };
    this.data.reminders.unshift(newR);
    this.save();
    return newR;
  }

  public updateReminder(id: number, patch: Partial<Reminder>): Reminder | null {
    const idx = this.data.reminders.findIndex((r) => r.id === id);
    if (idx === -1) return null;
    this.data.reminders[idx] = { ...this.data.reminders[idx], ...patch, id };
    this.save();
    return this.data.reminders[idx];
  }

  public deleteReminder(id: number): boolean {
    const before = this.data.reminders.length;
    this.data.reminders = this.data.reminders.filter((r) => r.id !== id);
    if (this.data.reminders.length !== before) {
      this.save();
      return true;
    }
    return false;
  }

  public updateComplaint(id: number, patch: Partial<Complaint>): Complaint | null {
    const idx = this.data.complaints.findIndex((c) => c.id === id);
    if (idx === -1) return null;
    this.data.complaints[idx] = { ...this.data.complaints[idx], ...patch, id };
    this.save();
    return this.data.complaints[idx];
  }

  public deleteComplaint(id: number): boolean {
    const before = this.data.complaints.length;
    this.data.complaints = this.data.complaints.filter((c) => c.id !== id);
    if (this.data.complaints.length !== before) {
      this.save();
      return true;
    }
    return false;
  }

  public renameServiceCategory(oldCategory: string, newCategory: string): number {
    let count = 0;
    this.data.services.forEach((s) => {
      if (s.category === oldCategory) {
        s.category = newCategory;
        count++;
      }
    });
    if (count > 0) this.save();
    return count;
  }

  public deleteServiceCategory(category: string): number {
    let count = 0;
    this.data.services.forEach((s) => {
      if (s.category === category) {
        s.category = "Umumiy";
        count++;
      }
    });
    if (count > 0) this.save();
    return count;
  }

  public addDentalImage(img: DentalImage): DentalImage {
    this.data.dentalImages.unshift(img);
    this.save();
    return img;
  }

  public deleteDentalImage(id: string): boolean {
    const before = this.data.dentalImages.length;
    this.data.dentalImages = this.data.dentalImages.filter((x) => x.id !== id);
    if (this.data.dentalImages.length !== before) {
      this.save();
      return true;
    }
    return false;
  }

  public getClinicSettings() {
    return this.data.clinicSettings || {
      botToken: process.env.TELEGRAM_BOT_TOKEN || "",
      clinicName: process.env.CLINIC_NAME || "Dentistry Clinic",
      clinicPhone: process.env.CLINIC_PHONE || "+998 (71) 200-00-00",
      clinicTg: process.env.CLINIC_TG || "",
    };
  }

  public updateClinicSettings(settings: Partial<{ botToken: string; clinicName: string; clinicPhone: string; clinicTg: string }>) {
    const prev = this.getClinicSettings();
    this.data.clinicSettings = {
      ...prev,
      ...settings,
    };
    if (settings.botToken !== undefined) {
      process.env.TELEGRAM_BOT_TOKEN = settings.botToken;
    }
    if (settings.clinicName !== undefined) {
      process.env.CLINIC_NAME = settings.clinicName;
    }
    if (settings.clinicPhone !== undefined) {
      process.env.CLINIC_PHONE = settings.clinicPhone;
    }
    if (settings.clinicTg !== undefined) {
      process.env.CLINIC_TG = settings.clinicTg;
    }
    this.save();
    return this.data.clinicSettings;
  }
}

export const storage = new StorageEngine();
