/**
 * App.jsx — asosiy ilova: login → sidebar → sahifalar
 */

import React, { useState, useEffect } from "react";
import { signInWithPopup } from "firebase/auth";
import { auth, googleAuthProvider } from "./lib/firebase.ts";
import { LangProvider, useLang } from "./i18n.jsx";
import { api, setAuth, setApiKey, setBaseUrl, hasToken } from "./api.js";
import { useEvents } from "./useEvents.js";
import Dashboard from "./pages/Dashboard.jsx";
import Patients from "./pages/Patients.jsx";
import Appointments from "./pages/Appointments.jsx";
import Visits from "./pages/Visits.jsx";
import AiAssistant from "./pages/AiAssistant.jsx";
import Finance from "./pages/Finance.jsx";
import Reports from "./pages/Reports.jsx";
import Reminders from "./pages/Reminders.jsx";
import Complaints from "./pages/Complaints.jsx";
import Settings from "./pages/Settings.jsx";

function AccessRequestsModal({ requests, onClose, onUpdated }) {
  const [roles, setRoles] = useState({});
  const [busyId, setBusyId] = useState(null);
  const [msg, setMsg] = useState("");

  const handleRoleChange = (id, role) => {
    setRoles((r) => ({ ...r, [id]: role }));
  };

  const approve = async (req) => {
    setBusyId(req.id);
    setMsg("");
    try {
      const assignedRole = roles[req.id] || req.role || "doctor";
      await api.post(`/api/users/${req.id}/approve`, { role: assignedRole });
      setMsg(`✅ ${req.full_name} muvaffaqiyatli tasdiqlandi va tizimga kirish ruxsati berildi.`);
      onUpdated();
    } catch (e) {
      setMsg(`❌ Xatolik: ${e.message}`);
    } finally {
      setBusyId(null);
    }
  };

  const reject = async (req) => {
    if (!confirm(`${req.full_name} so'rovini rad qilmoqchimisiz?`)) return;
    setBusyId(req.id);
    setMsg("");
    try {
      await api.post(`/api/users/${req.id}/reject`, {});
      setMsg(`❌ ${req.full_name} so'rovi rad etildi.`);
      onUpdated();
    } catch (e) {
      setMsg(`❌ Xatolik: ${e.message}`);
    } finally {
      setBusyId(null);
    }
  };

  const block = async (req) => {
    if (!confirm(`${req.full_name} hisobini bloklashni tasdiqlaysizmi? U boshqa tizimga kira olmaydi.`)) return;
    setBusyId(req.id);
    setMsg("");
    try {
      await api.post(`/api/users/${req.id}/block`, {});
      setMsg(`🚫 ${req.full_name} bloklandi.`);
      onUpdated();
    } catch (e) {
      setMsg(`❌ Xatolik: ${e.message}`);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 640 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">🔔 Google orqali ro'yxatdan o'tish so'rovlari</div>
          <button type="button" className="btn small secondary" onClick={onClose}>✕</button>
        </div>

        {msg && (
          <div
            style={{
              padding: "8px 12px",
              borderRadius: 6,
              marginBottom: 12,
              background: msg.startsWith("✅") ? "#ecfdf5" : "#fef2f2",
              color: msg.startsWith("✅") ? "#065f46" : "#991b1b",
              fontWeight: 500,
              fontSize: "0.88rem",
            }}
          >
            {msg}
          </div>
        )}

        {requests.length === 0 ? (
          <div style={{ textAlign: "center", padding: "30px 10px", color: "#64748b" }}>
            <div style={{ fontSize: "2.5rem", marginBottom: 8 }}>🎉</div>
            <div style={{ fontWeight: 600 }}>Hozirda kutilayotgan so'rovlar yo'q</div>
            <div style={{ fontSize: "0.85rem", marginTop: 4 }}>
              Yangi xodimlar Google orqali tizimga kirishga uringanda, xabar shu yerda paydo bo'ladi.
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12, maxHeight: 450, overflowY: "auto" }}>
            {requests.map((r) => {
              const currentRole = roles[r.id] || r.role || "doctor";
              const isBusy = busyId === r.id;
              return (
                <div
                  key={r.id}
                  style={{
                    border: "1px solid #e2e8f0",
                    borderRadius: 8,
                    padding: 14,
                    background: "#ffffff",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 12 }}>
                    {r.avatar_url ? (
                      <img
                        src={r.avatar_url}
                        alt=""
                        style={{ width: 44, height: 44, borderRadius: "50%", objectFit: "cover" }}
                      />
                    ) : (
                      <div
                        style={{
                          width: 44,
                          height: 44,
                          borderRadius: "50%",
                          background: "#3b82f6",
                          color: "#fff",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontWeight: 700,
                          fontSize: "1.1rem",
                        }}
                      >
                        {(r.full_name || "U")[0].toUpperCase()}
                      </div>
                    )}

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, color: "#0f172a", fontSize: "0.95rem" }}>
                        {r.full_name}
                      </div>
                      <div style={{ color: "#475569", fontSize: "0.85rem", display: "flex", alignItems: "center", gap: 6 }}>
                        <span>📧 {r.email || r.username}</span>
                      </div>
                      {r.requested_at && (
                        <div style={{ fontSize: "0.78rem", color: "#94a3b8", marginTop: 2 }}>
                          ⏰ So'rov vaqti: {new Date(r.requested_at).toLocaleString("uz-UZ")}
                        </div>
                      )}
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <label style={{ fontSize: "0.82rem", fontWeight: 600, color: "#334155" }}>Lavozim:</label>
                      <select
                        value={currentRole}
                        onChange={(e) => handleRoleChange(r.id, e.target.value)}
                        style={{ padding: "4px 8px", fontSize: "0.85rem" }}
                      >
                        <option value="doctor">👨‍⚕️ Shifokor</option>
                        <option value="accountant">💼 Buxgalter</option>
                        <option value="admin">👑 Administrator</option>
                      </select>
                    </div>
                  </div>

                  <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, borderTop: "1px solid #f1f5f9", paddingTop: 10 }}>
                    <button
                      type="button"
                      className="btn small"
                      disabled={isBusy}
                      onClick={() => approve(r)}
                      style={{ background: "#16a34a", color: "#fff", border: "none" }}
                    >
                      ✅ Tasdiqlash (Ruxsat berish)
                    </button>
                    <button
                      type="button"
                      className="btn small secondary"
                      disabled={isBusy}
                      onClick={() => reject(r)}
                    >
                      ❌ Rad qilish
                    </button>
                    <button
                      type="button"
                      className="btn small danger"
                      disabled={isBusy}
                      onClick={() => block(r)}
                    >
                      🚫 Bloklash
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="modal-actions" style={{ marginTop: 14 }}>
          <button type="button" className="btn secondary" onClick={onClose}>
            Yopish
          </button>
        </div>
      </div>
    </div>
  );
}

function Login({ onLogin }) {
  const { t } = useLang();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [serverUrl, setServerUrl] = useState(localStorage.getItem("dc_base_url") || "");
  const [apiKey, setKey] = useState(localStorage.getItem("dc_api_key") || "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [pendingUser, setPendingUser] = useState(null);
  const [checkingStatus, setCheckingStatus] = useState(false);

  // So'rov holatini tekshirish
  const checkStatus = async (showLoading = true) => {
    if (!pendingUser?.email) return;
    if (showLoading) setCheckingStatus(true);
    try {
      const res = await api.get(`/api/auth/check-status?email=${encodeURIComponent(pendingUser.email)}`);
      if (res.status === "approved" && res.token) {
        setAuth(res.token);
        onLogin(res.user);
      } else if (res.status === "rejected") {
        setError("❌ Ro'yxatdan o'tish so'rovingiz administrator tomonidan rad etilgan.");
        setPendingUser(null);
      } else if (res.status === "blocked") {
        setError("🚫 Ushbu Google hisobi administrator tomonidan bloklangan.");
        setPendingUser(null);
      }
    } catch (e) {
      console.warn("Status check failed:", e.message);
    } finally {
      if (showLoading) setCheckingStatus(false);
    }
  };

  // Agar so'rov kutilayotgan holatda bo'lsa, fon rejimida tekshirib turish
  useEffect(() => {
    if (!pendingUser) return;
    const interval = setInterval(() => checkStatus(false), 3000);
    const onSSE = (e) => {
      const detail = e.detail;
      if (
        detail?.type === "user:approved" ||
        detail?.type === "user:rejected" ||
        detail?.type === "user:blocked" ||
        detail?.type === "user:status_changed"
      ) {
        checkStatus(false);
      }
    };
    window.addEventListener("clinic:sse", onSSE);
    return () => {
      clearInterval(interval);
      window.removeEventListener("clinic:sse", onSSE);
    };
  }, [pendingUser]);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      setBaseUrl(serverUrl);
      setApiKey(apiKey);
      const res = await api.post("/api/users/login", { username, password });
      setAuth(res.token);
      onLogin(res.user);
    } catch (err) {
      setError(err.message || t("loginError"));
    } finally {
      setBusy(false);
    }
  };

  const handleGoogleLogin = async () => {
    setBusy(true);
    setError("");
    try {
      const credential = await signInWithPopup(auth, googleAuthProvider);
      const idToken = await credential.user.getIdToken();
      const res = await api.post("/api/auth/google", { idToken });
      if (res.status === "pending") {
        setPendingUser(res.user);
      } else if (res.token) {
        setAuth(res.token);
        onLogin(res.user);
      }
    } catch (err) {
      console.error("Google sign-in error:", err);
      if (err.status === "pending" || err.message?.includes("tasdiqlanganidan")) {
        setPendingUser(err.user || { email: "Google account" });
      } else {
        setError(err.message || "Google orqali tizimga kirib bo'lmadi");
      }
    } finally {
      setBusy(false);
    }
  };

  // Agar foydalanuvchi tasdiq kutayotgan bo'lsa, kutilmoqda ekrani
  if (pendingUser) {
    return (
      <div className="login-wrap">
        <div className="login-card" style={{ maxWidth: 440 }}>
          <div style={{ textAlign: "center", marginBottom: 16 }}>
            <div style={{ fontSize: "3rem", marginBottom: 8 }}>⏳</div>
            <h2 style={{ margin: "0 0 6px 0", color: "#1e293b", fontSize: "1.3rem" }}>
              Administrator tasdiqlashi kutilmoqda
            </h2>
            <div style={{ fontSize: "0.88rem", color: "#64748b" }}>
              Google hisobingiz bo'yicha so'rov yuborildi
            </div>
          </div>

          <div
            style={{
              background: "#f8fafc",
              border: "1px solid #e2e8f0",
              borderRadius: 8,
              padding: "12px 14px",
              marginBottom: 16,
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}
          >
            {pendingUser.avatar_url ? (
              <img
                src={pendingUser.avatar_url}
                alt=""
                style={{ width: 44, height: 44, borderRadius: "50%", objectFit: "cover" }}
              />
            ) : (
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: "50%",
                  background: "var(--color-primary)",
                  color: "#fff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 700,
                  fontSize: "1.1rem",
                }}
              >
                {(pendingUser.full_name || "U")[0].toUpperCase()}
              </div>
            )}
            <div style={{ overflow: "hidden" }}>
              <div style={{ fontWeight: 600, color: "#0f172a", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>
                {pendingUser.full_name || "Foydalanuvchi"}
              </div>
              <div style={{ fontSize: "0.82rem", color: "#64748b", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>
                {pendingUser.email}
              </div>
              <span
                style={{
                  display: "inline-block",
                  marginTop: 4,
                  fontSize: "0.72rem",
                  padding: "2px 8px",
                  borderRadius: 10,
                  background: "#fef3c7",
                  color: "#92400e",
                  fontWeight: 600,
                }}
              >
                ⏳ Ko'rib chiqilmoqda
              </span>
            </div>
          </div>

          <div
            style={{
              background: "#eff6ff",
              border: "1px solid #bfdbfe",
              borderRadius: 8,
              padding: "12px 14px",
              marginBottom: 20,
              fontSize: "0.85rem",
              color: "#1e40af",
              lineHeight: 1.5,
            }}
          >
            📢 <strong>Klinika ma'muriyatiga xabar yuborildi.</strong>
            <br />
            Administrator boshqaruv panelida sizning so'rovingizni tasdiqlagach, ushbu sahifa sizni darhol tizimga kiritadi.
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <button
              type="button"
              className="btn"
              disabled={checkingStatus}
              onClick={() => checkStatus(true)}
              style={{ width: "100%", justifyContent: "center", padding: "10px" }}
            >
              {checkingStatus ? "Tekshirilmoqda..." : "🔄 Holatni tekshirish"}
            </button>
            <button
              type="button"
              className="btn secondary"
              onClick={() => setPendingUser(null)}
              style={{ width: "100%", justifyContent: "center" }}
            >
              🔙 Boshqa hisob bilan kirish
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <h1>🦷 Dental Clinic</h1>
        <div className="sub">{t("appName")}</div>
        {error && <div className="error-msg mb">{error}</div>}

        <button
          type="button"
          className="btn"
          disabled={busy}
          onClick={handleGoogleLogin}
          style={{
            width: "100%",
            marginBottom: "14px",
            background: "#fff",
            color: "#374151",
            border: "1px solid #d1d5db",
            boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "8px",
            fontWeight: 600,
            padding: "10px",
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
            />
          </svg>
          Google orqali kirish / Ro'yxatdan o'tish
        </button>

        <div style={{ display: "flex", alignItems: "center", gap: "10px", margin: "10px 0 14px 0" }}>
          <div style={{ flex: 1, height: "1px", background: "#e5e7eb" }} />
          <span style={{ fontSize: "12px", color: "#9ca3af" }}>yoki xodim logini va paroli bilan</span>
          <div style={{ flex: 1, height: "1px", background: "#e5e7eb" }} />
        </div>

        <form onSubmit={submit}>
          <input
            placeholder={t("username")}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoFocus
            required
          />
          <input
            type="password"
            placeholder={t("password")}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button className="btn" disabled={busy} type="submit" style={{ width: "100%", padding: "10px" }}>
            {busy ? t("loading") : t("loginBtn")}
          </button>

          <details style={{ marginTop: 14 }}>
            <summary style={{ cursor: "pointer", color: "#64748b", fontSize: "0.85rem" }}>
              {t("connectionSettings")}
            </summary>
            <div className="form-row" style={{ marginTop: 8 }}>
              <label>{t("serverUrl")} (bo'sh qoldirilsa joriy server ishlatiladi)</label>
              <input
                placeholder="Masalan: http://localhost:4000 yoki bo'sh"
                value={serverUrl}
                onChange={(e) => setServerUrl(e.target.value)}
              />
              <label>{t("apiKey")}</label>
              <input value={apiKey} onChange={(e) => setKey(e.target.value)} />
            </div>
          </details>
        </form>
      </div>
    </div>
  );
}

const NAV = [
  { key: "dashboard", icon: "📊", page: Dashboard },
  { key: "patients", icon: "🧑‍🤝‍🧑", page: Patients },
  { key: "appointments", icon: "📅", page: Appointments },
  { key: "visits", icon: "🦷", page: Visits },
  { key: "ai", icon: "🤖", page: AiAssistant },
  { key: "finance", icon: "💰", page: Finance },
  { key: "reports", icon: "📈", page: Reports },
  { key: "reminders", icon: "⏰", page: Reminders },
  { key: "complaints", icon: "💬", page: Complaints },
  { key: "settings", icon: "⚙️", page: Settings },
];

function Toasts({ toasts, onDismiss }) {
  return (
    <div className="toast-container">
      {toasts.map((tst) => (
        <div key={tst.id} className={`toast toast-${tst.kind}`} onClick={() => onDismiss(tst.id)}>
          <div className="toast-title">{tst.title}</div>
          {tst.body && <div className="toast-body">{tst.body}</div>}
        </div>
      ))}
    </div>
  );
}

function StaffContactsModal({ staffList = [], onStaffUpdated, onClose, isAdmin = true }) {
  const [localList, setLocalList] = useState(staffList);
  const [editingStaff, setEditingStaff] = useState(null); // null | 'new' | staff obj
  const [form, setForm] = useState({ full_name: "", position: "doctor", phone: "", telegram_username: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  useEffect(() => {
    setLocalList(staffList);
  }, [staffList]);

  const reloadStaff = async () => {
    try {
      const res = await api.get("/api/staff");
      if (res.staff) setLocalList(res.staff);
      if (onStaffUpdated) onStaffUpdated();
    } catch {}
  };

  const startEdit = (s) => {
    setForm({
      full_name: s ? s.full_name : "",
      position: s ? s.position : "doctor",
      phone: s ? s.phone || "" : "",
      telegram_username: s ? (s.telegram_username || "").replace(/^@/, "") : "",
    });
    setError("");
    setSuccessMsg("");
    setEditingStaff(s || "new");
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.full_name.trim()) {
      setError("Xodim F.I.Sh. kiritilishi shart");
      return;
    }
    setSaving(true);
    setError("");
    setSuccessMsg("");
    try {
      const payload = {
        full_name: form.full_name.trim(),
        position: form.position,
        phone: form.phone.trim(),
        telegram_username: form.telegram_username.replace(/^@/, "").trim(),
      };
      if (editingStaff && editingStaff.id) {
        await api.put(`/api/staff/${editingStaff.id}`, payload);
        setSuccessMsg(`✅ "${payload.full_name}" ma'lumotlari (telefon va Telegram) yangilandi!`);
      } else {
        await api.post("/api/staff", payload);
        setSuccessMsg(`✅ Yangi xodim "${payload.full_name}" muvaffaqiyatli qo'shildi!`);
      }
      setEditingStaff(null);
      await reloadStaff();
      setTimeout(() => setSuccessMsg(""), 4000);
    } catch (err) {
      setError(err.message || "Saqlashda xatolik yuz berdi");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (s) => {
    if (!confirm(`Haqiqatan ham "${s.full_name}"ni ro'yxatdan o'chirmoqchimisiz?`)) return;
    try {
      await api.del(`/api/staff/${s.id}`);
      setSuccessMsg(`🗑 "${s.full_name}" o'chirildi.`);
      await reloadStaff();
      setTimeout(() => setSuccessMsg(""), 4000);
    } catch (err) {
      alert(`Xatolik: ${err.message}`);
    }
  };

  const doctors = (localList || []).filter((s) => s.position === "doctor" && s.active !== false);
  const assistants = (localList || []).filter((s) => s.position === "assistant" && s.active !== false);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 660 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div className="modal-title" style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span>📞</span>
            <span>Shifokorlar bilan aloqa & Xodimlar</span>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            {!editingStaff && (
              <button
                type="button"
                className="btn small"
                style={{ background: "#10b981", borderColor: "#10b981", color: "#fff" }}
                onClick={() => startEdit(null)}
              >
                + Yangi shifokor qo'shish
              </button>
            )}
            <button type="button" className="btn small secondary" onClick={onClose}>✕</button>
          </div>
        </div>

        {successMsg && (
          <div style={{ background: "#ecfdf5", border: "1px solid #a7f3d0", color: "#065f46", padding: "10px 14px", borderRadius: 8, marginBottom: 12, fontSize: "0.88rem", fontWeight: 600 }}>
            {successMsg}
          </div>
        )}

        {/* TAHRIRLASH / YANGI QO'SHISH FORMASI */}
        {editingStaff && (
          <div style={{ background: "#f8fafc", border: "2px solid #0284c7", borderRadius: 8, padding: 14, marginBottom: 14 }}>
            <div style={{ fontWeight: 700, color: "#0369a1", marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>{editingStaff.id ? `✏️ Shifokor ma'lumotlarini tahrirlash` : `➕ Yangi shifokor / xodim qo'shish`}</span>
              <button type="button" className="btn small secondary" onClick={() => setEditingStaff(null)}>Bekor qilish</button>
            </div>
            {error && <div className="error-msg mb">{error}</div>}
            <form onSubmit={handleSave}>
              <div className="form-grid">
                <div className="form-row">
                  <label>F.I.Sh. (To'liq ism) *</label>
                  <input
                    required
                    value={form.full_name}
                    onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                    placeholder="Masalan: Dr. Rustam Karimov"
                  />
                </div>
                <div className="form-row">
                  <label>Lavozimi</label>
                  <select
                    value={form.position}
                    onChange={(e) => setForm({ ...form, position: e.target.value })}
                  >
                    <option value="doctor">Shifokor-stomatolog</option>
                    <option value="assistant">Yordamchi / Hamshira</option>
                    <option value="admin">Administrator</option>
                  </select>
                </div>
                <div className="form-row">
                  <label>Telefon raqami (Qo'ng'iroq uchun)</label>
                  <input
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    placeholder="+998 90 123 45 67"
                  />
                </div>
                <div className="form-row">
                  <label>✈️ Telegram username (boshida @ siz)</label>
                  <input
                    value={form.telegram_username}
                    onChange={(e) => setForm({ ...form, telegram_username: e.target.value })}
                    placeholder="dr_rustam"
                  />
                </div>
              </div>
              <div className="form-actions" style={{ marginTop: 10, display: "flex", gap: 8 }}>
                <button className="btn" type="submit" disabled={saving}>
                  {saving ? "Saqlanmoqda..." : "💾 Saqlash"}
                </button>
                <button className="btn secondary" type="button" onClick={() => setEditingStaff(null)}>
                  Bekor qilish
                </button>
              </div>
            </form>
          </div>
        )}

        <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: 12, marginBottom: 14 }}>
          <div style={{ fontWeight: 600, color: "#1e293b", fontSize: "0.92rem", marginBottom: 4 }}>
            🏥 Klinika ma'muriyati va Qabulxona
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 14, fontSize: "0.86rem", color: "#475569" }}>
            <a href="tel:+998712000000" style={{ color: "#2563eb", textDecoration: "none", fontWeight: 600 }}>
              📞 +998 (71) 200-00-00
            </a>
            <a href="https://t.me/dental_clinic_admin" target="_blank" rel="noreferrer" style={{ color: "#0284c7", textDecoration: "none", fontWeight: 600 }}>
              💬 @dental_clinic_admin
            </a>
            <span>⏰ 09:00 – 18:00 (Tushlik: 14:00 – 15:00)</span>
          </div>
        </div>

        <div style={{ maxHeight: 440, overflowY: "auto", display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: "0.85rem", color: "#64748b", textTransform: "uppercase", marginBottom: 8, display: "flex", justifyContent: "space-between" }}>
              <span>👨‍⚕️ Shifokorlar ({doctors.length})</span>
            </div>
            <div className="contacts-modal-grid">
              {doctors.map((doc) => {
                const phoneClean = (doc.phone || "").replace(/[^\d+]/g, "");
                return (
                  <div key={doc.id} className="contact-staff-card" style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 8, padding: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ width: 38, height: 38, borderRadius: "50%", background: "#dbeafe", color: "#1d4ed8", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700 }}>
                        👨‍⚕️
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, color: "#0f172a", fontSize: "0.95rem" }}>{doc.full_name}</div>
                        <div style={{ fontSize: "0.78rem", color: "#2563eb", fontWeight: 600 }}>Shifokor-stomatolog</div>
                        <div style={{ fontSize: "0.78rem", color: "#475569", marginTop: 2 }}>
                          {doc.phone ? <span>📞 {doc.phone}</span> : <span className="muted">Tel kiritilmagan</span>}
                        </div>
                        {doc.telegram_username && (
                          <div style={{ fontSize: "0.75rem", color: "#0284c7", fontWeight: 600 }}>
                            ✈️ @{doc.telegram_username.replace(/^@/, "")}
                          </div>
                        )}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                      {phoneClean && (
                        <a
                          href={`tel:${phoneClean}`}
                          className="btn small"
                          style={{ flex: 1, minWidth: 80, justifyContent: "center", background: "#10b981", color: "#fff", textDecoration: "none", fontWeight: 600, fontSize: "0.8rem" }}
                        >
                          📞 Qo'ng'iroq
                        </a>
                      )}
                      <a
                        href={
                          doc.telegram_username
                            ? `https://t.me/${doc.telegram_username.replace(/^@/, "")}`
                            : "https://t.me/dental_clinic_admin"
                        }
                        target="_blank"
                        rel="noreferrer"
                        className="btn small secondary"
                        style={{ flex: 1, minWidth: 80, justifyContent: "center", textDecoration: "none", fontSize: "0.8rem" }}
                      >
                        💬 Telegram
                      </a>
                      <button
                        type="button"
                        className="btn small secondary"
                        style={{ padding: "4px 8px" }}
                        onClick={() => startEdit(doc)}
                        title="Tahrirlash"
                      >
                        ✏️
                      </button>
                      <button
                        type="button"
                        className="btn small danger"
                        style={{ padding: "4px 8px" }}
                        onClick={() => handleDelete(doc)}
                        title="O'chirish"
                      >
                        🗑
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {assistants.length > 0 && (
            <div>
              <div style={{ fontWeight: 700, fontSize: "0.85rem", color: "#64748b", textTransform: "uppercase", marginBottom: 8 }}>
                👩‍⚕️ Yordamchilar / Assistentlar ({assistants.length})
              </div>
              <div className="contacts-modal-grid">
                {assistants.map((ast) => {
                  const phoneClean = (ast.phone || "").replace(/[^\d+]/g, "");
                  return (
                    <div key={ast.id} className="contact-staff-card" style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 8, padding: 12 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{ width: 38, height: 38, borderRadius: "50%", background: "#fef3c7", color: "#b45309", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700 }}>
                          👩‍⚕️
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 700, color: "#0f172a", fontSize: "0.95rem" }}>{ast.full_name}</div>
                          <div style={{ fontSize: "0.78rem", color: "#b45309", fontWeight: 600 }}>Assistent / Hamshira</div>
                          <div style={{ fontSize: "0.78rem", color: "#475569", marginTop: 2 }}>
                            {ast.phone ? <span>📞 {ast.phone}</span> : <span className="muted">Tel kiritilmagan</span>}
                          </div>
                          {ast.telegram_username && (
                            <div style={{ fontSize: "0.75rem", color: "#0284c7", fontWeight: 600 }}>
                              ✈️ @{ast.telegram_username.replace(/^@/, "")}
                            </div>
                          )}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                        {phoneClean && (
                          <a
                            href={`tel:${phoneClean}`}
                            className="btn small"
                            style={{ flex: 1, minWidth: 80, justifyContent: "center", background: "#10b981", color: "#fff", textDecoration: "none", fontWeight: 600, fontSize: "0.8rem" }}
                          >
                            📞 Qo'ng'iroq
                          </a>
                        )}
                        <a
                          href={
                            ast.telegram_username
                              ? `https://t.me/${ast.telegram_username.replace(/^@/, "")}`
                              : "https://t.me/dental_clinic_admin"
                          }
                          target="_blank"
                          rel="noreferrer"
                          className="btn small secondary"
                          style={{ flex: 1, minWidth: 80, justifyContent: "center", textDecoration: "none", fontSize: "0.8rem" }}
                        >
                          💬 Telegram
                        </a>
                        <button
                          type="button"
                          className="btn small secondary"
                          style={{ padding: "4px 8px" }}
                          onClick={() => startEdit(ast)}
                          title="Tahrirlash"
                        >
                          ✏️
                        </button>
                        <button
                          type="button"
                          className="btn small danger"
                          style={{ padding: "4px 8px" }}
                          onClick={() => handleDelete(ast)}
                          title="O'chirish"
                        >
                          🗑
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Shell() {
  const { t, lang, setLang } = useLang();
  const [page, setPage] = useState("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [user, setUser] = useState(null);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [showRequestsModal, setShowRequestsModal] = useState(false);
  const [showContactsModal, setShowContactsModal] = useState(false);
  const [staffMembers, setStaffMembers] = useState([]);
  const [badgeCounts, setBadgeCounts] = useState({
    complaints: 0,
    reminders: 0,
    appointments: 0,
    patients: 0,
    requests: 0,
  });
  const { toasts, dismiss } = useEvents();

  const loadRequests = () => {
    api.get("/api/users/requests")
      .then((d) => setPendingRequests(d.requests || []))
      .catch(() => {});
  };

  const loadBadges = () => {
    api.get("/api/badges")
      .then((d) => {
        if (d) setBadgeCounts(d);
      })
      .catch(() => {});
  };

  const loadStaff = () => {
    api.get("/api/staff")
      .then((d) => setStaffMembers(d.staff || []))
      .catch(() => {});
  };

  // Kim kirganini olish
  useEffect(() => {
    api.get("/api/users/me")
      .then((d) => {
        setUser(d.user);
        if (d.user?.role === "admin") {
          loadRequests();
        }
      })
      .catch(() => setUser({ full_name: "Admin", role: "admin" }));
    loadBadges();
    loadStaff();
  }, []);

  // Har 20 soniyada yangilanishlarni yangilab turish
  useEffect(() => {
    const timer = setInterval(() => {
      loadBadges();
    }, 20000);
    return () => clearInterval(timer);
  }, []);

  // Real-time SSE orqali yangi ro'yxatdan o'tish so'rovlarini va bildirishnomalarni tinglash
  useEffect(() => {
    const onSSE = (e) => {
      const detail = e.detail;
      loadBadges();
      if (detail?.type?.startsWith("user:")) {
        loadRequests();
      }
    };
    const onOpenReqs = () => setShowRequestsModal(true);
    const onOpenContacts = () => setShowContactsModal(true);
    const onAppNav = (e) => {
      if (e.detail?.page) navigateTo(e.detail.page);
    };
    window.addEventListener("clinic:sse", onSSE);
    window.addEventListener("open:access_requests", onOpenReqs);
    window.addEventListener("open:contacts", onOpenContacts);
    window.addEventListener("app:navigate", onAppNav);
    return () => {
      window.removeEventListener("clinic:sse", onSSE);
      window.removeEventListener("open:access_requests", onOpenReqs);
      window.removeEventListener("open:contacts", onOpenContacts);
      window.removeEventListener("app:navigate", onAppNav);
    };
  }, []);

  // Modal yoki drawer ochilganda orqa fon skrollini boshqarish
  useEffect(() => {
    if (sidebarOpen) {
      document.body.classList.add("drawer-open");
    } else {
      document.body.classList.remove("drawer-open");
    }
  }, [sidebarOpen]);

  const logout = () => {
    setAuth("");
    localStorage.removeItem("dc_token");
    window.location.reload();
  };

  const navigateTo = (key) => {
    setPage(key);
    setSidebarOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const roleLabel = user ? t(`role_${user.role}`) || user.role : "";
  const currentNav = NAV.find((n) => n.key === page) || NAV[0];
  const ActivePage = currentNav.page || Dashboard;

  const MOBILE_QUICK_TABS = [
    { key: "dashboard", icon: "📊", label: t("nav_dashboard") },
    { key: "patients", icon: "👥", label: t("nav_patients") },
    { key: "appointments", icon: "📅", label: t("nav_appointments") },
    { key: "visits", icon: "🦷", label: t("nav_visits") },
    { key: "ai", icon: "🤖", label: "AI" },
  ];

  return (
    <div className="app">
      {/* Mobil orqa fon xiralashtiruvchi parda */}
      {sidebarOpen && (
        <div
          className="sidebar-backdrop"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Asosiy yon menyu (Desktop doimiy, Mobil/Planshetda suriluvchi drawer) */}
      <aside className={`sidebar ${sidebarOpen ? "open" : ""}`}>
        <div className="logo">
          <div className="logo-title">
            <span>🦷</span>
            <span>Dental Clinic</span>
          </div>
          <button
            type="button"
            className="sidebar-close-btn"
            onClick={() => setSidebarOpen(false)}
            aria-label="Menyuni yopish"
          >
            ✕
          </button>
        </div>

        <nav>
          {NAV.map((n) => {
            let count = 0;
            if (n.key === "complaints") count = badgeCounts.complaints;
            else if (n.key === "reminders") count = badgeCounts.reminders;
            else if (n.key === "appointments") count = badgeCounts.appointments;
            else if (n.key === "patients") count = badgeCounts.patients;

            return (
              <button
                key={n.key}
                className={`nav-btn ${page === n.key ? "active" : ""}`}
                onClick={() => navigateTo(n.key)}
              >
                <span className="nav-icon">{n.icon}</span>
                <span className="nav-label">{t(`nav_${n.key}`)}</span>
                {count > 0 && (
                  <span
                    className={`nav-badge-count ${
                      n.key === "complaints"
                        ? "badge-danger"
                        : n.key === "reminders"
                        ? "badge-warning"
                        : "badge-primary"
                    }`}
                    title={`${count} ta yangi`}
                  >
                    {count}
                  </span>
                )}
                {n.key === "ai" && <span className="nav-badge-ai">PRO</span>}
              </button>
            );
          })}
        </nav>

        <div className="footer">
          <button
            type="button"
            className="btn small secondary"
            onClick={() => setShowContactsModal(true)}
            style={{
              width: "100%",
              marginBottom: 10,
              justifyContent: "center",
              gap: 6,
              background: "rgba(255,255,255,0.08)",
              color: "#e2e8f0",
              border: "1px solid rgba(255,255,255,0.15)",
            }}
            title="Shifokorlar va assistentlar bilan to'g'ridan-to'g'ri aloqa"
          >
            <span>📞</span>
            <span>Shifokorlar bilan aloqa</span>
          </button>
          <div className="footer-lang">
            <label className="footer-lang-label">🌐 {t("language") || "Til"}:</label>
            <select value={lang} onChange={(e) => setLang(e.target.value)}>
              <option value="uz">🇺🇿 O'zbekcha</option>
              <option value="ru">🇷🇺 Русский</option>
              <option value="en">🇬🇧 English</option>
            </select>
          </div>
          <button className="logout-btn" onClick={logout}>
            🚪 {t("logout")}
          </button>
        </div>
      </aside>

      {/* Asosiy kontent maydoni */}
      <main className="main">
        <header className="topbar">
          <div className="topbar-left">
            <button
              type="button"
              className="mobile-menu-btn"
              onClick={() => setSidebarOpen((v) => !v)}
              aria-label="Menyu"
              title="Menyuni ochish"
            >
              <span className="hamburger-line" />
              <span className="hamburger-line" />
              <span className="hamburger-line" />
            </button>
            <div className="topbar-info">
              <span className="topbar-app-name">🦷 Dental Clinic</span>
              <span className="topbar-crumb">
                <span className="crumb-icon">{currentNav.icon}</span>
                <span className="crumb-text">{t(`nav_${page}`)}</span>
              </span>
            </div>
          </div>

          <div className="topbar-right">
            <button
              type="button"
              className="btn small"
              onClick={() => setShowContactsModal(true)}
              style={{
                background: "#f0fdf4",
                color: "#166534",
                border: "1px solid #bbf7d0",
                fontWeight: 600,
                borderRadius: 20,
                padding: "5px 12px",
                display: "flex",
                alignItems: "center",
                gap: 6,
                cursor: "pointer",
              }}
              title="Shifokor va assistentlar bilan to'g'ridan-to'g'ri qo'ng'iroq yoki Telegram orqali bog'lanish"
            >
              <span>📞</span>
              <span style={{ fontSize: "0.85rem" }}>Aloqa</span>
            </button>

            {user?.role === "admin" && (
              <button
                type="button"
                className="btn small"
                onClick={() => setShowRequestsModal(true)}
                style={{
                  background: pendingRequests.length > 0 ? "#dc2626" : "#f1f5f9",
                  color: pendingRequests.length > 0 ? "#ffffff" : "#475569",
                  border: pendingRequests.length > 0 ? "none" : "1px solid #cbd5e1",
                  fontWeight: 700,
                  borderRadius: 20,
                  padding: "5px 12px",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  cursor: "pointer",
                  boxShadow: pendingRequests.length > 0 ? "0 2px 8px rgba(220, 38, 38, 0.4)" : "none",
                }}
                title="Google orqali ro'yxatdan o'tish so'rovlarini ko'rish"
              >
                <span>🔔</span>
                {pendingRequests.length > 0 ? (
                  <span>{pendingRequests.length} ta so'rov</span>
                ) : (
                  <span style={{ fontSize: "0.8rem" }}>So'rovlar</span>
                )}
              </button>
            )}

            <div className="topbar-user">
              <span className="user-avatar">👤</span>
              <div className="user-details">
                <strong className="user-name">{user ? user.full_name : "..."}</strong>
                {roleLabel && <span className="topbar-role">{roleLabel}</span>}
              </div>
            </div>
            <div className="topbar-lang-picker">
              <select
                value={lang}
                onChange={(e) => setLang(e.target.value)}
                aria-label="Til tanlash"
              >
                <option value="uz">UZ</option>
                <option value="ru">RU</option>
                <option value="en">EN</option>
              </select>
            </div>
          </div>
        </header>

        <div className="content-container">
          <ActivePage onNavigate={navigateTo} />
        </div>
      </main>

      {/* Smartfonlar uchun qulay pastki navigatsiya (Bottom Navigation Bar) */}
      <nav className="mobile-bottom-nav">
        {MOBILE_QUICK_TABS.map((tab) => {
          let tabCount = 0;
          if (tab.key === "appointments") tabCount = badgeCounts.appointments;
          else if (tab.key === "patients") tabCount = badgeCounts.patients;

          return (
            <button
              key={tab.key}
              type="button"
              className={`bottom-nav-item ${page === tab.key ? "active" : ""}`}
              onClick={() => navigateTo(tab.key)}
            >
              <span className="bottom-nav-icon" style={{ position: "relative" }}>
                {tab.icon}
                {tabCount > 0 && <span className="mobile-badge-dot">{tabCount > 9 ? "9+" : tabCount}</span>}
              </span>
              <span className="bottom-nav-label">{tab.label}</span>
            </button>
          );
        })}
        <button
          type="button"
          className={`bottom-nav-item ${sidebarOpen ? "active" : ""}`}
          onClick={() => setSidebarOpen(true)}
        >
          <span className="bottom-nav-icon">☰</span>
          <span className="bottom-nav-label">{t("nav_settings") ? "Ko'proq" : "Menyu"}</span>
        </button>
      </nav>

      {showRequestsModal && (
        <AccessRequestsModal
          requests={pendingRequests}
          onClose={() => setShowRequestsModal(false)}
          onUpdated={loadRequests}
        />
      )}

      {showContactsModal && (
        <StaffContactsModal
          staffList={staffMembers}
          isAdmin={user?.role === "admin"}
          onStaffUpdated={loadStaff}
          onClose={() => setShowContactsModal(false)}
        />
      )}

      <Toasts toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}

function Root() {
  const [user, setUser] = useState(null);

  // Eski token bor-bo'lsa tekshiramiz
  useEffect(() => {
    if (hasToken()) {
      api.get("/api/dashboard")
        .then(() => setUser({}))
        .catch(() => {
          setAuth("");
          setUser(null);
        });
    }
  }, []);

  return user ? <Shell /> : <Login onLogin={setUser} />;
}

export default function App() {
  return (
    <LangProvider>
      <Root />
    </LangProvider>
  );
}
