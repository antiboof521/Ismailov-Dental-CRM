/**
 * Settings.jsx — Sozlamalar: Xizmatlar & Kategoriyalar doskasi (Ustunli shakl), Xodimlar, Foydalanuvchilar va Telegram
 */

import React, { useEffect, useState, useMemo } from "react";
import { api } from "../api.js";
import { useLang } from "../i18n.jsx";
import { Modal, Empty, ErrorBanner } from "../components/ui.jsx";

function ServiceForm({ initial, defaultCategory = "Umumiy", onSaved, onCancel }) {
  const { t } = useLang();
  const [form, setForm] = useState(
    initial || { name: "", category: defaultCategory || "Umumiy", price: 0, active: true }
  );
  const [error, setError] = useState("");
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    try {
      const body = {
        ...form,
        price: Number(form.price || 0),
        active: form.active !== undefined ? Boolean(form.active) : true,
      };
      if (initial && initial.id) await api.put(`/api/services/${initial.id}`, body);
      else await api.post("/api/services", body);
      onSaved();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <form onSubmit={submit}>
      {error && <div className="error-msg mb">{error}</div>}
      <div className="form-grid">
        <div className="form-row">
          <label>{t("name")} *</label>
          <input required value={form.name} onChange={set("name")} placeholder="Masalan: Fotopolimer plomba" autoFocus />
        </div>
        <div className="form-row">
          <label>{t("set_category")} *</label>
          <input required value={form.category} onChange={set("category")} placeholder="Masalan: Terapevtik" />
        </div>
        <div className="form-row">
          <label>{t("set_price")} ({t("sum")}) *</label>
          <input type="number" min="0" required value={form.price} onChange={set("price")} />
        </div>
        <div className="form-row">
          <label>{t("set_active")}</label>
          <select
            value={form.active ? "1" : "0"}
            onChange={(e) => setForm((f) => ({ ...f, active: e.target.value === "1" }))}
          >
            <option value="1">✅ {t("set_active")}</option>
            <option value="0">❌ Nofaol</option>
          </select>
        </div>
      </div>
      <div className="form-actions">
        <button className="btn" type="submit">{t("save")}</button>
        <button className="btn secondary" type="button" onClick={onCancel}>{t("cancel")}</button>
      </div>
    </form>
  );
}

function StaffForm({ initial, onSaved, onCancel }) {
  const { t } = useLang();
  const [form, setForm] = useState(
    initial || { full_name: "", position: "doctor", phone: "", telegram_username: "", salary_pct: 0, salary_fixed: 0 }
  );
  const [error, setError] = useState("");
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    try {
      const body = {
        ...form,
        telegram_username: (form.telegram_username || "").replace(/^@/, "").trim(),
        salary_pct: parseInt(form.salary_pct || 0, 10),
        salary_fixed: Number(form.salary_fixed || 0),
      };
      if (initial && initial.id) await api.put(`/api/staff/${initial.id}`, body);
      else await api.post("/api/staff", body);
      onSaved();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <form onSubmit={submit}>
      {error && <div className="error-msg mb">{error}</div>}
      <div className="form-grid">
        <div className="form-row">
          <label>{t("patients_fullName")} *</label>
          <input required value={form.full_name} onChange={set("full_name")} placeholder="Masalan: Dr. Rustam Karimov" />
        </div>
        <div className="form-row">
          <label>{t("set_position")}</label>
          <select value={form.position} onChange={set("position")}>
            <option value="doctor">{t("pos_doctor")}</option>
            <option value="assistant">{t("pos_assistant")}</option>
            <option value="admin">{t("pos_admin")}</option>
          </select>
        </div>
        <div className="form-row">
          <label>{t("phone")} (Aloqa uchun)</label>
          <input value={form.phone || ""} onChange={set("phone")} placeholder="+998 90 123 45 67" />
        </div>
        <div className="form-row">
          <label>✈️ Telegram username (bot va bemorlar uchun)</label>
          <input
            value={form.telegram_username || ""}
            onChange={set("telegram_username")}
            placeholder="dr_rustam (boshida @ siz)"
          />
          <small style={{ color: "#64748b", fontSize: "0.75rem" }}>
            Bemorlar Telegram bot yoki CRM orqali ushbu profilga to'g'ridan-to'g'ri yozishlari mumkin
          </small>
        </div>
        <div className="form-row">
          <label>{t("set_salaryPct")}</label>
          <input type="number" min="0" max="100" value={form.salary_pct} onChange={set("salary_pct")} />
        </div>
        <div className="form-row">
          <label>{t("set_salaryFixed")}</label>
          <input type="number" min="0" value={form.salary_fixed} onChange={set("salary_fixed")} />
        </div>
      </div>
      <div className="form-actions">
        <button className="btn" type="submit">{t("save")}</button>
        <button className="btn secondary" type="button" onClick={onCancel}>{t("cancel")}</button>
      </div>
    </form>
  );
}

