/**
 * Visits.jsx — qabul (visits) sahifasi
 */

import React, { useEffect, useState } from "react";
import { api } from "../api.js";
import { useLang } from "../i18n.jsx";
import { Modal, Empty, ErrorBanner } from "../components/ui.jsx";
import DentalChart from "../components/DentalChart.jsx";
import { PatientCard } from "./Patients.jsx";

function VisitForm({ onSaved, onCancel }) {
  const { t } = useLang();
  const [services, setServices] = useState([]);
  const [staff, setStaff] = useState([]);
  const [patients, setPatients] = useState([]);
  const [form, setForm] = useState({
    patient_id: "",
    staff_id: "",
    initial_staff_id: "",
    final_staff_id: "",
    split_ratio: 50,
    complaint: "",
    diagnosis: "",
    recommendations: "",
  });
  const [items, setItems] = useState([]); // [{ service_id, tooth, price }]
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showChart, setShowChart] = useState(false);
  const [patientChart, setPatientChart] = useState({});
  const [activeItemIndex, setActiveItemIndex] = useState(0);

  useEffect(() => {
    api.get("/api/services").then((d) => setServices(d.services || [])).catch(() => {});
    api.get("/api/staff").then((d) => setStaff((d.staff || []).filter((s) => s.active))).catch(() => {});
    api.get("/api/patients?limit=200").then((d) => setPatients(d.patients || [])).catch(() => {});
  }, []);

  // Bemor tanlanganda uning tish formulasini yuklash
  useEffect(() => {
    if (form.patient_id) {
      api.get(`/api/patients/${form.patient_id}/dental-chart`)
        .then((d) => setPatientChart(d.chart || {}))
        .catch(() => setPatientChart({}));
    }
  }, [form.patient_id]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const addItem = () => {
    setItems((arr) => [...arr, { service_id: "", tooth: "", price: 0 }]);
    setActiveItemIndex(items.length);
  };
  const setItem = (i, k, v) => setItems((arr) => arr.map((it, idx) => (idx === i ? { ...it, [k]: v } : it)));
  const removeItem = (i) => setItems((arr) => arr.filter((_, idx) => idx !== i));

  const pickService = (i, serviceId) => {
    const svc = services.find((s) => String(s.id) === String(serviceId));
    setItems((arr) => arr.map((it, idx) => (idx === i ? { ...it, service_id: serviceId, price: svc ? Number(svc.price) : 0 } : it)));
  };

  const handleToothSelect = (toothNum) => {
    if (items.length === 0) {
      setItems([{ service_id: "", tooth: String(toothNum), price: 0 }]);
      setActiveItemIndex(0);
      return;
    }
    const targetIdx = activeItemIndex !== null && activeItemIndex < items.length ? activeItemIndex : items.length - 1;
    setItem(targetIdx, "tooth", String(toothNum));
  };

  const total = items.reduce((s, it) => s + Number(it.price || 0), 0);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (items.length === 0) { setError(t("visit_noServices")); return; }
    setBusy(true);
    try {
      const initId = form.initial_staff_id ? parseInt(form.initial_staff_id, 10) : (form.staff_id ? parseInt(form.staff_id, 10) : null);
      const finId = form.final_staff_id ? parseInt(form.final_staff_id, 10) : null;
      await api.post("/api/visits", {
        ...form,
        patient_id: form.patient_id ? parseInt(form.patient_id, 10) : null,
        staff_id: initId,
        initial_staff_id: initId,
        final_staff_id: finId,
        split_ratio: finId ? Number(form.split_ratio || 50) : 50,
        procedures: items.map((it) => ({
          service_id: it.service_id ? parseInt(it.service_id, 10) : null,
          tooth: it.tooth,
          price: Number(it.price || 0),
          initial_staff_id: initId,
          final_staff_id: finId,
          split_ratio: finId ? Number(form.split_ratio || 50) : 50,
        })),
      });

      // Agar tish formulasi o'zgargan bo'lsa, uni ham yangilash
      if (form.patient_id && Object.keys(patientChart).length > 0) {
        api.put(`/api/patients/${form.patient_id}/dental-chart`, { chart: patientChart }).catch(() => {});
      }

      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const hasTwoDoctors = Boolean(form.final_staff_id && form.final_staff_id !== (form.initial_staff_id || form.staff_id));
  const initStaff = staff.find((s) => String(s.id) === String(form.initial_staff_id || form.staff_id));
  const finStaff = staff.find((s) => String(s.id) === String(form.final_staff_id));

  return (
    <form onSubmit={submit}>
      {error && <div className="error-msg mb">{error}</div>}
      <div className="form-grid">
        <div className="form-row">
          <label>{t("appt_patient")} *</label>
          <select required value={form.patient_id} onChange={set("patient_id")}>
            <option value="">— Bemor tanlang —</option>
            {patients.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
          </select>
        </div>
        <div className="form-row">
          <label>👨‍⚕️ Dastlabki ko'rgan / qabul qilgan shifokor</label>
          <select
            value={form.initial_staff_id || form.staff_id || ""}
            onChange={(e) => {
              const val = e.target.value;
              setForm((f) => ({ ...f, initial_staff_id: val, staff_id: val }));
            }}
          >
            <option value="">— Shifokor tanlang —</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.full_name} ({s.position === "doctor" ? "Shifokor" : s.position})
              </option>
            ))}
          </select>
        </div>
        <div className="form-row">
          <label>🤝 Yakuniy / Muolaja qilgan shifokor (2-shifokor)</label>
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

        {/* 2 KISHI BAJARGANDA TAYYOR TUGMALAR BILAN ULUSHNI BO'LISH */}
        {hasTwoDoctors && (
          <div style={{ gridColumn: "1 / -1", background: "#f8fafc", border: "1.5px dashed #94a3b8", borderRadius: 10, padding: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, flexWrap: "wrap", gap: 6 }}>
              <span style={{ fontWeight: 700, fontSize: "0.9rem", color: "#0f172a" }}>
                👥 2 kishi bajargan ish summasini taqsimlash:
              </span>
              <span className="badge blue" style={{ fontWeight: 700 }}>
                {form.split_ratio || 50}% / {100 - (form.split_ratio || 50)}%
              </span>
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
              {[
                { label: "50% / 50% (Teng 2 ga)", val: 50 },
                { label: "60% / 40%", val: 60 },
                { label: "70% / 30%", val: 70 },
                { label: "80% / 20%", val: 80 },
              ].map((item) => (
                <button
                  key={item.val}
                  type="button"
                  className={`btn small ${Number(form.split_ratio) === item.val ? "" : "secondary"}`}
                  onClick={() => setForm((f) => ({ ...f, split_ratio: item.val }))}
                  style={{ fontWeight: Number(form.split_ratio) === item.val ? 700 : 500 }}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span style={{ fontSize: "0.85rem", color: "#475569", fontWeight: 600 }}>Ixtiyoriy ulush (%):</span>
              <input
                type="number"
                min="1"
                max="99"
                value={form.split_ratio}
                onChange={(e) => {
                  const num = Math.min(99, Math.max(1, Number(e.target.value) || 50));
                  setForm((f) => ({ ...f, split_ratio: num }));
                }}
                style={{ width: 75, textAlign: "center", fontWeight: 700 }}
              />
              <span style={{ fontSize: "0.85rem", color: "#64748b" }}>
                Boshlovchi: <strong>{form.split_ratio || 50}%</strong> | Yordamchi: <strong>{100 - (form.split_ratio || 50)}%</strong>
              </span>
            </div>
            {total > 0 && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10, background: "#fff", padding: 10, borderRadius: 8, border: "1px solid #e2e8f0" }}>
                <div>
                  <div style={{ fontSize: "0.78rem", color: "#64748b" }}>👨‍⚕️ {initStaff?.full_name || "1-shifokor"}:</div>
                  <div style={{ fontWeight: 700, color: "#16a34a", fontSize: "0.95rem" }}>
                    {Math.round((total * (form.split_ratio || 50)) / 100).toLocaleString("ru-RU")} so'm ({form.split_ratio || 50}%)
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: "0.78rem", color: "#64748b" }}>🤝 {finStaff?.full_name || "2-shifokor"}:</div>
                  <div style={{ fontWeight: 700, color: "#2563eb", fontSize: "0.95rem" }}>
                    {Math.round((total * (100 - (form.split_ratio || 50))) / 100).toLocaleString("ru-RU")} so'm ({100 - (form.split_ratio || 50)}%)
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="form-row">
          <label>{t("appt_complaint")}</label>
          <input value={form.complaint} onChange={set("complaint")} placeholder="Shikoyat..." />
        </div>
        <div className="form-row">
          <label>{t("visit_diagnosis")}</label>
          <input value={form.diagnosis} onChange={set("diagnosis")} placeholder="Tashxis..." />
        </div>
      </div>
      <div className="form-row">
        <label>{t("visit_recs")}</label>
        <textarea rows={2} value={form.recommendations} onChange={set("recommendations")} placeholder="Tavsiyalar..." />
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "14px 0 8px", flexWrap: "wrap", gap: 8 }}>
        <h3 style={{ margin: 0 }}>{t("visit_services")}</h3>
        <button
          type="button"
          className={`btn small ${showChart ? "" : "secondary"}`}
          onClick={() => setShowChart(!showChart)}
          style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
        >
          <span>🦷</span>
          <span>{showChart ? "Tish xaritasini yashirish ▲" : "Interaktiv Tish Xaritasi ▼"}</span>
        </button>
      </div>

      {/* INTERAKTIV ODONTOGRAMMA (KO'RSATISH / TANLASH) */}
      {showChart && (
        <div style={{ marginBottom: 14, border: "1px solid var(--color-primary, #3b82f6)", borderRadius: 12, padding: 10, background: "#f8fafc" }}>
          <div style={{ fontSize: "0.85rem", color: "var(--color-primary, #3b82f6)", fontWeight: 500, marginBottom: 8 }}>
            ℹ️ Tish ustiga bosing — raqam quyidagi xizmat qatoriga avtomatik kiritiladi va uning holatini ham belgilashingiz mumkin.
          </div>
          <DentalChart
            chart={patientChart}
            selectable
            selectedTooth={items[activeItemIndex]?.tooth || null}
            onSelectTooth={handleToothSelect}
            onChange={setPatientChart}
          />
        </div>
      )}

      {items.map((it, i) => (
        <div
          key={i}
          className="toolbar"
          style={{
            marginBottom: 6,
            background: activeItemIndex === i ? "var(--color-primary-light, #eff6ff)" : "transparent",
            padding: "4px 8px",
            borderRadius: 6,
            border: activeItemIndex === i ? "1px solid #bfdbfe" : "1px solid transparent",
          }}
          onClick={() => setActiveItemIndex(i)}
        >
          <select value={it.service_id} onChange={(e) => pickService(i, e.target.value)} style={{ flex: 2 }}>
            <option value="">— {t("visit_service")} —</option>
            {services.map((s) => <option key={s.id} value={s.id}>{s.name} ({Number(s.price).toLocaleString("ru-RU")})</option>)}
          </select>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <input
              placeholder={t("visit_tooth")}
              value={it.tooth}
              onChange={(e) => setItem(i, "tooth", e.target.value)}
              style={{ width: 80, fontWeight: "bold" }}
            />
            <button
              type="button"
              className="btn small secondary"
              title="Tish xaritasidan tanlash"
              onClick={() => {
                setActiveItemIndex(i);
                setShowChart(true);
              }}
              style={{ padding: "4px 8px" }}
            >
              🦷
            </button>
          </div>
          <input type="number" min="0" value={it.price} onChange={(e) => setItem(i, "price", e.target.value)} style={{ width: 120 }} />
          <button type="button" className="btn small danger" onClick={() => removeItem(i)}>✕</button>
        </div>
      ))}
      <div className="toolbar">
        <button type="button" className="btn secondary small" onClick={addItem}>+ {t("visit_addService")}</button>
        <strong>{t("visit_total")}: {total.toLocaleString("ru-RU")} {t("sum")}</strong>
      </div>

      <div className="form-actions">
        <button className="btn" disabled={busy} type="submit">{t("save")}</button>
        <button className="btn secondary" type="button" onClick={onCancel}>{t("cancel")}</button>
      </div>
    </form>
  );
}

