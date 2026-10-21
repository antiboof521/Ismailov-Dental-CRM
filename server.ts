import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import dayjs from "dayjs";
import { createServer as createViteServer } from "vite";
import {
  initTelegramBot,
  sendPatientTelegramMessage,
  sendReminderTelegram,
  notifyUpcomingAppointments,
  notifyNewAppointment,
  notifyQueueProgressAfterCompletion,
  getBotInfo,
  getTelegramWebhookMiddleware,
  getBotWebhookStatus,
  setBotWebhook,
  switchToPolling,
  restartTelegramBot,
  BotPatient,
  BotAppointment,
  BotStaff,
} from "./server/bot.js";
import { finance as createFinanceExcel, doctorStats as createDoctorStatsExcel } from "./server/utils/excel.js";
import { PORT, CLINIC_NAME, CLINIC_PHONE, CLINIC_TG, TZ, DB_MODE } from "./server/config.js";
import { sseHandler, broadcast as broadcastSSE } from "./server/events.js";
import { startCron, triggerManualCheck } from "./server/cron.js";
import {
  analyzeDentalRadiograph,
  generateDentalTreatmentPlan,
  consultDentalCopilot,
  isGeminiAvailable,
  testGeminiConnection,
  getRawApiKey,
} from "./server/gemini.js";
import { adminAuth } from "./src/lib/firebase-admin.ts";
import { getOrCreateUser } from "./src/db/users.ts";
import {
  storage,
  User,
  Staff,
  Service,
  Patient,
  Appointment,
  Procedure,
  Transaction,
  Visit,
  Reminder,
  Complaint,
  DentalImage,
} from "./server/storage.js";

const app = express();

app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

const todayStr = dayjs().format("YYYY-MM-DD");

// ── TELEGRAM WEBHOOK ROUTE (24/7 uzluksiz ishlash) ──
app.post("/api/telegram/webhook", (req, res) => {
  const handler = getTelegramWebhookMiddleware();
  if (handler) {
    return handler(req, res);
  }
  res.status(503).json({ error: "Telegram bot webhook hali tayyor emas" });
});

// ── API ROUTES ──
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    db_mode: "firestore_cloud_persistent",
    storage: storage.getCloudStatus(),
  });
});

app.get("/api/storage/status", (req, res) => {
  res.json(storage.getCloudStatus());
});

app.post("/api/storage/sync", async (req, res) => {
  try {
    const result = await storage.forcePushToCloud();
    broadcastSSE("storage:synced", result);
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post("/api/storage/restore", async (req, res) => {
  try {
    const result = await storage.forcePullFromCloud();
    broadcastSSE("storage:updated", result);
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get("/api/storage/export-backup", (req, res) => {
  const data = {
    exportDate: new Date().toISOString(),
    clinicName: CLINIC_NAME,
    users: storage.getUsers(),
    staff: storage.getStaff(),
    services: storage.getServices(),
    patients: storage.getPatients(),
    appointments: storage.getAppointments(),
    procedures: storage.getProcedures(),
    transactions: storage.getTransactions(),
    visits: storage.getVisits(),
    reminders: storage.getReminders(),
    complaints: storage.getComplaints(),
    dentalCharts: storage.getDentalCharts(),
  };
  res.setHeader("Content-Disposition", `attachment; filename=clinic_backup_${dayjs().format("YYYY-MM-DD_HHmm")}.json`);
  res.setHeader("Content-Type", "application/json");
  res.send(JSON.stringify(data, null, 2));
});

// 1. Auth & Users
app.post("/api/auth/google", async (req, res) => {
  const { idToken } = req.body;
  if (!idToken) {
    return res.status(400).json({ error: "Missing Firebase idToken" });
  }
  try {
    const decoded = await adminAuth.verifyIdToken(idToken);
    const email = decoded.email || `${decoded.uid}@google.com`;
    const fullName = decoded.name || email.split("@")[0] || "Foydalanuvchi";
    const avatarUrl = decoded.picture || "";

    const { user: u, isNew } = storage.addOrUpdateGoogleRequest({
      uid: decoded.uid,
      email,
      full_name: fullName,
      avatar_url: avatarUrl,
    });

    // Also sync user record with relational database helper if available
    try {
      await getOrCreateUser(
        decoded.uid,
        email,
        fullName,
        u.role || "doctor"
      );
    } catch {}

    // If new request, broadcast real-time SSE event to all connected admin panels!
    if (isNew) {
      broadcastSSE("user:access_requested", {
        user: {
          id: u.id,
          username: u.username,
          full_name: u.full_name,
          email: u.email,
          avatar_url: u.avatar_url,
          role: u.role,
          status: u.status,
          requested_at: u.requested_at,
        },
        message: `Yangi ro'yxatdan o'tish so'rovi: ${u.full_name} (${u.email})`,
      });
    }

    // Check user access status
    if (u.status === "blocked") {
      return res.status(403).json({
        ok: false,
        status: "blocked",
        error: "Sizning hisobingiz administrator tomonidan bloklangan. Tizimga kirish taqiqlangan.",
        user: { id: u.id, email: u.email, full_name: u.full_name },
      });
    }

    if (u.status === "rejected") {
      return res.status(403).json({
        ok: false,
        status: "rejected",
        error: "Ro'yxatdan o'tish so'rovingiz administrator tomonidan rad etilgan. Qo'shimcha ma'lumot uchun klinika ma'muriyatiga murojaat qiling.",
        user: { id: u.id, email: u.email, full_name: u.full_name },
      });
    }

    if (u.status === "pending") {
      return res.status(200).json({
        ok: false,
        status: "pending",
        message: "Ro'yxatdan o'tish so'rovingiz qabul qilindi va administratorga yuborildi. Administrator tasdiqlaganidan so'ng tizimga kira olasiz.",
        user: {
          id: u.id,
          username: u.username,
          email: u.email,
          full_name: u.full_name,
          avatar_url: u.avatar_url,
          status: u.status,
          requested_at: u.requested_at,
        },
      });
    }

    if (!u.active) {
      return res.status(403).json({
        ok: false,
        status: "inactive",
        error: "Hisobingiz nofaol holatda. Administratorga murojaat qiling.",
      });
    }

    // User is approved and active
    const token = `token_${u.id}_${Date.now()}`;
    res.json({
      ok: true,
      status: "approved",
      token,
      firebaseToken: idToken,
      user: {
        id: u.id,
        username: u.username,
        email: u.email,
        full_name: u.full_name,
        role: u.role,
        avatar_url: u.avatar_url,
        uid: decoded.uid,
      },
    });
  } catch (err: any) {
    console.error("Firebase Google Auth verification failed:", err);
    res.status(401).json({ error: "Google orqali autentifikatsiyadan o'tib bo'lmadi" });
  }
});

// So'rov holatini tekshirish (foydalanuvchi tasdiqlanganini tekshirish uchun)
app.get("/api/auth/check-status", (req, res) => {
  const email = (req.query.email as string) || "";
  const uid = (req.query.uid as string) || "";
  const user = storage.getUserByUid(uid) || storage.getUserByEmail(email);
  if (!user) {
    return res.status(404).json({ error: "Foydalanuvchi topilmadi" });
  }
  if (user.status === "approved" && user.active) {
    const token = `token_${user.id}_${Date.now()}`;
    return res.json({
      status: "approved",
      active: true,
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        full_name: user.full_name,
        role: user.role,
        avatar_url: user.avatar_url,
      },
    });
  }
  res.json({
    status: user.status || (user.active ? "approved" : "pending"),
    active: user.active,
    user: {
      id: user.id,
      email: user.email,
      full_name: user.full_name,
      role: user.role,
    },
  });
});

app.post("/api/users/login", (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: "Login va parol kiritilishi shart" });
  }
  const users = storage.getUsers();
  const user = users.find(
    (u) =>
      (u.username === username || u.email === username) &&
      u.password === password
  );
  if (!user) {
    return res.status(401).json({ error: "Login yoki parol noto'g'ri kiritildi" });
  }
  if (user.status === "blocked") {
    return res.status(403).json({ error: "Hisobingiz administrator tomonidan bloklangan" });
  }
  if (user.status === "rejected") {
    return res.status(403).json({ error: "Ro'yxatdan o'tish so'rovingiz administrator tomonidan rad etilgan" });
  }
  if (user.status === "pending") {
    return res.status(403).json({ error: "Hisobingiz hali administrator tomonidan tasdiqlanmagan. Iltimos kuting." });
  }
  if (!user.active) {
    return res.status(403).json({ error: "Hisob nofaol holatda. Administratorga murojaat qiling." });
  }
  const token = `token_${user.id}_${Date.now()}`;
  res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      full_name: user.full_name,
      role: user.role,
      avatar_url: user.avatar_url,
    },
  });
});

