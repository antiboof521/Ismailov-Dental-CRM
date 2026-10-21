/**
 * Reminders.jsx — Eslatmalar sahifasi (To'liq tahrirlash, o'chirish, filtrlash va yuborish bilan)
 */

import React, { useEffect, useState, useMemo, useCallback } from "react";
import dayjs from "dayjs";
import { api } from "../api.js";
import { useLang } from "../i18n.jsx";
import { Modal, StatusBadge, Empty, ErrorBanner } from "../components/ui.jsx";

function RemModal({ initial, onSaved, onCancel }) {
  const { t } = useLang();
  const [patients, setPatients] = useState([]);
  const [form, setForm] = useState({
    patient_id: initial?.patient_id || "",
    due_date: initial?.due_date || dayjs().add(3, "day").format("YYYY-MM-DD"),
    reason: initial?.reason || "",
    status: initial?.status || "pending",
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get("/api/patients?limit=200").then((d) => setPatients(d.patients || [])).catch(() => {});
  }, []);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const setQuickDate = (days) => {
    setForm((f) => ({
      ...f,
      due_date: dayjs().add(days, "day").format("YYYY-MM-DD"),
    }));
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.patient_id) {
      setError("Bemor tanlanishi shart");
      return;
    }
    if (!form.reason.trim()) {
      setError("Eslatma sababini kiriting");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const payload = {
        ...form,
        patient_id: parseInt(form.patient_id, 10),
      };

      if (initial && initial.id) {
        await api.put(`/api/reminders/${initial.id}`, payload);
      } else {
        await api.post("/api/reminders", payload);
      }
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={initial ? `✏️ ${t("rem_edit")}` : `+ ${t("rem_new")}`} onClose={onCancel}>
      <form onSubmit={submit}>
        {error && <div className="error-msg mb">{error}</div>}
        <div className="form-grid">
          <div className="form-row">
            <label>{t("appt_patient")} *</label>
            <select required value={form.patient_id} onChange={set("patient_id")}>
              <option value="">— Bemorni tanlang —</option>
              {patients.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name} {p.phone ? `(${p.phone})` : ""}
                </option>
              ))}
            </select>
          </div>

          <div className="form-row">
            <label>{t("rem_due")} *</label>
            <input type="date" required value={form.due_date} onChange={set("due_date")} />
            <div style={{ display: "flex", gap: 4, marginTop: 4, flexWrap: "wrap" }}>
              <button type="button" className="btn small secondary" style={{ padding: "2px 6px", fontSize: "0.75rem" }} onClick={() => setQuickDate(1)}>+1 kun</button>
              <button type="button" className="btn small secondary" style={{ padding: "2px 6px", fontSize: "0.75rem" }} onClick={() => setQuickDate(3)}>+3 kun</button>
              <button type="button" className="btn small secondary" style={{ padding: "2px 6px", fontSize: "0.75rem" }} onClick={() => setQuickDate(7)}>+1 hafta</button>
              <button type="button" className="btn small secondary" style={{ padding: "2px 6px", fontSize: "0.75rem" }} onClick={() => setQuickDate(30)}>+1 oy</button>
              <button type="button" className="btn small secondary" style={{ padding: "2px 6px", fontSize: "0.75rem" }} onClick={() => setQuickDate(180)}>+6 oy</button>
            </div>
          </div>

          {initial && (
            <div className="form-row">
              <label>{t("status")}</label>
              <select value={form.status} onChange={set("status")}>
                <option value="pending">⏳ {t("rem_pending")}</option>
                <option value="sent">📨 {t("rem_sent")}</option>
                <option value="done">✅ {t("rem_done")}</option>
              </select>
            </div>
          )}
        </div>

        <div className="form-row">
          <label>{t("rem_reason")} *</label>
          <input
            required
            value={form.reason}
            onChange={set("reason")}
            placeholder="Masalan: Breket ligaturani almashtirish, implant nazorati yoki profilaktik ko'rik..."
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

