/**
 * Finance.jsx — Moliya sahifasi (To'liq tahrirlash, o'chirish, filtrlash va Excel bilan)
 */

import React, { useEffect, useState, useMemo, useCallback } from "react";
import dayjs from "dayjs";
import { api } from "../api.js";
import { useLang } from "../i18n.jsx";
import { Modal, StatCard, Empty, ErrorBanner } from "../components/ui.jsx";

const EXPENSE_CATEGORIES = ["material", "rent", "salary", "utility", "equipment", "marketing", "other"];

function TxModal({ initial, defaultType = "income", onSaved, onCancel }) {
  const { t } = useLang();
  const [patients, setPatients] = useState([]);
  const [staff, setStaff] = useState([]);
  const [form, setForm] = useState({
    type: initial?.type || defaultType,
    amount: initial?.amount || "",
    category: initial?.category || (defaultType === "income" ? "payment" : "material"),
    method: initial?.method || "cash",
    patient_id: initial?.patient_id || "",
    staff_id: initial?.staff_id || "",
    comment: initial?.comment || "",
    tx_date: initial?.tx_date || dayjs().format("YYYY-MM-DD"),
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get("/api/patients?limit=200").then((d) => setPatients(d.patients || [])).catch(() => {});
    api.get("/api/staff").then((d) => setStaff(d.staff || [])).catch(() => {});
  }, []);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.amount || Number(form.amount) <= 0) {
      setError("To'g'ri summa kiriting");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const selStaff = staff.find((s) => String(s.id) === String(form.staff_id));
      const payload = {
        ...form,
        amount: Number(form.amount),
        patient_id: form.patient_id ? parseInt(form.patient_id, 10) : null,
        staff_id: form.staff_id ? parseInt(form.staff_id, 10) : null,
        staff_name: selStaff ? selStaff.full_name : undefined,
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

  const isIncome = form.type === "income";

  return (
    <Modal
      title={initial ? `✏️ ${t("fin_editTx")}` : isIncome ? `+ ${t("fin_addIncome")}` : `+ ${t("fin_addExpense")}`}
      onClose={onCancel}
    >
      <form onSubmit={submit}>
        {error && <div className="error-msg mb">{error}</div>}
        <div className="form-grid">
          <div className="form-row">
            <label>Turi *</label>
            <select
              value={form.type}
              onChange={(e) => {
                const newType = e.target.value;
                setForm((f) => ({
                  ...f,
                  type: newType,
                  category: newType === "income" ? "payment" : "material",
                }));
              }}
            >
              <option value="income">🟢 {t("fin_income")}</option>
              <option value="expense">🔴 {t("fin_expense")}</option>
            </select>
          </div>

          <div className="form-row">
            <label>{t("visit_price")} ({t("sum")}) *</label>
            <input
              type="text"
              inputMode="numeric"
              required
              value={form.amount}
              onChange={(e) => {
                const val = e.target.value.replace(/[^\d.]/g, "");
                setForm((f) => ({ ...f, amount: val }));
              }}
              autoFocus
              placeholder="Masalan: 240000"
            />
            {form.amount && !isNaN(Number(form.amount)) && Number(form.amount) > 0 && (
              <small style={{ color: "#16a34a", fontSize: "0.82rem", marginTop: 4, display: "block", fontWeight: 600 }}>
                ✓ {Number(form.amount).toLocaleString("ru-RU")} so'm
              </small>
            )}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
              {[100000, 200000, 240000, 500000, 1000000].map((amt) => (
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
            </div>
          </div>

          {isIncome ? (
            <div className="form-row">
              <label>{t("appt_patient")}</label>
              <select value={form.patient_id} onChange={set("patient_id")}>
                <option value="">— Bemor (ixtiyoriy) —</option>
                {patients.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name} {p.phone ? `(${p.phone})` : ""}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="form-row">
              <label>{t("fin_category")}</label>
              <select value={form.category} onChange={set("category")}>
                {EXPENSE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {t(`cat_${c}`) || c}
                  </option>
                ))}
              </select>
            </div>
          )}

          {isIncome && (
            <div className="form-row">
              <label>👨‍⚕️ Bajaruvchi shifokor</label>
              <select value={form.staff_id} onChange={set("staff_id")}>
                <option value="">— Shifokor (ixtiyoriy) —</option>
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.full_name} ({s.position === "doctor" ? "Shifokor" : s.position})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="form-row">
            <label>{t("fin_method")}</label>
            <select value={form.method} onChange={set("method")}>
              <option value="cash">💵 {t("fin_cash")}</option>
              <option value="card">💳 {t("fin_card")}</option>
              <option value="transfer">🏦 {t("fin_transfer")}</option>
            </select>
          </div>

          <div className="form-row">
            <label>{t("date")} *</label>
            <input type="date" required value={form.tx_date} onChange={set("tx_date")} />
          </div>
        </div>

        <div className="form-row">
          <label>{t("fin_comment")}</label>
          <input
            value={form.comment}
            onChange={set("comment")}
            placeholder="Masalan: Plomba va rentgen to'lovi yoki material xaridi..."
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

export default function Finance() {
  const { t } = useLang();
  const [filterMode, setFilterMode] = useState("month"); // 'today' | 'month' | 'all' | 'custom'
  const [date, setDate] = useState(dayjs().format("YYYY-MM-DD"));
  const [dateFrom, setDateFrom] = useState(dayjs().startOf("month").format("YYYY-MM-DD"));
  const [dateTo, setDateTo] = useState(dayjs().format("YYYY-MM-DD"));
  const [typeFilter, setTypeFilter] = useState("all"); // 'all' | 'income' | 'expense'
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  const [modal, setModal] = useState(null); // { kind: 'new' | 'edit', type?: 'income' | 'expense', tx?: any }

  const load = useCallback(() => {
    let url = "/api/transactions";
    if (filterMode === "today") {
      url += `?date=${dayjs().format("YYYY-MM-DD")}`;
    } else if (filterMode === "month") {
      const start = dayjs().startOf("month").format("YYYY-MM-DD");
      const end = dayjs().endOf("month").format("YYYY-MM-DD");
      url += `?from=${start}&to=${end}`;
    } else if (filterMode === "custom") {
      url += `?from=${dateFrom}&to=${dateTo}`;
    } else {
      url += "?all=true";
    }

    api.get(url)
      .then((d) => setRows(d.transactions || []))
      .catch((e) => setError(e.message));
  }, [filterMode, dateFrom, dateTo]);

  useEffect(() => {
    load();
  }, [load]);

  // Real-time SSE updates for transactions
  useEffect(() => {
    const onSSE = (e) => {
      const type = e.detail?.type;
      if (!type || type.startsWith("transaction:") || type === "storage:updated") {
        load();
      }
    };
    window.addEventListener("clinic:sse", onSSE);
    return () => window.removeEventListener("clinic:sse", onSSE);
  }, [load]);

  const del = async (tx) => {
    const label = `${tx.type === "income" ? "Kirim" : "Xarajat"}: ${Number(tx.amount).toLocaleString("ru-RU")} ${t("sum")}`;
    if (!confirm(`${t("confirmDelete")} (${label})`)) return;
    try {
      await api.del(`/api/transactions/${tx.id}`);
      load();
    } catch (e) {
      setError(e.message);
    }
  };

  const fmtMoney = (n) => Number(n || 0).toLocaleString("ru-RU");

  // Client filtering
  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      if (typeFilter !== "all" && r.type !== typeFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        const pName = (r.patient_name || "").toLowerCase();
        const comm = (r.comment || "").toLowerCase();
        const cat = (r.category || "").toLowerCase();
        if (!pName.includes(q) && !comm.includes(q) && !cat.includes(q)) return false;
      }
      return true;
    });
  }, [rows, typeFilter, search]);

  const totals = useMemo(() => {
    const inc = filteredRows.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
    const exp = filteredRows.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);
    return { income: inc, expense: exp, profit: inc - exp };
  }, [filteredRows]);

  const downloadExcel = async () => {
    try {
      const from = filterMode === "month"
        ? dayjs().startOf("month").format("YYYY-MM-DD")
        : filterMode === "custom" ? dateFrom : dayjs().format("YYYY-MM-DD");
      const to = filterMode === "month"
        ? dayjs().endOf("month").format("YYYY-MM-DD")
        : filterMode === "custom" ? dateTo : dayjs().format("YYYY-MM-DD");

      const blob = await api.get(`/api/reports/excel?kind=finance&from=${from}&to=${to}`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Moliya_${from}_${to}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
        <div className="page-title" style={{ margin: 0 }}>💰 {t("nav_finance")}</div>
        <div className="toolbar" style={{ margin: 0 }}>
          <button className="btn" onClick={() => setModal({ kind: "new", type: "income" })}>
            + {t("fin_addIncome")}
          </button>
          <button className="btn secondary" onClick={() => setModal({ kind: "new", type: "expense" })}>
            + {t("fin_addExpense")}
          </button>
          <button className="btn secondary" onClick={downloadExcel} title="Excel yuklab olish">
            📥 {t("rep_excel")}
          </button>
        </div>
      </div>

      {error && <ErrorBanner message={error} />}

      <div className="cards">
        <StatCard label={t("fin_income")} value={`${fmtMoney(totals.income)} ${t("sum")}`} color="green" />
        <StatCard label={t("fin_expense")} value={`${fmtMoney(totals.expense)} ${t("sum")}`} color="red" />
        <StatCard label={t("fin_profit")} value={`${fmtMoney(totals.profit)} ${t("sum")}`} />
      </div>

      <div className="panel" style={{ marginTop: 18 }}>
        {/* FILTRLAR BOSHQARUVI */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 14, borderBottom: "1px solid var(--color-border)", paddingBottom: 12 }}>
          {/* Sana oralig'i rejimlari */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)", fontWeight: 600 }}>Oraliq:</span>
            <button
              className={`btn small ${filterMode === "today" ? "" : "secondary"}`}
              onClick={() => setFilterMode("today")}
            >
              {t("today")}
            </button>
            <button
              className={`btn small ${filterMode === "month" ? "" : "secondary"}`}
              onClick={() => setFilterMode("month")}
            >
              {t("this_month")}
            </button>
            <button
              className={`btn small ${filterMode === "all" ? "" : "secondary"}`}
              onClick={() => setFilterMode("all")}
            >
              {t("all")}
            </button>
            <button
              className={`btn small ${filterMode === "custom" ? "" : "secondary"}`}
              onClick={() => setFilterMode("custom")}
            >
              Tanlangan sana
            </button>

            {filterMode === "custom" && (
              <div style={{ display: "flex", gap: 4, alignItems: "center", marginLeft: 6 }}>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  style={{ width: 135 }}
                />
                <span className="muted">—</span>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  style={{ width: 135 }}
                />
              </div>
            )}
          </div>

          {/* Turi va Qidiruv */}
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ display: "flex", border: "1px solid var(--color-border)", borderRadius: 6, overflow: "hidden" }}>
              <button
                type="button"
                className={`btn small ${typeFilter === "all" ? "" : "secondary"}`}
                style={{ borderRadius: 0, border: "none" }}
                onClick={() => setTypeFilter("all")}
              >
                {t("all")}
              </button>
              <button
                type="button"
                className={`btn small ${typeFilter === "income" ? "" : "secondary"}`}
                style={{ borderRadius: 0, border: "none", color: "#16a34a" }}
                onClick={() => setTypeFilter("income")}
              >
                Kirim
              </button>
              <button
                type="button"
                className={`btn small ${typeFilter === "expense" ? "" : "secondary"}`}
                style={{ borderRadius: 0, border: "none", color: "#dc2626" }}
                onClick={() => setTypeFilter("expense")}
              >
                Xarajat
              </button>
            </div>

            <input
              placeholder={t("search")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ width: 180 }}
            />
          </div>
        </div>

        {filteredRows.length === 0 ? (
          <Empty />
        ) : (
          <table>
            <thead>
              <tr>
                <th>{t("date")}</th>
                <th>Turi</th>
                <th>{t("fin_category")}</th>
                <th>{t("visit_price")}</th>
                <th>{t("appt_patient")}</th>
                <th>👨‍⚕️ Bajaruvchi</th>
                <th>{t("fin_method")}</th>
                <th>{t("fin_comment")}</th>
                <th>{t("actions")}</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((r) => (
                <tr key={r.id}>
                  <td style={{ fontVariantNumeric: "tabular-nums" }}>{r.tx_date}</td>
                  <td>
                    <span
                      style={{
                        padding: "2px 8px",
                        borderRadius: 4,
                        fontSize: "0.78rem",
                        fontWeight: 600,
                        background: r.type === "income" ? "#ecfdf5" : "#fef2f2",
                        color: r.type === "income" ? "#065f46" : "#991b1b",
                        border: `1px solid ${r.type === "income" ? "#a7f3d0" : "#fecaca"}`,
                      }}
                    >
                      {r.type === "income" ? "🟢 Kirim" : "🔴 Xarajat"}
                    </span>
                  </td>
                  <td>
                    {r.type === "income"
                      ? (t("cat_payment") || "To'lov")
                      : (t(`cat_${r.category}`) || r.category)}
                  </td>
                  <td style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums", color: r.type === "income" ? "#16a34a" : "#dc2626" }}>
                    {r.type === "income" ? "+" : "-"}{fmtMoney(r.amount)} {t("sum")}
                  </td>
                  <td>{r.patient_name || "—"}</td>
                  <td style={{ fontSize: "0.85rem", fontWeight: 600, color: "#1e293b" }}>
                    {r.staff_name ? `👨‍⚕️ ${r.staff_name}` : "—"}
                  </td>
                  <td>
                    {r.method === "cash"
                      ? `💵 ${t("fin_cash")}`
                      : r.method === "card"
                      ? `💳 ${t("fin_card")}`
                      : `🏦 ${t("fin_transfer")}`}
                  </td>
                  <td className="muted" style={{ maxWidth: 220, fontSize: "0.85rem" }}>
                    {r.comment || "—"}
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <button
                        className="btn small secondary"
                        onClick={() => setModal({ kind: "edit", tx: r })}
                        title={t("edit")}
                      >
                        ✏️ {t("edit")}
                      </button>
                      <button
                        className="btn small danger"
                        onClick={() => del(r)}
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

      {modal && (
        <TxModal
          initial={modal.kind === "edit" ? modal.tx : null}
          defaultType={modal.type || "income"}
          onSaved={() => {
            setModal(null);
            load();
          }}
          onCancel={() => setModal(null)}
        />
      )}
    </div>
  );
}