app.get("/api/users/me", (req, res) => {
  const auth = req.headers.authorization;
  const users = storage.getUsers();
  if (auth && auth.includes("token_")) {
    const id = parseInt(auth.split("_")[1], 10);
    const u = users.find((x) => x.id === id);
    if (u) {
      return res.json({
        user: {
          id: u.id,
          username: u.username,
          email: u.email,
          full_name: u.full_name,
          role: u.role,
          avatar_url: u.avatar_url,
          status: u.status,
        },
      });
    }
  }
  res.json({ user: { id: 1, username: "admin", full_name: "Dr. Rustam Karimov (Admin)", role: "admin" } });
});

// Kutilayotgan so'rovlar ro'yxati
app.get("/api/users/requests", (req, res) => {
  const pending = storage.getPendingUsers().map(({ password, ...u }) => u);
  res.json({ requests: pending });
});

// So'rovni tasdiqlash (Qabul qilish)
app.post("/api/users/:id/approve", (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { role } = req.body;
  const user = storage.approveUser(id, role);
  if (!user) return res.status(404).json({ error: "Foydalanuvchi topilmadi" });
  broadcastSSE("user:approved", {
    userId: user.id,
    user: { id: user.id, email: user.email, full_name: user.full_name, role: user.role, status: "approved" },
  });
  broadcastSSE("user:status_changed", { userId: user.id, status: "approved", user });
  broadcastSSE("storage:updated", { counts: storage.getCloudStatus() });
  res.json({ ok: true, user });
});

// So'rovni rad qilish
app.post("/api/users/:id/reject", (req, res) => {
  const id = parseInt(req.params.id, 10);
  const user = storage.rejectUser(id);
  if (!user) return res.status(404).json({ error: "Foydalanuvchi topilmadi" });
  broadcastSSE("user:rejected", {
    userId: user.id,
    user: { id: user.id, email: user.email, full_name: user.full_name, status: "rejected" },
  });
  broadcastSSE("user:status_changed", { userId: user.id, status: "rejected", user });
  broadcastSSE("storage:updated", { counts: storage.getCloudStatus() });
  res.json({ ok: true, user });
});

// Foydalanuvchini bloklash
app.post("/api/users/:id/block", (req, res) => {
  const id = parseInt(req.params.id, 10);
  const user = storage.blockUser(id);
  if (!user) return res.status(404).json({ error: "Foydalanuvchi topilmadi" });
  broadcastSSE("user:blocked", {
    userId: user.id,
    user: { id: user.id, email: user.email, full_name: user.full_name, status: "blocked" },
  });
  broadcastSSE("user:status_changed", { userId: user.id, status: "blocked", user });
  broadcastSSE("storage:updated", { counts: storage.getCloudStatus() });
  res.json({ ok: true, user });
});

// Foydalanuvchini blokdan chiqarish
app.post("/api/users/:id/unblock", (req, res) => {
  const id = parseInt(req.params.id, 10);
  const user = storage.unblockUser(id);
  if (!user) return res.status(404).json({ error: "Foydalanuvchi topilmadi" });
  broadcastSSE("user:approved", {
    userId: user.id,
    user: { id: user.id, email: user.email, full_name: user.full_name, status: "approved" },
  });
  broadcastSSE("user:status_changed", { userId: user.id, status: "approved", user });
  broadcastSSE("storage:updated", { counts: storage.getCloudStatus() });
  res.json({ ok: true, user });
});

app.get("/api/users", (req, res) => {
  res.json({ users: storage.getUsers().map(({ password, ...u }) => u) });
});

app.post("/api/users", (req, res) => {
  const { username, password, full_name, role } = req.body;
  if (!username || !password) return res.status(400).json({ error: "Login va parol talab qilinadi" });
  const users = storage.getUsers();
  const newUser: User = {
    id: users.length ? Math.max(...users.map((u) => u.id)) + 1 : 1,
    username,
    password,
    full_name: full_name || username,
    role: role || "doctor",
    active: true,
    status: "approved",
  };
  users.push(newUser);
  storage.save();
  res.json({ user: newUser });
});

app.put("/api/users/:id", (req, res) => {
  const id = parseInt(req.params.id, 10);
  const users = storage.getUsers();
  const u = users.find((x) => x.id === id);
  if (!u) return res.status(404).json({ error: "Foydalanuvchi topilmadi" });
  const { full_name, role, password, active, status } = req.body;
  if (full_name !== undefined) u.full_name = full_name;
  if (role !== undefined) u.role = role;
  if (password) u.password = password;
  if (active !== undefined) u.active = active;
  if (status !== undefined) u.status = status;
  storage.save();
  res.json({ user: u });
});

app.delete("/api/users/:id", (req, res) => {
  const id = parseInt(req.params.id, 10);
  const users = storage.getUsers();
  const idx = users.findIndex((x) => x.id === id);
  if (idx !== -1) {
    users.splice(idx, 1);
    storage.save();
  }
  res.json({ ok: true });
});

// 2. Dashboard
app.get("/api/dashboard", (req, res) => {
  const todayAppts = storage.getAppointments().filter((a) => a.date === todayStr);
  const todayTx = storage.getTransactions().filter((t) => t.tx_date === todayStr);
  const income = todayTx.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
  const expense = todayTx.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);
  const pendingReminders = storage.getReminders().filter((r) => r.status === "pending").length;
  const openComplaints = storage.getComplaints().filter((c) => c.status === "open").length;
  const pendingUserRequests = storage.getPendingUsers().length;

  res.json({
    appointments: { total: todayAppts.length },
    income,
    expense,
    total_patients: storage.getPatients().length,
    pending_reminders: pendingReminders,
    open_complaints: openComplaints,
    pending_user_requests: pendingUserRequests,
    upcoming: todayAppts.slice(0, 10),
  });
});

// 3. Patients
app.get("/api/patients", (req, res) => {
  const q = String(req.query.search || "").toLowerCase().trim();
  let list = storage.getPatients();
  if (q) {
    list = list.filter((p) => p.full_name.toLowerCase().includes(q) || p.phone.includes(q));
  }
  res.json({ patients: list });
});

app.get("/api/patients/:id", (req, res) => {
  const id = parseInt(req.params.id, 10);
  const p = storage.getPatients().find((x) => x.id === id);
  if (!p) return res.status(404).json({ error: "Bemor topilmadi" });

  const procs = storage.getProcedures().filter((pr) => pr.patient_id === id);
  const txs = storage.getTransactions().filter((t) => t.patient_id === id);

  const servicesCost = procs.reduce((s, pr) => s + pr.price, 0);
  const paid = txs.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
  const debt = Math.max(0, servicesCost - paid);

  res.json({
    patient: p,
    balance: { paid, servicesCost, debt },
    procedures: procs,
    transactions: txs,
    dental_chart: storage.getDentalCharts()[id] || {},
  });
});

app.get("/api/patients/:id/dental-chart", (req, res) => {
  const id = parseInt(req.params.id, 10);
  const p = storage.getPatients().find((x) => x.id === id);
  if (!p) return res.status(404).json({ error: "Bemor topilmadi" });

  res.json({
    patient_id: id,
    patient_name: p.full_name,
    chart: storage.getDentalCharts()[id] || {},
  });
});

app.put("/api/patients/:id/dental-chart", (req, res) => {
  const id = parseInt(req.params.id, 10);
  const p = storage.getPatients().find((x) => x.id === id);
  if (!p) return res.status(404).json({ error: "Bemor topilmadi" });

  const chart = req.body.chart || {};
  const allCharts = storage.getDentalCharts();
  allCharts[id] = chart;
  storage.save();

  broadcastSSE("dental_chart:updated", {
    patient_id: id,
    patient_name: p.full_name,
  });

  res.json({
    ok: true,
    patient_id: id,
    chart: allCharts[id],
  });
});

