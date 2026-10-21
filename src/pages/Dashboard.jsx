/**
 * Dashboard.jsx — Boshqaruv paneli (To'liq amallar va boshqaruv bilan)
 */

import React, { useEffect, useState, useCallback } from "react";
import dayjs from "dayjs";
import { api } from "../api.js";
import { useLang } from "../i18n.jsx";
import { StatCard, StatusBadge, Empty, ErrorBanner, Modal } from "../components/ui.jsx";
import { PatientCard } from "./Patients.jsx";

function ApptEditModal({ appt, staffList, onSaved, onCancel }) {
  const { t } = useLang();
  const [form, setForm] = useState({
    time: (appt.scheduled_at || "").slice(11, 16) || appt.time || "09:00",
    date: (appt.scheduled_at || "").slice(0, 10) || appt.date || dayjs().format("YYYY-MM-DD"),
    staff_id: appt.staff_id || "",
    duration_min: appt.duration_min || 30,
    complaint: appt.complaint || "",
    status: appt.status || "scheduled",
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api.put(`/api/appointments/${appt.id}`, form);
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={`✏️ ${t("edit")}: ${appt.patient_name}`} onClose={onCancel}>
      <form onSubmit={submit}>
        {error && <div className="error-msg mb">{error}</div>}
        <div className="form-grid">
          <div className="form-row">
            <label>{t("date")} *</label>
            <input type="date" required value={form.date} onChange={set("date")} />
          </div>
          <div className="form-row">
            <label>{t("time")} *</label>
            <input type="time" required value={form.time} onChange={set("time")} />
          </div>
          <div className="form-row">
            <label>{t("appt_doctor")}</label>
            <select value={form.staff_id} onChange={set("staff_id")}>
              <option value="">— {t("cal_allDoctors")} —</option>
              {staffList.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.full_name}
                </option>
              ))}
            </select>
          </div>
          <div className="form-row">
            <label>{t("status")}</label>
            <select value={form.status} onChange={set("status")}>
              <option value="scheduled">🔵 {t("st_scheduled")}</option>
              <option value="arrived">🟡 {t("st_arrived")}</option>
              <option value="completed">🟢 {t("st_completed")}</option>
              <option value="no_show">⚪ {t("st_no_show")}</option>
              <option value="cancelled">🔴 {t("st_cancelled")}</option>
            </select>
          </div>
          <div className="form-row">
            <label>{t("appt_duration")}</label>
            <input type="number" min="10" step="5" value={form.duration_min} onChange={set("duration_min")} />
          </div>
        </div>
        <div className="form-row">
          <label>{t("appt_complaint")}</label>
          <textarea rows={2} value={form.complaint} onChange={set("complaint")} placeholder="Shikoyat yoki maqsad..." />
        </div>
        <div className="form-actions">
          <button className="btn" disabled={busy} type="submit">{t("save")}</button>
          <button className="btn secondary" type="button" onClick={onCancel}>{t("cancel")}</button>
        </div>
      </form>
    </Modal>
  );
}

function NewApptModal({ onSaved, onCancel }) {
  const { t } = useLang();
  const [patients, setPatients] = useState([]);
  const [staff, setStaff] = useState([]);
  const [form, setForm] = useState({
    patient_id: "",
    staff_id: "",
    date: dayjs().format("YYYY-MM-DD"),
    time: "09:30",
    duration_min: 30,
    complaint: "",
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get("/api/patients?limit=200").then((d) => setPatients(d.patients || [])).catch(() => {});
    api.get("/api/staff").then((d) => setStaff((d.staff || []).filter((s) => s.active))).catch(() => {});
  }, []);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.patient_id) {
      setError("Bemor tanlanishi shart");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api.post("/api/appointments", form);
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={`+ ${t("appt_new")}`} onClose={onCancel}>
      <form onSubmit={submit}>
        {error && <div className="error-msg mb">{error}</div>}
        <div className="form-grid">
          <div className="form-row">
            <label>{t("appt_patient")} *</label>
            <select required value={form.patient_id} onChange={set("patient_id")}>
              <option value="">— {t("appt_patient")}ni tanlang —</option>
              {patients.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name} {p.phone ? `(${p.phone})` : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="form-row">
            <label>{t("appt_doctor")}</label>
            <select value={form.staff_id} onChange={set("staff_id")}>
              <option value="">— {t("cal_allDoctors")} —</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.full_name}
                </option>
              ))}
            </select>
          </div>
          <div className="form-row">
            <label>{t("date")} *</label>
            <input type="date" required value={form.date} onChange={set("date")} />
          </div>
          <div className="form-row">
            <label>{t("time")} *</label>
            <input type="time" required value={form.time} onChange={set("time")} />
          </div>
          <div className="form-row">
            <label>{t("appt_duration")}</label>
            <input type="number" min="10" step="5" value={form.duration_min} onChange={set("duration_min")} />
          </div>
        </div>
        <div className="form-row">
          <label>{t("appt_complaint")}</label>
          <textarea rows={2} value={form.complaint} onChange={set("complaint")} placeholder="Shikoyat..." />
        </div>
        <div className="form-actions">
          <button className="btn" disabled={busy} type="submit">{t("save")}</button>
          <button className="btn secondary" type="button" onClick={onCancel}>{t("cancel")}</button>
        </div>
      </form>
    </Modal>
  );
}

