/**
 * Complaints.jsx — Shikoyatlar sahifasi (To'liq tahrirlash, o'chirish, javob berish va filtrlash bilan)
 */

import React, { useEffect, useState, useMemo, useCallback } from "react";
import { api } from "../api.js";
import { useLang } from "../i18n.jsx";
import { Modal, StatusBadge, Empty, ErrorBanner } from "../components/ui.jsx";

function ComplaintModal({ initial, onSaved, onCancel }) {
  const { t } = useLang();
  const [patients, setPatients] = useState([]);
  const [form, setForm] = useState({
    patient_id: initial?.patient_id || "",
    patient_name: initial?.patient_name || "",
    telegram_id: initial?.telegram_id || "",
    message: initial?.message || "",
    status: initial?.status || "open",
    reply_text: initial?.reply_text || "",
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get("/api/patients?limit=200").then((d) => setPatients(d.patients || [])).catch(() => {});
  }, []);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.message.trim()) {
      setError("Shikoyat yoki murojaat matni talab qilinadi");
      return;
    }
    setBusy(true);
    setError("");
    try {
      if (initial && initial.id) {
        await api.put(`/api/complaints/${initial.id}`, form);
      } else {
        await api.post("/api/complaints", form);
      }
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={initial ? `✏️ ${t("cmp_edit")}` : `+ ${t("cmp_new")}`} onClose={onCancel}>
      <form onSubmit={submit}>
        {error && <div className="error-msg mb">{error}</div>}
        <div className="form-grid">
          <div className="form-row">
            <label>{t("appt_patient")}</label>
            <select
              value={form.patient_id}
              onChange={(e) => {
                const pid = e.target.value;
                const p = patients.find((x) => x.id === parseInt(pid, 10));
                setForm((f) => ({
                  ...f,
                  patient_id: pid,
                  patient_name: p ? p.full_name : f.patient_name,
                  telegram_id: p?.telegram_id || f.telegram_id,
                }));
              }}
            >
              <option value="">— Bemorlardan tanlash (yoki qo'lda kiritish) —</option>
              {patients.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name} {p.phone ? `(${p.phone})` : ""}
                </option>
              ))}
            </select>
          </div>

          <div className="form-row">
            <label>{t("patients_fullName")} *</label>
            <input
              required
              value={form.patient_name}
              onChange={set("patient_name")}
              placeholder="Masalan: Dilnoza Karimova"
            />
          </div>

          <div className="form-row">
            <label>{t("status")}</label>
            <select value={form.status} onChange={set("status")}>
              <option value="open">🔴 {t("cmp_open")}</option>
              <option value="in_progress">🟡 {t("cmp_in_progress")}</option>
              <option value="closed">🟢 {t("cmp_closed")}</option>
            </select>
          </div>
        </div>

        <div className="form-row">
          <label>{t("cmp_message")} *</label>
          <textarea
            required
            rows={3}
            value={form.message}
            onChange={set("message")}
            placeholder="Shikoyat, taklif yoki murojaat tafsilotlari..."
          />
        </div>

        {initial && (
          <div className="form-row">
            <label>Javob matni</label>
            <textarea
              rows={2}
              value={form.reply_text}
              onChange={set("reply_text")}
              placeholder="Qaytarilgan javob..."
            />
          </div>
        )}

        <div className="form-actions">
          <button className="btn" disabled={busy} type="submit">{t("save")}</button>
          <button className="btn secondary" type="button" onClick={onCancel}>{t("cancel")}</button>
        </div>
      </form>
    </Modal>
  );
}

