/**
 * Reports.jsx — Hisobotlar sahifasi
 * - Shifokorlar tugmalariga kirish va interaktiv filtrlash
 * - 2 kishi bajargan muolajalar summasini tayyor tugmalar (50/50, 60/40, 70/30, 80/20, ixtiyoriy) bilan bo'lish
 * - Davr to'lovlar daftari jadvalida ishni bajargan shifokorni ko'rsatish va tahrirlash
 * - Shifokor bo'yicha batafsil individual hisobot modali
 * - Excel eksport
 */

import React, { useEffect, useState, useCallback, useMemo } from "react";
import dayjs from "dayjs";
import { api } from "../api.js";
import { useLang } from "../i18n.jsx";
import { StatCard, Empty, ErrorBanner, Modal } from "../components/ui.jsx";

export default function Reports() {
  const { t } = useLang();
  const [preset, setPreset] = useState("month"); // 'today' | 'week' | 'month' | 'year' | 'custom'
  const [from, setFrom] = useState(dayjs().startOf("month").format("YYYY-MM-DD"));
  const [to, setTo] = useState(dayjs().format("YYYY-MM-DD"));
  const [activeTab, setActiveTab] = useState("doctors"); // 'doctors' | 'ledger' | 'splits'
  const [finance, setFinance] = useState(null);
  const [stats, setStats] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [procedures, setProcedures] = useState([]);
  const [staff, setStaff] = useState([]);
  const [selectedDoctorId, setSelectedDoctorId] = useState(null); // null = all
  const [doctorDetailModal, setDoctorDetailModal] = useState(null); // staff_id or null
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [editingTx, setEditingTx] = useState(null);
  const [savingSplitId, setSavingSplitId] = useState(null);
  const [customSplitModal, setCustomSplitModal] = useState(null); // proc or null
  const [customRatioInput, setCustomRatioInput] = useState(50);

  const applyPreset = (key) => {
    setPreset(key);
    const today = dayjs();
    if (key === "today") {
      setFrom(today.format("YYYY-MM-DD"));
      setTo(today.format("YYYY-MM-DD"));
    } else if (key === "week") {
      setFrom(today.startOf("week").add(1, "day").format("YYYY-MM-DD"));
      setTo(today.format("YYYY-MM-DD"));
    } else if (key === "month") {
      setFrom(today.startOf("month").format("YYYY-MM-DD"));
      setTo(today.format("YYYY-MM-DD"));
    } else if (key === "year") {
      setFrom(today.startOf("year").format("YYYY-MM-DD"));
      setTo(today.format("YYYY-MM-DD"));
    }
  };

  const load = useCallback(() => {
    setError("");
    api.get(`/api/reports/finance?from=${from}&to=${to}`)
      .then(setFinance)
      .catch((e) => setError(e.message));

    api.get(`/api/reports/doctor-stats?from=${from}&to=${to}`)
      .then((d) => setStats(d.stats || []))
      .catch(() => {});

    api.get(`/api/transactions?from=${from}&to=${to}`)
      .then((d) => setTransactions(d.transactions || []))
      .catch(() => {});

    api.get(`/api/procedures?from=${from}&to=${to}`)
      .then((d) => setProcedures(d.procedures || []))
      .catch(() => {});

    api.get("/api/staff")
      .then((d) => setStaff(d.staff || []))
      .catch(() => {});
  }, [from, to]);

  useEffect(() => {
    load();
  }, [load]);

  // 2 kishi bajargan muolajalar ro'yxati
  const jointProcedures = useMemo(() => {
    return procedures.filter(
      (p) => p.final_staff_id && p.final_staff_id !== (p.initial_staff_id || p.staff_id)
    );
  }, [procedures]);

  // Tezkor ulush o'zgartirish (50/50, 60/40, 70/30, 80/20 yoki ixtiyoriy)
  const applySplit = async (procId, ratio) => {
    setSavingSplitId(procId);
    setError("");
    try {
      await api.put(`/api/procedures/${procId}/split`, { split_ratio: Number(ratio) });
      setSuccessMsg(`Muolaja ulushi muvaffaqiyatli ${ratio}% / ${100 - ratio}% qilib saqlandi!`);
      setTimeout(() => setSuccessMsg(""), 3500);
      load();
    } catch (e) {
      setError(e.message || "Ulushni saqlashda xatolik");
    } finally {
      setSavingSplitId(null);
    }
  };

  const downloadExcel = async (kind) => {
    try {
      const blob = await api.get(`/api/reports/excel?kind=${kind}&from=${from}&to=${to}`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${kind}_${from}_${to}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e.message);
    }
  };

  const delTx = async (tx) => {
    if (!confirm(`${t("confirmDelete")} (${tx.amount} ${t("sum")})`)) return;
    try {
      await api.del(`/api/transactions/${tx.id}`);
      load();
    } catch (e) {
      setError(e.message);
    }
  };

  const saveEditTx = async (e) => {
    e.preventDefault();
    try {
      const selStaff = staff.find((s) => String(s.id) === String(editingTx.staff_id));
      await api.put(`/api/transactions/${editingTx.id}`, {
        amount: Number(editingTx.amount),
        type: editingTx.type,
        category: editingTx.category,
        method: editingTx.method,
        staff_id: editingTx.staff_id ? parseInt(editingTx.staff_id, 10) : null,
        staff_name: selStaff ? selStaff.full_name : undefined,
        comment: editingTx.comment,
        tx_date: editingTx.tx_date,
      });
      setEditingTx(null);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const fmtMoney = (n) => Number(n || 0).toLocaleString("ru-RU");

  // Shifokor bo'yicha filtrlangan amallar
  const filteredTransactions = useMemo(() => {
    if (!selectedDoctorId) return transactions;
    return transactions.filter((t) => t.staff_id === selectedDoctorId);
  }, [transactions, selectedDoctorId]);

  // Shifokor bo'yicha filtrlangan statistika
  const displayedStats = useMemo(() => {
    if (!selectedDoctorId) return stats;
    return stats.filter((s) => s.staff_id === selectedDoctorId);
  }, [stats, selectedDoctorId]);

  // Tanlangan shifokor ma'lumoti
  const selectedDoctor = useMemo(() => {
    return stats.find((s) => s.staff_id === selectedDoctorId) || staff.find((s) => s.id === selectedDoctorId);
  }, [stats, staff, selectedDoctorId]);

  // Shifokor batafsil hisoboti modali uchun ma'lumotlar
  const modalDoctorData = useMemo(() => {
    if (!doctorDetailModal) return null;
    const docStat = stats.find((s) => s.staff_id === doctorDetailModal);
    const docStaff = staff.find((s) => s.id === doctorDetailModal);
    const docProcs = procedures.filter(
      (p) =>
        p.staff_id === doctorDetailModal ||
        p.initial_staff_id === doctorDetailModal ||
        p.final_staff_id === doctorDetailModal
    );
    const docTxs = transactions.filter((t) => t.staff_id === doctorDetailModal);
    return {
      stat: docStat || {},
      staff: docStaff || {},
      procedures: docProcs,
      transactions: docTxs,
    };
  }, [doctorDetailModal, stats, staff, procedures, transactions]);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
        <div className="page-title" style={{ margin: 0 }}>📈 {t("nav_reports")}</div>
        <div className="toolbar" style={{ margin: 0 }}>
          <button className="btn secondary" onClick={() => downloadExcel("finance")}>
            📥 {t("rep_excel")} (Kirim-chiqim)
          </button>
          <button className="btn secondary" onClick={() => downloadExcel("doctor-stats")}>
            📥 {t("rep_excel")} ({t("rep_doctorStats")})
          </button>
        </div>
      </div>

      {error && <ErrorBanner message={error} />}
      {successMsg && (
        <div style={{ background: "#ecfdf5", border: "1px solid #6ee7b7", color: "#065f46", padding: "10px 14px", borderRadius: 8, marginBottom: 14, fontWeight: 600 }}>
          ✓ {successMsg}
        </div>
      )}

      {/* DAVR BOSHQARUVI */}
      <div className="panel" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)", fontWeight: 600 }}>Davr:</span>
            <button
              className={`btn small ${preset === "today" ? "" : "secondary"}`}
              onClick={() => applyPreset("today")}
            >
              {t("today")}
            </button>
            <button
              className={`btn small ${preset === "week" ? "" : "secondary"}`}
              onClick={() => applyPreset("week")}
            >
              Shu hafta
            </button>
            <button
              className={`btn small ${preset === "month" ? "" : "secondary"}`}
              onClick={() => applyPreset("month")}
            >
              {t("this_month")}
            </button>
            <button
              className={`btn small ${preset === "year" ? "" : "secondary"}`}
              onClick={() => applyPreset("year")}
            >
              {t("this_year")}
            </button>
          </div>

          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            <label className="muted" style={{ fontSize: "0.85rem" }}>{t("from")}:</label>
            <input
              type="date"
              value={from}
              onChange={(e) => {
                setPreset("custom");
                setFrom(e.target.value);
              }}
              style={{ width: 135 }}
            />
            <label className="muted" style={{ fontSize: "0.85rem" }}>{t("to")}:</label>
            <input
              type="date"
              value={to}
              onChange={(e) => {
                setPreset("custom");
                setTo(e.target.value);
              }}
              style={{ width: 135 }}
            />
            <button className="btn small" onClick={load}>
              Ko'rsatish
            </button>
          </div>
        </div>
      </div>

      {finance && (
        <div className="cards">
          <StatCard label={t("fin_income")} value={`${fmtMoney(finance.income)} ${t("sum")}`} color="green" />
          <StatCard label={t("fin_expense")} value={`${fmtMoney(finance.expense)} ${t("sum")}`} color="red" />
          <StatCard label={t("fin_profit")} value={`${fmtMoney(finance.profit)} ${t("sum")}`} />
          <StatCard label={t("rep_proceduresSum")} value={`${fmtMoney(finance.procedures_total)} ${t("sum")}`} />
          <StatCard label={t("rep_newPatients")} value={finance.new_patients} />
        </div>
      )}

      {/* SHIFOKORLAR TUGMALARI (DOCTOR ACCESS & FILTER BAR) */}
      <div className="panel" style={{ marginTop: 18, marginBottom: 18, background: "#f8fafc", border: "1px solid #cbd5e1" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
          <div style={{ fontWeight: 700, fontSize: "0.92rem", color: "#0f172a", display: "flex", alignItems: "center", gap: 6 }}>
            <span>👨‍⚕️ Shifokorlar bo'yicha tezkor kirish va hisobot tugmalari:</span>
            {selectedDoctor && (
              <span className="badge blue" style={{ fontSize: "0.78rem" }}>
                Tanlangan: {selectedDoctor.full_name}
              </span>
            )}
          </div>
          {selectedDoctorId && (
            <button
              className="btn small secondary"
              onClick={() => setSelectedDoctorId(null)}
              style={{ fontSize: "0.78rem", padding: "2px 8px" }}
            >
              ✕ Barcha shifokorlarni ko'rsatish
            </button>
          )}
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            className={`btn small ${selectedDoctorId === null ? "" : "secondary"}`}
            style={{ fontWeight: selectedDoctorId === null ? 700 : 500 }}
            onClick={() => setSelectedDoctorId(null)}
          >
            👥 Barcha shifokorlar ({stats.length})
          </button>
          {stats.map((doc) => {
            const isSelected = selectedDoctorId === doc.staff_id;
            return (
              <button
                key={doc.staff_id}
                className={`btn small ${isSelected ? "" : "secondary"}`}
                style={{
                  fontWeight: isSelected ? 700 : 500,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  borderColor: isSelected ? "var(--color-primary)" : "#cbd5e1",
                }}
                onClick={() => setSelectedDoctorId(isSelected ? null : doc.staff_id)}
                title="Shifokor hisobotini ko'rish uchun bosing"
              >
                <span>👨‍⚕️ {doc.full_name}</span>
                <span
                  style={{
                    background: isSelected ? "rgba(255,255,255,0.3)" : "#e2e8f0",
                    color: isSelected ? "#fff" : "#334155",
                    fontSize: "0.72rem",
                    padding: "1px 6px",
                    borderRadius: 10,
                    fontWeight: 700,
                  }}
                >
                  {doc.procedures_count} ta · {fmtMoney(doc.procedures_total)}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* TABLAR */}
      <div className="toolbar" style={{ marginTop: 10 }}>
        <button
          className={`btn ${activeTab === "doctors" ? "" : "secondary"}`}
          onClick={() => setActiveTab("doctors")}
        >
          👨‍⚕️ {t("rep_doctorStats")} ({displayedStats.length})
        </button>
        <button
          className={`btn ${activeTab === "splits" ? "" : "secondary"}`}
          onClick={() => setActiveTab("splits")}
          style={{ position: "relative" }}
        >
          ✂️ 2 kishi bajargan ishlar va Ulushlar ({jointProcedures.length})
          {jointProcedures.length > 0 && (
            <span
              style={{
                marginLeft: 6,
                background: "#2563eb",
                color: "#fff",
                fontSize: "0.72rem",
                padding: "1px 6px",
                borderRadius: 10,
              }}
            >
              Tayyor bo'lish
            </span>
          )}
        </button>
        <button
          className={`btn ${activeTab === "ledger" ? "" : "secondary"}`}
          onClick={() => setActiveTab("ledger")}
        >
          💳 Davr to'lovlar daftari ({filteredTransactions.length})
          {selectedDoctorId && <span style={{ fontSize: "0.75rem", opacity: 0.85 }}> (Filtrlangan)</span>}
        </button>
      </div>

      {/* 1. SHIFOKORLAR STATISTIKASI */}
      {activeTab === "doctors" && (
        <div className="panel">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
            <h3 style={{ margin: 0 }}>
              👨‍⚕️ {t("rep_doctorStats")} {selectedDoctor ? `— ${selectedDoctor.full_name}` : ""}
            </h3>
            <span style={{ fontSize: "0.85rem", color: "#64748b" }}>
              * Birgalikda 2 kishi bajargan muolajalar summasi belgilangan ulush (masalan 50/50) bo'yicha hisoblangan
            </span>
          </div>

          {displayedStats.length === 0 ? (
            <Empty />
          ) : (
            <table>
              <thead>
                <tr>
                  <th>{t("appt_doctor")}</th>
                  <th>{t("set_position")}</th>
                  <th>Bajarilgan ishlar</th>
                  <th>{t("rep_proceduresSum")}</th>
                  <th>Birgalikdagi ishlar</th>
                  <th>{t("rep_appointments")}</th>
                  <th>{t("rep_completed")}</th>
                  <th>Amallar</th>
                </tr>
              </thead>
              <tbody>
                {displayedStats.map((s) => (
                  <tr key={s.staff_id}>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <button
                          type="button"
                          className="btn small secondary"
                          style={{ padding: "3px 8px", fontSize: "0.82rem", fontWeight: 700 }}
                          onClick={() => setDoctorDetailModal(s.staff_id)}
                          title="Shifokor profiliga kirish va to'liq hisobotni ko'rish"
                        >
                          👁 {s.full_name}
                        </button>
                      </div>
                    </td>
                    <td>{t(`pos_${s.position}`) || s.position}</td>
                    <td style={{ fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>
                      {s.procedures_count} ta
                      {s.solo_procedures_count !== undefined && (
                        <span style={{ fontSize: "0.78rem", color: "#64748b", display: "block" }}>
                          ({s.solo_procedures_count} ta yakka)
                        </span>
                      )}
                    </td>
                    <td style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums", color: "#16a34a", fontSize: "0.95rem" }}>
                      {fmtMoney(s.procedures_total)} {t("sum")}
                    </td>
                    <td>
                      {s.joint_procedures_count > 0 ? (
                        <button
                          type="button"
                          className="btn small secondary"
                          style={{ color: "#2563eb", borderColor: "#bfdbfe", padding: "2px 8px", fontSize: "0.78rem" }}
                          onClick={() => {
                            setSelectedDoctorId(s.staff_id);
                            setActiveTab("splits");
                          }}
                        >
                          👥 {s.joint_procedures_count} ta ulushli ish
                        </button>
                      ) : (
                        <span className="muted">0 ta</span>
                      )}
                    </td>
                    <td style={{ fontVariantNumeric: "tabular-nums" }}>{s.appointments_total}</td>
                    <td>
                      <span className="badge green">{s.appointments_completed} ta yakunlangan</span>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn small"
                        style={{ padding: "3px 10px", fontSize: "0.8rem" }}
                        onClick={() => setDoctorDetailModal(s.staff_id)}
                      >
                        📊 Batafsil hisobot
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* 2. IKKI KISHI BAJARGANI ISHLAR VA ULUSHLAR TAQSIMOTI */}
      {activeTab === "splits" && (
        <div className="panel">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 10 }}>
            <div>
              <h3 style={{ margin: 0 }}>👥 2 kishi bajargan muolajalar va summani bo'lish (Taqsimot)</h3>
              <p style={{ margin: "4px 0 0", fontSize: "0.85rem", color: "#64748b" }}>
                Agar bir bemorni ikki kishi bajargan bo'lsa, summani <strong>2 ga teng (50/50)</strong> yoki tayyor tugmalar <strong>(60/40, 70/30, 80/20 yoki ixtiyoriy)</strong> orqali bir bosishda bo'ling.
              </p>
            </div>
            {selectedDoctorId && (
              <span className="badge blue">
                Filtr: {selectedDoctor?.full_name}
              </span>
            )}
          </div>

          {jointProcedures.length === 0 ? (
            <div style={{ textAlign: "center", padding: "30px 10px", background: "#f8fafc", borderRadius: 8 }}>
              <p style={{ fontSize: "1rem", color: "#475569", margin: "0 0 8px" }}>
                Ushbu davrda 2 kishi birgalikda bajargan muolaja topilmadi.
              </p>
              <small className="muted">
                (Muolaja qo'shish yoki tahrirlashda "Yakunlovchi / Yordamchi shifokor" ham tanlansa, ushbu ro'yxatda paydo bo'ladi)
              </small>
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table>
                <thead>
                  <tr>
                    <th>Sana</th>
                    <th>Bemor</th>
                    <th>Muolaja & Tish</th>
                    <th>Umumiy summa</th>
                    <th>👨‍⚕️ 1-shifokor (Boshlovchi)</th>
                    <th>🤝 2-shifokor (Yordamchi)</th>
                    <th style={{ minWidth: 260 }}>⚡ Tayyor tugmalar bilan ulushni bo'lish</th>
                  </tr>
                </thead>
                <tbody>
                  {jointProcedures.map((proc) => {
                    const ratio = proc.split_ratio !== undefined ? Number(proc.split_ratio) : 50;
                    const assistRatio = 100 - ratio;
                    const doc1Sum = Math.round((Number(proc.price || 0) * ratio) / 100);
                    const doc2Sum = Math.round((Number(proc.price || 0) * assistRatio) / 100);
                    const isSaving = savingSplitId === proc.id;

                    return (
                      <tr key={proc.id}>
                        <td style={{ fontVariantNumeric: "tabular-nums" }}>
                          {(proc.procedure_date || "").slice(0, 10)}
                        </td>
                        <td>
                          <strong>{proc.patient_name || `Bemor #${proc.patient_id}`}</strong>
                        </td>
                        <td>
                          <div><strong>{proc.service_name || "Muolaja"}</strong></div>
                          {proc.tooth && <span className="badge gray" style={{ fontSize: "0.75rem" }}>Tish: {proc.tooth}</span>}
                        </td>
                        <td style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums", color: "#0f172a" }}>
                          {fmtMoney(proc.price)} {t("sum")}
                        </td>
                        <td>
                          <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "#16a34a" }}>
                            👨‍⚕️ {proc.initial_staff_name || proc.staff_name || "1-shifokor"}
                          </div>
                          <div style={{ fontSize: "0.8rem", color: "#065f46", fontWeight: 700 }}>
                            {fmtMoney(doc1Sum)} {t("sum")} ({ratio}%)
                          </div>
                        </td>
                        <td>
                          <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "#2563eb" }}>
                            🤝 {proc.final_staff_name || "2-shifokor"}
                          </div>
                          <div style={{ fontSize: "0.8rem", color: "#1e40af", fontWeight: 700 }}>
                            {fmtMoney(doc2Sum)} {t("sum")} ({assistRatio}%)
                          </div>
                        </td>
                        <td>
                          <div style={{ display: "flex", gap: 5, flexWrap: "wrap", alignItems: "center" }}>
                            {[
                              { label: "50/50", val: 50 },
                              { label: "60/40", val: 60 },
                              { label: "70/30", val: 70 },
                              { label: "80/20", val: 80 },
                            ].map((btn) => (
                              <button
                                key={btn.val}
                                type="button"
                                disabled={isSaving}
                                className={`btn small ${ratio === btn.val ? "" : "secondary"}`}
                                style={{
                                  padding: "3px 8px",
                                  fontSize: "0.78rem",
                                  fontWeight: ratio === btn.val ? 700 : 500,
                                }}
                                onClick={() => applySplit(proc.id, btn.val)}
                                title={`1-shifokorga ${btn.val}%, 2-shifokorga ${100 - btn.val}%`}
                              >
                                {btn.label}
                              </button>
                            ))}
                            <button
                              type="button"
                              className="btn small secondary"
                              style={{ padding: "3px 8px", fontSize: "0.78rem", color: "#7c3aed", borderColor: "#ddd6fe" }}
                              onClick={() => {
                                setCustomSplitModal(proc);
                                setCustomRatioInput(ratio);
                              }}
                              title="Ixtiyoriy foizda bo'lish"
                            >
                              ⚙️ Ixtiyoriy
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* 3. DAVR TO'LOVLARI VA XARAJATLARI JADVALI (KIM ISH BAJARGANINI HAM KO'RSATISH) */}
      {activeTab === "ledger" && (
        <div className="panel">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
            <div>
              <h3 style={{ margin: 0 }}>💳 Davr to'lovlar daftari ({filteredTransactions.length})</h3>
              {selectedDoctor && (
                <span style={{ fontSize: "0.85rem", color: "#2563eb", fontWeight: 600 }}>
                  👨‍⚕️ Faqat {selectedDoctor.full_name} ishlari ko'rsatilmoqda
                </span>
              )}
            </div>
            {selectedDoctorId && (
              <button className="btn small secondary" onClick={() => setSelectedDoctorId(null)}>
                Barcha to'lovlarni ko'rish
              </button>
            )}
          </div>

          {filteredTransactions.length === 0 ? (
            <Empty />
          ) : (
            <table>
              <thead>
                <tr>
                  <th>{t("date")}</th>
                  <th>Turi</th>
                  <th>{t("fin_category")}</th>
                  <th>Summa</th>
                  <th>{t("appt_patient")}</th>
                  <th style={{ minWidth: 150 }}>👨‍⚕️ Bajaruvchi (Shifokor)</th>
                  <th>{t("fin_method")}</th>
                  <th>{t("fin_comment")}</th>
                  <th>{t("actions")}</th>
                </tr>
              </thead>
              <tbody>
                {filteredTransactions.map((tx) => (
                  <tr key={tx.id}>
                    <td style={{ fontVariantNumeric: "tabular-nums" }}>{tx.tx_date}</td>
                    <td>
                      <span className={`badge ${tx.type === "income" ? "green" : "red"}`}>
                        {tx.type === "income" ? "Kirim" : "Xarajat"}
                      </span>
                    </td>
                    <td>{tx.category}</td>
                    <td style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums", color: tx.type === "income" ? "#16a34a" : "#dc2626" }}>
                      {tx.type === "income" ? "+" : "-"}{fmtMoney(tx.amount)} {t("sum")}
                    </td>
                    <td>{tx.patient_name || "—"}</td>
                    <td>
                      {tx.staff_name ? (
                        <span style={{ fontWeight: 600, color: "#1e293b", fontSize: "0.85rem", display: "inline-flex", alignItems: "center", gap: 4 }}>
                          👨‍⚕️ {tx.staff_name}
                        </span>
                      ) : (
                        <span className="muted" style={{ fontSize: "0.82rem" }}>—</span>
                      )}
                    </td>
                    <td>
                      {tx.method === "cash" ? "💵 Naqd" : tx.method === "card" ? "💳 Karta" : "🏦 O'tkazma"}
                    </td>
                    <td className="muted" style={{ maxWidth: 180, fontSize: "0.85rem" }}>
                      {tx.comment || "—"}
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: 4 }}>
                        <button
                          className="btn small secondary"
                          onClick={() => setEditingTx({ ...tx })}
                          title={t("edit")}
                        >
                          ✏️
                        </button>
                        <button
                          className="btn small danger"
                          onClick={() => delTx(tx)}
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

      {/* SHIFOKOR BATAFSIL HISOBOT MODALI */}
      {modalDoctorData && (
        <Modal
          title={`👨‍⚕️ ${modalDoctorData.staff.full_name || "Shifokor"} — Batafsil hisoboti`}
          onClose={() => setDoctorDetailModal(null)}
        >
          <div>
            <div className="cards" style={{ marginBottom: 16 }}>
              <StatCard
                label="Bajarilgan ishlar soni"
                value={`${modalDoctorData.stat.procedures_count || 0} ta`}
              />
              <StatCard
                label="Jami ishlangan summa"
                value={`${fmtMoney(modalDoctorData.stat.procedures_total)} ${t("sum")}`}
                color="green"
              />
              <StatCard
                label="Birgalikdagi ishlar"
                value={`${modalDoctorData.stat.joint_procedures_count || 0} ta`}
              />
              <StatCard
                label="Yakunlangan qabullar"
                value={`${modalDoctorData.stat.appointments_completed || 0} ta`}
              />
            </div>

            <h4 style={{ margin: "16px 0 8px" }}>📋 Ushbu davrdagi muolajalar ro'yxati:</h4>
            {modalDoctorData.procedures.length === 0 ? (
              <p className="muted">Muolajalar topilmadi</p>
            ) : (
              <div style={{ maxHeight: 300, overflowY: "auto" }}>
                <table>
                  <thead>
                    <tr>
                      <th>Sana</th>
                      <th>Bemor</th>
                      <th>Muolaja & Tish</th>
                      <th>Narxi</th>
                      <th>Ulush holati</th>
                    </tr>
                  </thead>
                  <tbody>
                    {modalDoctorData.procedures.map((p) => {
                      const isJoint = p.final_staff_id && p.final_staff_id !== (p.initial_staff_id || p.staff_id);
                      const isPrimary = p.staff_id === doctorDetailModal || p.initial_staff_id === doctorDetailModal;
                      const ratio = p.split_ratio !== undefined ? Number(p.split_ratio) : 50;
                      const myRatio = isJoint ? (isPrimary ? ratio : 100 - ratio) : 100;
                      const myEarned = Math.round((Number(p.price || 0) * myRatio) / 100);

                      return (
                        <tr key={p.id}>
                          <td>{(p.procedure_date || "").slice(0, 10)}</td>
                          <td><strong>{p.patient_name || `Bemor #${p.patient_id}`}</strong></td>
                          <td>
                            {p.service_name} {p.tooth ? `(${p.tooth}-tish)` : ""}
                          </td>
                          <td style={{ fontVariantNumeric: "tabular-nums" }}>
                            {fmtMoney(p.price)} {t("sum")}
                          </td>
                          <td>
                            {isJoint ? (
                              <span className="badge blue" style={{ fontSize: "0.75rem" }}>
                                👥 {myRatio}% ulush: <strong>{fmtMoney(myEarned)} {t("sum")}</strong>
                              </span>
                            ) : (
                              <span className="badge green" style={{ fontSize: "0.75rem" }}>
                                100% (Yakka)
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <div className="form-actions" style={{ marginTop: 20 }}>
              <button className="btn" type="button" onClick={() => setDoctorDetailModal(null)}>
                Yopish
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* IXTIYORIY FOIZDA BO'LISH MODALI */}
      {customSplitModal && (
        <Modal
          title={`⚙️ Ixtiyoriy ulushni kiritish — ${customSplitModal.service_name}`}
          onClose={() => setCustomSplitModal(null)}
        >
          <div>
            <p style={{ fontSize: "0.9rem", color: "#334155" }}>
              Bemor: <strong>{customSplitModal.patient_name}</strong> | Jami summa:{" "}
              <strong>{fmtMoney(customSplitModal.price)} {t("sum")}</strong>
            </p>
            <div style={{ background: "#f8fafc", padding: 14, borderRadius: 8, margin: "14px 0" }}>
              <div style={{ marginBottom: 10 }}>
                <label style={{ fontWeight: 600, display: "block", marginBottom: 4 }}>
                  👨‍⚕️ 1-shifokor ({customSplitModal.initial_staff_name || customSplitModal.staff_name || "Boshlovchi"}) ulushi (%):
                </label>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <input
                    type="range"
                    min="1"
                    max="99"
                    value={customRatioInput}
                    onChange={(e) => setCustomRatioInput(Number(e.target.value))}
                    style={{ flex: 1 }}
                  />
                  <input
                    type="number"
                    min="1"
                    max="99"
                    value={customRatioInput}
                    onChange={(e) => setCustomRatioInput(Math.min(99, Math.max(1, Number(e.target.value) || 50)))}
                    style={{ width: 70, textAlign: "center", fontWeight: 700, fontSize: "1rem" }}
                  />
                  <span style={{ fontWeight: 700 }}>%</span>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 12, background: "#fff", padding: 10, borderRadius: 6, border: "1px solid #e2e8f0" }}>
                <div>
                  <div style={{ fontSize: "0.78rem", color: "#64748b" }}>1-shifokor summasi:</div>
                  <div style={{ fontWeight: 700, color: "#16a34a", fontSize: "1rem" }}>
                    {Math.round((Number(customSplitModal.price || 0) * customRatioInput) / 100).toLocaleString("ru-RU")} so'm ({customRatioInput}%)
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: "0.78rem", color: "#64748b" }}>2-shifokor summasi:</div>
                  <div style={{ fontWeight: 700, color: "#2563eb", fontSize: "1rem" }}>
                    {Math.round((Number(customSplitModal.price || 0) * (100 - customRatioInput)) / 100).toLocaleString("ru-RU")} so'm ({100 - customRatioInput}%)
                  </div>
                </div>
              </div>
            </div>

            <div className="form-actions">
              <button
                className="btn"
                type="button"
                onClick={async () => {
                  await applySplit(customSplitModal.id, customRatioInput);
                  setCustomSplitModal(null);
                }}
              >
                Taqsimotni saqlash
              </button>
              <button className="btn secondary" type="button" onClick={() => setCustomSplitModal(null)}>
                {t("cancel")}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* TRANZAKSIYA TAHRIRLASH MODALI */}
      {editingTx && (
        <Modal title={t("fin_editTx")} onClose={() => setEditingTx(null)}>
          <form onSubmit={saveEditTx}>
            <div className="form-grid">
              <div className="form-row">
                <label>Turi</label>
                <select
                  value={editingTx.type}
                  onChange={(e) => setEditingTx({ ...editingTx, type: e.target.value })}
                >
                  <option value="income">Kirim</option>
                  <option value="expense">Xarajat</option>
                </select>
              </div>
              <div className="form-row">
                <label>Summa *</label>
                <input
                  type="number"
                  required
                  value={editingTx.amount}
                  onChange={(e) => setEditingTx({ ...editingTx, amount: e.target.value })}
                />
              </div>
              <div className="form-row">
                <label>Kategoriya</label>
                <input
                  value={editingTx.category}
                  onChange={(e) => setEditingTx({ ...editingTx, category: e.target.value })}
                />
              </div>

              {/* ISHNI BAJARGAN SHIFOKOR */}
              <div className="form-row">
                <label>👨‍⚕️ Ishni bajargan shifokor</label>
                <select
                  value={editingTx.staff_id || ""}
                  onChange={(e) => setEditingTx({ ...editingTx, staff_id: e.target.value })}
                >
                  <option value="">— Shifokorni tanlang (ixtiyoriy) —</option>
                  {staff.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.full_name} ({s.position === "doctor" ? "Shifokor" : s.position})
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-row">
                <label>To'lov usuli</label>
                <select
                  value={editingTx.method}
                  onChange={(e) => setEditingTx({ ...editingTx, method: e.target.value })}
                >
                  <option value="cash">Naqd</option>
                  <option value="card">Karta</option>
                  <option value="transfer">O'tkazma</option>
                </select>
              </div>
              <div className="form-row">
                <label>Sana</label>
                <input
                  type="date"
                  value={editingTx.tx_date}
                  onChange={(e) => setEditingTx({ ...editingTx, tx_date: e.target.value })}
                />
              </div>
            </div>
            <div className="form-row">
              <label>Izoh</label>
              <input
                value={editingTx.comment || ""}
                onChange={(e) => setEditingTx({ ...editingTx, comment: e.target.value })}
              />
            </div>
            <div className="form-actions">
              <button className="btn" type="submit">{t("save")}</button>
              <button className="btn secondary" type="button" onClick={() => setEditingTx(null)}>{t("cancel")}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
