/**
 * ui.jsx — umumiy UI komponentlar
 */

import React, { useEffect } from "react";
import { useLang } from "../i18n.jsx";

export function Modal({ title, onClose, children, wide }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`modal ${wide ? "modal-wide" : ""}`} style={{ maxWidth: wide ? 880 : 640, width: "95vw" }}>
        <div className="modal-header">
          <h3>{title}</h3>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <div className="modal-body">
          {children}
        </div>
      </div>
    </div>
  );
}

export function StatCard({ label, value, color, onClick }) {
  return (
    <div
      className={`card ${color || ""} ${onClick ? "clickable-card" : ""}`}
      onClick={onClick}
      style={onClick ? { cursor: "pointer", transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)", userSelect: "none" } : {}}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === "Enter" || e.key === " ") onClick(); } : undefined}
    >
      <div className="label" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span>{label}</span>
        {onClick && <span style={{ fontSize: "0.85rem", opacity: 0.6, fontWeight: 700 }}>→</span>}
      </div>
      <div className="value">{value}</div>
    </div>
  );
}

const STATUS_STYLES = {
  scheduled: "blue", arrived: "amber", completed: "green", no_show: "red", cancelled: "gray",
  open: "red", in_progress: "amber", closed: "green",
  pending: "amber", sent: "blue", done: "green",
};

export function StatusBadge({ status }) {
  const { t } = useLang();
  const map = {
    scheduled: "st_scheduled", arrived: "st_arrived", completed: "st_completed",
    no_show: "st_no_show", cancelled: "st_cancelled",
    open: "cmp_open", in_progress: "cmp_in_progress", closed: "cmp_closed",
    pending: "rem_pending", sent: "rem_sent", done: "rem_done",
  };
  return <span className={`badge ${STATUS_STYLES[status] || "gray"}`}>{t(map[status] || status)}</span>;
}

export function Empty({ text }) {
  const { t } = useLang();
  return <p className="muted" style={{ padding: "12px 0" }}>{text || t("noData")}</p>;
}

export function ErrorBanner({ message }) {
  if (!message) return null;
  return <div className="error-msg mb">{message}</div>;
}