// Dental Images
app.get("/api/patients/:id/images", (req, res) => {
  const patientId = parseInt(req.params.id, 10);
  const images = storage.getDentalImages()
    .filter((img) => img.patient_id === patientId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  res.json({ images });
});

app.post("/api/patients/:id/images", (req, res) => {
  const patientId = parseInt(req.params.id, 10);
  const p = storage.getPatients().find((x) => x.id === patientId);
  if (!p) return res.status(404).json({ error: "Bemor topilmadi" });

  const body = req.body;
  if (!body.url && !body.before_url) {
    return res.status(400).json({ error: "Rasm ma'lumoti talab qilinadi" });
  }

  const newImg: DentalImage = {
    id: `img-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    patient_id: patientId,
    tooth: body.tooth || "general",
    category: body.category || "intraoral",
    title: body.title || "Klinik rasm",
    description: body.description || "",
    url: body.url || body.after_url || body.before_url,
    before_url: body.before_url,
    after_url: body.after_url,
    created_at: dayjs().utcOffset(5).format("YYYY-MM-DD HH:mm"),
    doctor_name: body.doctor_name || "Shifokor",
  };

  storage.addDentalImage(newImg);
  broadcastSSE("dental_image:new", { patient_id: patientId, image_id: newImg.id, title: newImg.title });
  res.json({ ok: true, image: newImg });
});

app.delete("/api/patients/:id/images/:imageId", (req, res) => {
  const patientId = parseInt(req.params.id, 10);
  const imgId = req.params.imageId;
  storage.deleteDentalImage(imgId);
  broadcastSSE("dental_image:deleted", { patient_id: patientId, image_id: imgId });
  res.json({ ok: true });
});

// ── GEMINI AI ENDPOINTS ──
app.get("/api/ai/status", (req, res) => {
  const hasKey = isGeminiAvailable();
  res.json({
    available: true,
    hasApiKey: hasKey,
    model: "gemini-3.8-flash",
    hint: hasKey
      ? "Gemini API kaliti aniqlangan"
      : "Render.com Dashboard -> Environment bo'limida 'GEMINI_API_KEY' kaliti kiritilishi kerak.",
  });
});

app.all("/api/ai/test", async (req, res) => {
  try {
    const testRes = await testGeminiConnection();
    res.json(testRes);
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message || "Gemini sinovida xatolik" });
  }
});

app.post("/api/ai/analyze-radiograph", async (req, res) => {
  try {
    const { imageUrl, category, tooth, clinicalContext, patientName, language } = req.body;
    if (!imageUrl) {
      return res.status(400).json({ error: "Rasm ma'lumoti (imageUrl) talab qilinadi" });
    }
    const result = await analyzeDentalRadiograph({
      imageUrl,
      category,
      tooth,
      clinicalContext,
      patientName,
      language,
    });
    res.json({ ok: true, analysis: result });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Tahlil paytida xatolik yuz berdi" });
  }
});

app.post("/api/ai/treatment-plan", async (req, res) => {
  try {
    const { patientId, complaint, budgetPreference, language } = req.body;
    const patient = storage.getPatients().find((p) => p.id === Number(patientId));
    if (!patient) {
      return res.status(404).json({ error: "Bemor topilmadi" });
    }
    const chart = storage.getDentalCharts()[patient.id] || {};
    const result = await generateDentalTreatmentPlan({
      patient,
      dentalChart: chart,
      availableServices: storage.getServices().filter((s) => s.active),
      complaint,
      budgetPreference,
      language,
    });
    res.json({ ok: true, plan: result });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Davolash rejasi tuzishda xatolik" });
  }
});

app.post("/api/ai/copilot", async (req, res) => {
  try {
    const { message, history, patientContext, language } = req.body;
    if (!message) {
      return res.status(400).json({ error: "Xabar matni talab qilinadi" });
    }
    const reply = await consultDentalCopilot({
      message,
      history,
      patientContext,
      language,
    });
    res.json({ ok: true, reply });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "AI assistent bilan muloqotda xatolik" });
  }
});

app.post("/api/patients", (req, res) => {
  const body = req.body;
  if (!body.full_name) return res.status(400).json({ error: "Bemor F.I.Sh. talab qilinadi" });
  const newP = storage.addPatient({
    full_name: body.full_name,
    phone: body.phone || "",
    birth_date: body.birth_date || "",
    gender: body.gender || "",
    address: body.address || "",
    allergies: body.allergies || "",
    notes: body.notes || "",
    source: body.source || "clinic",
    telegram_id: body.telegram_id,
    created_at: dayjs().utcOffset(5).format("YYYY-MM-DD HH:mm"),
    is_viewed: false,
  });
  broadcastSSE("patient:new", { id: newP.id, name: newP.full_name, phone: newP.phone });
  broadcastSSE("clinic:sse", { type: "patient:new", id: newP.id });
  res.json({ patient: newP });
});

app.post("/api/patients/:id/view", (req, res) => {
  const id = parseInt(req.params.id, 10);
  const p = storage.markPatientViewed(id);
  if (!p) return res.status(404).json({ error: "Bemor topilmadi" });
  broadcastSSE("patient:updated", { id: p.id, patient: p });
  broadcastSSE("clinic:sse", { type: "patient:viewed", id: p.id });
  res.json({ ok: true, patient: p });
});

app.put("/api/patients/:id", (req, res) => {
  const id = parseInt(req.params.id, 10);
  const updated = storage.updatePatient(id, req.body);
  if (!updated) return res.status(404).json({ error: "Bemor topilmadi" });
  broadcastSSE("patient:updated", { id: updated.id, patient: updated });
  res.json({ patient: updated });
});

app.delete("/api/patients/:id", (req, res) => {
  const auth = req.headers.authorization;
  if (auth && auth.includes("token_")) {
    const userId = parseInt(auth.split("_")[1], 10);
    const u = storage.getUsers().find((x) => x.id === userId);
    if (u && u.role !== "admin") {
      return res.status(403).json({ error: "Bemorlarni o'chirish faqat administrator huquqiga ega" });
    }
  }

  const id = parseInt(req.params.id, 10);
  const ok = storage.deletePatient(id);
  if (!ok) return res.status(404).json({ error: "Bemor topilmadi" });
  broadcastSSE("patient:deleted", { id });
  broadcastSSE("clinic:sse", { type: "patient:deleted", id });
  res.json({ ok: true });
});

app.post("/api/patients/:id/message", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const patient = storage.getPatients().find((p) => p.id === id);
  if (!patient) return res.status(404).json({ error: "Bemor topilmadi" });
  const { text } = req.body;
  if (!text || !String(text).trim()) return res.status(400).json({ error: "Xabar matni bo'sh" });
  
  let delivered = false;
  if (patient.telegram_id) {
    delivered = await sendPatientTelegramMessage(patient.telegram_id, String(text).trim());
  }
  res.json({ ok: true, delivered, text });
});

// Telegramga bemorni ulash ma'lumotlari (Deep Link, QR va PIN kod)
app.get("/api/patients/:id/telegram-link-info", (req, res) => {
  const id = parseInt(req.params.id, 10);
  const patient = storage.getPatients().find((p) => p.id === id);
  if (!patient) return res.status(404).json({ error: "Bemor topilmadi" });

  if (!patient.connect_code) {
    storage.generatePatientConnectCode(id);
  }

  const botInfo = getBotInfo();
  const botUsername = botInfo.botUsername || process.env.TELEGRAM_BOT_USERNAME || "";
  const deepLink = botUsername ? `https://t.me/${botUsername}?start=link_${patient.id}` : "";
  const codeDeepLink = botUsername ? `https://t.me/${botUsername}?start=code_${patient.connect_code}` : "";

  res.json({
    patient_id: patient.id,
    full_name: patient.full_name,
    phone: patient.phone,
    telegram_id: patient.telegram_id || null,
    telegram_username: patient.telegram_username || null,
    is_connected: Boolean(patient.telegram_id),
    connect_code: patient.connect_code,
    bot_username: botUsername,
    bot_running: botInfo.running,
    deep_link: deepLink,
    code_deep_link: codeDeepLink,
  });
});

// Bemorga Telegram ID yoki username orqali qo'lda ulash
app.post("/api/patients/:id/telegram-link", (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { telegram_id, telegram_username } = req.body;
  if (!telegram_id && !telegram_username) {
    return res.status(400).json({ error: "Telegram ID yoki @username kiritilishi shart" });
  }

  const tgIdToUse = String(telegram_id || telegram_username).replace("@", "");
  const updated = storage.linkPatientTelegram(id, tgIdToUse, telegram_username);
  if (!updated) return res.status(404).json({ error: "Bemor topilmadi" });

  broadcastSSE("patient:telegram_linked", {
    patient_id: updated.id,
    full_name: updated.full_name,
    telegram_id: updated.telegram_id,
    telegram_username: updated.telegram_username,
  });
  broadcastSSE("patient:updated", { id: updated.id, patient: updated });

  res.json({ ok: true, patient: updated });
});

// Bemorning Telegram hisobini tizimdan uzish
app.post("/api/patients/:id/telegram-unlink", (req, res) => {
  const id = parseInt(req.params.id, 10);
  const updated = storage.unlinkPatientTelegram(id);
  if (!updated) return res.status(404).json({ error: "Bemor topilmadi" });

  broadcastSSE("patient:telegram_unlinked", { patient_id: updated.id });
  broadcastSSE("patient:updated", { id: updated.id, patient: updated });

  res.json({ ok: true, patient: updated });
});

// Bemor uchun yangi 6 xonali ulanish kodini (PIN) qayta generatsiya qilish
app.post("/api/patients/:id/generate-connect-code", (req, res) => {
  const id = parseInt(req.params.id, 10);
  const newCode = storage.generatePatientConnectCode(id);
  if (!newCode) return res.status(404).json({ error: "Bemor topilmadi" });
  res.json({ ok: true, connect_code: newCode });
});

// 4. Appointments
app.get("/api/appointments", (req, res) => {
  let list = storage.getAppointments();
  if (req.query.from && req.query.to) {
    const from = String(req.query.from);
    const to = String(req.query.to);
    list = list.filter((a) => a.date >= from && a.date <= to);
  } else if (req.query.date) {
    const date = String(req.query.date);
    list = list.filter((a) => a.date === date);
  } else if (req.query.all !== "true") {
    list = list.filter((a) => a.date === todayStr);
  }

  if (req.query.staff_id) {
    const sid = parseInt(String(req.query.staff_id), 10);
    list = list.filter((a) => a.staff_id === sid);
  }
  res.json({ appointments: list });
});

app.post("/api/appointments", (req, res) => {
  const b = req.body;
  const patient = storage.getPatients().find((p) => p.id === parseInt(b.patient_id, 10));
  const staff = storage.getStaff().find((s) => s.id === parseInt(b.staff_id, 10));

  const initialStaff = b.initial_staff_id ? storage.getStaff().find((s) => s.id === parseInt(b.initial_staff_id, 10)) : null;
  const finalStaff = b.final_staff_id ? storage.getStaff().find((s) => s.id === parseInt(b.final_staff_id, 10)) : null;

  const newA = storage.addAppointment({
    patient_id: parseInt(b.patient_id, 10),
    patient_name: patient ? patient.full_name : "Bemor",
    staff_id: b.staff_id ? parseInt(b.staff_id, 10) : (initialStaff ? initialStaff.id : null),
    staff_name: staff ? staff.full_name : (initialStaff ? initialStaff.full_name : ""),
    initial_staff_id: initialStaff ? initialStaff.id : (b.initial_staff_id ? parseInt(b.initial_staff_id, 10) : (staff ? staff.id : null)),
    initial_staff_name: initialStaff ? initialStaff.full_name : (staff ? staff.full_name : ""),
    final_staff_id: finalStaff ? finalStaff.id : (b.final_staff_id ? parseInt(b.final_staff_id, 10) : null),
    final_staff_name: finalStaff ? finalStaff.full_name : "",
    date: b.date || todayStr,
    time: b.time || "09:00",
    scheduled_at: `${b.date || todayStr}T${b.time || "09:00"}:00`,
    duration_min: parseInt(b.duration_min, 10) || 30,
    complaint: b.complaint || "",
    status: "scheduled",
  });

  broadcastSSE("appointment:new", {
    id: newA.id,
    patient: newA.patient_name,
    date: newA.date,
    time: newA.time,
    doctor: newA.staff_name,
    initial_doctor: newA.initial_staff_name,
    final_doctor: newA.final_staff_name,
    source: "clinic",
  });

  if (patient?.telegram_id) {
    notifyNewAppointment(newA as any, patient as any).catch(() => {});
  }
  res.json({ appointment: newA });
});

app.put("/api/appointments/:id", (req, res) => {
  const id = parseInt(req.params.id, 10);
  const a = storage.getAppointments().find((x) => x.id === id);
  if (!a) return res.status(404).json({ error: "Navbat topilmadi" });

  const oldStatus = a.status;
  const b = req.body;
  if (b.patient_id) {
    a.patient_id = parseInt(b.patient_id, 10);
    const p = storage.getPatients().find((x) => x.id === a.patient_id);
    if (p) a.patient_name = p.full_name;
  }
  if (b.staff_id !== undefined) {
    a.staff_id = b.staff_id ? parseInt(b.staff_id, 10) : null;
    const s = storage.getStaff().find((x) => x.id === a.staff_id);
    a.staff_name = s ? s.full_name : "";
  }
  if (b.initial_staff_id !== undefined) {
    a.initial_staff_id = b.initial_staff_id ? parseInt(b.initial_staff_id, 10) : null;
    const s = storage.getStaff().find((x) => x.id === a.initial_staff_id);
    a.initial_staff_name = s ? s.full_name : "";
    if (!a.staff_id && a.initial_staff_id) {
      a.staff_id = a.initial_staff_id;
      a.staff_name = a.initial_staff_name;
    }
  }
  if (b.final_staff_id !== undefined) {
    a.final_staff_id = b.final_staff_id ? parseInt(b.final_staff_id, 10) : null;
    const s = storage.getStaff().find((x) => x.id === a.final_staff_id);
    a.final_staff_name = s ? s.full_name : "";
  }
  if (b.date) a.date = b.date;
  if (b.time) a.time = b.time;
  a.scheduled_at = `${a.date}T${a.time}:00`;
  if (b.duration_min !== undefined) a.duration_min = parseInt(b.duration_min, 10);
  if (b.complaint !== undefined) a.complaint = b.complaint;
  if (b.status !== undefined) a.status = b.status;

  storage.save();
  broadcastSSE("appointment:updated", { id: a.id, appointment: a });

  // Agar qabul yakunlangan bo'lsa ('completed'), keyingi bemorlarga navbat siljishi haqida xabar yuboriladi
  if (b.status === "completed" && oldStatus !== "completed") {
    notifyQueueProgressAfterCompletion(
      a as any,
      storage.getPatients() as any,
      storage.getAppointments() as any
    ).catch((err) => console.error("notifyQueueProgressAfterCompletion error:", err));
  }

  res.json({ appointment: a });
});

app.put("/api/appointments/:id/status", (req, res) => {
  const id = parseInt(req.params.id, 10);
  const oldA = storage.getAppointments().find((x) => x.id === id);
  const oldStatus = oldA?.status;
  const updated = storage.updateAppointment(id, { status: req.body.status });
  if (!updated) return res.status(404).json({ error: "Navbat topilmadi" });
  broadcastSSE("appointment:updated", { id: updated.id, appointment: updated });

  // Agar qabul yakunlangan bo'lsa ('completed'), navbatdagi keyingi bemorlarga xabar beriladi
  if (req.body.status === "completed" && oldStatus !== "completed") {
    notifyQueueProgressAfterCompletion(
      updated as any,
      storage.getPatients() as any,
      storage.getAppointments() as any
    ).catch((err) => console.error("notifyQueueProgressAfterCompletion error:", err));
  }

  res.json({ appointment: updated });
});

app.delete("/api/appointments/:id", (req, res) => {
  const id = parseInt(req.params.id, 10);
  storage.deleteAppointment(id);
  broadcastSSE("appointment:deleted", { id });
  res.json({ ok: true });
});

// 4.1. Badge hisoblagichlari (CRM tugmachalarida yangiliklar sonini ko'rsatish)
app.get("/api/badges", (req, res) => {
  const openComplaints = storage.getComplaints().filter((c) => c.status === "open").length;
  const pendingReminders = storage.getReminders().filter((r) => r.status === "pending").length;
  const todayAppts = storage.getAppointments().filter((a) => a.date === todayStr && a.status !== "cancelled");
  const newPatientsToday = storage.getPatients().filter((p) => p.created_at === todayStr).length;
  const pendingUserRequests = storage.getPendingUsers().length;

  res.json({
    complaints: openComplaints,
    reminders: pendingReminders,
    appointments: todayAppts.length,
    patients: newPatientsToday,
    requests: pendingUserRequests,
  });
});

// 5. Visits & Procedures
app.get("/api/visits", (req, res) => {
  res.json({ visits: storage.getVisits() });
});

app.post("/api/visits", (req, res) => {
  const b = req.body;
  const p = storage.getPatients().find((x) => x.id === parseInt(b.patient_id, 10));
  const s = storage.getStaff().find((x) => x.id === parseInt(b.staff_id, 10));
  const initStaff = b.initial_staff_id ? storage.getStaff().find((st) => st.id === parseInt(b.initial_staff_id, 10)) : null;
  const finStaff = b.final_staff_id ? storage.getStaff().find((st) => st.id === parseInt(b.final_staff_id, 10)) : null;

  const newV = storage.addVisit({
    patient_id: parseInt(b.patient_id, 10),
    patient_name: p ? p.full_name : "Bemor",
    staff_id: b.staff_id ? parseInt(b.staff_id, 10) : (initStaff ? initStaff.id : null),
    staff_name: s ? s.full_name : (initStaff ? initStaff.full_name : ""),
    initial_staff_id: initStaff ? initStaff.id : (b.staff_id ? parseInt(b.staff_id, 10) : null),
    initial_staff_name: initStaff ? initStaff.full_name : (s ? s.full_name : ""),
    final_staff_id: finStaff ? finStaff.id : null,
    final_staff_name: finStaff ? finStaff.full_name : "",
    complaint: b.complaint || "",
    diagnosis: b.diagnosis || "",
    recommendations: b.recommendations || "",
    visit_date: dayjs().format("YYYY-MM-DD"),
  });

  // Add procedures
  if (Array.isArray(b.procedures)) {
    b.procedures.forEach((pr: { service_id: number; tooth: string; price: number; initial_staff_id?: number; final_staff_id?: number }) => {
      const svc = storage.getServices().find((item) => item.id === pr.service_id);
      storage.addProcedure({
        patient_id: newV.patient_id,
        service_id: pr.service_id || null,
        service_name: svc ? svc.name : "Xizmat",
        tooth: pr.tooth || "",
        price: Number(pr.price || 0),
        staff_id: newV.staff_id,
        staff_name: newV.staff_name,
        initial_staff_id: newV.initial_staff_id,
        initial_staff_name: newV.initial_staff_name,
        final_staff_id: newV.final_staff_id,
        final_staff_name: newV.final_staff_name,
        procedure_date: newV.visit_date,
      });
    });
  }

  res.json({ visit: newV });
});

app.delete("/api/visits/:id", (req, res) => {
  const id = parseInt(req.params.id, 10);
  const ok = storage.deleteVisit(id);
  if (!ok) return res.status(404).json({ error: "Qabul topilmadi" });
  broadcastSSE("visit:deleted", { id });
  broadcastSSE("clinic:sse", { type: "visit:deleted", id });
  broadcastSSE("storage:updated", { counts: storage.getCloudStatus() });
  res.json({ ok: true });
});

// Procedures CRUD
app.get("/api/procedures", (req, res) => {
  let list = storage.getProcedures();
  if (req.query.from && req.query.to) {
    const from = String(req.query.from);
    const to = String(req.query.to);
    list = list.filter((p) => p.procedure_date >= from && p.procedure_date <= to);
  }
  if (req.query.patient_id) {
    const pid = parseInt(String(req.query.patient_id), 10);
    list = list.filter((p) => p.patient_id === pid);
  }
  if (req.query.staff_id) {
    const sid = parseInt(String(req.query.staff_id), 10);
    list = list.filter((p) => p.staff_id === sid || p.initial_staff_id === sid || p.final_staff_id === sid);
  }
  const patients = storage.getPatients();
  const enriched = list.map((p) => {
    const pat = patients.find((pt) => pt.id === p.patient_id);
    return {
      ...p,
      patient_name: pat ? pat.full_name : "Bemor",
    };
  });
  res.json({ procedures: enriched });
});

app.post("/api/procedures", (req, res) => {
  const b = req.body;
  if (!b.patient_id) return res.status(400).json({ error: "Bemor ID talab qilinadi" });
  const svc = b.service_id ? storage.getServices().find((s) => s.id === parseInt(b.service_id, 10)) : null;
  const staff = b.staff_id ? storage.getStaff().find((s) => s.id === parseInt(b.staff_id, 10)) : null;
  const initStaff = b.initial_staff_id ? storage.getStaff().find((st) => st.id === parseInt(b.initial_staff_id, 10)) : null;
  const finStaff = b.final_staff_id ? storage.getStaff().find((st) => st.id === parseInt(b.final_staff_id, 10)) : null;

  const newP = storage.addProcedure({
    patient_id: parseInt(b.patient_id, 10),
    service_id: b.service_id ? parseInt(b.service_id, 10) : null,
    service_name: svc ? svc.name : b.service_name || "Muolaja",
    tooth: b.tooth || "",
    price: Number(b.price || (svc ? svc.price : 0)),
    staff_id: b.staff_id ? parseInt(b.staff_id, 10) : (initStaff ? initStaff.id : null),
    staff_name: staff ? staff.full_name : (initStaff ? initStaff.full_name : b.staff_name || ""),
    initial_staff_id: initStaff ? initStaff.id : (staff ? staff.id : null),
    initial_staff_name: initStaff ? initStaff.full_name : (staff ? staff.full_name : ""),
    final_staff_id: finStaff ? finStaff.id : null,
    final_staff_name: finStaff ? finStaff.full_name : "",
    split_ratio: b.split_ratio !== undefined ? Number(b.split_ratio) : 50,
    procedure_date: b.procedure_date || dayjs().format("YYYY-MM-DD"),
  });

  broadcastSSE("procedure:new", newP);
  broadcastSSE("clinic:sse", { type: "procedure:new", procedure: newP });
  broadcastSSE("storage:updated", { counts: storage.getCloudStatus() });
  res.json({ procedure: newP });
});

app.put("/api/procedures/:id", (req, res) => {
  const id = parseInt(req.params.id, 10);
  const b = req.body;
  const svc = b.service_id ? storage.getServices().find((s) => s.id === parseInt(b.service_id, 10)) : null;
  const staff = b.staff_id ? storage.getStaff().find((s) => s.id === parseInt(b.staff_id, 10)) : null;

  const patch: any = {};
  if (b.service_name !== undefined) patch.service_name = b.service_name;
  else if (svc) patch.service_name = svc.name;
  if (b.tooth !== undefined) patch.tooth = b.tooth;
  if (b.price !== undefined) patch.price = Number(b.price || 0);
  if (b.initial_staff_id !== undefined) {
    patch.initial_staff_id = b.initial_staff_id ? parseInt(b.initial_staff_id, 10) : null;
    const is = storage.getStaff().find((s) => s.id === patch.initial_staff_id);
    patch.initial_staff_name = is ? is.full_name : "";
  }
  if (b.final_staff_id !== undefined) {
    patch.final_staff_id = b.final_staff_id ? parseInt(b.final_staff_id, 10) : null;
    const fs = storage.getStaff().find((s) => s.id === patch.final_staff_id);
    patch.final_staff_name = fs ? fs.full_name : "";
  }
  if (b.split_ratio !== undefined) patch.split_ratio = Number(b.split_ratio);
  if (b.procedure_date !== undefined) patch.procedure_date = b.procedure_date;

  const updated = storage.updateProcedure(id, patch);
  if (!updated) return res.status(404).json({ error: "Muolaja topilmadi" });
  broadcastSSE("procedure:updated", updated);
  broadcastSSE("clinic:sse", { type: "procedure:updated", procedure: updated });
  broadcastSSE("storage:updated", { counts: storage.getCloudStatus() });
  res.json({ procedure: updated });
});

app.delete("/api/procedures/:id", (req, res) => {
  const id = parseInt(req.params.id, 10);
  const ok = storage.deleteProcedure(id);
  if (!ok) return res.status(404).json({ error: "Muolaja topilmadi" });
  broadcastSSE("procedure:deleted", { id });
  broadcastSSE("clinic:sse", { type: "procedure:deleted", id });
  broadcastSSE("storage:updated", { counts: storage.getCloudStatus() });
  res.json({ ok: true });
});

// 6. Services & Categories
app.get("/api/services", (req, res) => {
  const includeInactive = req.query.includeInactive === "1";
  const list = includeInactive ? storage.getServices() : storage.getServices().filter((s) => s.active);
  res.json({ services: list });
});

app.get("/api/services/categories", (req, res) => {
  const services = storage.getServices();
  const catMap = new Map<string, number>();
  services.forEach((s) => {
    const c = s.category || "Umumiy";
    catMap.set(c, (catMap.get(c) || 0) + 1);
  });
  const categories = Array.from(catMap.entries()).map(([name, count]) => ({
    name,
    count,
  }));
  res.json({ categories });
});

app.post("/api/services/categories/rename", (req, res) => {
  const { oldName, newName } = req.body;
  if (!oldName || !newName) {
    return res.status(400).json({ error: "Eski va yangi kategoriya nomi talab qilinadi" });
  }
  const count = storage.renameServiceCategory(oldName.trim(), newName.trim());
  res.json({ ok: true, updatedCount: count, newCategory: newName.trim() });
});

app.delete("/api/services/categories/:name", (req, res) => {
  const categoryName = decodeURIComponent(req.params.name);
  const count = storage.deleteServiceCategory(categoryName);
  res.json({ ok: true, movedToGeneralCount: count });
});

app.post("/api/services", (req, res) => {
  const { name, category, price } = req.body;
  const services = storage.getServices();
  const newS: Service = {
    id: services.length ? Math.max(...services.map((x) => x.id)) + 1 : 1,
    name,
    category: category || "Umumiy",
    price: Number(price || 0),
    active: true,
  };
  services.push(newS);
  storage.save();
  res.json({ service: newS });
});

app.put("/api/services/:id", (req, res) => {
  const id = parseInt(req.params.id, 10);
  const s = storage.getServices().find((x) => x.id === id);
  if (!s) return res.status(404).json({ error: "Xizmat topilmadi" });
  Object.assign(s, req.body);
  storage.save();
  res.json({ service: s });
});

app.delete("/api/services/:id", (req, res) => {
  const id = parseInt(req.params.id, 10);
  const services = storage.getServices();
  const idx = services.findIndex((x) => x.id === id);
  if (idx !== -1) {
    services.splice(idx, 1);
    storage.save();
  }
  res.json({ ok: true });
});

// 7. Staff
app.get("/api/staff", (req, res) => {
  res.json({ staff: storage.getStaff() });
});

app.post("/api/staff", (req, res) => {
  const { full_name, position, phone, telegram_username, salary_pct, salary_fixed } = req.body;
  if (!full_name || !String(full_name).trim()) {
    return res.status(400).json({ error: "Xodim F.I.Sh. kiritilishi shart" });
  }
  const newS = storage.addStaff({
    full_name: full_name.trim(),
    position: position || "doctor",
    phone: phone || "",
    telegram_username: (telegram_username || "").replace(/^@/, "").trim(),
    salary_pct: Number(salary_pct || 0),
    salary_fixed: Number(salary_fixed || 0),
    active: true,
  });
  broadcastSSE("staff:new", { staff: newS });
  broadcastSSE("clinic:sse", { type: "staff:new", staff: newS });
  res.json({ staff: newS });
});

app.put("/api/staff/:id", (req, res) => {
  const id = parseInt(req.params.id, 10);
  const updated = storage.updateStaff(id, req.body);
  if (!updated) return res.status(404).json({ error: "Xodim topilmadi" });
  broadcastSSE("staff:updated", { staff: updated });
  broadcastSSE("clinic:sse", { type: "staff:updated", staff: updated });
  res.json({ staff: updated });
});

app.delete("/api/staff/:id", (req, res) => {
  const id = parseInt(req.params.id, 10);
  const ok = storage.deleteStaff(id);
  if (!ok) return res.status(404).json({ error: "Xodim topilmadi" });
  broadcastSSE("staff:deleted", { id });
  broadcastSSE("clinic:sse", { type: "staff:deleted", id });
  res.json({ ok: true });
});

// 8. Finance (Transactions)
app.get("/api/transactions", (req, res) => {
  let list = storage.getTransactions();
  if (req.query.from && req.query.to) {
    const from = String(req.query.from);
    const to = String(req.query.to);
    list = list.filter((t) => t.tx_date >= from && t.tx_date <= to);
  } else if (req.query.date) {
    list = list.filter((t) => t.tx_date === String(req.query.date));
  } else if (req.query.all !== "true") {
    list = list.filter((t) => t.tx_date === todayStr);
  }

  const procs = storage.getProcedures();
  const visits = storage.getVisits();
  const appts = storage.getAppointments();

  // Bajaruvchi shifokor ma'lumotini to'ldirish (agar saqlanmagan bo'lsa bemor muolajalari/tashriflaridan aniqlash)
  const enriched = list.map((t) => {
    if (t.staff_name) return t;
    if (t.patient_id) {
      const proc =
        procs.find((p) => p.patient_id === t.patient_id && p.procedure_date === t.tx_date) ||
        procs.find((p) => p.patient_id === t.patient_id);
      if (proc) {
        return {
          ...t,
          staff_id: proc.staff_id || proc.initial_staff_id,
          staff_name: proc.staff_name || proc.initial_staff_name,
        };
      }
      const v = visits.find((x) => x.patient_id === t.patient_id);
      if (v) {
        return {
          ...t,
          staff_id: v.staff_id || v.initial_staff_id,
          staff_name: v.staff_name || v.initial_staff_name,
        };
      }
      const a = appts.find((x) => x.patient_name === t.patient_name && x.date === t.tx_date);
      if (a) {
        return {
          ...t,
          staff_id: a.staff_id,
          staff_name: a.staff_name,
        };
      }
    }
    return t;
  });

  const income = enriched.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
  const expense = enriched.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);
  res.json({ transactions: enriched, totals: { income, expense } });
});

app.post("/api/transactions", (req, res) => {
  const b = req.body;
  const p = b.patient_id ? storage.getPatients().find((x) => x.id === parseInt(b.patient_id, 10)) : null;
  const staff = b.staff_id ? storage.getStaff().find((s) => s.id === parseInt(b.staff_id, 10)) : null;

  // Agar shifokor ko'rsatilmagan bo'lsa va bemor bo'lsa, oxirgi muolajadan topish
  let autoStaffId = b.staff_id ? parseInt(b.staff_id, 10) : null;
  let autoStaffName = staff ? staff.full_name : (b.staff_name || undefined);
  if (!autoStaffName && b.patient_id) {
    const lastProc = storage.getProcedures().find((proc) => proc.patient_id === parseInt(b.patient_id, 10));
    if (lastProc) {
      autoStaffId = lastProc.staff_id || lastProc.initial_staff_id || null;
      autoStaffName = lastProc.staff_name || lastProc.initial_staff_name || undefined;
    }
  }

  const newT = storage.addTransaction({
    type: b.type === "expense" ? "expense" : "income",
    amount: Number(b.amount || 0),
    category: b.category || (b.type === "expense" ? "material" : "payment"),
    method: b.method || "cash",
    patient_id: b.patient_id ? parseInt(b.patient_id, 10) : null,
    patient_name: p ? p.full_name : (b.patient_name || undefined),
    staff_id: autoStaffId,
    staff_name: autoStaffName,
    comment: b.comment || "",
    tx_date: b.tx_date || todayStr,
  });
  broadcastSSE("transaction:new", newT);
  broadcastSSE("clinic:sse", { type: "transaction:new", transaction: newT });
  broadcastSSE("storage:updated", { counts: storage.getCloudStatus() });
  res.json({ transaction: newT });
});

app.put("/api/transactions/:id", (req, res) => {
  const id = parseInt(req.params.id, 10);
  const b = req.body;
  const p = b.patient_id ? storage.getPatients().find((x) => x.id === parseInt(b.patient_id, 10)) : null;
  const patch: Partial<Transaction> = {};
  if (b.type !== undefined) patch.type = b.type;
  if (b.amount !== undefined) patch.amount = Number(b.amount || 0);
  if (b.category !== undefined) patch.category = b.category;
  if (b.method !== undefined) patch.method = b.method;
  if (b.comment !== undefined) patch.comment = b.comment;
  if (b.tx_date !== undefined) patch.tx_date = b.tx_date;
  if (b.patient_id !== undefined) {
    patch.patient_id = b.patient_id ? parseInt(b.patient_id, 10) : null;
    patch.patient_name = p ? p.full_name : undefined;
  }
  if (b.staff_id !== undefined) {
    patch.staff_id = b.staff_id ? parseInt(b.staff_id, 10) : null;
    const staff = b.staff_id ? storage.getStaff().find((s) => s.id === parseInt(b.staff_id, 10)) : null;
    patch.staff_name = staff ? staff.full_name : (b.staff_name || undefined);
  }

  const updated = storage.updateTransaction(id, patch);
  if (!updated) return res.status(404).json({ error: "Tranzaksiya topilmadi" });
  broadcastSSE("transaction:updated", updated);
  broadcastSSE("clinic:sse", { type: "transaction:updated", transaction: updated });
  broadcastSSE("storage:updated", { counts: storage.getCloudStatus() });
  res.json({ transaction: updated });
});

app.delete("/api/transactions/:id", (req, res) => {
  const id = parseInt(req.params.id, 10);
  const ok = storage.deleteTransaction(id);
  if (ok) {
    broadcastSSE("transaction:deleted", { id });
    broadcastSSE("clinic:sse", { type: "transaction:deleted", id });
    broadcastSSE("storage:updated", { counts: storage.getCloudStatus() });
  }
  res.json({ ok });
});

// Muolaja ulushini o'zgartirish (agar 2 kishi bajargan bo'lsa: 50/50, 60/40, 70/30 yoki ixtiyoriy)
app.put("/api/procedures/:id/split", (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { split_ratio, initial_staff_id, initial_staff_name, final_staff_id, final_staff_name } = req.body;
  const patch: Partial<Procedure> = {};
  if (split_ratio !== undefined) patch.split_ratio = Number(split_ratio);
  if (initial_staff_id !== undefined) patch.initial_staff_id = initial_staff_id ? Number(initial_staff_id) : null;
  if (initial_staff_name !== undefined) patch.initial_staff_name = initial_staff_name;
  if (final_staff_id !== undefined) patch.final_staff_id = final_staff_id ? Number(final_staff_id) : null;
  if (final_staff_name !== undefined) patch.final_staff_name = final_staff_name;

  const updated = storage.updateProcedure(id, patch);
  if (!updated) return res.status(404).json({ error: "Muolaja topilmadi" });
  broadcastSSE("procedure:updated", updated);
  broadcastSSE("clinic:sse", { type: "procedure:updated", procedure: updated });
  broadcastSSE("storage:updated", { counts: storage.getCloudStatus() });
  res.json({ ok: true, procedure: updated });
});

// 9. Reports
app.get("/api/reports/finance", (req, res) => {
  const from = req.query.from ? String(req.query.from) : "2026-01-01";
  const to = req.query.to ? String(req.query.to) : "2026-12-31";

  const txs = storage.getTransactions().filter((t) => t.tx_date >= from && t.tx_date <= to);
  const procs = storage.getProcedures().filter((p) => p.procedure_date >= from && p.procedure_date <= to);
  const newPts = storage.getPatients().filter((p) => p.created_at >= from && p.created_at <= to);

  const income = txs.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
  const expense = txs.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);
  const procedures_total = procs.reduce((s, p) => s + p.price, 0);

  res.json({
    income,
    expense,
    profit: income - expense,
    procedures_total,
    new_patients: newPts.length,
  });
});