export default function Dashboard({ onNavigate }) {
  const { t } = useLang();
  const [data, setData] = useState(null);
  const [staffList, setStaffList] = useState([]);
  const [error, setError] = useState("");
  const [editingAppt, setEditingAppt] = useState(null);
  const [showNewAppt, setShowNewAppt] = useState(false);
  const [viewPatientCard, setViewPatientCard] = useState(null);
  const [statusFilter, setStatusFilter] = useState("all");

  const nav = useCallback((targetPage) => {
    if (typeof onNavigate === "function") {
      onNavigate(targetPage);
    } else {
      window.dispatchEvent(new CustomEvent("app:navigate", { detail: targetPage }));
    }
  }, [onNavigate]);

  const load = useCallback(() => {
    api.get("/api/dashboard")
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    load();
    api.get("/api/staff").then((d) => setStaffList((d.staff || []).filter((s) => s.active))).catch(() => {});
  }, [load]);

  // Real-time SSE eshituvchisi
  useEffect(() => {
    const onSSE = () => load();
    window.addEventListener("clinic:sse", onSSE);
    return () => window.removeEventListener("clinic:sse", onSSE);
  }, [load]);

  const updateStatus = async (id, status) => {
    try {
      await api.put(`/api/appointments/${id}/status`, { status });
      load();
    } catch (e) {
      setError(e.message);
    }
  };

  const deleteAppt = async (a) => {
    if (!confirm(`${t("confirmDelete")} (${a.patient_name})`)) return;
    try {
      await api.del(`/api/appointments/${a.id}`);
      load();
    } catch (e) {
      setError(e.message);
    }
  };

  if (error) return <ErrorBanner message={error} />;
  if (!data) return <p className="muted">{t("loading")}</p>;

  const fmtMoney = (n) => Number(n || 0).toLocaleString("ru-RU");

  const upcoming = data.upcoming || [];
  const filteredAppts = statusFilter === "all"
    ? upcoming
    : upcoming.filter((a) => a.status === statusFilter);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
        <div className="page-title" style={{ margin: 0 }}>📊 {t("nav_dashboard")}</div>
        <div className="toolbar" style={{ margin: 0 }}>
          <button className="btn" onClick={() => setShowNewAppt(true)}>
            + {t("appt_new")}
          </button>
          <button className="btn secondary" onClick={load} title="Yangilash">
            🔄
          </button>
        </div>
      </div>

      {data.pending_user_requests > 0 && (
        <div
          style={{
            background: "linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)",
            border: "1px solid #f87171",
            borderRadius: 8,
            padding: "14px 18px",
            marginBottom: 16,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 12,
            boxShadow: "0 2px 8px rgba(239, 68, 68, 0.15)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: "1.8rem" }}>🔔</span>
            <div>
              <strong style={{ color: "#991b1b", fontSize: "0.98rem", display: "block" }}>
                Google orqali ro'yxatdan o'tish so'rovi mavjud ({data.pending_user_requests} ta kutilmoqda)
              </strong>
              <span style={{ fontSize: "0.85rem", color: "#7f1d1d" }}>
                Yangi foydalanuvchilar tizimga kirish uchun ruxsat kutmoqda. Administrator sifatida ularni tasdiqlashingiz, rad qilishingiz yoki bloklashingiz mumkin.
              </span>
            </div>
          </div>
          <button
            type="button"
            className="btn small"
            style={{ background: "#dc2626", color: "#ffffff", border: "none", fontWeight: 700, padding: "7px 14px" }}
            onClick={() => window.dispatchEvent(new CustomEvent("open:access_requests"))}
          >
            So'rovlarni ko'rish va tasdiqlash →
          </button>
        </div>
      )}

      <div className="cards">
        <StatCard
          label={t("dash_todayAppts")}
          value={data.appointments?.total || 0}
          onClick={() => nav("appointments")}
        />
        <StatCard
          label={t("dash_income")}
          value={`${fmtMoney(data.income)} ${t("sum")}`}
          color="green"
          onClick={() => nav("finance")}
        />
        <StatCard
          label={t("dash_expense")}
          value={`${fmtMoney(data.expense)} ${t("sum")}`}
          color="red"
          onClick={() => nav("finance")}
        />
        <StatCard
          label={t("dash_patients")}
          value={data.total_patients}
          onClick={() => nav("patients")}
        />
        <StatCard
          label={t("dash_reminders")}
          value={data.pending_reminders}
          onClick={() => nav("reminders")}
        />
        <StatCard
          label={t("dash_complaints")}
          value={data.open_complaints}
          onClick={() => nav("complaints")}
        />
        {data.pending_user_requests > 0 && (
          <StatCard
            label="Kirish so'rovlari"
            value={`${data.pending_user_requests} ta`}
            color="red"
            onClick={() => window.dispatchEvent(new CustomEvent("open:access_requests"))}
          />
        )}
      </div>

      <div className="panel" style={{ marginTop: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
          <h3 style={{ margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
            <span>📅 {t("dash_upcoming")}</span>
            <span style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)", fontWeight: "normal" }}>
              ({filteredAppts.length} ta)
            </span>
          </h3>

          {/* Tezkor status filtrlari */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button
              className={`btn small ${statusFilter === "all" ? "" : "secondary"}`}
              onClick={() => setStatusFilter("all")}
            >
              {t("all")}
            </button>
            <button
              className={`btn small ${statusFilter === "scheduled" ? "" : "secondary"}`}
              onClick={() => setStatusFilter("scheduled")}
            >
              🔵 {t("st_scheduled")}
            </button>
            <button
              className={`btn small ${statusFilter === "arrived" ? "" : "secondary"}`}
              onClick={() => setStatusFilter("arrived")}
            >
              🟡 {t("st_arrived")}
            </button>
            <button
              className={`btn small ${statusFilter === "completed" ? "" : "secondary"}`}
              onClick={() => setStatusFilter("completed")}
            >
              🟢 {t("st_completed")}
            </button>
          </div>
        </div>

        {filteredAppts.length === 0 ? (
          <Empty />
        ) : (
          <table>
            <thead>
              <tr>
                <th>{t("time")}</th>
                <th>{t("appt_patient")}</th>
                <th>{t("appt_doctor")}</th>
                <th>{t("appt_complaint")}</th>
                <th>{t("status")}</th>
                <th>{t("change_status")}</th>
                <th>{t("actions")}</th>
              </tr>
            </thead>
            <tbody>
              {filteredAppts.map((a) => (
                <tr key={a.id}>
                  <td style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                    {(a.scheduled_at || "").slice(11, 16) || a.time || "—"}
                    <span style={{ fontSize: "0.75rem", color: "var(--color-text-secondary)", marginLeft: 4 }}>
                      ({a.duration_min || 30}m)
                    </span>
                  </td>
                  <td>
                    <button
                      type="button"
                      style={{ background: "none", border: "none", padding: 0, fontWeight: 600, color: "var(--color-primary)", cursor: "pointer", textDecoration: "underline" }}
                      onClick={() => setViewPatientCard({ id: a.patient_id, full_name: a.patient_name })}
                      title="Bemor kartasini ochish"
                    >
                      {a.patient_name}
                    </button>
                  </td>
                  <td>{a.staff_name || "—"}</td>
                  <td className="muted" style={{ maxWidth: 220, fontSize: "0.85rem" }}>
                    {a.complaint || "—"}
                  </td>
                  <td>
                    <StatusBadge status={a.status} />
                  </td>
                  <td>
                    {/* To'g'ridan-to'g'ri holatni o'zgartirish tanlagichi */}
                    <select
                      value={a.status}
                      onChange={(e) => updateStatus(a.id, e.target.value)}
                      style={{ padding: "4px 8px", fontSize: "0.82rem", borderRadius: 4, minWidth: 125 }}
                    >
                      <option value="scheduled">🔵 {t("st_scheduled")}</option>
                      <option value="arrived">🟡 {t("st_arrived")}</option>
                      <option value="completed">🟢 {t("st_completed")}</option>
                      <option value="no_show">⚪ {t("st_no_show")}</option>
                      <option value="cancelled">🔴 {t("st_cancelled")}</option>
                    </select>
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                      <button
                        className="btn small secondary"
                        onClick={() => setEditingAppt(a)}
                        title={t("edit")}
                      >
                        ✏️ {t("edit")}
                      </button>
                      <button
                        className="btn small"
                        style={{ background: "#0284c7", borderColor: "#0284c7" }}
                        onClick={() => setViewPatientCard({ id: a.patient_id, full_name: a.patient_name })}
                        title="Tish xaritasi & kartasi"
                      >
                        🦷 Kartasi
                      </button>
                      <button
                        className="btn small danger"
                        onClick={() => deleteAppt(a)}
                        title={t("delete")}
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

      {/* TAHRIRLASH MODALI */}
      {editingAppt && (
        <ApptEditModal
          appt={editingAppt}
          staffList={staffList}
          onSaved={() => {
            setEditingAppt(null);
            load();
          }}
          onCancel={() => setEditingAppt(null)}
        />
      )}

      {/* YANGI NAVBAT MODALI */}
      {showNewAppt && (
        <NewApptModal
          onSaved={() => {
            setShowNewAppt(false);
            load();
          }}
          onCancel={() => setShowNewAppt(false)}
        />
      )}

      {/* BEMOR KARTASI VA TISH XARITASI */}
      {viewPatientCard && (
        <PatientCard
          patient={viewPatientCard}
          initialTab="chart"
          onClose={() => setViewPatientCard(null)}
        />
      )}
    </div>
  );
}