export default function Reminders() {
  const { t } = useLang();
  const [rows, setRows] = useState([]);
  const [statusFilter, setStatusFilter] = useState("all"); // 'all' | 'pending' | 'done'
  const [error, setError] = useState("");
  const [modal, setModal] = useState(null); // { kind: 'new' | 'edit', rem?: any }
  const [sendingId, setSendingId] = useState(null);

  const load = useCallback(() => {
    api.get("/api/reminders")
      .then((d) => setRows(d.reminders || []))
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Real-time SSE updates for reminders
  useEffect(() => {
    const onSSE = (e) => {
      const type = e.detail?.type;
      if (!type || type.startsWith("reminder:") || type === "storage:updated") {
        load();
      }
    };
    window.addEventListener("clinic:sse", onSSE);
    return () => window.removeEventListener("clinic:sse", onSSE);
  }, [load]);

  const setStatus = async (id, status) => {
    try {
      await api.put(`/api/reminders/${id}/status`, { status });
      load();
    } catch (e) {
      setError(e.message);
    }
  };

  const delReminder = async (r) => {
    if (!confirm(`${t("confirmDelete")} (${r.patient_name}: "${r.reason}")`)) return;
    try {
      await api.del(`/api/reminders/${r.id}`);
      load();
    } catch (e) {
      setError(e.message);
    }
  };

  const send = async (id) => {
    setError("");
    setSendingId(id);
    try {
      const res = await api.post(`/api/reminders/${id}/send`, {});
      if (!res.delivered) {
        alert("Eslatma saqlandi, lekin bemor Telegram botga ulanmagan");
      }
      load();
    } catch (e) {
      setError(e.message);
    } finally {
      setSendingId(null);
    }
  };

  const filteredRows = useMemo(() => {
    if (statusFilter === "pending") return rows.filter((r) => r.status === "pending");
    if (statusFilter === "done") return rows.filter((r) => r.status === "done" || r.status === "sent");
    return rows;
  }, [rows, statusFilter]);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
        <div className="page-title" style={{ margin: 0 }}>⏰ {t("nav_reminders")}</div>
        <div className="toolbar" style={{ margin: 0 }}>
          <button className="btn" onClick={() => setModal({ kind: "new" })}>
            + {t("rem_new")}
          </button>
          <button className="btn secondary" onClick={load} title="Yangilash">
            🔄
          </button>
        </div>
      </div>

      {error && <ErrorBanner message={error} />}

      <div className="panel">
        {/* Status filtrlari */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button
              className={`btn small ${statusFilter === "all" ? "" : "secondary"}`}
              onClick={() => setStatusFilter("all")}
            >
              {t("all")} ({rows.length})
            </button>
            <button
              className={`btn small ${statusFilter === "pending" ? "" : "secondary"}`}
              onClick={() => setStatusFilter("pending")}
            >
              ⏳ {t("rem_pending")} ({rows.filter((r) => r.status === "pending").length})
            </button>
            <button
              className={`btn small ${statusFilter === "done" ? "" : "secondary"}`}
              onClick={() => setStatusFilter("done")}
            >
              ✅ {t("rem_done")} ({rows.filter((r) => r.status === "done" || r.status === "sent").length})
            </button>
          </div>
        </div>

        {filteredRows.length === 0 ? (
          <Empty />
        ) : (
          <table>
            <thead>
              <tr>
                <th>{t("rem_due")}</th>
                <th>{t("appt_patient")}</th>
                <th>{t("phone")}</th>
                <th>{t("rem_reason")}</th>
                <th>{t("status")}</th>
                <th>{t("actions")}</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((r) => (
                <tr key={r.id}>
                  <td style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                    {r.due_date}
                  </td>
                  <td><strong>{r.patient_name}</strong></td>
                  <td>{r.phone || "—"}</td>
                  <td style={{ maxWidth: 280 }}>{r.reason}</td>
                  <td>
                    <StatusBadge status={r.status} />
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}>
                      {r.status === "pending" && r.telegram_id && (
                        <button
                          className="btn small"
                          style={{ background: "#2563eb", borderColor: "#2563eb" }}
                          onClick={() => send(r.id)}
                          disabled={sendingId === r.id}
                        >
                          {sendingId === r.id ? "..." : "📨 Telegram"}
                        </button>
                      )}

                      {r.status !== "done" ? (
                        <button
                          className="btn small"
                          style={{ background: "#10b981", borderColor: "#10b981" }}
                          onClick={() => setStatus(r.id, "done")}
                        >
                          ✅ {t("rem_done")}
                        </button>
                      ) : (
                        <button
                          className="btn small secondary"
                          onClick={() => setStatus(r.id, "pending")}
                        >
                          ⏳ Qayta ochish
                        </button>
                      )}

                      <button
                        className="btn small secondary"
                        onClick={() => setModal({ kind: "edit", rem: r })}
                        title={t("edit")}
                      >
                        ✏️ {t("edit")}
                      </button>

                      <button
                        className="btn small danger"
                        onClick={() => delReminder(r)}
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
        <RemModal
          initial={modal.kind === "edit" ? modal.rem : null}
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