app.get("/api/reports/doctor-stats", (req, res) => {
  const from = req.query.from ? String(req.query.from) : "2026-01-01";
  const to = req.query.to ? String(req.query.to) : "2026-12-31";

  const doctors = storage.getStaff().filter((s) => s.position === "doctor" || s.position === "assistant");
  const procs = storage.getProcedures().filter((p) => p.procedure_date >= from && p.procedure_date <= to);
  const appts = storage.getAppointments().filter((a) => a.date >= from && a.date <= to);

  const stats = doctors.map((doc) => {
    let procCount = 0;
    let procSum = 0;
    let jointCount = 0;
    let soloCount = 0;

    procs.forEach((p) => {
      const isPrimary = p.staff_id === doc.id || p.initial_staff_id === doc.id;
      const isFinal = p.final_staff_id === doc.id && p.final_staff_id !== (p.initial_staff_id || p.staff_id);

      if (isPrimary && isFinal) {
        // Ayni bir shifokor 2 martalab tanlangan bo'lsa
        procCount += 1;
        soloCount += 1;
        procSum += p.price;
      } else if (isPrimary && p.final_staff_id && p.final_staff_id !== (p.initial_staff_id || p.staff_id)) {
        // 2 kishi bajargan: boshlovchi shifokor ulushi
        const ratio = p.split_ratio !== undefined ? p.split_ratio : 50;
        procCount += 1;
        jointCount += 1;
        procSum += Math.round((p.price * ratio) / 100);
      } else if (isFinal) {
        // 2 kishi bajargan: yakunlovchi / yordamchi shifokor ulushi
        const ratio = p.split_ratio !== undefined ? p.split_ratio : 50;
        const assistRatio = 100 - ratio;
        procCount += 1;
        jointCount += 1;
        procSum += Math.round((p.price * assistRatio) / 100);
      } else if (isPrimary) {
        // 1 kishi bajargan yagona ish
        procCount += 1;
        soloCount += 1;
        procSum += p.price;
      }
    });

    const docAppts = appts.filter((a) => a.staff_id === doc.id);
    const completed = docAppts.filter((a) => a.status === "completed").length;

    return {
      staff_id: doc.id,
      full_name: doc.full_name,
      position: doc.position,
      procedures_count: procCount,
      procedures_total: procSum,
      joint_procedures_count: jointCount,
      solo_procedures_count: soloCount,
      appointments_total: docAppts.length,
      appointments_completed: completed,
    };
  });

  res.json({ stats });
});