function UserForm({ initial, onSaved, onCancel }) {
  const { t } = useLang();
  const [form, setForm] = useState(
    initial
      ? { full_name: initial.full_name, role: initial.role, password: "" }
      : { username: "", password: "", full_name: "", role: "doctor" }
  );
  const [error, setError] = useState("");
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    try {
      if (initial && initial.id) {
        const body = { full_name: form.full_name, role: form.role };
        if (form.password) body.password = form.password;
        await api.put(`/api/users/${initial.id}`, body);
      } else {
        await api.post("/api/users", form);
      }
      onSaved();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <form onSubmit={submit}>
      {error && <div className="error-msg mb">{error}</div>}
      <div className="form-grid">
        {!initial && (
          <div className="form-row">
            <label>{t("username")} *</label>
            <input required value={form.username} onChange={set("username")} />
          </div>
        )}
        <div className="form-row">
          <label>{initial ? `${t("password")} (${t("activate")})` : `${t("password")} *`}</label>
          <input
            type="password"
            required={!initial}
            value={form.password}
            onChange={set("password")}
            placeholder={initial ? "— o'zgartirish uchun kiriting —" : ""}
          />
        </div>
        <div className="form-row">
          <label>{t("patients_fullName")} *</label>
          <input required value={form.full_name} onChange={set("full_name")} />
        </div>
        <div className="form-row">
          <label>{t("set_role")}</label>
          <select value={form.role} onChange={set("role")}>
            <option value="admin">{t("role_admin")}</option>
            <option value="accountant">{t("role_accountant")}</option>
            <option value="doctor">{t("role_doctor")}</option>
          </select>
        </div>
      </div>
      <div className="form-actions">
        <button className="btn" type="submit">{t("save")}</button>
        <button className="btn secondary" type="button" onClick={onCancel}>{t("cancel")}</button>
      </div>
    </form>
  );
}

