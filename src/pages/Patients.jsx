/**
 * Patients.jsx — bemorlar sahifasi
 */

import React, { useEffect, useState, useCallback, useRef } from "react";
import dayjs from "dayjs";
import { api } from "../api.js";
import { useLang } from "../i18n.jsx";
import { Modal, Empty, ErrorBanner } from "../components/ui.jsx";
import DentalChart from "../components/DentalChart.jsx";
import DentalGallery from "../components/DentalGallery.jsx";
import AddressInput from "../components/AddressInput.jsx";

function PatientForm({ initial, onSaved, onCancel }) {
  const { t } = useLang();
  const [form, setForm] = useState(initial || { full_name: "", phone: "", birth_date: "", gender: "", address: "", allergies: "", notes: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (initial && initial.id) await api.put(`/api/patients/${initial.id}`, form);
      else await api.post("/api/patients", form);
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit}>
      {error && <div className="error-msg mb">{error}</div>}
      <div className="form-grid">
        <div className="form-row">
          <label>{t("patients_fullName")} *</label>
          <input required value={form.full_name || ""} onChange={set("full_name")} />
        </div>
        <div className="form-row">
          <label>{t("phone")}</label>
          <input value={form.phone || ""} onChange={set("phone")} placeholder="+998..." />
        </div>
        <div className="form-row">
          <label>{t("patients_birth")}</label>
          <input type="date" value={(form.birth_date || "").slice(0, 10)} onChange={set("birth_date")} />
        </div>
        <div className="form-row">
          <label>{t("patients_gender")}</label>
          <select value={form.gender || ""} onChange={set("gender")}>
            <option value="">—</option>
            <option value="male">{t("patients_male")}</option>
            <option value="female">{t("patients_female")}</option>
          </select>
        </div>
        <div className="form-row">
          <label>{t("patients_address")} (Qo'shko'pir MFY yoki erkin manzil)</label>
          <AddressInput value={form.address || ""} onChange={(val) => setForm((f) => ({ ...f, address: val }))} />
        </div>
        <div className="form-row">
          <label>{t("patients_allergies")}</label>
          <input value={form.allergies || ""} onChange={set("allergies")} />
        </div>
      </div>
      <div className="form-row">
        <label>{t("patients_notes")}</label>
        <textarea rows={2} value={form.notes || ""} onChange={set("notes")} />
      </div>
      <div className="form-actions">
        <button className="btn" disabled={busy} type="submit">{t("save")}</button>
        <button className="btn secondary" type="button" onClick={onCancel}>{t("cancel")}</button>
      </div>
    </form>
  );
}