app.get("/api/reports/excel", async (req, res) => {
  const kind = String(req.query.kind || "finance");
  const from = String(req.query.from || todayStr);
  const to = String(req.query.to || todayStr);

  try {
    if (kind === "finance") {
      const procs = storage.getProcedures();
      const txRows = storage.getTransactions()
        .filter((t) => t.tx_date >= from && t.tx_date <= to)
        .map((t) => {
          let doctor = t.staff_name;
          if (!doctor && t.patient_id) {
            const p = procs.find((proc) => proc.patient_id === t.patient_id);
            if (p) doctor = p.staff_name || p.initial_staff_name;
          }
          return {
            tx_date: t.tx_date,
            type: t.type,
            category: t.category,
            amount: t.amount,
            method: t.method,
            patient: t.patient_name || "",
            doctor: doctor || "—",
            comment: t.comment || "",
          };
        });

      const wb = createFinanceExcel(txRows, from, to);
      const buffer = await wb.xlsx.writeBuffer();

      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="Moliya_${from}_${to}.xlsx"`);
      return res.send(buffer);
    } else {
      const doctors = storage.getStaff().filter((s) => s.position === "doctor" || s.position === "assistant");
      const procs = storage.getProcedures().filter((p) => p.procedure_date >= from && p.procedure_date <= to);

      const rows = doctors.map((doc) => {
        let docTotal = 0;
        let docCount = 0;

        procs.forEach((p) => {
          const isPrimary = p.staff_id === doc.id || p.initial_staff_id === doc.id;
          const isFinal = p.final_staff_id === doc.id && p.final_staff_id !== (p.initial_staff_id || p.staff_id);

          if (isPrimary && isFinal) {
            docCount += 1;
            docTotal += p.price;
          } else if (isPrimary && p.final_staff_id && p.final_staff_id !== (p.initial_staff_id || p.staff_id)) {
            const ratio = p.split_ratio !== undefined ? p.split_ratio : 50;
            docCount += 1;
            docTotal += Math.round((p.price * ratio) / 100);
          } else if (isFinal) {
            const ratio = p.split_ratio !== undefined ? p.split_ratio : 50;
            docCount += 1;
            docTotal += Math.round((p.price * (100 - ratio)) / 100);
          } else if (isPrimary) {
            docCount += 1;
            docTotal += p.price;
          }
        });

        return {
          full_name: doc.full_name,
          position: doc.position,
          ishlar_soni: docCount,
          umumiy_summa: docTotal,
        };
      });

      const wb = createDoctorStatsExcel(rows, from, to);
      const buffer = await wb.xlsx.writeBuffer();

      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="Shifokorlar_${from}_${to}.xlsx"`);
      return res.send(buffer);
    }
  } catch (err: any) {
    console.error("Excel generation error:", err);
    res.status(500).json({ error: "Excel hisobot yaratishda xatolik yuz berdi" });
  }
});