function ReplyModal({ complaint, onClose, onSent }) {
  const { t } = useLang();
  const [reply, setReply] = useState("");
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState(false);

  const send = async (e) => {
    e.preventDefault();
    if (!reply.trim()) return;
    setBusy(true);
    setError("");
    try {
      const res = await api.post(`/api/complaints/${complaint.id}/reply`, { reply });
      setOk(res.delivered ? t("replySentOk") : t("replySavedNoTg"));
      setReply("");
      setTimeout(() => {
        onSent();
        onClose();
      }, 1000);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={`✉️ ${t("replyTitle")}: ${complaint.patient_name || "Bemor"}`} onClose={onClose}>
      {error && <div className="error-msg mb">{error}</div>}
      {ok && <div className="ok-msg mb">{ok}</div>}
      <div style={{ background: "#f8fafc", padding: 12, borderRadius: 6, marginBottom: 14, border: "1px solid var(--color-border)" }}>
        <div style={{ fontSize: "0.78rem", color: "var(--color-text-secondary)", marginBottom: 4 }}>Bemor shikoyati:</div>
        <div style={{ fontStyle: "italic", color: "#1e293b" }}>"{complaint.message}"</div>
      </div>
      <form onSubmit={send}>
        <div className="form-row">
          <textarea
            rows={4}
            value={reply}
            placeholder={t("replyPlaceholder")}
            onChange={(e) => setReply(e.target.value)}
            style={{ width: "100%" }}
            autoFocus
          />
        </div>
        <div className="form-actions">
          <button className="btn" disabled={busy || !reply.trim()} type="submit">{t("send")}</button>
          <button className="btn secondary" type="button" onClick={onClose}>{t("close")}</button>
        </div>
      </form>
    </Modal>
  );
}

export default function Complaints() {
  const { t } = useLang();
  const [rows, setRows] = useState([]);
  const [statusFilter, setStatusFilter] = useState("all");
  const [error, setError] = useState("");
  const [modal, setModal] = useState(null); // { kind: 'new' | 'edit', complaint?: any }
  const [replyOf, setReplyOf] = useState(null);

  const load = useCallback(() => {
    api.get("/api/complaints")
      .then((d) => setRows(d.complaints || []))
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Real-time SSE updates for complaints
  useEffect(() => {
    const onSSE = (e) => {
      const type = e.detail?.type;
      if (!type || type.startsWith("complaint:") || type === "storage:updated") {
        load();
      }
    };
    window.addEventListener("clinic:sse", onSSE);
    return () => window.removeEventListener("clinic:sse", onSSE);
  }, [load]);

  const setStatus = async (id, status) => {
    try {
      await api.put(`/api/complaints/${id}/status`, { status });
      load();
    } catch (e) {
      setError(e.message);
    }
  };

  const delComplaint = async (c) => {
    if (!confirm(`${t("confirmDelete")} (${c.patient_name || "Murojaat"})`)) return;
    try {
      await api.del(`/api/complaints/${c.id}`);
      load();
    } catch (e) {
      setError(e.message);
    }
  };

  const filteredRows = useMemo(() => {
    if (statusFilter === "open") return rows.filter((r) => r.status === "open");
    if (statusFilter === "in_progress") return rows.filter((r) => r.status === "in_progress");
    if (statusFilter === "closed") return rows.filter((r) => r.status === "closed");
    return rows;
  }, [rows, statusFilter]);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
        <div className="page-title" style={{ margin: 0 }}>💬 {t("nav_complaints")}</div>
        <div className="toolbar" style={{ margin: 0 }}>
          <button className="btn" onClick={() => setModal({ kind: "new" })}>
            + {t("cmp_new")}
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
              className={`btn small ${statusFilter === "open" ? "" : "secondary"}`}
              onClick={() => setStatusFilter("open")}
            >
              🔴 {t("cmp_open")} ({rows.filter((r) => r.status === "open").length})
            </button>
            <button
              className={`btn small ${statusFilter === "in_progress" ? "" : "secondary"}`}
              onClick={() => setStatusFilter("in_progress")}
            >
              🟡 {t("cmp_in_progress")} ({rows.filter((r) => r.status === "in_progress").length})
            </button>
            <button
              className={`btn small ${statusFilter === "closed" ? "" : "secondary"}`}
              onClick={() => setStatusFilter("closed")}
            >
              🟢 {t("cmp_closed")} ({rows.filter((r) => r.status === "closed").length})
            </button>
          </div>
        </div>

        {filteredRows.length === 0 ? (
          <Empty />
        ) : (
          <table>
            <thead>
              <tr>
                <th>{t("date")}</th>
                <th>{t("appt_patient")}</th>
                <th>{t("cmp_message")}</th>
                <th>{t("status")}</th>
                <th>{t("change_status")}</th>
                <th>{t("actions")}</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((c) => (
                <tr key={c.id}>
                  <td style={{ fontVariantNumeric: "tabular-nums" }}>
                    {(c.created_at || "").slice(0, 16).replace("T", " ")}
                  </td>
                  <td>
                    <strong>{c.patient_name || "—"}</strong>
                    {c.telegram_id && (
                      <span style={{ fontSize: "0.75rem", color: "#2563eb", display: "block" }}>
                        ✈️ Telegram
                      </span>
                    )}
                  </td>
                  <td style={{ maxWidth: 360 }}>
                    <div style={{ color: "#0f172a" }}>{c.message}</div>
                    {c.reply_text && (
                      <div style={{ marginTop: 6, background: "#f0fdf4", padding: "4px 8px", borderRadius: 4, border: "1px solid #bbf7d0", fontSize: "0.82rem", color: "#166534" }}>
                        ↩️ <strong>{t("repliedAt")}:</strong> {c.reply_text}
                      </div>
                    )}
                  </td>
                  <td>
                    <StatusBadge status={c.status} />
                  </td>
                  <td>
                    <select
                      value={c.status}
                      onChange={(e) => setStatus(c.id, e.target.value)}
                      style={{ padding: "4px 8px", fontSize: "0.82rem", borderRadius: 4, minWidth: 120 }}
                    >
                      <option value="open">🔴 {t("cmp_open")}</option>
                      <option value="in_progress">🟡 {t("cmp_in_progress")}</option>
                      <option value="closed">🟢 {t("cmp_closed")}</option>
                    </select>
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}>
                      <button
                        className="btn small"
                        style={{ background: "#2563eb", borderColor: "#2563eb" }}
                        onClick={() => setReplyOf(c)}
                        title={t("replyBtn")}
                      >
                        ✉️ Javob
                      </button>
                      <button
                        className="btn small secondary"
                        onClick={() => setModal({ kind: "edit", complaint: c })}
                        title={t("edit")}
                      >
                        ✏️ {t("edit")}
                      </button>
                      <button
                        className="btn small danger"
                        onClick={() => delComplaint(c)}
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
        <ComplaintModal
          initial={modal.kind === "edit" ? modal.complaint : null}
          onSaved={() => {
            setModal(null);
            load();
          }}
          onCancel={() => setModal(null)}
        />
      )}

      {replyOf && (
        <ReplyModal
          complaint={replyOf}
          onClose={() => setReplyOf(null)}
          onSent={load}
        />
      )}
    </div>
  );
}