function ProcedureFormModal({ patientId, initial, staffList = [], servicesList = [], onSaved, onCancel }) {
  const { t } = useLang();
  const [form, setForm] = useState({
    service_id: initial?.service_id || "",
    service_name: initial?.service_name || "",
    tooth: initial?.tooth || "",
    price: initial?.price !== undefined ? initial.price : "",
    staff_id: initial?.staff_id || "",
    staff_name: initial?.staff_name || "",
    initial_staff_id: initial?.initial_staff_id || initial?.staff_id || "",
    final_staff_id: initial?.final_staff_id || "",
    procedure_date: initial?.procedure_date ? initial.procedure_date.slice(0, 10) : dayjs().format("YYYY-MM-DD"),
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const onServiceSelect = (svcId) => {
    if (!svcId) {
      setForm((f) => ({ ...f, service_id: "", service_name: "" }));
      return;
    }
    const svc = servicesList.find((s) => String(s.id) === String(svcId));
    if (svc) {
      setForm((f) => ({
        ...f,
        service_id: svc.id,
        service_name: svc.name,
        price: svc.price !== undefined ? svc.price : f.price,
      }));
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.service_name.trim() && !form.service_id) {
      setError("Xizmat yoki muolaja nomini kiriting");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const initStaff = staffList.find((s) => String(s.id) === String(form.initial_staff_id || form.staff_id));
      const finStaff = staffList.find((s) => String(s.id) === String(form.final_staff_id));
      const payload = {
        patient_id: patientId,
        service_id: form.service_id ? parseInt(form.service_id, 10) : null,
        service_name: form.service_name.trim(),
        tooth: form.tooth.trim(),
        price: Number(String(form.price).replace(/[^\d.]/g, "") || 0),
        staff_id: initStaff ? initStaff.id : (form.staff_id ? parseInt(form.staff_id, 10) : null),
        staff_name: initStaff ? initStaff.full_name : form.staff_name,
        initial_staff_id: initStaff ? initStaff.id : null,
        initial_staff_name: initStaff ? initStaff.full_name : "",
        final_staff_id: finStaff ? finStaff.id : null,
        final_staff_name: finStaff ? finStaff.full_name : "",
        procedure_date: form.procedure_date,
      };

      if (initial && initial.id) {
        await api.put(`/api/procedures/${initial.id}`, payload);
      } else {
        await api.post("/api/procedures", payload);
      }
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={initial ? "✏️ Muolajani tahrirlash" : "📋 + Yangi muolaja (ish) qo'shish"} onClose={onCancel}>
      <form onSubmit={submit}>
        {error && <div className="error-msg mb">{error}</div>}
        <div className="form-grid">
          <div className="form-row">
            <label>Standart narxlar ro'yxatidan tanlash</label>
            <select value={form.service_id} onChange={(e) => onServiceSelect(e.target.value)}>
              <option value="">— Xizmatni tanlash (ixtiyoriy) —</option>
              {servicesList.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({Number(s.price || 0).toLocaleString("ru-RU")} so'm)
                </option>
              ))}
            </select>
          </div>
          <div className="form-row">
            <label>Muolaja / Xizmat nomi *</label>
            <input
              required
              placeholder="Masalan: Karies davolash, Plomba, Tish toshini tozalash..."
              value={form.service_name}
              onChange={(e) => setForm((f) => ({ ...f, service_name: e.target.value }))}
            />
          </div>
          <div className="form-row">
            <label>Tish raqami (Soha)</label>
            <input
              placeholder="Masalan: 16, 21, 36, 47 yoki Umumiy"
              value={form.tooth}
              onChange={(e) => setForm((f) => ({ ...f, tooth: e.target.value }))}
            />
          </div>
          <div className="form-row">
            <label>Narxi (so'm) *</label>
            <input
              type="text"
              inputMode="numeric"
              required
              placeholder="0"
              value={form.price}
              onChange={(e) => {
                const val = e.target.value.replace(/[^\d.]/g, "");
                setForm((f) => ({ ...f, price: val }));
              }}
            />
          </div>
          <div className="form-row">
            <label>👨‍⚕️ Dastlabki ko'rgan shifokor</label>
            <select
              value={form.initial_staff_id || form.staff_id || ""}
              onChange={(e) => {
                const val = e.target.value;
                setForm((f) => ({ ...f, initial_staff_id: val, staff_id: val }));
              }}
            >
              <option value="">— Shifokorni tanlang —</option>
              {staffList.map((s) => (
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
              {staffList.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.full_name} ({s.position === "doctor" ? "Shifokor" : s.position})
                </option>
              ))}
            </select>
          </div>
          <div className="form-row">
            <label>Sana *</label>
            <input
              type="date"
              required
              value={form.procedure_date}
              onChange={(e) => setForm((f) => ({ ...f, procedure_date: e.target.value }))}
            />
          </div>
        </div>
        <div className="form-actions">
          <button className="btn" disabled={busy} type="submit">{t("save")}</button>
          <button className="btn secondary" type="button" onClick={onCancel}>{t("cancel")}</button>
        </div>
      </form>
    </Modal>
  );
}

function PaymentFormModal({ patientId, patientName, initial, defaultDebt = 0, onSaved, onCancel }) {
  const { t } = useLang();
  const [form, setForm] = useState({
    type: initial?.type || "income",
    amount: initial?.amount || (defaultDebt > 0 ? String(defaultDebt) : ""),
    method: initial?.method || "cash",
    category: initial?.category || "payment",
    comment: initial?.comment || "",
    tx_date: initial?.tx_date || dayjs().format("YYYY-MM-DD"),
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    const cleanAmount = Number(String(form.amount).replace(/[^\d.]/g, ""));
    if (!cleanAmount || cleanAmount <= 0) {
      setError("To'g'ri to'lov summasini kiriting (masalan: 240000)");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const payload = {
        type: form.type,
        amount: cleanAmount,
        method: form.method,
        category: form.category,
        patient_id: patientId,
        patient_name: patientName,
        comment: form.comment.trim() || (form.type === "income" ? "Bemor to'lovi" : "To'lov qaytarish"),
        tx_date: form.tx_date,
      };

      if (initial && initial.id) {
        await api.put(`/api/transactions/${initial.id}`, payload);
      } else {
        await api.post("/api/transactions", payload);
      }
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const parsedAmount = Number(String(form.amount).replace(/[^\d.]/g, ""));

  return (
    <Modal title={initial ? "✏️ To'lovni tahrirlash" : "💰 + To'lov qabul qilish"} onClose={onCancel}>
      <form onSubmit={submit}>
        {error && <div className="error-msg mb">{error}</div>}
        <div className="form-grid">
          <div className="form-row">
            <label>To'lov turi *</label>
            <select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}>
              <option value="income">🟢 Kirim (Bemor to'lovi)</option>
              <option value="expense">🔴 Chiqim (Pulni qaytarish / Chegirma)</option>
            </select>
          </div>
          <div className="form-row">
            <label>Summa (so'm) *</label>
            <input
              type="text"
              inputMode="numeric"
              required
              placeholder="Masalan: 240000"
              value={form.amount}
              onChange={(e) => {
                const val = e.target.value.replace(/[^\d.]/g, "");
                setForm((f) => ({ ...f, amount: val }));
              }}
              style={{ fontSize: "1rem", fontWeight: 600 }}
              autoFocus
            />
            {form.amount && !isNaN(parsedAmount) && parsedAmount > 0 && (
              <small style={{ color: "#16a34a", fontSize: "0.82rem", marginTop: 4, display: "block", fontWeight: 600 }}>
                ✓ {parsedAmount.toLocaleString("ru-RU")} so'm
              </small>
            )}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
              {[100000, 200000, 240000, 500000].map((amt) => (
                <button
                  key={amt}
                  type="button"
                  className="btn small secondary"
                  style={{ padding: "2px 8px", fontSize: "0.75rem" }}
                  onClick={() => setForm((f) => ({ ...f, amount: String(amt) }))}
                >
                  {amt.toLocaleString("ru-RU")}
                </button>
              ))}
              {defaultDebt > 0 && (
                <button
                  type="button"
                  className="btn small secondary"
                  style={{ padding: "2px 8px", fontSize: "0.75rem", color: "#16a34a", borderColor: "#86efac", fontWeight: 700 }}
                  onClick={() => setForm((f) => ({ ...f, amount: String(defaultDebt) }))}
                >
                  To'liq qarz: {Number(defaultDebt).toLocaleString("ru-RU")}
                </button>
              )}
            </div>
          </div>
          <div className="form-row">
            <label>To'lov usuli *</label>
            <select value={form.method} onChange={(e) => setForm((f) => ({ ...f, method: e.target.value }))}>
              <option value="cash">💵 Naqd pul</option>
              <option value="card">💳 Plastik karta / Terminal</option>
              <option value="transfer">📱 Pul o'tkazmasi (Click / Payme / Uzum)</option>
            </select>
          </div>
          <div className="form-row">
            <label>Sana *</label>
            <input
              type="date"
              required
              value={form.tx_date}
              onChange={(e) => setForm((f) => ({ ...f, tx_date: e.target.value }))}
            />
          </div>
        </div>
        <div className="form-row">
          <label>Izoh / Maqsad</label>
          <input
            placeholder="Masalan: Tish plombalash uchun to'lov, avans yoki to'liq hisob-kitob"
            value={form.comment}
            onChange={(e) => setForm((f) => ({ ...f, comment: e.target.value }))}
          />
        </div>
        <div className="form-actions">
          <button className="btn" disabled={busy} type="submit">{t("save")}</button>
          <button className="btn secondary" type="button" onClick={onCancel}>{t("cancel")}</button>
        </div>
      </form>
    </Modal>
  );
}

function ReceiptModal({ tx, patientName, onClose }) {
  const fmtMoney = (n) => Number(n || 0).toLocaleString("ru-RU");
  const clinicName = "Dental Clinic Stomatologiya Markazi";

  const handlePrint = () => {
    window.print();
  };

  return (
    <Modal title={`🧾 Kvitansiya / Chek #${tx.id}`} onClose={onClose}>
      <div className="receipt-box">
        <div style={{ textAlign: "center", borderBottom: "2px solid #0f172a", paddingBottom: 10, marginBottom: 12 }}>
          <div style={{ fontSize: "1.3rem", fontWeight: 800 }}>🦷 {clinicName}</div>
          <div style={{ fontSize: "0.8rem", color: "#64748b" }}>To'lov cheki va rasmiy kvitansiya</div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", marginBottom: 6 }}>
          <span style={{ color: "#64748b" }}>Kvitansiya raqami:</span>
          <strong>#{tx.id}</strong>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", marginBottom: 6 }}>
          <span style={{ color: "#64748b" }}>Sana:</span>
          <strong>{tx.tx_date}</strong>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", marginBottom: 6 }}>
          <span style={{ color: "#64748b" }}>Bemor:</span>
          <strong>{patientName}</strong>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", marginBottom: 6 }}>
          <span style={{ color: "#64748b" }}>To'lov usuli:</span>
          <strong>{tx.method === "card" ? "Plastik karta" : tx.method === "transfer" ? "O'tkazma" : "Naqd pul"}</strong>
        </div>
        {tx.comment && (
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", marginBottom: 6 }}>
            <span style={{ color: "#64748b" }}>Izoh:</span>
            <span>{tx.comment}</span>
          </div>
        )}

        <div style={{ borderTop: "1px dashed #cbd5e1", marginTop: 12, paddingTop: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: "1rem", fontWeight: 700 }}>To'langan summa:</span>
          <span style={{ fontSize: "1.3rem", fontWeight: 900, color: "#16a34a" }}>{fmtMoney(tx.amount)} so'm</span>
        </div>

        <div style={{ marginTop: 24, display: "flex", justifyContent: "space-between", fontSize: "0.75rem", color: "#64748b", borderTop: "1px solid #f1f5f9", paddingTop: 8 }}>
          <span>Kassir / Qabulxona: ________________</span>
          <span>M.O'.</span>
        </div>
      </div>

      <div className="no-print" style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 16 }}>
        <button className="btn" type="button" onClick={handlePrint}>
          🖨 Chop etish (Print)
        </button>
        <button className="btn secondary" type="button" onClick={onClose}>
          Yopish
        </button>
      </div>
    </Modal>
  );
}

export function PatientCard({ patient, onClose, initialTab = "chart" }) {
  const { t } = useLang();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState(initialTab);
  const [chart, setChart] = useState({});
  const [savedMsg, setSavedMsg] = useState("");
  const [showTgModal, setShowTgModal] = useState(false);

  // Muolajalar va to'lovlar modal holatlari
  const [procModal, setProcModal] = useState(null); // null | "new" | procObject
  const [paymentModal, setPaymentModal] = useState(null); // null | "new" | txObject
  const [receiptTx, setReceiptTx] = useState(null);
  const [staffList, setStaffList] = useState([]);
  const [servicesList, setServicesList] = useState([]);

  const loadCard = useCallback(() => {
    api.get(`/api/patients/${patient.id}`)
      .then((d) => {
        setData(d);
        setChart(d.dental_chart || {});
      })
      .catch((e) => setError(e.message));
  }, [patient.id]);

  useEffect(() => {
    if (!patient.is_viewed) {
      api.post(`/api/patients/${patient.id}/view`).catch(() => {});
    }
    loadCard();
    api.get("/api/staff").then((d) => setStaffList((d.staff || []).filter((s) => s.active))).catch(() => {});
    api.get("/api/services").then((d) => setServicesList(d.services || [])).catch(() => {});
  }, [loadCard, patient.id, patient.is_viewed]);

  const saveChart = async (updatedChart) => {
    try {
      await api.put(`/api/patients/${patient.id}/dental-chart`, { chart: updatedChart });
      setSavedMsg("Tish formulasi muvaffaqiyatli saqlandi!");
      setTimeout(() => setSavedMsg(""), 3000);
    } catch (err) {
      setError(err.message);
    }
  };

  const deleteProc = async (proc) => {
    const label = proc.service_name || proc.tooth || "Muolaja";
    if (!confirm(`Haqiqatan ham ushbu muolajani o'chirmoqchimisiz? (${label})`)) return;
    try {
      await api.del(`/api/procedures/${proc.id}`);
      setSavedMsg("Muolaja o'chirildi");
      setTimeout(() => setSavedMsg(""), 3000);
      loadCard();
    } catch (err) {
      setError(err.message);
    }
  };

  const deletePayment = async (tx) => {
    const label = `${tx.type === "income" ? "To'lov" : "Xarajat"}: ${fmtMoney(tx.amount)} so'm`;
    if (!confirm(`Haqiqatan ham ushbu to'lov yozuvini o'chirmoqchimisiz? (${label})`)) return;
    try {
      await api.del(`/api/transactions/${tx.id}`);
      setSavedMsg("To'lov yozuvi o'chirildi");
      setTimeout(() => setSavedMsg(""), 3000);
      loadCard();
    } catch (err) {
      setError(err.message);
    }
  };

  const fmtMoney = (n) => Number(n || 0).toLocaleString("ru-RU");
  const genderLabel = data?.patient?.gender
    ? data.patient.gender === "male" ? t("patients_male") : t("patients_female")
    : "—";

  return (
    <Modal title={`${t("patients_card")}: ${patient.full_name}`} onClose={onClose} wide>
      {error && <ErrorBanner message={error} />}
      {savedMsg && (
        <div style={{ padding: "8px 12px", background: "#ecfdf5", border: "1px solid #10b981", color: "#065f46", borderRadius: 6, marginBottom: 12, fontSize: "0.9rem" }}>
          ✅ {savedMsg}
        </div>
      )}
      {!data ? (
        <p className="muted">{t("loading")}</p>
      ) : (
        <>
          <div className="mb muted" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
            <div>
              👥 {t("patients_gender")}: <strong>{genderLabel}</strong> · 📍 {t("patients_address")}: <strong>{data.patient.address || "—"}</strong>
              {data.patient.birth_date && <span> · 🗓 {data.patient.birth_date.slice(0, 10)}</span>}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {data.patient.phone && (
                <div style={{ fontWeight: "bold" }}>
                  📞 {data.patient.phone}
                </div>
              )}
              <button
                type="button"
                className={`badge ${data.patient.telegram_id ? "green" : "gray"}`}
                style={{ cursor: "pointer", border: data.patient.telegram_id ? "none" : "1px dashed #0284c7", display: "inline-flex", alignItems: "center", gap: 4, padding: "4px 8px" }}
                onClick={() => setShowTgModal(true)}
                title="Telegram botga ulash va boshqarish"
              >
                <span>✈️</span>
                <span>{data.patient.telegram_id ? (data.patient.telegram_username ? `@${data.patient.telegram_username}` : "Botga ulangan") : "Botga ulash"}</span>
              </button>
            </div>
          </div>

          <div className="cards" style={{ marginBottom: 16 }}>
            <div className="card green clickable-card" onClick={() => setActiveTab("payments")} title="To'lovlar bo'limiga o'tish">
              <div className="label">{t("patients_paid")} →</div>
              <div className="value">{fmtMoney(data.balance?.paid || 0)}</div>
            </div>
            <div className="card clickable-card" onClick={() => setActiveTab("procedures")} title="Muolajalar bo'limiga o'tish">
              <div className="label">{t("patients_servicesCost")} →</div>
              <div className="value">{fmtMoney(data.balance?.servicesCost || 0)}</div>
            </div>
            <div className="card red clickable-card" onClick={() => setActiveTab("payments")} title="To'lov qabul qilish">
              <div className="label">{t("patients_debt")} →</div>
              <div className="value">{fmtMoney(data.balance?.debt || 0)}</div>
            </div>
          </div>

          {/* TABLAR */}
          <div className="toolbar" style={{ borderBottom: "1px solid var(--color-border)", paddingBottom: 8, marginBottom: 14 }}>
            <button
              type="button"
              className={`btn ${activeTab === "chart" ? "" : "secondary"}`}
              onClick={() => setActiveTab("chart")}
            >
              🦷 {t("odontogram")}
            </button>
            <button
              type="button"
              className={`btn ${activeTab === "procedures" ? "" : "secondary"}`}
              onClick={() => setActiveTab("procedures")}
            >
              📋 {t("patients_procedures")} ({data.procedures?.length || 0})
            </button>
            <button
              type="button"
              className={`btn ${activeTab === "payments" ? "" : "secondary"}`}
              onClick={() => setActiveTab("payments")}
            >
              💰 {t("patients_payments")} ({data.transactions?.length || 0})
            </button>
            <button
              type="button"
              className={`btn ${activeTab === "gallery" ? "" : "secondary"}`}
              onClick={() => setActiveTab("gallery")}
            >
              📸 {t("img_gallery")}
            </button>
          </div>

          {/* TAB 1: ODONTOGRAMMA */}
          {activeTab === "chart" && (
            <DentalChart
              chart={chart}
              procedures={data.procedures || []}
              patientName={patient.full_name}
              onChange={setChart}
              onSave={saveChart}
              onOpenGallery={() => setActiveTab("gallery")}
            />
          )}

          {/* TAB 2: MUOLAJALAR (QILINGAN ISHLAR) */}
          {activeTab === "procedures" && (
            <div className="panel">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
                <div>
                  <h3 style={{ margin: 0 }}>📋 {t("patients_procedures")}</h3>
                  <span style={{ fontSize: "0.85rem", color: "#64748b" }}>
                    Jami muolajalar summasi: <strong style={{ color: "#0f172a" }}>{fmtMoney(data.balance?.servicesCost || 0)} {t("sum")}</strong>
                  </span>
                </div>
                <button
                  type="button"
                  className="btn"
                  onClick={() => setProcModal("new")}
                >
                  + Yangi muolaja qo'shish
                </button>
              </div>

              {(!data.procedures || data.procedures.length === 0) ? (
                <Empty text="Ushbu bemorga hali hech qanday muolaja yoki ish yozilmagan. Yuqoridagi tugma orqali yangi muolaja qo'shishingiz mumkin." />
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>{t("date")}</th>
                      <th>{t("visit_service")}</th>
                      <th>{t("visit_tooth")}</th>
                      <th>{t("visit_price")}</th>
                      <th>{t("appt_doctor")}</th>
                      <th>{t("actions")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.procedures.map((p) => (
                      <tr key={p.id}>
                        <td>{(p.procedure_date || "").slice(0, 10)}</td>
                        <td><strong>{p.service_name || "Muolaja"}</strong></td>
                        <td>
                          <span className="badge gray" style={{ fontWeight: 700 }}>
                            {p.tooth || "—"}
                          </span>
                        </td>
                        <td style={{ fontWeight: 600, color: "#16a34a" }}>
                          {fmtMoney(p.price)} {t("sum")}
                        </td>
                        <td>
                          <div>
                            {p.initial_staff_name ? (
                              <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "#0f172a" }}>
                                👨‍⚕️ <span style={{ color: "#2563eb", fontSize: "0.78rem" }}>Dastlab:</span> {p.initial_staff_name}
                              </div>
                            ) : p.staff_name ? (
                              <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "#0f172a" }}>
                                👨‍⚕️ {p.staff_name}
                              </div>
                            ) : (
                              <span className="muted" style={{ fontSize: "0.82rem" }}>—</span>
                            )}
                            {p.final_staff_name && (
                              <div style={{ fontSize: "0.8rem", color: "#059669", marginTop: 2, fontWeight: 500 }}>
                                🤝 <span style={{ fontSize: "0.75rem", fontWeight: 700 }}>Yakuniy:</span> {p.final_staff_name}
                              </div>
                            )}
                          </div>
                        </td>
                        <td>
                          <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                            <button
                              type="button"
                              className="btn small secondary"
                              onClick={() => setProcModal(p)}
                              title={t("edit")}
                            >
                              ✏️ {t("edit")}
                            </button>
                            <button
                              type="button"
                              className="btn small danger"
                              onClick={() => deleteProc(p)}
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
          )}

          {/* TAB 3: TO'LOVLAR (TRANSAKSIYALAR) */}
          {activeTab === "payments" && (
            <div className="panel">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
                <div>
                  <h3 style={{ margin: 0 }}>💰 {t("patients_payments")}</h3>
                  <div style={{ display: "flex", gap: 10, marginTop: 4, flexWrap: "wrap", fontSize: "0.85rem" }}>
                    <span>To'langan: <strong style={{ color: "#16a34a" }}>{fmtMoney(data.balance?.paid || 0)} {t("sum")}</strong></span>
                    <span>·</span>
                    <span>Qoldiq qarz: <strong style={{ color: (data.balance?.debt || 0) > 0 ? "#dc2626" : "#16a34a" }}>{fmtMoney(data.balance?.debt || 0)} {t("sum")}</strong></span>
                  </div>
                </div>
                <button
                  type="button"
                  className="btn"
                  style={{ background: "#16a34a", borderColor: "#16a34a" }}
                  onClick={() => setPaymentModal("new")}
                >
                  💰 + To'lov qabul qilish
                </button>
              </div>

              {(!data.transactions || data.transactions.length === 0) ? (
                <Empty text="Bemor hisobida hali to'lovlar mavjud emas. Yuqoridagi tugma orqali to'lov kiritishingiz mumkin." />
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>{t("date")}</th>
                      <th>{t("fin_income")}/{t("fin_expense")}</th>
                      <th>To'lov usuli</th>
                      <th>{t("visit_price")}</th>
                      <th>{t("fin_comment")}</th>
                      <th>{t("actions")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.transactions.map((tr) => (
                      <tr key={tr.id}>
                        <td>{tr.tx_date}</td>
                        <td>
                          <span className={`badge ${tr.type === "income" ? "green" : "red"}`}>
                            {tr.type === "income" ? t("fin_income") : t("fin_expense")}
                          </span>
                        </td>
                        <td>
                          <span style={{ fontSize: "0.85rem", color: "#64748b" }}>
                            {tr.method === "card" ? "💳 Karta" : tr.method === "transfer" ? "📱 O'tkazma" : "💵 Naqd"}
                          </span>
                        </td>
                        <td style={{ fontWeight: 700, color: tr.type === "income" ? "#16a34a" : "#dc2626" }}>
                          {tr.type === "income" ? "+" : "-"}{fmtMoney(tr.amount)} {t("sum")}
                        </td>
                        <td style={{ maxWidth: 180, fontSize: "0.85rem", color: "#334155" }}>
                          {tr.comment || "—"}
                        </td>
                        <td>
                          <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                            <button
                              type="button"
                              className="btn small secondary"
                              style={{ color: "#0284c7", borderColor: "#bae6fd" }}
                              onClick={() => setReceiptTx(tr)}
                              title="Chek / Kvitansiya"
                            >
                              🧾 Chek
                            </button>
                            <button
                              type="button"
                              className="btn small secondary"
                              onClick={() => setPaymentModal(tr)}
                              title={t("edit")}
                            >
                              ✏️
                            </button>
                            <button
                              type="button"
                              className="btn small danger"
                              onClick={() => deletePayment(tr)}
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
          )}

          {/* TAB 4: RENTGEN VA RASMLAR GALEREYASI */}
          {activeTab === "gallery" && (
            <DentalGallery
              patientId={patient.id}
              patientName={patient.full_name}
            />
          )}

          {showTgModal && (
            <TelegramConnectModal
              patient={data.patient}
              onClose={() => setShowTgModal(false)}
              onUpdated={() => {
                loadCard();
              }}
            />
          )}

          {/* MUOLAJA QO'SHISH / TAHRIRLASH MODAL */}
          {procModal && (
            <ProcedureFormModal
              patientId={patient.id}
              initial={procModal === "new" ? null : procModal}
              staffList={staffList}
              servicesList={servicesList}
              onSaved={() => {
                setProcModal(null);
                setSavedMsg("Muolaja muvaffaqiyatli saqlandi!");
                setTimeout(() => setSavedMsg(""), 3000);
                loadCard();
              }}
              onCancel={() => setProcModal(null)}
            />
          )}

          {/* TO'LOV QABUL QILISH / TAHRIRLASH MODAL */}
          {paymentModal && (
            <PaymentFormModal
              patientId={patient.id}
              patientName={patient.full_name}
              initial={paymentModal === "new" ? null : paymentModal}
              defaultDebt={data?.balance?.debt || 0}
              onSaved={() => {
                setPaymentModal(null);
                setSavedMsg("To'lov muvaffaqiyatli saqlandi!");
                setTimeout(() => setSavedMsg(""), 3000);
                loadCard();
              }}
              onCancel={() => setPaymentModal(null)}
            />
          )}

          {/* KVITANSIYA / CHEK PRINT MODAL */}
          {receiptTx && (
            <ReceiptModal
              tx={receiptTx}
              patientName={patient.full_name}
              onClose={() => setReceiptTx(null)}
            />
          )}
        </>
      )}
    </Modal>
  );
}

function TelegramConnectModal({ patient, onClose, onUpdated }) {
  const { t } = useLang();
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [manualInput, setManualInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [activeSubTab, setActiveSubTab] = useState("qr"); // "qr" | "code" | "manual"

  const loadInfo = () => {
    setLoading(true);
    setError("");
    api.get(`/api/patients/${patient.id}/telegram-link-info`)
      .then((data) => {
        setInfo(data);
        if (data.telegram_username) {
          setManualInput(`@${data.telegram_username}`);
        } else if (data.telegram_id) {
          setManualInput(String(data.telegram_id));
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadInfo();
  }, [patient.id]);

  // Real-time SSE eshityapti: bemor o'z telefonida /start bosishi bilanoq darhol yashil holatga o'tadi
  useEffect(() => {
    let es;
    try {
      es = new EventSource("/api/events");
      es.addEventListener("patient:telegram_linked", (e) => {
        try {
          const d = JSON.parse(e.data);
          if (d.patient_id === patient.id) {
            setInfo((prev) => prev ? { ...prev, is_connected: true, telegram_id: d.telegram_id, telegram_username: d.telegram_username } : prev);
            if (onUpdated) onUpdated();
          }
        } catch {}
      });
      es.addEventListener("patient:telegram_unlinked", (e) => {
        try {
          const d = JSON.parse(e.data);
          if (d.patient_id === patient.id) {
            setInfo((prev) => prev ? { ...prev, is_connected: false, telegram_id: null, telegram_username: null } : prev);
            if (onUpdated) onUpdated();
          }
        } catch {}
      });
    } catch {}
    return () => {
      if (es) es.close();
    };
  }, [patient.id, onUpdated]);

  const copyToClipboard = (text, type) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    if (type === "link") {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    } else {
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2500);
    }
  };

  const handleManualLink = async (e) => {
    e.preventDefault();
    if (!manualInput.trim()) return;
    setBusy(true);
    setError("");
    try {
      const clean = manualInput.trim();
      const isUsername = clean.startsWith("@") || isNaN(Number(clean));
      await api.post(`/api/patients/${patient.id}/telegram-link`, {
        telegram_id: isUsername ? undefined : clean,
        telegram_username: isUsername ? clean.replace("@", "") : undefined,
      });
      loadInfo();
      if (onUpdated) onUpdated();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleUnlink = async () => {
    if (!confirm("Bemorning Telegram akkauntini tizimdan uzmoqchimisiz?")) return;
    setBusy(true);
    setError("");
    try {
      await api.post(`/api/patients/${patient.id}/telegram-unlink`, {});
      loadInfo();
      if (onUpdated) onUpdated();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleNewCode = async () => {
    setBusy(true);
    try {
      const res = await api.post(`/api/patients/${patient.id}/generate-connect-code`, {});
      setInfo((prev) => prev ? { ...prev, connect_code: res.connect_code } : prev);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const qrImageUrl = info?.deep_link
    ? `https://api.qrserver.com/v1/create-qr-code/?size=200x200&margin=8&data=${encodeURIComponent(info.deep_link)}`
    : "";

  return (
    <Modal title={`✈️ Telegram Botga Ulash: ${patient.full_name}`} onClose={onClose} wide>
      {error && <ErrorBanner message={error} />}

      {loading ? (
        <div style={{ padding: 24, textAlign: "center" }}>
          <p className="muted">Ulanish parametrlari yuklanmoqda...</p>
        </div>
      ) : (
        <div>
          {/* HOLAT QUTISI */}
          <div
            style={{
              padding: 14,
              borderRadius: 8,
              background: info.is_connected ? "#ecfdf5" : "#f8fafc",
              border: `1px solid ${info.is_connected ? "#10b981" : "#e2e8f0"}`,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 10,
              marginBottom: 16,
            }}
          >
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: "1.2rem" }}>{info.is_connected ? "🟢" : "⚪"}</span>
                <strong style={{ fontSize: "1rem", color: info.is_connected ? "#065f46" : "#334155" }}>
                  {info.is_connected ? "Telegramga muvaffaqiyatli ulangan" : "Telegram botga ulanmagan"}
                </strong>
              </div>
              <div style={{ fontSize: "0.85rem", color: "#64748b" }}>
                {info.is_connected ? (
                  <span>
                    Telegram ID: <strong>{info.telegram_id}</strong>
                    {info.telegram_username && <span> · @{info.telegram_username}</span>}
                  </span>
                ) : (
                  <span>Bemor klinikaga kelganda quyidagi usullardan biri orqali Telegram akkauntini bir zumda bog'lang.</span>
                )}
              </div>
            </div>

            {info.is_connected && (
              <button
                type="button"
                className="btn small danger"
                onClick={handleUnlink}
                disabled={busy}
              >
                ❌ Akkauntni uzish
              </button>
            )}
          </div>

          {/* ULASH USULLARI TABLARI */}
          <div style={{ display: "flex", gap: 8, borderBottom: "1px solid var(--color-border)", paddingBottom: 8, marginBottom: 16 }}>
            <button
              type="button"
              className={`btn small ${activeSubTab === "qr" ? "" : "secondary"}`}
              onClick={() => setActiveSubTab("qr")}
            >
              📱 1. QR-kod & Havola (Tavsiya)
            </button>
            <button
              type="button"
              className={`btn small ${activeSubTab === "code" ? "" : "secondary"}`}
              onClick={() => setActiveSubTab("code")}
            >
              🔑 2. Ulanish kodi (PIN: {info.connect_code})
            </button>
            <button
              type="button"
              className={`btn small ${activeSubTab === "manual" ? "" : "secondary"}`}
              onClick={() => setActiveSubTab("manual")}
            >
              ⌨️ 3. ID / Username kiritish
            </button>
          </div>

          {/* TAB 1: QR KOD VA HAVOLA */}
          {activeSubTab === "qr" && (
            <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 20, alignItems: "center" }}>
              <div
                style={{
                  background: "#ffffff",
                  padding: 10,
                  border: "2px solid #0284c7",
                  borderRadius: 12,
                  boxShadow: "0 4px 12px rgba(2, 132, 199, 0.1)",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                }}
              >
                {qrImageUrl ? (
                  <img
                    src={qrImageUrl}
                    alt="Telegram Bot QR Code"
                    style={{ width: 190, height: 190, display: "block", borderRadius: 6 }}
                  />
                ) : (
                  <div style={{ width: 190, height: 190, display: "flex", alignItems: "center", justifyContent: "center", color: "#64748b" }}>
                    QR generatsiya qilinmoqda...
                  </div>
                )}
                <span style={{ fontSize: "0.75rem", color: "#0284c7", fontWeight: "bold", marginTop: 6 }}>
                  Kamera bilan skaner qiling
                </span>
              </div>

              <div>
                <h4 style={{ margin: "0 0 8px 0", color: "#0f172a" }}>
                  Bemor telefonida ochish:
                </h4>
                <p style={{ fontSize: "0.88rem", color: "#475569", lineHeight: 1.5, margin: "0 0 12px 0" }}>
                  1. Bemor ushbu QR-kodni telefon kamerasida skaner qiladi yoki quyidagi havolani bosadi.<br />
                  2. Telegram ochilib <strong>«Start»</strong> tugmasi bosiladi.<br />
                  3. Bemorning ma'lumotlari serverda avtomatik eslab qolinadi va ushbu sahifada bir zumda bog'lanadi!
                </p>

                <div style={{ background: "#f1f5f9", padding: "8px 12px", borderRadius: 6, border: "1px solid #cbd5e1", fontSize: "0.85rem", wordBreak: "break-all", marginBottom: 12, fontFamily: "monospace" }}>
                  {info.deep_link || "Havola yaratilmoqda..."}
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className="btn small"
                    onClick={() => copyToClipboard(info.deep_link, "link")}
                    style={{ background: copiedLink ? "#10b981" : "var(--color-primary)" }}
                  >
                    {copiedLink ? "✅ Havola nusxalandi!" : "📋 Havolani nusxalash"}
                  </button>

                  {info.deep_link && (
                    <a
                      href={`https://t.me/share/url?url=${encodeURIComponent(info.deep_link)}&text=${encodeURIComponent(`Hurmatli ${patient.full_name}, stomatologiya klinikasi Telegram botiga ulanish uchun ushbu havolani bosing:`)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn small secondary"
                    >
                      💬 Telegramda ulashish
                    </a>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: 6 XONALI ULANISH KODI (PIN) */}
          {activeSubTab === "code" && (
            <div style={{ background: "#f8fafc", padding: 20, borderRadius: 8, border: "1px solid #e2e8f0", textAlign: "center" }}>
              <div style={{ fontSize: "0.9rem", color: "#64748b", marginBottom: 8 }}>
                Bemor uchun shaxsiy 6 xonali ulanish kodi:
              </div>

              <div
                style={{
                  display: "inline-block",
                  letterSpacing: 8,
                  fontSize: "2.4rem",
                  fontWeight: "900",
                  fontFamily: "monospace",
                  color: "#0284c7",
                  background: "#ffffff",
                  padding: "8px 24px",
                  borderRadius: 10,
                  border: "2px dashed #0284c7",
                  marginBottom: 14,
                }}
              >
                {info.connect_code}
              </div>

              <div style={{ maxWidth: 440, margin: "0 auto 16px auto", fontSize: "0.88rem", color: "#475569", lineHeight: 1.5 }}>
                Bemor o'z Telegramida botimizga (<strong>@{info.bot_username || "klinika_boti"}</strong>) kirib:
                <br />
                <code style={{ background: "#e2e8f0", padding: "2px 6px", borderRadius: 4, fontWeight: "bold" }}>
                  /link {info.connect_code}
                </code>
                <br />
                yoki shunchaki <strong>{info.connect_code}</strong> kodini yozib yuborsa kifoya!
              </div>

              <div style={{ display: "flex", justifyContent: "center", gap: 10 }}>
                <button
                  type="button"
                  className="btn small"
                  onClick={() => copyToClipboard(info.connect_code, "code")}
                  style={{ background: copiedCode ? "#10b981" : "var(--color-primary)" }}
                >
                  {copiedCode ? "✅ Kod nusxalandi!" : "📋 Kodni nusxalash"}
                </button>
                <button
                  type="button"
                  className="btn small secondary"
                  onClick={handleNewCode}
                  disabled={busy}
                >
                  🔄 Yangi kod yaratish
                </button>
              </div>
            </div>
          )}

          {/* TAB 3: QO'LDA ID / USERNAME KIRITISH */}
          {activeSubTab === "manual" && (
            <form onSubmit={handleManualLink} style={{ background: "#f8fafc", padding: 18, borderRadius: 8, border: "1px solid #e2e8f0" }}>
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: "block", fontWeight: 600, marginBottom: 6, fontSize: "0.9rem" }}>
                  Bemorning Telegram username yoki ID raqami:
                </label>
                <input
                  type="text"
                  placeholder="Masalan: @alisher_q yoki 87654321"
                  value={manualInput}
                  onChange={(e) => setManualInput(e.target.value)}
                  style={{ width: "100%", padding: "8px 12px", borderRadius: 6, border: "1px solid #cbd5e1" }}
                />
                <span style={{ fontSize: "0.75rem", color: "#64748b", marginTop: 4, display: "block" }}>
                  Agar bemorning Telegram @username yoki raqamli Telegram ID si ma'lum bo'lsa, to'g'ridan-to'g'ri kiritishingiz mumkin.
                </span>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <button className="btn" type="submit" disabled={busy || !manualInput.trim()}>
                  💾 Saqlash va Bog'lash
                </button>
              </div>
            </form>
          )}

          <div style={{ marginTop: 20, display: "flex", justifyContent: "flex-end" }}>
            <button className="btn secondary" type="button" onClick={onClose}>
              {t("close")}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function MessageModal({ patient, onClose }) {
  const { t } = useLang();
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState(false);

  const send = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    setError("");
    try {
      await api.post(`/api/patients/${patient.id}/message`, { text });
      setOk(t("msgSent"));
      setText("");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={`${t("msgTitle")}: ${patient.full_name}`} onClose={onClose}>
      {error && <div className="error-msg mb">{error}</div>}
      {ok && <div className="ok-msg mb">{ok}</div>}
      <form onSubmit={send}>
        <div className="form-row">
          <textarea rows={5} value={text} placeholder={t("msgPlaceholder")} onChange={(e) => setText(e.target.value)} style={{ width: "100%" }} />
        </div>
        <div className="form-actions">
          <button className="btn" disabled={busy || !text.trim()} type="submit">{t("send")}</button>
          <button className="btn secondary" type="button" onClick={onClose}>{t("close")}</button>
        </div>
      </form>
    </Modal>
  );
}

function PatientActionsDropdown({ patient, isAdmin, onOpenCard, onEdit, onConnectTg, onSendMsg, onDelete }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    const handleDocClick = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    if (open) {
      document.addEventListener("mousedown", handleDocClick);
    }
    return () => document.removeEventListener("mousedown", handleDocClick);
  }, [open]);

  return (
    <div className="actions-dropdown-container" ref={containerRef}>
      <div style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
        <button
          type="button"
          className="btn small"
          style={{ background: "#0284c7", borderColor: "#0284c7" }}
          onClick={() => onOpenCard(patient, "chart")}
          title="Bemor kartasini ochish"
        >
          🦷 Kartasi
        </button>
        <button
          type="button"
          className="actions-dropdown-btn"
          onClick={() => setOpen((v) => !v)}
          title="Barcha amallar"
          aria-expanded={open}
        >
          <span>⋮ Amallar</span>
        </button>
        {isAdmin && (
          <button
            type="button"
            className="btn small danger"
            style={{ padding: "4px 8px" }}
            onClick={() => onDelete(patient)}
            title="Bemor kartasini o'chirish (faqat admin)"
          >
            🗑
          </button>
        )}
      </div>

      {open && (
        <div className="actions-dropdown-menu">
          <button
            type="button"
            className="actions-dropdown-item"
            onClick={() => { setOpen(false); onOpenCard(patient, "chart"); }}
          >
            <span>🦷</span>
            <span>Tish formulasi (Odontogramma)</span>
          </button>
          <button
            type="button"
            className="actions-dropdown-item"
            onClick={() => { setOpen(false); onOpenCard(patient, "procedures"); }}
          >
            <span>📋</span>
            <span>Qilingan ishlar & Muolajalar</span>
          </button>
          <button
            type="button"
            className="actions-dropdown-item"
            onClick={() => { setOpen(false); onOpenCard(patient, "payments"); }}
          >
            <span>💰</span>
            <span>To'lovlar & Balans</span>
          </button>
          <button
            type="button"
            className="actions-dropdown-item"
            onClick={() => { setOpen(false); onOpenCard(patient, "gallery"); }}
          >
            <span>📸</span>
            <span>Rentgen & Galereya</span>
          </button>

          <div className="actions-dropdown-divider" />

          <button
            type="button"
            className="actions-dropdown-item"
            onClick={() => { setOpen(false); onConnectTg(patient); }}
          >
            <span>✈️</span>
            <span>Telegram botga ulash (QR & Kod)</span>
          </button>

          {patient.telegram_id && (
            <button
              type="button"
              className="actions-dropdown-item"
              onClick={() => { setOpen(false); onSendMsg(patient); }}
            >
              <span>💬</span>
              <span>Telegram xabar yuborish</span>
            </button>
          )}

          <button
            type="button"
            className="actions-dropdown-item"
            onClick={() => { setOpen(false); onEdit(patient); }}
          >
            <span>✏️</span>
            <span>Ma'lumotlarni tahrirlash</span>
          </button>

          {isAdmin && (
            <>
              <div className="actions-dropdown-divider" />
              <button
                type="button"
                className="actions-dropdown-item danger"
                onClick={() => { setOpen(false); onDelete(patient); }}
              >
                <span>🗑</span>
                <span>Bemor kartasini o'chirish</span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function Patients() {
  const { t } = useLang();
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [cardOf, setCardOf] = useState(null);
  const [cardTab, setCardTab] = useState("chart");
  const [msgOf, setMsgOf] = useState(null);
  const [tgConnectOf, setTgConnectOf] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    api.get("/api/users/me").then((d) => setIsAdmin(d.user?.role === "admin")).catch(() => setIsAdmin(false));
  }, []);

  const openPatientCard = (p, tab = "chart") => {
    if (!p.is_viewed) {
      api.post(`/api/patients/${p.id}/view`).catch(() => {});
      setRows((prev) => prev.map((item) => (item.id === p.id ? { ...item, is_viewed: true } : item)));
    }
    setCardOf(p);
    setCardTab(tab || "chart");
  };

  const delPatient = async (p) => {
    if (!isAdmin) {
      alert("Bemorlarni faqat administrator o'chirish huquqiga ega!");
      return;
    }
    if (!confirm(`Haqiqatan ham bemor "${p.full_name}"ni butunlay o'chirmoqchimisiz? Ushbu amal qaytarilmaydi!`)) return;
    try {
      await api.del(`/api/patients/${p.id}`);
      load();
    } catch (e) {
      setError(e.message);
    }
  };

  const load = () => {
    const q = search ? `?search=${encodeURIComponent(search)}&limit=100` : "?limit=100";
    api.get(`/api/patients${q}`).then((d) => setRows(d.patients || [])).catch((e) => setError(e.message));
  };

  useEffect(() => {
    const tm = setTimeout(load, 300);
    return () => clearTimeout(tm);
  }, [search]);

  // Real-time SSE updates for telegram linking & patient events
  useEffect(() => {
    const onSSE = (e) => {
      const type = e.detail?.type;
      if (!type || type.startsWith("patient:") || type === "storage:updated") {
        load();
      }
    };
    window.addEventListener("clinic:sse", onSSE);
    return () => window.removeEventListener("clinic:sse", onSSE);
  }, []);

  return (
    <div>
      <div className="page-title">🧑‍🤝‍🧑 {t("nav_patients")}</div>
      {error && <ErrorBanner message={error} />}
      <div className="panel">
        <div className="toolbar">
          <input placeholder={t("search")} value={search} onChange={(e) => setSearch(e.target.value)} style={{ flex: 1, maxWidth: 320 }} />
          <button className="btn" onClick={() => setShowForm(true)}>+ {t("patients_new")}</button>
        </div>
        {rows.length === 0 ? <Empty /> : (
          <table>
            <thead>
              <tr>
                <th>{t("patients_fullName")}</th>
                <th>{t("phone")}</th>
                <th>Telegram</th>
                <th>{t("patients_source")}</th>
                <th>Ro'yxatdan o'tgan sana & vaqt</th>
                <th>{t("actions")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const isNew = !p.is_viewed;
                return (
                  <tr
                    key={p.id}
                    style={isNew ? { background: "#f0fdf4", borderLeft: "4px solid #10b981" } : undefined}
                  >
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        <strong
                          style={{ color: "#0f172a", cursor: "pointer" }}
                          onClick={() => openPatientCard(p, "chart")}
                          title="Bemor kartasini ochish"
                        >
                          {p.full_name}
                        </strong>
                        {isNew && (
                          <span
                            style={{
                              background: "#dcfce7",
                              color: "#15803d",
                              border: "1px solid #86efac",
                              padding: "2px 6px",
                              borderRadius: 4,
                              fontSize: "0.72rem",
                              fontWeight: 700,
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 3,
                            }}
                            title="Yangi qo'shilgan bemor (hali kartasi ochilmagan)"
                          >
                            <span>✨</span>
                            <span>Yangi (ko'rilmagan)</span>
                          </span>
                        )}
                      </div>
                      {p.birth_date && (
                        <div style={{ fontSize: "0.75rem", color: "#64748b" }}>
                          🗓 {p.birth_date.slice(0, 10)}
                        </div>
                      )}
                    </td>
                    <td>{p.phone || "—"}</td>
                    <td>
                      {p.telegram_id ? (
                        <button
                          type="button"
                          className="badge green"
                          style={{ cursor: "pointer", border: "none", display: "inline-flex", alignItems: "center", gap: 4, padding: "4px 8px" }}
                          onClick={() => setTgConnectOf(p)}
                          title="Telegram ulanishini ko'rish va boshqarish"
                        >
                          <span>✈️</span>
                          <span>{p.telegram_username ? `@${p.telegram_username}` : `ID: ${p.telegram_id}`}</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="btn small secondary"
                          style={{ padding: "2px 8px", fontSize: "0.78rem", borderStyle: "dashed", borderColor: "#0284c7", color: "#0284c7" }}
                          onClick={() => setTgConnectOf(p)}
                          title="Bemorga Telegram botni ulash (QR kod va havola)"
                        >
                          ✈️ Botga ulash
                        </button>
                      )}
                    </td>
                    <td>
                      <span className={`badge ${p.source === "telegram" ? "blue" : "gray"}`}>
                        {p.source === "telegram" ? t("source_telegram") : t("source_clinic")}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                        <span style={{ fontWeight: 600, color: "#1e293b", fontSize: "0.85rem" }}>
                          📅 {p.created_at ? dayjs(p.created_at).format("YYYY-MM-DD") : "—"}
                        </span>
                        <span style={{ fontSize: "0.78rem", color: "#64748b", fontWeight: 500 }}>
                          🕒 {p.created_at ? dayjs(p.created_at).format("HH:mm") : ""}
                        </span>
                      </div>
                    </td>
                    <td>
                      <PatientActionsDropdown
                        patient={p}
                        isAdmin={isAdmin}
                        onOpenCard={(pat, tab) => openPatientCard(pat, tab)}
                        onEdit={(pat) => setEditing(pat)}
                        onConnectTg={(pat) => setTgConnectOf(pat)}
                        onSendMsg={(pat) => setMsgOf(pat)}
                        onDelete={(pat) => delPatient(pat)}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {showForm && (
        <Modal title={t("patients_new")} onClose={() => setShowForm(false)}>
          <PatientForm onSaved={() => { setShowForm(false); load(); }} onCancel={() => setShowForm(false)} />
        </Modal>
      )}
      {editing && (
        <Modal title={t("edit")} onClose={() => setEditing(null)}>
          <PatientForm initial={editing} onSaved={() => { setEditing(null); load(); }} onCancel={() => setEditing(null)} />
        </Modal>
      )}
      {cardOf && <PatientCard patient={cardOf} initialTab={cardTab} onClose={() => setCardOf(null)} />}
      {msgOf && <MessageModal patient={msgOf} onClose={() => setMsgOf(null)} />}
      {tgConnectOf && (
        <TelegramConnectModal
          patient={tgConnectOf}
          onClose={() => setTgConnectOf(null)}
          onUpdated={() => load()}
        />
      )}
    </div>
  );
}