export default function Visits() {
  const { t } = useLang();
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [cardTarget, setCardTarget] = useState(null);

  const load = () => {
    api.get("/api/visits?limit=100").then((d) => setRows(d.visits || [])).catch((e) => setError(e.message));
  };
  useEffect(load, []);

  return (
    <div>
      <div className="page-title">🦷 {t("nav_visits")}</div>
      {error && <ErrorBanner message={error} />}
      <div className="panel">
        <div className="toolbar">
          <button className="btn" onClick={() => setShowForm(true)}>+ {t("visit_new")}</button>
        </div>
        {rows.length === 0 ? <Empty /> : (
          <table>
            <thead>
              <tr>
                <th>{t("date")}</th>
                <th>{t("appt_patient")}</th>
                <th>{t("appt_doctor")}</th>
                <th>{t("visit_diagnosis")}</th>
                <th>{t("appt_complaint")}</th>
                <th>{t("actions")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((v) => (
                <tr key={v.id}>
                  <td>{(v.visit_date || "").slice(0, 10)}</td>
                  <td>
                    <button
                      type="button"
                      style={{ background: "none", border: "none", padding: 0, fontWeight: 600, color: "var(--color-primary)", cursor: "pointer", textDecoration: "underline" }}
                      onClick={() => setCardTarget({ id: v.patient_id, full_name: v.patient_name })}
                    >
                      {v.patient_name}
                    </button>
                  </td>
                  <td>
                    <div>
                      {v.initial_staff_name ? (
                        <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "#0f172a" }}>
                          👨‍⚕️ <span style={{ color: "#2563eb", fontSize: "0.78rem" }}>Dastlab:</span> {v.initial_staff_name}
                        </div>
                      ) : v.staff_name ? (
                        <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "#0f172a" }}>
                          👨‍⚕️ {v.staff_name}
                        </div>
                      ) : (
                        <span className="muted" style={{ fontSize: "0.82rem" }}>—</span>
                      )}
                      {v.final_staff_name && (
                        <div style={{ fontSize: "0.8rem", color: "#059669", marginTop: 2, fontWeight: 500 }}>
                          🤝 <span style={{ fontSize: "0.75rem", fontWeight: 700 }}>Yakuniy:</span> {v.final_staff_name}
                        </div>
                      )}
                    </div>
                  </td>
                  <td>{v.diagnosis || "—"}</td>
                  <td className="muted">{v.complaint || "—"}</td>
                  <td>
                    <button
                      className="btn small"
                      style={{ background: "#0284c7", borderColor: "#0284c7" }}
                      onClick={() => setCardTarget({ id: v.patient_id, full_name: v.patient_name })}
                    >
                      🦷 Bemor kartasi
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showForm && (
        <Modal title={t("visit_new")} onClose={() => setShowForm(false)} wide>
          <VisitForm onSaved={() => { setShowForm(false); load(); }} onCancel={() => setShowForm(false)} />
        </Modal>
      )}

      {cardTarget && (
        <PatientCard
          patient={cardTarget}
          initialTab="chart"
          onClose={() => setCardTarget(null)}
        />
      )}
    </div>
  );
}