// 10. Reminders
app.get("/api/reminders", (req, res) => {
  res.json({ reminders: storage.getReminders() });
});

app.post("/api/reminders", (req, res) => {
  const b = req.body;
  const p = storage.getPatients().find((x) => x.id === parseInt(b.patient_id, 10));
  const newR = storage.addReminder({
    patient_id: parseInt(b.patient_id, 10),
    patient_name: p ? p.full_name : "Bemor",
    phone: p ? p.phone : "",
    telegram_id: p ? p.telegram_id : undefined,
    due_date: b.due_date || todayStr,
    reason: b.reason,
    status: "pending",
  });
  res.json({ reminder: newR });
});

app.put("/api/reminders/:id", (req, res) => {
  const id = parseInt(req.params.id, 10);
  const b = req.body;
  const patch: Partial<Reminder> = {};
  if (b.patient_id) {
    patch.patient_id = parseInt(b.patient_id, 10);
    const p = storage.getPatients().find((x) => x.id === patch.patient_id);
    if (p) {
      patch.patient_name = p.full_name;
      patch.phone = p.phone;
      patch.telegram_id = p.telegram_id;
    }
  }
  if (b.due_date) patch.due_date = b.due_date;
  if (b.reason !== undefined) patch.reason = b.reason;
  if (b.status !== undefined) patch.status = b.status;

  const updated = storage.updateReminder(id, patch);
  if (!updated) return res.status(404).json({ error: "Eslatma topilmadi" });
  res.json({ reminder: updated });
});

