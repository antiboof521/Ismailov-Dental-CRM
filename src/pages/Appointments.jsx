/**
 * Appointments.jsx — Navbatlar va Google Calendar uslubidagi vizual Time-Grid taqvim
 */

import React, { useEffect, useState, useMemo } from "react";
import dayjs from "dayjs";
import { api } from "../api.js";
import { useLang } from "../i18n.jsx";
import { Modal, StatusBadge, Empty, ErrorBanner } from "../components/ui.jsx";
import CalendarGrid from "../components/CalendarGrid.jsx";
import { PatientCard } from "./Patients.jsx";
import AddressInput from "../components/AddressInput.jsx";

function ApptForm({ initial, onSaved, onCancel }) {
  const { t } = useLang();
  const [patients, setPatients] = useState([]);
  const [staff, setStaff] = useState([]);
  const [isNewPatient, setIsNewPatient] = useState(false);
  const [newPatient, setNewPatient] = useState({
    full_name: "",
    phone: "",
    birth_date: "",
    gender: "",
    address: "",
  });
  const [form, setForm] = useState({
    patient_id: initial?.patient_id || "",
    staff_id: initial?.staff_id || "",
    initial_staff_id: initial?.initial_staff_id || initial?.staff_id || "",
    final_staff_id: initial?.final_staff_id || "",
    date: initial?.date || dayjs().format("YYYY-MM-DD"),
    time: initial?.time || "09:00",
    duration_min: initial?.duration_min || 30,
    complaint: initial?.complaint || "",
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get("/api/patients?limit=300").then((d) => setPatients(d.patients || [])).catch(() => {});
    api.get("/api/staff").then((d) => setStaff((d.staff || []).filter((s) => s.active))).catch(() => {});
  }, []);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const setNewP = (k) => (e) => setNewPatient((p) => ({ ...p, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      let targetPatientId = form.patient_id;

      if (isNewPatient) {
        if (!newPatient.full_name.trim()) {
          setError("Yangi bemorning ism-sharifini kiriting");
          setBusy(false);
          return;
        }
        const created = await api.post("/api/patients", newPatient);
        targetPatientId = created.patient?.id || created.id;
      }

      if (!targetPatientId && !initial?.id) {
        setError("Iltimos, bemorni tanlang yoki yangi bemor kiriting");
        setBusy(false);
        return;
      }

      const payload = {
        ...form,
        patient_id: targetPatientId,
      };

      if (initial && initial.id) {
        await api.put(`/api/appointments/${initial.id}`, payload);
      } else {
        await api.post("/api/appointments", payload);
      }
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const durations = [15, 30, 45, 60, 90];

  return (
    <form onSubmit={submit}>
      {error && <div className="error-msg mb">{error}</div>}

      {/* Bemor tanlash yoki yangi bemor kiritish */}
      <div style={{ marginBottom: 14, background: "#f8fafc", padding: "10px 12px", borderRadius: 8, border: "1px solid #e2e8f0" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <label style={{ fontWeight: 600, fontSize: "0.9rem", margin: 0 }}>
            {t("appt_patient")} *
          </label>
          {!initial && (
            <button
              type="button"
              className="btn small secondary"
              style={{ padding: "2px 8px", fontSize: "0.78rem" }}
              onClick={() => setIsNewPatient((v) => !v)}
            >
              {isNewPatient ? "👥 Ro'yxatdan tanlash" : "+ Yangi bemor kiritish"}
            </button>
          )}
        </div>

        {isNewPatient ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div>
              <input
                required
                placeholder="Bemorning to'liq F.I.Sh *"
                value={newPatient.full_name}
                onChange={setNewP("full_name")}
                style={{ width: "100%" }}
              />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <input
                placeholder="Telefon (+998...)"
                value={newPatient.phone}
                onChange={setNewP("phone")}
              />
              <input
                type="date"
                title="Tug'ilgan sana"
                value={newPatient.birth_date}
                onChange={setNewP("birth_date")}
              />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <select value={newPatient.gender} onChange={setNewP("gender")}>
                <option value="">Jinsi: Tanlanmagan</option>
                <option value="male">👨 Erkak</option>
                <option value="female">👩 Ayol</option>
              </select>
              <AddressInput
                placeholder="Yashash manzili / Qo'shko'pir MFY..."
                value={newPatient.address}
                onChange={(val) => setNewPatient((p) => ({ ...p, address: val }))}
              />
            </div>
          </div>
        ) : (
          <select
            required
            value={form.patient_id}
            onChange={set("patient_id")}
            style={{ width: "100%" }}
          >
            <option value="">— {t("appt_patient")}ni tanlang —</option>
            {patients.map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name} {p.phone ? `(${p.phone})` : ""}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="form-grid">
        <div className="form-row">
          <label>👨‍⚕️ Dastlabki ko'rgan shifokor</label>
          <select
            value={form.initial_staff_id || form.staff_id || ""}
            onChange={(e) => {
              const val = e.target.value;
              setForm((f) => ({ ...f, initial_staff_id: val, staff_id: val }));
            }}
          >
            <option value="">— {t("cal_allDoctors")} —</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.full_name} ({s.position === "doctor" ? "Shifokor" : s.position})
              </option>
            ))}
          </select>
        </div>
        <div className="form-row">
          <label>🤝 Yakuniy / Yordamchi shifokor (2-shifokor)</label>
          <select
            value={form.final_staff_id || ""}
            onChange={(e) => {
              const val = e.target.value;
              setForm((f) => ({ ...f, final_staff_id: val }));
            }}
          >
            <option value="">— Kerak bo'lsa tanlang (ixtiyoriy) —</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.full_name} ({s.position === "doctor" ? "Shifokor" : s.position})
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
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input
              type="number"
              min="10"
              step="5"
              value={form.duration_min}
              onChange={set("duration_min")}
              style={{ width: "90px" }}
            />
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {durations.map((d) => (
                <button
                  key={d}
                  type="button"
                  className={`btn small ${form.duration_min === d ? "" : "secondary"}`}
                  onClick={() => setForm((f) => ({ ...f, duration_min: d }))}
                  style={{ padding: "3px 7px", fontSize: "0.75rem" }}
                >
                  {d}m
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="form-row">
        <label>{t("appt_complaint")}</label>
        <textarea
          rows={2}
          placeholder="Masalan: Tish og'rig'i, konsultatsiya yoki tish toshlarini tozalash..."
          value={form.complaint}
          onChange={set("complaint")}
        />
      </div>
      <div className="form-actions">
        <button className="btn" disabled={busy} type="submit">{t("save")}</button>
        <button className="btn secondary" type="button" onClick={onCancel}>{t("cancel")}</button>
      </div>
    </form>
  );
}

function ApptDetailModal({ appt, onClose, onEdit, onDelete, onStatusChange, onViewPatient }) {
  const { t } = useLang();
  const apptTime = (appt.scheduled_at || "").slice(11, 16) || appt.time || "—";
  const apptDate = (appt.scheduled_at || "").slice(0, 10) || appt.date || "—";

  return (
    <Modal title={`📅 Navbat: ${appt.patient_name}`} onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--color-border)", paddingBottom: 10 }}>
          <div>
            <div style={{ fontSize: "1.2rem", fontWeight: 700, color: "var(--color-text)" }}>
              👤 {appt.patient_name}
            </div>
            <div style={{ fontSize: "0.85rem", color: "#64748b", marginTop: 2 }}>
              👨‍⚕️ Dastlabki ko'rgan: <strong>{appt.initial_staff_name || appt.staff_name || "Belgilanmagan"}</strong>
              {appt.final_staff_name && (
                <span style={{ marginLeft: 6, color: "#059669" }}>
                  · 🤝 Yakuniy/Yordamchi: <strong>{appt.final_staff_name}</strong>
                </span>
              )}
            </div>
          </div>
          <div>
            <StatusBadge status={appt.status} />
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, background: "#f8fafc", padding: 12, borderRadius: 8 }}>
          <div>
            <div style={{ fontSize: "0.75rem", color: "#64748b" }}>Sana</div>
            <div style={{ fontWeight: 600 }}>🗓 {apptDate}</div>
          </div>
          <div>
            <div style={{ fontSize: "0.75rem", color: "#64748b" }}>Vaqt va davomiylik</div>
            <div style={{ fontWeight: 600 }}>⏱ {apptTime} ({appt.duration_min || 30} daqiqa)</div>
          </div>
          {appt.complaint && (
            <div style={{ gridColumn: "span 2" }}>
              <div style={{ fontSize: "0.75rem", color: "#64748b" }}>Shikoyat / Maqsad</div>
              <div style={{ color: "#334155", fontStyle: "italic" }}>"{appt.complaint}"</div>
            </div>
          )}
        </div>

        {/* Holatni tezkor o'zgartirish tugmalari */}
        <div>
          <div style={{ fontSize: "0.8rem", fontWeight: 600, color: "#64748b", marginBottom: 6 }}>
            {t("change_status")}:
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button
              className={`btn small ${appt.status === "scheduled" ? "" : "secondary"}`}
              style={{ background: appt.status === "scheduled" ? "#2563eb" : "", borderColor: "#2563eb", color: appt.status === "scheduled" ? "#fff" : "#1d4ed8" }}
              onClick={() => onStatusChange(appt.id, "scheduled")}
            >
              🔵 {t("st_scheduled")}
            </button>
            <button
              className={`btn small ${appt.status === "arrived" ? "" : "secondary"}`}
              style={{ background: appt.status === "arrived" ? "#f59e0b" : "", borderColor: "#f59e0b", color: appt.status === "arrived" ? "#fff" : "#b45309" }}
              onClick={() => onStatusChange(appt.id, "arrived")}
            >
              🟡 {t("st_arrived")}
            </button>
            <button
              className={`btn small ${appt.status === "completed" ? "" : "secondary"}`}
              style={{ background: appt.status === "completed" ? "#10b981" : "", borderColor: "#10b981", color: appt.status === "completed" ? "#fff" : "#065f46" }}
              onClick={() => onStatusChange(appt.id, "completed")}
            >
              🟢 {t("st_completed")}
            </button>
            <button
              className={`btn small ${appt.status === "no_show" ? "" : "secondary"}`}
              onClick={() => onStatusChange(appt.id, "no_show")}
            >
              ⚪ {t("st_no_show")}
            </button>
            <button
              className={`btn small secondary`}
              style={{ color: "#ef4444" }}
              onClick={() => onStatusChange(appt.id, "cancelled")}
            >
              🔴 {t("st_cancelled")}
            </button>
          </div>
        </div>

        {/* Asosiy harakatlar */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid var(--color-border)", paddingTop: 14, flexWrap: "wrap", gap: 8 }}>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              className="btn small"
              style={{ background: "#0284c7", borderColor: "#0284c7" }}
              onClick={() => onViewPatient(appt.patient_id, appt.patient_name)}
            >
              🦷 Tish xaritasi & Kartochka
            </button>
            <button className="btn small secondary" onClick={() => onEdit(appt)}>
              ✏️ {t("edit")}
            </button>
          </div>
          <button className="btn small danger" onClick={() => onDelete(appt)}>
            🗑 {t("delete")}
          </button>
        </div>
      </div>
    </Modal>
  );
}

export default function Appointments() {
  const { t } = useLang();
  const [date, setDate] = useState(dayjs().format("YYYY-MM-DD"));
  const [viewMode, setViewMode] = useState("day"); // "day" | "week" | "table"
  const [rows, setRows] = useState([]);
  const [staff, setStaff] = useState([]);
  const [selectedStaffId, setSelectedStaffId] = useState("");
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [formInitial, setFormInitial] = useState(null);
  const [editing, setEditing] = useState(null);
  const [viewingAppt, setViewingAppt] = useState(null);
  const [patientCardTarget, setPatientCardTarget] = useState(null);

  // Shifokorlar ro'yxatini yuklash
  useEffect(() => {
    api.get("/api/staff").then((d) => setStaff((d.staff || []).filter((s) => s.active))).catch(() => {});
  }, []);

  // Hafta oralig'ini hisoblash
  const weekRange = useMemo(() => {
    const cur = dayjs(date);
    const start = cur.startOf("week").add(1, "day"); // Du
    const end = start.add(6, "day"); // Yak
    return {
      from: start.format("YYYY-MM-DD"),
      to: end.format("YYYY-MM-DD"),
    };
  }, [date]);

  const load = () => {
    let url = `/api/appointments?date=${date}`;
    if (viewMode === "week") {
      url = `/api/appointments?from=${weekRange.from}&to=${weekRange.to}`;
    }
    if (selectedStaffId) {
      url += `&staff_id=${selectedStaffId}`;
    }

    api.get(url)
      .then((d) => setRows(d.appointments || []))
      .catch((e) => setError(e.message));
  };

  useEffect(load, [date, viewMode, selectedStaffId, weekRange.from, weekRange.to]);

  // Real-time SSE eshituvchisi
  useEffect(() => {
    const onSSE = (e) => {
      const type = e.detail?.type;
      if (!type || type.startsWith("appointment:") || type.startsWith("patient:") || type === "storage:updated") {
        load();
      }
    };
    window.addEventListener("clinic:sse", onSSE);
    return () => window.removeEventListener("clinic:sse", onSSE);
  }, [date, viewMode, selectedStaffId, weekRange.from, weekRange.to]);

  // Kunlar / haftalar bo'yicha harakatlanish
  const shiftDate = (amount) => {
    if (viewMode === "week") {
      setDate((d) => dayjs(d).add(amount * 7, "day").format("YYYY-MM-DD"));
    } else {
      setDate((d) => dayjs(d).add(amount, "day").format("YYYY-MM-DD"));
    }
  };

  const goToday = () => setDate(dayjs().format("YYYY-MM-DD"));

  const setStatus = async (id, status) => {
    try {
      if (status === "cancelled" && !confirm(t("removeConfirm"))) return;
      await api.put(`/api/appointments/${id}/status`, { status });
      if (viewingAppt && viewingAppt.id === id) {
        setViewingAppt((prev) => (prev ? { ...prev, status } : null));
      }
      load();
    } catch (e) {
      setError(e.message);
    }
  };

  const delAppt = async (a) => {
    const patientName = a.patient_name || "Bemor";
    const apptTime = a.time || (a.scheduled_at || "").slice(11, 16) || "";
    if (!confirm(`Haqiqatan ham ${patientName}ni qabuldan o'chirmoqchimisiz? (${a.date || ""} ${apptTime})`)) return;
    try {
      await api.del(`/api/appointments/${a.id}`);
      if (viewingAppt && viewingAppt.id === a.id) {
        setViewingAppt(null);
      }
      load();
    } catch (e) {
      setError(e.message);
    }
  };

  // Bo'sh slotga bosilganda yangi navbat oynasini ochish
  const handleSlotClick = ({ date: slotDate, time: slotTime, staff_id: slotStaffId }) => {
    setFormInitial({
      date: slotDate,
      time: slotTime,
      staff_id: slotStaffId || selectedStaffId || "",
      duration_min: 30,
    });
    setShowForm(true);
  };

  // Statistika hisoblash
  const stats = useMemo(() => {
    const total = rows.length;
    const scheduled = rows.filter((r) => r.status === "scheduled").length;
    const arrived = rows.filter((r) => r.status === "arrived").length;
    const completed = rows.filter((r) => r.status === "completed").length;
    return { total, scheduled, arrived, completed };
  }, [rows]);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
        <div className="page-title" style={{ margin: 0 }}>
          📅 {t("nav_appointments")}
        </div>

        {/* Rejim tugmalari: Kunlik, Haftalik, Jadval */}
        <div className="toolbar" style={{ margin: 0 }}>
          <div style={{ display: "flex", border: "1px solid var(--color-border)", borderRadius: "8px", overflow: "hidden", background: "#f1f5f9" }}>
            <button
              type="button"
              className={`btn small ${viewMode === "day" ? "" : "secondary"}`}
              style={{ borderRadius: 0, border: "none" }}
              onClick={() => setViewMode("day")}
            >
              📅 {t("cal_day")} (Time-Grid)
            </button>
            <button
              type="button"
              className={`btn small ${viewMode === "week" ? "" : "secondary"}`}
              style={{ borderRadius: 0, border: "none" }}
              onClick={() => setViewMode("week")}
            >
              📆 {t("cal_week")}
            </button>
            <button
              type="button"
              className={`btn small ${viewMode === "table" ? "" : "secondary"}`}
              style={{ borderRadius: 0, border: "none" }}
              onClick={() => setViewMode("table")}
            >
              📋 {t("cal_table")}
            </button>
          </div>

          <button
            className="btn"
            onClick={() => {
              setFormInitial(null);
              setShowForm(true);
            }}
          >
            + {t("appt_new")}
          </button>
        </div>
      </div>

      {error && <ErrorBanner message={error} />}

      {/* TAQVIM BOSHQARUV PANEL: Oldingi, Bugun, Keyingi, Sana tanlash, Shifokor filtri */}
      <div
        className="panel"
        style={{
          marginBottom: 14,
          padding: "10px 14px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <button className="btn small secondary" onClick={() => shiftDate(-1)} title="Oldingi">
            ◀
          </button>
          <button className="btn small" onClick={goToday} style={{ background: "#475569", borderColor: "#475569" }}>
            {t("cal_today")}
          </button>
          <button className="btn small secondary" onClick={() => shiftDate(1)} title="Keyingi">
            ▶
          </button>

          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            style={{ width: "150px", marginLeft: 6 }}
          />

          <span style={{ fontWeight: 600, fontSize: "0.95rem", color: "#1e293b", marginLeft: 6 }}>
            {viewMode === "week"
              ? `${dayjs(weekRange.from).format("DD MMM")} — ${dayjs(weekRange.to).format("DD MMM, YYYY")}`
              : dayjs(date).format("DD MMMM YYYY (dddd)")}
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          {/* Shifokor bo'yicha filter */}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: "0.85rem", color: "#64748b" }}>👨‍⚕️ {t("appt_doctor")}:</span>
            <select
              value={selectedStaffId}
              onChange={(e) => setSelectedStaffId(e.target.value)}
              style={{ minWidth: "160px" }}
            >
              <option value="">— {t("cal_allDoctors")} —</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.full_name}
                </option>
              ))}
            </select>
          </div>

          {/* Qisqacha status statistikasi */}
          <div style={{ display: "flex", gap: 6, fontSize: "0.8rem" }}>
            <span className="badge blue" title="Kutilmoqda">
              🔵 {stats.scheduled}
            </span>
            <span className="badge yellow" title="Keldi / Qabulda">
              🟡 {stats.arrived}
            </span>
            <span className="badge green" title="Tugallandi">
              🟢 {stats.completed}
            </span>
          </div>
        </div>
      </div>

      {/* VIZUAL TAQVIM REJIMLARI */}
      {viewMode === "day" && (
        <CalendarGrid
          viewMode="day"
          date={date}
          appointments={rows}
          staff={staff}
          selectedStaffId={selectedStaffId}
          onSlotClick={handleSlotClick}
          onApptClick={(a) => setViewingAppt(a)}
          onStatusChange={setStatus}
        />
      )}

      {viewMode === "week" && (
        <CalendarGrid
          viewMode="week"
          date={date}
          appointments={rows}
          staff={staff}
          selectedStaffId={selectedStaffId}
          onSlotClick={handleSlotClick}
          onApptClick={(a) => setViewingAppt(a)}
          onStatusChange={setStatus}
        />
      )}

      {/* KLASSIK JADVAL REJIMI */}
      {viewMode === "table" && (
        <div className="panel">
          {rows.length === 0 ? (
            <Empty />
          ) : (
            <table>
              <thead>
                <tr>
                  <th>{t("date")}</th>
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
                {rows.map((a) => (
                  <tr key={a.id}>
                    <td>{(a.scheduled_at || "").slice(0, 10) || a.date}</td>
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
                        onClick={() => setPatientCardTarget({ id: a.patient_id, full_name: a.patient_name })}
                        title="Bemor kartasini ochish"
                      >
                        {a.patient_name}
                      </button>
                    </td>
                    <td>
                      <div>
                        {a.initial_staff_name ? (
                          <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "#0f172a" }}>
                            👨‍⚕️ <span style={{ color: "#2563eb", fontSize: "0.78rem" }}>Dastlab:</span> {a.initial_staff_name}
                          </div>
                        ) : a.staff_name ? (
                          <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "#0f172a" }}>
                            👨‍⚕️ {a.staff_name}
                          </div>
                        ) : (
                          <span className="muted" style={{ fontSize: "0.82rem" }}>Biriktirilmagan</span>
                        )}
                        {a.final_staff_name && (
                          <div style={{ fontSize: "0.8rem", color: "#059669", marginTop: 2, fontWeight: 500 }}>
                            🤝 <span style={{ fontSize: "0.75rem", fontWeight: 700 }}>Yakuniy:</span> {a.final_staff_name}
                          </div>
                        )}
                      </div>
                    </td>
                    <td>
                      <StatusBadge status={a.status} />
                    </td>
                    <td>
                      <select
                        value={a.status}
                        onChange={(e) => setStatus(a.id, e.target.value)}
                        style={{ padding: "4px 8px", fontSize: "0.82rem", borderRadius: 4, minWidth: 120 }}
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
                        <button className="btn small secondary" onClick={() => setEditing(a)} title={t("edit")}>
                          ✏️ {t("edit")}
                        </button>
                        <button
                          className="btn small"
                          style={{ background: "#0284c7", borderColor: "#0284c7" }}
                          onClick={() => setPatientCardTarget({ id: a.patient_id, full_name: a.patient_name })}
                          title="Tish kartasi"
                        >
                          🦷 Kartasi
                        </button>
                        <button className="btn small danger" onClick={() => delAppt(a)} title={t("delete")}>
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

      {/* YANGI NAVBAT MODAL */}
      {showForm && (
        <Modal title={t("appt_new")} onClose={() => setShowForm(false)}>
          <ApptForm
            initial={formInitial}
            onSaved={() => {
              setShowForm(false);
              setFormInitial(null);
              load();
            }}
            onCancel={() => {
              setShowForm(false);
              setFormInitial(null);
            }}
          />
        </Modal>
      )}

      {/* TAHRIRLASH MODAL */}
      {editing && (
        <Modal title={t("edit")} onClose={() => setEditing(null)}>
          <ApptForm
            initial={{
              ...editing,
              date: (editing.scheduled_at || "").slice(0, 10) || editing.date,
              time: (editing.scheduled_at || "").slice(11, 16) || editing.time,
            }}
            onSaved={() => {
              setEditing(null);
              load();
            }}
            onCancel={() => setEditing(null)}
          />
        </Modal>
      )}

      {/* NAVBAT TAFSILOTLARI MODAL (Calendar kartochkasini bosganda ochiladi) */}
      {viewingAppt && (
        <ApptDetailModal
          appt={viewingAppt}
          onClose={() => setViewingAppt(null)}
          onEdit={(a) => {
            setViewingAppt(null);
            setEditing(a);
          }}
          onDelete={delAppt}
          onStatusChange={setStatus}
          onViewPatient={(patientId, patientName) => {
            setViewingAppt(null);
            setPatientCardTarget({ id: patientId, full_name: patientName });
          }}
        />
      )}

      {/* BEMOR KARTOCHKASI & ODONTOGRAMMA (Navbatdan to'g'ridan-to'g'ri ochish) */}
      {patientCardTarget && (
        <PatientCard
          patient={patientCardTarget}
          initialTab="chart"
          onClose={() => setPatientCardTarget(null)}
        />
      )}
    </div>
  );
}
