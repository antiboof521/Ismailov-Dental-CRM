/**
 * Reports.jsx — Hisobotlar sahifasi (Interaktiv tahlil, tezkor davrlar va amallar bilan)
 */

import React, { useEffect, useState, useCallback } from "react";
import dayjs from "dayjs";
import { api } from "../api.js";
import { useLang } from "../i18n.jsx";
import { StatCard, Empty, ErrorBanner, Modal } from "../components/ui.jsx";

export default function Reports() {
  const { t } = useLang();
  const [preset, setPreset] = useState("month"); // 'today' | 'week' | 'month' | 'year' | 'custom'
  const [from, setFrom] = useState(dayjs().startOf("month").format("YYYY-MM-DD"));
  const [to, setTo] = useState(dayjs().format("YYYY-MM-DD"));
  const [activeTab, setActiveTab] = useState("doctors"); // 'doctors' | 'ledger'
  const [finance, setFinance] = useState(null);
  const [stats, setStats] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [error, setError] = useState("");
  const [editingTx, setEditingTx] = useState(null);

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
  }, [from, to]);

  useEffect(() => {
    load();
  }, [load]);

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
      await api.put(`/api/transactions/${editingTx.id}`, {
        amount: Number(editingTx.amount),
        type: editingTx.type,
        category: editingTx.category,
        method: editingTx.method,
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

      {/* TABLAR */}
      <div className="toolbar" style={{ marginTop: 20 }}>
        <button
          className={`btn ${activeTab === "doctors" ? "" : "secondary"}`}
          onClick={() => setActiveTab("doctors")}
        >
          👨‍⚕️ {t("rep_doctorStats")} ({stats.length})
        </button>
        <button
          className={`btn ${activeTab === "ledger" ? "" : "secondary"}`}
          onClick={() => setActiveTab("ledger")}
        >
          💳 Davr to'lovlar daftari ({transactions.length})
        </button>
      </div>

      {/* SHIFOKORLAR STATISTIKASI */}
      {activeTab === "doctors" && (
        <div className="panel">
          <h3 style={{ margin: "0 0 12px 0" }}>{t("rep_doctorStats")}</h3>
          {stats.length === 0 ? (
            <Empty />
          ) : (
            <table>
              <thead>
                <tr>
                  <th>{t("appt_doctor")}</th>
                  <th>{t("set_position")}</th>
                  <th>{t("rep_proceduresCount")}</th>
                  <th>{t("rep_proceduresSum")}</th>
                  <th>{t("rep_appointments")}</th>
                  <th>{t("rep_completed")}</th>
                </tr>
              </thead>
              <tbody>
                {stats.map((s) => (
                  <tr key={s.staff_id}>
                    <td><strong>{s.full_name}</strong></td>
                    <td>{t(`pos_${s.position}`) || s.position}</td>
                    <td style={{ fontVariantNumeric: "tabular-nums" }}>{s.procedures_count} ta</td>
                    <td style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums", color: "#16a34a" }}>
                      {fmtMoney(s.procedures_total)} {t("sum")}
                    </td>
                    <td style={{ fontVariantNumeric: "tabular-nums" }}>{s.appointments_total}</td>
                    <td>
                      <span className="badge green">{s.appointments_completed} ta yakunlangan</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* DAVR TO'LOVLARI VA XARAJATLARI JADVALI */}
      {activeTab === "ledger" && (
        <div className="panel">
          <h3 style={{ margin: "0 0 12px 0" }}>💳 Tanlangan davrdagi barcha amallar</h3>
          {transactions.length === 0 ? (
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
                  <th>{t("fin_method")}</th>
                  <th>{t("fin_comment")}</th>
                  <th>{t("actions")}</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((tx) => (
                  <tr key={tx.id}>
                    <td style={{ fontVariantNumeric: "tabular-nums" }}>{tx.tx_date}</td>
                    <td>
                      <span className={`badge ${tx.type === "income" ? "green" : "red"}`}>
                        {tx.type === "income" ? "Kirim" : "Xarajat"}
                      </span>
                    </td>
                    <td>{tx.category}</td>
                    <td style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                      {fmtMoney(tx.amount)} {t("sum")}
                    </td>
                    <td>{tx.patient_name || "—"}</td>
                    <td>{tx.method}</td>
                    <td className="muted">{tx.comment || "—"}</td>
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