app.put("/api/reminders/:id/status", (req, res) => {
  const id = parseInt(req.params.id, 10);
  const updated = storage.updateReminder(id, { status: req.body.status });
  if (!updated) return res.status(404).json({ error: "Eslatma topilmadi" });
  res.json({ reminder: updated });
});

app.delete("/api/reminders/:id", (req, res) => {
  const id = parseInt(req.params.id, 10);
  const ok = storage.deleteReminder(id);
  res.json({ ok });
});

app.post("/api/reminders/:id/send", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const r = storage.getReminders().find((x) => x.id === id);
  if (!r) return res.status(404).json({ error: "Eslatma topilmadi" });
  let delivered = false;
  if (r.telegram_id) {
    delivered = await sendReminderTelegram(r.telegram_id, r.reason);
  }
  r.status = "sent";
  storage.save();
  res.json({ ok: true, delivered });
});

// 11. Complaints
app.get("/api/complaints", (req, res) => {
  res.json({ complaints: storage.getComplaints() });
});

app.post("/api/complaints", (req, res) => {
  const b = req.body;
  const p = b.patient_id ? storage.getPatients().find((x) => x.id === parseInt(b.patient_id, 10)) : null;
  const newC = storage.addComplaint({
    patient_id: b.patient_id ? parseInt(b.patient_id, 10) : undefined,
    patient_name: b.patient_name || (p ? p.full_name : "Bemor"),
    telegram_id: b.telegram_id || (p ? p.telegram_id : undefined),
    message: b.message || "",
    status: b.status || "open",
  });
  broadcastSSE("complaint:new", { id: newC.id, patient_name: newC.patient_name, message: newC.message });
  res.json({ complaint: newC });
});

