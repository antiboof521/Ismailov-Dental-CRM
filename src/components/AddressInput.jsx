import React, { useState, useId } from "react";
import { QOSHKOPIR_MFYS } from "../data/qoshkopir_mfy.js";

/**
 * AddressInput — Qo'shko'pir tumani 40 ta MFY va erkin manzil kiritish komponenti
 * - Datalist va tezkor qidiruv takliflari bilan
 * - Agar ro'yxatda bo'lmasa, qo'lda erkin yozish mumkin
 */
export default function AddressInput({
  value = "",
  onChange,
  placeholder = "Qo'shko'pir tumani, MFY yoki manzil...",
  required = false,
  className = "",
  style = {},
}) {
  const datalistId = useId();
  const [showSuggestions, setShowSuggestions] = useState(false);

  const filterText = (value || "").toLowerCase().trim();
  const matchedMfy = filterText
    ? QOSHKOPIR_MFYS.filter((m) => m.toLowerCase().includes(filterText))
    : QOSHKOPIR_MFYS;

  return (
    <div style={{ position: "relative", width: "100%", ...style }}>
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <input
          type="text"
          list={datalistId}
          value={value || ""}
          required={required}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={className}
          style={{ flex: 1 }}
          autoComplete="off"
        />
        <button
          type="button"
          className="btn small secondary"
          style={{ padding: "4px 8px", fontSize: "0.8rem", whiteSpace: "nowrap" }}
          onClick={() => setShowSuggestions((v) => !v)}
          title="MFY ro'yxatini ochish"
        >
          📍 {showSuggestions ? "Yopish" : "MFY ro'yxati"}
        </button>
      </div>

      <datalist id={datalistId}>
        {QOSHKOPIR_MFYS.map((mfy) => (
          <option key={mfy} value={`Qo'shko'pir tumani, ${mfy}`} />
        ))}
        {QOSHKOPIR_MFYS.map((mfy) => (
          <option key={`pure_${mfy}`} value={mfy} />
        ))}
      </datalist>

      {showSuggestions && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            zIndex: 100,
            background: "#ffffff",
            border: "1px solid #cbd5e1",
            borderRadius: 8,
            boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
            maxHeight: 220,
            overflowY: "auto",
            marginTop: 4,
            padding: 6,
          }}
        >
          <div
            style={{
              fontSize: "0.75rem",
              fontWeight: 700,
              color: "#64748b",
              padding: "4px 8px",
              borderBottom: "1px solid #f1f5f9",
              display: "flex",
              justifyContent: "space-between",
            }}
          >
            <span>QO'SHKO'PIR TUMANI MFYLARI ({matchedMfy.length} ta)</span>
            <span>Tanlash uchun bosing</span>
          </div>
          {matchedMfy.length === 0 ? (
            <div style={{ padding: "8px 10px", fontSize: "0.85rem", color: "#94a3b8" }}>
              Ro'yxatda topilmadi (erkin qo'lda kiritilmoqda)
            </div>
          ) : (
            matchedMfy.map((mfy) => (
              <button
                key={mfy}
                type="button"
                onClick={() => {
                  onChange(`Qo'shko'pir tumani, ${mfy}`);
                  setShowSuggestions(false);
                }}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "6px 10px",
                  background: "transparent",
                  border: "none",
                  borderRadius: 4,
                  fontSize: "0.86rem",
                  cursor: "pointer",
                  color: "#1e293b",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#f1f5f9")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                🏘 {mfy}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