export default function Settings() {
  const { t } = useLang();
  const [tab, setTab] = useState("services"); // "services" | "staff" | "users" | "telegram"
  const [servicesView, setServicesView] = useState("board"); // "board" (ustunlar) | "table" (jadval)
  const [services, setServices] = useState([]);
  const [customCategories, setCustomCategories] = useState([]);
  const [staff, setStaff] = useState([]);
  const [users, setUsers] = useState([]);
  const [tgStatus, setTgStatus] = useState(null);
  const [tgLoading, setTgLoading] = useState(false);
  const [tgMsg, setTgMsg] = useState("");
  const [tgConfig, setTgConfig] = useState({
    botToken: "",
    clinicName: "",
    clinicPhone: "",
    clinicTg: "",
  });
  const [showTgToken, setShowTgToken] = useState(false);
  const [isSavingTg, setIsSavingTg] = useState(false);
  const [dbStatus, setDbStatus] = useState(null);
  const [dbLoading, setDbLoading] = useState(false);
  const [dbMsg, setDbMsg] = useState("");
  const [error, setError] = useState("");
  const [modal, setModal] = useState(null); // { kind, initial, defaultCategory }
  const [editingCategory, setEditingCategory] = useState(null); // { oldName, newName }
  const [newCatInput, setNewCatInput] = useState("");
  const [showAddCatRow, setShowAddCatRow] = useState(false);
  const [pendingRoleChoice, setPendingRoleChoice] = useState({});

  const load = () => {
    api.get("/api/services?includeInactive=1")
      .then((d) => setServices(d.services || []))
      .catch((e) => setError(e.message));
    api.get("/api/staff").then((d) => setStaff(d.staff || [])).catch(() => {});
    api.get("/api/users").then((d) => setUsers(d.users || [])).catch(() => {});
    api.get("/api/telegram/status").then((d) => setTgStatus(d)).catch(() => {});
    api.get("/api/telegram/settings").then((d) => {
      if (d) {
        setTgConfig({
          botToken: d.botToken || "",
          clinicName: d.clinicName || "",
          clinicPhone: d.clinicPhone || "",
          clinicTg: d.clinicTg || "",
        });
      }
    }).catch(() => {});
    api.get("/api/storage/status").then((d) => setDbStatus(d)).catch(() => {});
  };

  useEffect(load, []);

  // Real-time SSE orqali yangi so'rovlar yoki tasdiqlashlarni tinglash
  useEffect(() => {
    const onSSE = (e) => {
      if (e.detail?.type?.startsWith("user:")) {
        api.get("/api/users").then((d) => setUsers(d.users || [])).catch(() => {});
      }
    };
    window.addEventListener("clinic:sse", onSSE);
    return () => window.removeEventListener("clinic:sse", onSSE);
  }, []);

  // Xizmatlar kategoriyalari ro'yxati (barcha mavjud kategoriyalar)
  const categoryColumns = useMemo(() => {
    const set = new Set();
    services.forEach((s) => {
      set.add(s.category || "Umumiy");
    });
    customCategories.forEach((c) => set.add(c));
    if (set.size === 0) set.add("Umumiy");
    return Array.from(set);
  }, [services, customCategories]);

  const triggerTestNotify = async () => {
    setTgLoading(true);
    setTgMsg("");
    try {
      const res = await api.post("/api/telegram/test-notify", {});
      setTgMsg(`🔔 Tekshiruv tugadi: ${res.notifiedCount || 0} ta bemorga navbat xabari yuborildi.`);
    } catch (err) {
      setTgMsg(`Xatolik: ${err.message}`);
    } finally {
      setTgLoading(false);
    }
  };

  const delService = async (id, name) => {
    if (!confirm(`${t("confirmDelete")} (${name || "Xizmat"})`)) return;
    await api.del(`/api/services/${id}`);
    load();
  };

  const handleAddCategoryColumn = () => {
    const trimmed = newCatInput.trim();
    if (!trimmed) return;
    if (categoryColumns.includes(trimmed)) {
      alert("Bu nomdagi kategoriya ustuni allaqachon mavjud");
      return;
    }
    setCustomCategories((prev) => [...prev, trimmed]);
    setNewCatInput("");
    setShowAddCatRow(false);
  };

  const handleRenameCategory = async () => {
    if (!editingCategory || !editingCategory.newName.trim()) return;
    try {
      await api.post("/api/services/categories/rename", {
        oldName: editingCategory.oldName,
        newName: editingCategory.newName.trim(),
      });
      setCustomCategories((prev) =>
        prev.map((c) => (c === editingCategory.oldName ? editingCategory.newName.trim() : c))
      );
      setEditingCategory(null);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDeleteCategory = async (catName) => {
    if (!confirm(t("confirm_del_category") || `"${catName}" kategoriyasini o'chirasizmi?`)) return;
    try {
      await api.del(`/api/services/categories/${encodeURIComponent(catName)}`);
      setCustomCategories((prev) => prev.filter((c) => c !== catName));
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const delStaff = async (id) => {
    if (!confirm(t("confirmDelete"))) return;
    try {
      await api.del(`/api/staff/${id}`);
      load();
    } catch (e) {
      setError(e.message);
    }
  };

  const toggleStaff = async (s) => {
    try {
      await api.put(`/api/staff/${s.id}`, { active: !s.active });
      load();
    } catch (e) {
      setError(e.message);
    }
  };

  const toggleUser = async (u) => {
    try {
      await api.put(`/api/users/${u.id}`, { active: !u.active });
      load();
    } catch (e) {
      setError(e.message);
    }
  };

  const delUser = async (u) => {
    if (!confirm(`${t("confirmDelete")} (${u.username})`)) return;
    try {
      await api.del(`/api/users/${u.id}`);
      load();
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <div>
      <div className="page-title">⚙️ {t("nav_settings")}</div>
      {error && <ErrorBanner message={error} />}

      <div className="toolbar" style={{ marginBottom: 16 }}>
        {["services", "staff", "users", "telegram", "database"].map((k) => (
          <button key={k} className={`btn ${tab === k ? "" : "secondary"}`} onClick={() => setTab(k)}>
            {k === "services"
              ? "🦷 Xizmatlar & Kategoriyalar"
              : k === "database"
              ? "☁️ Baza & 24/7 Avtonomlik"
              : t(`set_${k}`) || k}
          </button>
        ))}
      </div>

      {/* ── 1. XIZMATLAR VA KATEGORIYALAR (USTUNLI SHAKL VA JADVAL) ── */}
      {tab === "services" && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
            <div style={{ display: "flex", border: "1px solid var(--color-border)", borderRadius: 6, overflow: "hidden" }}>
              <button
                type="button"
                className={`btn small ${servicesView === "board" ? "" : "secondary"}`}
                style={{ borderRadius: 0, border: "none" }}
                onClick={() => setServicesView("board")}
              >
                📋 {t("board_view") || "Ustunlar (Doska)"}
              </button>
              <button
                type="button"
                className={`btn small ${servicesView === "table" ? "" : "secondary"}`}
                style={{ borderRadius: 0, border: "none" }}
                onClick={() => setServicesView("table")}
              >
                📄 {t("table_view") || "Klassik Jadval"}
              </button>
            </div>

            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button
                className="btn small secondary"
                onClick={() => setShowAddCatRow(true)}
              >
                + {t("add_category") || "Yangi kategoriya ustuni"}
              </button>
              <button
                className="btn small"
                onClick={() => setModal({ kind: "service" })}
              >
                + {t("add")} {t("visit_service")}
              </button>
            </div>
          </div>

          {/* Yangi kategoriya ustuni qo'shish paneli */}
          {showAddCatRow && (
            <div style={{ background: "#f8fafc", border: "1px solid #cbd5e1", borderRadius: 8, padding: 12, marginBottom: 16, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ fontWeight: 600, fontSize: "0.9rem" }}>➕ Yangi kategoriya ustuni:</span>
              <input
                value={newCatInput}
                onChange={(e) => setNewCatInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddCategoryColumn()}
                placeholder="Masalan: Bolalar stomatologiyasi, Parodontologiya..."
                style={{ width: 280 }}
                autoFocus
              />
              <button className="btn small" onClick={handleAddCategoryColumn}>
                Ustunni qo'shish
              </button>
              <button className="btn small secondary" onClick={() => setShowAddCatRow(false)}>
                {t("cancel")}
              </button>
            </div>
          )}

          {/* USTUNLI DOSKA (KANBAN STYLE CATEGORY COLUMNS) */}
          {servicesView === "board" && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
                gap: 16,
                alignItems: "start",
              }}
            >
              {categoryColumns.map((cat) => {
                const catServices = services.filter((s) => (s.category || "Umumiy") === cat);
                return (
                  <div
                    key={cat}
                    style={{
                      background: "#ffffff",
                      border: "1px solid var(--color-border)",
                      borderRadius: 8,
                      display: "flex",
                      flexDirection: "column",
                      boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
                      overflow: "hidden",
                    }}
                  >
                    {/* USTUN SARLAVHASI */}
                    <div
                      style={{
                        padding: "10px 14px",
                        background: "#f8fafc",
                        borderBottom: "1px solid var(--color-border)",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 6, overflow: "hidden" }}>
                        <span style={{ fontWeight: 700, fontSize: "0.95rem", color: "#1e293b", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>
                          📁 {cat}
                        </span>
                        <span
                          style={{
                            background: "#e2e8f0",
                            color: "#475569",
                            fontSize: "0.75rem",
                            padding: "1px 6px",
                            borderRadius: 10,
                            fontWeight: 600,
                          }}
                        >
                          {catServices.length}
                        </span>
                      </div>

                      {/* Kategoriya amallari */}
                      <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                        <button
                          type="button"
                          className="btn small secondary"
                          style={{ padding: "2px 6px", fontSize: "0.75rem" }}
                          onClick={() => setEditingCategory({ oldName: cat, newName: cat })}
                          title="Kategoriyani tahrirlash"
                        >
                          ✏️
                        </button>
                        <button
                          type="button"
                          className="btn small danger"
                          style={{ padding: "2px 6px", fontSize: "0.75rem" }}
                          onClick={() => handleDeleteCategory(cat)}
                          title="Kategoriyani o'chirish"
                        >
                          🗑
                        </button>
                      </div>
                    </div>

                    {/* USTUNDAGI XIZMATLAR RO'YXATI */}
                    <div style={{ padding: 10, display: "flex", flexDirection: "column", gap: 8, minHeight: 80 }}>
                      {catServices.length === 0 ? (
                        <div style={{ textAlign: "center", padding: "16px 0", color: "#94a3b8", fontSize: "0.85rem" }}>
                          Bu ustunda hali xizmat yo'q
                        </div>
                      ) : (
                        catServices.map((s) => (
                          <div
                            key={s.id}
                            style={{
                              background: s.active ? "#ffffff" : "#f1f5f9",
                              border: "1px solid #e2e8f0",
                              borderRadius: 6,
                              padding: "8px 10px",
                              opacity: s.active ? 1 : 0.6,
                              transition: "box-shadow 0.2s",
                            }}
                          >
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
                              <span style={{ fontWeight: 600, fontSize: "0.9rem", color: "#0f172a" }}>
                                {s.name}
                              </span>
                            </div>

                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6 }}>
                              <span style={{ fontWeight: 700, color: "#16a34a", fontSize: "0.88rem", fontVariantNumeric: "tabular-nums" }}>
                                {Number(s.price).toLocaleString("ru-RU")} {t("sum")}
                              </span>

                              <div style={{ display: "flex", gap: 4 }}>
                                <button
                                  className="btn small secondary"
                                  style={{ padding: "2px 6px", fontSize: "0.75rem" }}
                                  onClick={() => setModal({ kind: "service", initial: s })}
                                  title="Tahrirlash"
                                >
                                  ✏️
                                </button>
                                <button
                                  className="btn small danger"
                                  style={{ padding: "2px 6px", fontSize: "0.75rem" }}
                                  onClick={() => delService(s.id, s.name)}
                                  title="O'chirish"
                                >
                                  🗑
                                </button>
                              </div>
                            </div>
                          </div>
                        ))
                      )}

                      {/* Ustunga to'g'ridan-to'g'ri xizmat qo'shish */}
                      <button
                        type="button"
                        className="btn small secondary"
                        style={{ borderStyle: "dashed", marginTop: 4, width: "100%", justifyContent: "center" }}
                        onClick={() => setModal({ kind: "service", defaultCategory: cat })}
                      >
                        + Xizmat qo'shish
                      </button>
                    </div>
                  </div>
                );
              })}

              {/* YANGI USTUN QO'SHISH KARTASI */}
              <div
                style={{
                  border: "2px dashed #cbd5e1",
                  borderRadius: 8,
                  padding: 24,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  minHeight: 180,
                  cursor: "pointer",
                  background: "#f8fafc",
                }}
                onClick={() => setShowAddCatRow(true)}
              >
                <span style={{ fontSize: "1.8rem", marginBottom: 8 }}>➕</span>
                <span style={{ fontWeight: 600, color: "var(--color-primary)", textAlign: "center" }}>
                  Yangi kategoriya ustuni qo'shish
                </span>
                <span style={{ fontSize: "0.75rem", color: "#64748b", marginTop: 4, textAlign: "center" }}>
                  Xizmatlarni yangi yo'nalishga ajratish
                </span>
              </div>
            </div>
          )}

          {/* KLASSIK JADVAL SHAKLI */}
          {servicesView === "table" && (
            <div className="panel">
              {services.length === 0 ? (
                <Empty />
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>{t("name")}</th>
                      <th>{t("set_category")}</th>
                      <th>{t("set_price")}</th>
                      <th>{t("set_active")}</th>
                      <th>{t("actions")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {services.map((s) => (
                      <tr key={s.id} style={s.active ? undefined : { opacity: 0.6 }}>
                        <td><strong>{s.name}</strong></td>
                        <td>
                          <span
                            style={{
                              background: "#f1f5f9",
                              padding: "2px 8px",
                              borderRadius: 4,
                              fontSize: "0.8rem",
                              fontWeight: 600,
                              color: "#334155",
                            }}
                          >
                            {s.category}
                          </span>
                        </td>
                        <td style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                          {Number(s.price).toLocaleString("ru-RU")} {t("sum")}
                        </td>
                        <td>{s.active ? "✅ Faol" : "❌ Nofaol"}</td>
                        <td>
                          <div style={{ display: "flex", gap: 6 }}>
                            <button
                              className="btn small secondary"
                              onClick={() => setModal({ kind: "service", initial: s })}
                            >
                              ✏️ {t("edit")}
                            </button>
                            <button
                              className="btn small danger"
                              onClick={() => delService(s.id, s.name)}
                            >
                              🗑
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── 2. XODIMLAR ── */}
      {tab === "staff" && (
        <div className="panel">
          <div className="toolbar" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3 style={{ margin: 0 }}>👨‍⚕️ Xodimlar ro'yxati</h3>
            <button className="btn" onClick={() => setModal({ kind: "staff" })}>+ {t("add")}</button>
          </div>
          {staff.length === 0 ? (
            <Empty />
          ) : (
            <table>
              <thead>
                <tr>
                  <th>{t("patients_fullName")}</th>
                  <th>{t("set_position")}</th>
                  <th>{t("phone")} & Telegram</th>
                  <th>{t("set_salaryPct")}</th>
                  <th>{t("set_salaryFixed")}</th>
                  <th>{t("set_active")}</th>
                  <th>{t("actions")}</th>
                </tr>
              </thead>
              <tbody>
                {staff.map((s) => {
                  const phoneClean = (s.phone || "").replace(/[^\d+]/g, "");
                  const tgUser = (s.telegram_username || "").replace(/^@/, "").trim();
                  return (
                    <tr key={s.id} style={s.active ? undefined : { opacity: 0.5 }}>
                      <td><strong>{s.full_name}</strong></td>
                      <td>{t(`pos_${s.position}`) || s.position}</td>
                      <td>
                        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                          {s.phone ? (
                            <a
                              href={`tel:${phoneClean}`}
                              style={{ color: "#0f172a", textDecoration: "none", fontWeight: 600, fontSize: "0.86rem" }}
                            >
                              📞 {s.phone}
                            </a>
                          ) : (
                            <span className="muted">—</span>
                          )}
                          {tgUser ? (
                            <a
                              href={`https://t.me/${tgUser}`}
                              target="_blank"
                              rel="noreferrer"
                              style={{ color: "#0284c7", textDecoration: "none", fontSize: "0.82rem", display: "inline-flex", alignItems: "center", gap: 3 }}
                            >
                              <span>💬</span>
                              <span>@{tgUser}</span>
                            </a>
                          ) : (
                            <span style={{ fontSize: "0.75rem", color: "#94a3b8" }}>Telegram kiritilmagan</span>
                          )}
                        </div>
                      </td>
                      <td style={{ fontVariantNumeric: "tabular-nums" }}>{s.salary_pct}%</td>
                      <td style={{ fontVariantNumeric: "tabular-nums" }}>
                        {Number(s.salary_fixed || 0).toLocaleString("ru-RU")} {t("sum")}
                      </td>
                      <td>{s.active ? "✅" : "❌"}</td>
                      <td>
                        <div style={{ display: "flex", gap: 4 }}>
                          <button className="btn small secondary" onClick={() => setModal({ kind: "staff", initial: s })}>
                            ✏️ {t("edit")}
                          </button>
                          <button className="btn small secondary" onClick={() => toggleStaff(s)}>
                            {s.active ? t("deactivate") : t("activate")}
                          </button>
                          <button className="btn small danger" onClick={() => delStaff(s.id)}>
                            🗑
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── 3. FOYDALANUVCHILAR ── */}
      {tab === "users" && (
        <div className="panel">
          <div className="toolbar" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3 style={{ margin: 0 }}>👥 Tizim foydalanuvchilari</h3>
            <button className="btn" onClick={() => setModal({ kind: "user" })}>+ {t("set_newUser")}</button>
          </div>
          {users.length === 0 ? (
            <Empty />
          ) : (
            <table>
              <thead>
                <tr>
                  <th>{t("username")}</th>
                  <th>{t("patients_fullName")}</th>
                  <th>{t("set_role")}</th>
                  <th>{t("set_active")}</th>
                  <th>{t("actions")}</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} style={u.active ? undefined : { opacity: 0.5 }}>
                    <td><strong>{u.username}</strong></td>
                    <td>{u.full_name}</td>
                    <td>{t(`role_${u.role}`) || u.role}</td>
                    <td>{u.active ? "✅" : "❌"}</td>
                    <td>
                      <div style={{ display: "flex", gap: 4 }}>
                        <button className="btn small secondary" onClick={() => setModal({ kind: "user", initial: u })}>
                          ✏️ {t("edit")}
                        </button>
                        <button className="btn small secondary" onClick={() => toggleUser(u)}>
                          {u.active ? t("deactivate") : t("activate")}
                        </button>
                        <button className="btn small danger" onClick={() => delUser(u)}>
                          🗑
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── 4. TELEGRAM BOT INTEGRATSIYASI VA 24/7 ISHLASH ── */}
      {tab === "telegram" && (
        <div className="panel" style={{ maxWidth: 840 }}>
          <h3 style={{ margin: "0 0 16px 0", display: "flex", alignItems: "center", gap: 8 }}>
            <span>🤖</span>
            <span>Telegram Bot Integratsiyasi & 24/7 Uzluksiz Ishlash Markazi</span>
          </h3>

          {/* 1. STATUS KARTASI */}
          <div style={{ background: "var(--color-bg)", padding: 18, borderRadius: 8, marginBottom: 20, border: "1px solid var(--color-border)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: "1.2rem" }}>📶</span>
                <strong>Botning joriy holati:</strong>
              </div>
              <span className={`badge ${tgStatus?.running ? "badge-success" : tgStatus?.configured ? "badge-warning" : "badge-secondary"}`} style={{ fontSize: "0.9rem", padding: "4px 10px" }}>
                {tgStatus?.running ? "✅ Bot 24/7 Faol va Tayyor" : tgStatus?.configured ? "⏳ Ulanmoqda..." : "⚠️ Bot Tokeni kiritilmagan"}
              </span>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10, marginBottom: 12 }}>
              <div style={{ background: "#ffffff", padding: "10px 12px", borderRadius: 6, border: "1px solid var(--color-border)" }}>
                <div style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)" }}>Telegram Username:</div>
                <div style={{ fontWeight: "bold", marginTop: 2 }}>
                  {tgStatus?.botUsername ? (
                    <a href={`https://t.me/${tgStatus.botUsername}`} target="_blank" rel="noopener noreferrer" style={{ color: "var(--color-primary)" }}>
                      @{tgStatus.botUsername}
                    </a>
                  ) : (
                    <span style={{ color: "#94a3b8" }}>Ulanmagan</span>
                  )}
                </div>
              </div>

              <div style={{ background: "#ffffff", padding: "10px 12px", borderRadius: 6, border: "1px solid var(--color-border)" }}>
                <div style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)" }}>Qabul qilish usuli:</div>
                <div style={{ fontWeight: "bold", marginTop: 2, color: tgStatus?.webhook?.url ? "#16a34a" : "#2563eb" }}>
                  {tgStatus?.webhook?.url ? "🚀 Webhook (24/7 Bulut)" : "📡 Long-Polling (Uzluksiz)"}
                </div>
              </div>

              <div style={{ background: "#ffffff", padding: "10px 12px", borderRadius: 6, border: "1px solid var(--color-border)" }}>
                <div style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)" }}>Saytga sinxronizatsiya:</div>
                <div style={{ fontWeight: "bold", marginTop: 2, color: "#16a34a" }}>
                  🟢 Real-vaqt (SSE & Bulut)
                </div>
              </div>
            </div>

            <div style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)", display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8, borderTop: "1px solid var(--color-border)", paddingTop: 8 }}>
              <span>🏥 <strong>Klinika:</strong> {tgConfig.clinicName || tgStatus?.clinicName || "Dentistry Clinic"}</span>
              <span>⏰ <strong>Ish vaqti:</strong> 09:00 — 18:00</span>
              <span>📞 <strong>Tel:</strong> {tgConfig.clinicPhone || tgStatus?.clinicPhone || "+998 (71) 200-00-00"}</span>
            </div>
          </div>

          {/* 2. BOT TOKEN VA SOZLAMALARINI KIRITISH SHAKLI */}
          <div style={{ background: "#ffffff", border: "1px solid var(--color-border)", borderRadius: 8, padding: 18, marginBottom: 20 }}>
            <h4 style={{ margin: "0 0 12px 0", display: "flex", alignItems: "center", gap: 8, fontSize: "1rem" }}>
              <span>⚙️</span> Bot Sozlamalari & Tokenni O'rnatish
            </h4>
            <p style={{ margin: "0 0 14px 0", fontSize: "0.88rem", color: "var(--color-text-secondary)" }}>
              Telegramda <strong>@BotFather</strong> orqali bot ochib, berilgan <strong>HTTP API Token</strong>ni shu yerga kiriting. Bot darhol faollashadi va ma'lumotlar saqlanadi:
            </p>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setIsSavingTg(true);
                setTgMsg("");
                try {
                  const res = await api.post("/api/telegram/configure", tgConfig);
                  if (res.ok) {
                    setTgMsg(`✅ Bot sozlamalari muvaffaqiyatli saqlandi! Bot holati: ${res.bot?.botUsername ? `@${res.bot.botUsername} ishga tushdi` : res.bot?.status || "Saqlandi"}`);
                    load();
                  }
                } catch (err) {
                  setTgMsg(`❌ Xatolik: ${err.message}`);
                } finally {
                  setIsSavingTg(false);
                }
              }}
            >
              <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 12, marginBottom: 14 }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: 4 }}>
                    Telegram Bot Token (@BotFather dan):
                  </label>
                  <div style={{ display: "flex", gap: 6 }}>
                    <input
                      type={showTgToken ? "text" : "password"}
                      value={tgConfig.botToken}
                      onChange={(e) => setTgConfig({ ...tgConfig, botToken: e.target.value })}
                      placeholder="Masalan: 7123456789:AAHkL789..."
                      style={{ flex: 1, padding: "8px 10px", borderRadius: 6, border: "1px solid var(--color-border)" }}
                    />
                    <button
                      type="button"
                      className="btn secondary small"
                      onClick={() => setShowTgToken(!showTgToken)}
                      title="Ko'rsatish / Yashirish"
                    >
                      {showTgToken ? "🙈 Yashirish" : "👁 Ko'rsatish"}
                    </button>
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                  <div>
                    <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, marginBottom: 4 }}>
                      Klinika nomi:
                    </label>
                    <input
                      type="text"
                      value={tgConfig.clinicName}
                      onChange={(e) => setTgConfig({ ...tgConfig, clinicName: e.target.value })}
                      placeholder="Dentistry Clinic"
                      style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid var(--color-border)" }}
                    />
                  </div>

                  <div>
                    <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, marginBottom: 4 }}>
                      Telefon raqami:
                    </label>
                    <input
                      type="text"
                      value={tgConfig.clinicPhone}
                      onChange={(e) => setTgConfig({ ...tgConfig, clinicPhone: e.target.value })}
                      placeholder="+998 71 200-00-00"
                      style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid var(--color-border)" }}
                    />
                  </div>

                  <div>
                    <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, marginBottom: 4 }}>
                      Admin Telegram (@...):
                    </label>
                    <input
                      type="text"
                      value={tgConfig.clinicTg}
                      onChange={(e) => setTgConfig({ ...tgConfig, clinicTg: e.target.value })}
                      placeholder="stomatolog_admin"
                      style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid var(--color-border)" }}
                    />
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <button
                  type="submit"
                  className="btn"
                  disabled={isSavingTg}
                  style={{ background: "#2563eb", borderColor: "#2563eb" }}
                >
                  {isSavingTg ? "Saqlanmoqda & Ishga tushmoqda..." : "💾 Saqlash va Botni ishga tushirish"}
                </button>
                {tgConfig.botToken && (
                  <span style={{ fontSize: "0.85rem", color: "#16a34a" }}>
                    ✓ Token kiritilgan
                  </span>
                )}
              </div>
            </form>
          </div>

          {/* TEZKOR AMALLAR VA SINOV TUGMALARI */}
          <div style={{ borderTop: "1px solid var(--color-border)", paddingTop: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <button
                className="btn"
                style={{ background: "#10b981", borderColor: "#10b981" }}
                onClick={async () => {
                  setTgLoading(true);
                  setTgMsg("");
                  try {
                    const res = await api.post("/api/telegram/switch-polling", {});
                    setTgMsg(`✅ ${res.message || "Bot Polling rejimiga o'tkazildi"}`);
                    load();
                  } catch (err) {
                    setTgMsg(`Xatolik: ${err.message}`);
                  } finally {
                    setTgLoading(false);
                  }
                }}
                disabled={tgLoading}
              >
                📡 Polling rejimiga o'tish (Kafolatlangan faollik)
              </button>

              <button
                className="btn secondary"
                onClick={async () => {
                  setTgLoading(true);
                  setTgMsg("");
                  try {
                    const res = await api.post("/api/telegram/set-webhook", {});
                    setTgMsg(`✅ ${res.message || "Webhook muvaffaqiyatli yangilandi"}`);
                    load();
                  } catch (err) {
                    setTgMsg(`Webhook xatoligi: ${err.message}`);
                  } finally {
                    setTgLoading(false);
                  }
                }}
                disabled={tgLoading}
              >
                🚀 Webhook-ni qayta sinash
              </button>

              <button className="btn secondary" onClick={triggerTestNotify} disabled={tgLoading}>
                {tgLoading ? "Tekshirilmoqda..." : "🔔 Eslatmalarni tekshirish (Test Cron)"}
              </button>

              <button className="btn secondary" onClick={load}>
                🔄 Yangilash
              </button>
            </div>

            {tgMsg && (
              <div style={{ marginTop: 12, padding: "8px 12px", background: "var(--color-bg)", borderRadius: 6, fontSize: "0.9rem" }}>
                {tgMsg}
              </div>
            )}

            {tgStatus?.webhook?.lastErrorMessage && (
              <div style={{ marginTop: 10, padding: "8px 12px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 6, fontSize: "0.85rem", color: "#991b1b" }}>
                ⚠️ Telegram xabarnomasi: <strong>{tgStatus.webhook.lastErrorMessage}</strong>.
                {tgStatus.webhook.lastErrorMessage.includes("302") && (
                  <div style={{ marginTop: 4 }}>
                    (Tavsiya: "Polling rejimiga o'tish" tugmasini bosing — bot darhol barcha xabarlarni to'g'ridan-to'g'ri qabul qila boshlaydi).
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── 5. BULUTLI BAZA VA 24/7 AVTONOMLIK ── */}
      {tab === "database" && (
        <div className="panel" style={{ maxWidth: 840 }}>
          <h3 style={{ margin: "0 0 16px 0", display: "flex", alignItems: "center", gap: 8 }}>
            <span>☁️</span>
            <span>Doimiy Bulutli Baza & 24/7 Avtonom Ishlash Markazi</span>
          </h3>

          <div style={{ background: "var(--color-bg)", padding: 18, borderRadius: 8, marginBottom: 20, border: "1px solid var(--color-border)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: "1.3rem" }}>🛡️</span>
                <strong>Doimiy Bulutli Saqlash Holati:</strong>
              </div>
              <span className={`badge ${dbStatus?.connected ? "badge-success" : "badge-warning"}`} style={{ fontSize: "0.9rem", padding: "4px 10px" }}>
                {dbStatus?.connected ? "🟢 Google Cloud Firestore: Faol & Himoyalangan (24/7)" : "⚠️ Mahalliy rejim"}
              </span>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginTop: 12 }}>
              <div style={{ background: "#ffffff", padding: "12px 14px", borderRadius: 6, border: "1px solid var(--color-border)" }}>
                <div style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)", marginBottom: 4 }}>Bemorlar soni:</div>
                <div style={{ fontSize: "1.4rem", fontWeight: 700, color: "var(--color-primary)" }}>{dbStatus?.totalPatients || 0} ta</div>
              </div>
              <div style={{ background: "#ffffff", padding: "12px 14px", borderRadius: 6, border: "1px solid var(--color-border)" }}>
                <div style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)", marginBottom: 4 }}>Qabullar & Navbatlar:</div>
                <div style={{ fontSize: "1.4rem", fontWeight: 700, color: "#16a34a" }}>{dbStatus?.totalAppointments || 0} ta</div>
              </div>
              <div style={{ background: "#ffffff", padding: "12px 14px", borderRadius: 6, border: "1px solid var(--color-border)" }}>
                <div style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)", marginBottom: 4 }}>Xizmat turlari:</div>
                <div style={{ fontSize: "1.4rem", fontWeight: 700, color: "#9333ea" }}>{dbStatus?.totalServices || 0} ta</div>
              </div>
              <div style={{ background: "#ffffff", padding: "12px 14px", borderRadius: 6, border: "1px solid var(--color-border)" }}>
                <div style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)", marginBottom: 4 }}>Moliyaviy amallar:</div>
                <div style={{ fontSize: "1.4rem", fontWeight: 700, color: "#ea580c" }}>{dbStatus?.totalTransactions || 0} ta</div>
              </div>
            </div>

            <div style={{ marginTop: 14, fontSize: "0.85rem", color: "var(--color-text-secondary)", borderTop: "1px solid var(--color-border)", paddingTop: 10 }}>
              <div><strong>Bulut Loyihasi:</strong> {dbStatus?.projectId || "total-correlate-0v9wh"}</div>
              <div style={{ marginTop: 2 }}><strong>Firestore Database:</strong> {dbStatus?.databaseId || "ai-studio-dentalcliniccrm"}</div>
              <div style={{ marginTop: 2 }}><strong>So'nggi sinxronizatsiya:</strong> {dbStatus?.lastSynced ? new Date(dbStatus.lastSynced).toLocaleString("uz-UZ") : "Hozirgina"}</div>
            </div>
          </div>

          {/* AMALLAR TUGMALARI */}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 24 }}>
            <button
              className="btn"
              disabled={dbLoading}
              onClick={async () => {
                setDbLoading(true);
                setDbMsg("");
                try {
                  const res = await api.post("/api/storage/sync", {});
                  setDbMsg(`✅ ${res.message || "Barcha ma'lumotlar Firestore bulutiga muhrlandi!"}`);
                  load();
                } catch (e) {
                  setDbMsg(`Xatolik: ${e.message}`);
                } finally {
                  setDbLoading(false);
                }
              }}
              style={{ background: "#10b981", borderColor: "#10b981" }}
            >
              {dbLoading ? "Sinxronlanmoqda..." : "🚀 Hozir bulutga zaxiralash"}
            </button>

            <button
              className="btn secondary"
              disabled={dbLoading}
              onClick={async () => {
                if (!confirm("Google Cloud Firestore bulutidan barcha ma'lumotlarni qayta tiklashni tasdiqlaysizmi?")) return;
                setDbLoading(true);
                setDbMsg("");
                try {
                  const res = await api.post("/api/storage/restore", {});
                  setDbMsg(`✅ ${res.message || "Bulutdan ma'lumotlar tiklandi!"}`);
                  load();
                } catch (e) {
                  setDbMsg(`Xatolik: ${e.message}`);
                } finally {
                  setDbLoading(false);
                }
              }}
            >
              🔄 Bulutdan ma'lumotlarni tiklash
            </button>

            <a
              href="/api/storage/export-backup"
              download
              className="btn secondary"
              style={{ textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6 }}
            >
              📥 Lokal JSON zaxirasini yuklab olish
            </a>
          </div>

          {dbMsg && (
            <div style={{ marginBottom: 20, padding: "10px 14px", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 6, color: "#166534", fontSize: "0.9rem" }}>
              {dbMsg}
            </div>
          )}
        </div>
      )}

      {/* KATEGORIYA NOMINI TAHRIRLASH MODALI */}
      {editingCategory && (
        <Modal title={t("rename_category") || "Kategoriyani tahrirlash"} onClose={() => setEditingCategory(null)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleRenameCategory();
            }}
          >
            <div className="form-row">
              <label>{t("category_name")} *</label>
              <input
                required
                value={editingCategory.newName}
                onChange={(e) =>
                  setEditingCategory((prev) => ({ ...prev, newName: e.target.value }))
                }
                autoFocus
              />
            </div>
            <div className="form-actions">
              <button className="btn" type="submit">{t("save")}</button>
              <button className="btn secondary" type="button" onClick={() => setEditingCategory(null)}>
                {t("cancel")}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* XIZMAT FORMASI MODALI */}
      {modal && modal.kind === "service" && (
        <Modal
          title={modal.initial ? `✏️ ${t("edit")}: ${modal.initial.name}` : `+ Yangi xizmat`}
          onClose={() => setModal(null)}
        >
          <ServiceForm
            initial={modal.initial}
            defaultCategory={modal.defaultCategory}
            onSaved={() => {
              setModal(null);
              load();
            }}
            onCancel={() => setModal(null)}
          />
        </Modal>
      )}

      {/* XODIM FORMASI MODALI */}
      {modal && modal.kind === "staff" && (
        <Modal title={modal.initial ? `✏️ ${t("edit")}: ${modal.initial.full_name}` : `+ ${t("add")}`} onClose={() => setModal(null)}>
          <StaffForm
            initial={modal.initial}
            onSaved={() => {
              setModal(null);
              load();
            }}
            onCancel={() => setModal(null)}
          />
        </Modal>
      )}

      {/* FOYDALANUVCHI FORMASI MODALI */}
      {modal && modal.kind === "user" && (
        <Modal
          title={modal.initial ? `${t("edit")}: ${modal.initial.username}` : t("set_newUser")}
          onClose={() => setModal(null)}
        >
          <UserForm
            initial={modal.initial}
            onSaved={() => {
              setModal(null);
              load();
            }}
            onCancel={() => setModal(null)}
          />
        </Modal>
      )}
    </div>
  );
}