app.put("/api/complaints/:id", (req, res) => {
  const id = parseInt(req.params.id, 10);
  const updated = storage.updateComplaint(id, req.body);
  if (!updated) return res.status(404).json({ error: "Shikoyat topilmadi" });
  res.json({ complaint: updated });
});

app.put("/api/complaints/:id/status", (req, res) => {
  const id = parseInt(req.params.id, 10);
  const updated = storage.updateComplaint(id, { status: req.body.status });
  if (!updated) return res.status(404).json({ error: "Shikoyat topilmadi" });
  res.json({ complaint: updated });
});

app.delete("/api/complaints/:id", (req, res) => {
  const id = parseInt(req.params.id, 10);
  const ok = storage.deleteComplaint(id);
  res.json({ ok });
});

app.post("/api/complaints/:id/reply", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const c = storage.getComplaints().find((x) => x.id === id);
  if (!c) return res.status(404).json({ error: "Shikoyat topilmadi" });
  const replyText = String(req.body.reply || "").trim();
  c.reply_text = replyText;
  c.status = "closed";
  storage.save();
  let delivered = false;
  if (c.telegram_id) {
    delivered = await sendPatientTelegramMessage(c.telegram_id, `Shikoyatingiz yuzasidan javob:\n\n${replyText}`);
  }
  res.json({ ok: true, delivered, complaint: c });
});

// 12. SSE Event Stream
app.get("/api/events", sseHandler);

// Health check for Render and external uptime pingers
app.get(["/health", "/api/health"], (_req, res) => {
  res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
});

// 13. Telegram Bot Webhook Endpoint (Express)
app.use("/api/telegram/webhook", (req, res) => {
  const mw = getTelegramWebhookMiddleware();
  if (mw) {
    return mw(req, res);
  }
  res.status(503).json({ error: "Telegram bot is not active" });
});

// 14. Telegram Bot Status, Settings, Webhook & Actions
app.get("/api/telegram/settings", (req, res) => {
  const s = storage.getClinicSettings();
  const info = getBotInfo();
  res.json({
    ...s,
    configured: info.configured,
    running: info.running,
    botUsername: info.botUsername,
    webhookActive: info.webhookActive,
    webhookUrl: info.webhookUrl,
  });
});

app.post("/api/telegram/configure", async (req, res) => {
  const { botToken, clinicName, clinicPhone, clinicTg } = req.body;
  const updated = storage.updateClinicSettings({
    botToken: botToken !== undefined ? String(botToken).trim() : undefined,
    clinicName: clinicName !== undefined ? String(clinicName).trim() : undefined,
    clinicPhone: clinicPhone !== undefined ? String(clinicPhone).trim() : undefined,
    clinicTg: clinicTg !== undefined ? String(clinicTg).trim() : undefined,
  });
  const botRes = await restartTelegramBot(undefined, updated.botToken);
  res.json({ ok: true, settings: updated, bot: botRes });
});

app.get("/api/telegram/status", async (req, res) => {
  const webhook = await getBotWebhookStatus();
  const settings = storage.getClinicSettings();
  res.json({
    ...getBotInfo(),
    clinicName: settings.clinicName || CLINIC_NAME,
    clinicPhone: settings.clinicPhone || CLINIC_PHONE,
    clinicTg: settings.clinicTg || CLINIC_TG,
    webhook,
  });
});

app.get("/api/telegram/webhook-info", async (req, res) => {
  const status = await getBotWebhookStatus();
  res.json(status);
});

app.post("/api/telegram/set-webhook", async (req, res) => {
  const targetUrl = req.body.url || (process.env.APP_URL ? `${process.env.APP_URL.replace(/\/+$/, "")}/api/telegram/webhook` : "");
  if (!targetUrl) {
    return res.status(400).json({ ok: false, message: "Webhook URL manzili talab qilinadi" });
  }
  const result = await setBotWebhook(targetUrl);
  res.json(result);
});

app.post("/api/telegram/switch-polling", async (req, res) => {
  const result = await switchToPolling();
  res.json(result);
});

app.post("/api/telegram/test-notify", async (req, res) => {
  const count = await triggerManualCheck({
    getAppointments: () => storage.getAppointments() as any,
    getPatients: () => storage.getPatients() as any,
    getReminders: () => storage.getReminders() as any,
  });
  res.json({ ok: true, notifiedCount: count });
});

// Start Server with Vite Middleware
async function startServer() {
  // 1. Bulutli bazani (Firestore 24/7) yuklash
  try {
    await storage.initCloudSync();
  } catch (e: any) {
    console.warn("Dastlabki bulut sinxronizatsiyasida ogohlantirish:", e.message);
  }

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`🦷 Dental Clinic Server running on http://localhost:${PORT}`);
    console.log(`   Baza: 24/7 Doimiy Google Cloud Firestore + Local Cache`);
    console.log(`   Ish vaqti: 09:00 - 18:00`);
    console.log(`   Vaqt zonasi: ${TZ}`);
    console.log(`   Klinika: ${CLINIC_NAME}`);
    
    // Telegram Botni doimiy saqlash bazasi bilan ishga tushirish
    initTelegramBot({
      getPatients: () => storage.getPatients() as BotPatient[],
      createPatient: (p) => {
        const newP = storage.addPatient(p as any) as BotPatient;
        broadcastSSE("patient:new", {
          id: newP.id,
          name: newP.full_name,
          full_name: newP.full_name,
          phone: newP.phone,
          source: "telegram",
        });
        broadcastSSE("clinic:sse", { type: "patient:new", patient: newP });
        broadcastSSE("storage:updated", { counts: storage.getCloudStatus() });
        return newP;
      },
      updatePatient: (id, patch) => {
        const updated = storage.updatePatient(id, patch as any) as BotPatient | null;
        if (updated) {
          broadcastSSE("patient:updated", { id, patient: updated });
          broadcastSSE("clinic:sse", { type: "patient:updated", patient: updated });
          broadcastSSE("storage:updated", { counts: storage.getCloudStatus() });
        }
        return updated;
      },
      linkPatientTelegram: (patientId, tgId, username) => {
        const linked = storage.linkPatientTelegram(patientId, tgId, username) as BotPatient | null;
        if (linked) {
          broadcastSSE("patient:telegram_linked", { patient_id: patientId, telegram_id: tgId, telegram_username: username });
          broadcastSSE("patient:updated", { id: patientId, patient: linked });
          broadcastSSE("clinic:sse", { type: "patient:linked", patient: linked });
          broadcastSSE("storage:updated", { counts: storage.getCloudStatus() });
        }
        return linked;
      },
      findPatientByConnectCode: (code) => storage.findPatientByConnectCode(code) as BotPatient | null,
      findPatientByPhone: (phone) => storage.findPatientByPhone(phone) as BotPatient | null,
      getAppointments: () => storage.getAppointments() as BotAppointment[],
      createAppointment: (a) => {
        const newA = storage.addAppointment(a as any) as BotAppointment;
        broadcastSSE("appointment:new", {
          id: newA.id,
          patient: newA.patient_name,
          doctor: newA.staff_name,
          date: newA.date,
          time: newA.time,
          source: "telegram",
        });
        broadcastSSE("clinic:sse", { type: "appointment:new", appointment: newA });
        broadcastSSE("storage:updated", { counts: storage.getCloudStatus() });
        return newA;
      },
      updateAppointment: (id, patch) => {
        const updated = storage.updateAppointment(id, patch as any) as BotAppointment | null;
        if (updated) {
          broadcastSSE("appointment:updated", { id, appointment: updated });
          broadcastSSE("clinic:sse", { type: "appointment:updated", appointment: updated });
          broadcastSSE("storage:updated", { counts: storage.getCloudStatus() });
        }
        return updated;
      },
      getStaff: () => storage.getStaff() as BotStaff[],
      createComplaint: (c) => {
        const newC = storage.addComplaint(c as any);
        broadcastSSE("complaint:new", { id: newC.id, patient_name: newC.patient_name, message: newC.message });
        broadcastSSE("clinic:sse", { type: "complaint:new", complaint: newC });
        broadcastSSE("storage:updated", { counts: storage.getCloudStatus() });
      },
      broadcast: (ev, data) => {
        broadcastSSE(ev, data);
        broadcastSSE("clinic:sse", { type: ev, data });
      },
    });

    // 24/7 Server va Bot Keep-Alive (Cloud Run konteyneri uxlamasligi va bot doim hushyor turishi uchun har 3 daqiqada self-ping)
    setInterval(() => {
      fetch(`http://localhost:${PORT}/api/health`).catch(() => {});
    }, 3 * 60 * 1000);

    // Rejalashtirilgan vazifalar (Cron)
    startCron({
      getAppointments: () => storage.getAppointments() as any,
      getPatients: () => storage.getPatients() as any,
      getReminders: () => storage.getReminders() as any,
      onReminderSent: (id) => {
        broadcastSSE("reminder:sent", { id });
      },
    });
  });
}

startServer();
