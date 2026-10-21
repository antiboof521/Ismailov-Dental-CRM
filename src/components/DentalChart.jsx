/**
 * DentalChart.jsx — Professional Interaktiv Odontogramma (FDI Xalqaro Tish Formulasi)
 * 
 * Imkoniyatlar:
 * - 32 ta doimiy (kattalar) va 20 ta sut (bolalar) tishlari
 * - Anatomik vizual shakl (molarlar, premolarlar, qoziq va kurak tishlar)
 * - 8 xil klinik holat (Sog'lom, Karies, Plomba, Pulpit/Endo, Koronka, Implant, Olingan, Ortodontik)
 * - Tish ustiga bosilganda tezkor holat o'zgartirish va izoh kiritish
 * - O'tmishdagi muolajalar tarixini tish bo'yicha ko'rish
 * - Qabul (Visit) vaqtida tishni 1 bosish bilan tanlash (selectable mode)
 */

import React, { useState, useMemo } from "react";
import { useLang } from "../i18n.jsx";

// Klinik holatlar va ranglar
export const TOOTH_CONDITIONS = {
  healthy: { label: "Sog'lom", ru: "Здоровый", en: "Healthy", color: "#10b981", bg: "#ecfdf5", border: "#a7f3d0", icon: "⚪" },
  caries: { label: "Karies", ru: "Кариес", en: "Caries", color: "#ef4444", bg: "#fef2f2", border: "#fca5a5", icon: "🔴" },
  filling: { label: "Plomba", ru: "Пломба", en: "Filling", color: "#3b82f6", bg: "#eff6ff", border: "#93c5fd", icon: "🔵" },
  pulpitis: { label: "Pulpit / Kanal", ru: "Пульпит / Эндо", en: "Pulpitis / Endo", color: "#f59e0b", bg: "#fffbeb", border: "#fcd34d", icon: "🟡" },
  crown: { label: "Koronka / Qoplama", ru: "Коронка", en: "Crown", color: "#8b5cf6", bg: "#f5f3ff", border: "#c4b5fd", icon: "🟣" },
  implant: { label: "Implant", ru: "Имплант", en: "Implant", color: "#059669", bg: "#f0fdf4", border: "#6ee7b7", icon: "🟢" },
  missing: { label: "Olingan / Yo'q", ru: "Отсутствует", en: "Missing", color: "#64748b", bg: "#f1f5f9", border: "#cbd5e1", icon: "❌" },
  prosthetic: { label: "Breket / Ortodontik", ru: "Брекет / Орто", en: "Braces / Ortho", color: "#ea580c", bg: "#fff7ed", border: "#fdba74", icon: "🟠" },
};

// Tishlarning anatomik guruhi
function getToothType(num) {
  const digit = Number(num) % 10;
  if (digit === 1 || digit === 2) return "incisor"; // kurak tish
  if (digit === 3) return "canine"; // qoziq tish
  if (digit === 4 || digit === 5) return "premolar"; // kichik oziq
  return "molar"; // katta oziq (6, 7, 8)
}

// FDI Tishlar ro'yxati
const ADULT_UPPER_RIGHT = [18, 17, 16, 15, 14, 13, 12, 11];
const ADULT_UPPER_LEFT = [21, 22, 23, 24, 25, 26, 27, 28];
const ADULT_LOWER_RIGHT = [48, 47, 46, 45, 44, 43, 42, 41];
const ADULT_LOWER_LEFT = [31, 32, 33, 34, 35, 36, 37, 38];

const CHILD_UPPER_RIGHT = [55, 54, 53, 52, 51];
const CHILD_UPPER_LEFT = [61, 62, 63, 64, 65];
const CHILD_LOWER_RIGHT = [85, 84, 83, 82, 81];
const CHILD_LOWER_LEFT = [71, 72, 73, 74, 75];

export default function DentalChart({
  chart = {},
  onChange,
  onSave,
  readonly = false,
  selectable = false,
  selectedTooth = null,
  onSelectTooth,
  onOpenGallery,
  procedures = [],
  patientName = "",
}) {
  const { lang } = useLang();
  const [isChild, setIsChild] = useState(false);
  const [activeTooth, setActiveTooth] = useState(selectedTooth || null);
  const [editNote, setEditNote] = useState("");
  const [isDirty, setIsDirty] = useState(false);
  const [filterCondition, setFilterCondition] = useState(null);

  // Agar tashqaridan selectedTooth o'zgarsa
  React.useEffect(() => {
    if (selectedTooth !== undefined) {
      setActiveTooth(selectedTooth);
    }
  }, [selectedTooth]);

  // Faol tish tanlanganda uning izohini yuklash
  React.useEffect(() => {
    if (activeTooth && chart[activeTooth]) {
      setEditNote(chart[activeTooth].note || "");
    } else {
      setEditNote("");
    }
  }, [activeTooth, chart]);

  const upperRight = isChild ? CHILD_UPPER_RIGHT : ADULT_UPPER_RIGHT;
  const upperLeft = isChild ? CHILD_UPPER_LEFT : ADULT_UPPER_LEFT;
  const lowerRight = isChild ? CHILD_LOWER_RIGHT : ADULT_LOWER_RIGHT;
  const lowerLeft = isChild ? CHILD_LOWER_LEFT : ADULT_LOWER_LEFT;

  // Tish holatini olish
  const getTooth = (num) => {
    return chart[num] || { number: num, status: "healthy", note: "" };
  };

  // Tish holatini yangilash
  const updateToothStatus = (num, status) => {
    if (readonly) return;
    const current = getTooth(num);
    const updated = {
      ...chart,
      [num]: {
        ...current,
        number: num,
        status,
        note: editNote || current.note,
        updated_at: new Date().toISOString(),
      },
    };
    setIsDirty(true);
    if (onChange) onChange(updated);
  };

  // Izohni saqlash
  const saveToothNote = () => {
    if (!activeTooth || readonly) return;
    const current = getTooth(activeTooth);
    const updated = {
      ...chart,
      [activeTooth]: {
        ...current,
        note: editNote,
        updated_at: new Date().toISOString(),
      },
    };
    setIsDirty(true);
    if (onChange) onChange(updated);
  };

  // Barcha tishlar statistikasi
  const stats = useMemo(() => {
    const counts = {
      healthy: 0,
      caries: 0,
      filling: 0,
      pulpitis: 0,
      crown: 0,
      implant: 0,
      missing: 0,
      prosthetic: 0,
    };
    const allNums = [...upperRight, ...upperLeft, ...lowerRight, ...lowerLeft];
    allNums.forEach((n) => {
      const st = chart[n]?.status || "healthy";
      if (counts[st] !== undefined) counts[st]++;
    });
    return counts;
  }, [chart, upperRight, upperLeft, lowerRight, lowerLeft]);

  // Faol tish bo'yicha tarixiy muolajalar
  const toothProcedures = useMemo(() => {
    if (!activeTooth) return [];
    return procedures.filter(
      (p) => String(p.tooth) === String(activeTooth) || p.tooth === "All" || p.tooth === "Barchasi"
    );
  }, [activeTooth, procedures]);

  const activeToothData = activeTooth ? getTooth(activeTooth) : null;
  const activeCondition = activeToothData ? TOOTH_CONDITIONS[activeToothData.status] || TOOTH_CONDITIONS.healthy : null;

  // Tish tugmasini bosganda
  const handleToothClick = (num) => {
    setActiveTooth(num);
    if (onSelectTooth) {
      onSelectTooth(String(num));
    }
  };

  // Tish SVG vizual renderingi
  const renderToothVisual = (num) => {
    const tData = getTooth(num);
    const cond = TOOTH_CONDITIONS[tData.status] || TOOTH_CONDITIONS.healthy;
    const isSelected = String(activeTooth) === String(num);
    const type = getToothType(num);
    const hasNote = Boolean(tData.note);
    const isFiltered = filterCondition && tData.status !== filterCondition;

    return (
      <div
        key={num}
        onClick={() => handleToothClick(num)}
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          cursor: "pointer",
          padding: "6px 4px",
          borderRadius: 8,
          background: isSelected ? "var(--color-primary-light, #e0e7ff)" : isFiltered ? "#f8fafc" : "#ffffff",
          border: isSelected ? "2px solid var(--color-primary, #3b82f6)" : `1px solid ${cond.border}`,
          boxShadow: isSelected ? "0 4px 12px rgba(59, 130, 246, 0.25)" : "0 1px 3px rgba(0,0,0,0.05)",
          transition: "all 0.15s ease",
          opacity: isFiltered ? 0.35 : 1,
          minWidth: 38,
          position: "relative",
          userSelect: "none",
        }}
        title={`Tish #${num}: ${cond.label}${hasNote ? ` (${tData.note})` : ""}`}
      >
        {/* Tish raqami */}
        <span
          style={{
            fontSize: "0.8rem",
            fontWeight: "bold",
            color: isSelected ? "var(--color-primary, #3b82f6)" : "var(--color-text)",
            marginBottom: 4,
          }}
        >
          {num}
        </span>

        {/* Anatomik tish shakli (SVG) */}
        <svg
          width="32"
          height="42"
          viewBox="0 0 32 42"
          style={{
            filter: isSelected ? "drop-shadow(0 2px 4px rgba(59,130,246,0.3))" : "none",
          }}
        >
          {/* Tish ildizlari va toji */}
          {type === "molar" ? (
            // 2-3 ildizli katta oziq tish
            <g>
              {/* Ildizlar */}
              <path
                d="M8 18 C6 28 5 36 7 40 C9 38 12 30 14 20 C16 30 19 38 21 40 C23 36 22 28 20 18 Z"
                fill={tData.status === "pulpitis" ? "#fcd34d" : tData.status === "missing" ? "#e2e8f0" : "#f1f5f9"}
                stroke={cond.color}
                strokeWidth="1.5"
              />
              {/* Toj (Crown) */}
              <path
                d="M5 6 C5 2 10 1 13 3 C16 1 21 2 21 6 C23 10 24 16 22 18 C18 20 8 20 4 18 C2 16 3 10 5 6 Z"
                fill={cond.bg}
                stroke={cond.color}
                strokeWidth="1.8"
              />
              {/* Markaziy okklyuzion fissura */}
              {tData.status !== "missing" && (
                <ellipse cx="13" cy="11" rx="5" ry="3" fill={cond.color} opacity={tData.status === "healthy" ? "0.2" : "0.75"} />
              )}
            </g>
          ) : type === "premolar" ? (
            // Kichik oziq tish
            <g>
              <path
                d="M10 16 C9 26 8 35 11 39 C14 35 15 25 15 16 Z"
                fill={tData.status === "pulpitis" ? "#fcd34d" : tData.status === "missing" ? "#e2e8f0" : "#f1f5f9"}
                stroke={cond.color}
                strokeWidth="1.5"
              />
              <path
                d="M6 6 C6 2 18 2 18 6 C20 10 20 16 18 17 C14 19 8 19 4 17 C2 16 4 10 6 6 Z"
                fill={cond.bg}
                stroke={cond.color}
                strokeWidth="1.8"
              />
              {tData.status !== "missing" && (
                <circle cx="12" cy="11" r="3.5" fill={cond.color} opacity={tData.status === "healthy" ? "0.2" : "0.75"} />
              )}
            </g>
          ) : (
            // Kurak va qoziq tishlar
            <g>
              <path
                d="M11 16 C10 26 9 36 12 40 C15 36 14 26 13 16 Z"
                fill={tData.status === "pulpitis" ? "#fcd34d" : tData.status === "missing" ? "#e2e8f0" : "#f1f5f9"}
                stroke={cond.color}
                strokeWidth="1.5"
              />
              <path
                d="M6 5 C6 2 18 2 18 5 C19 9 18 16 16 17 C13 18 9 18 6 17 C4 16 3 9 6 5 Z"
                fill={cond.bg}
                stroke={cond.color}
                strokeWidth="1.8"
              />
              {tData.status !== "missing" && (
                <line x1="8" y1="10" x2="16" y2="10" stroke={cond.color} strokeWidth="2" strokeLinecap="round" opacity={tData.status === "healthy" ? "0.25" : "0.85"} />
              )}
            </g>
          )}

          {/* Implant vint belgisi */}
          {tData.status === "implant" && (
            <g stroke="#059669" strokeWidth="1.5">
              <line x1="9" y1="24" x2="15" y2="24" />
              <line x1="9" y1="28" x2="15" y2="28" />
              <line x1="10" y1="32" x2="14" y2="32" />
            </g>
          )}

          {/* Koronka toji belgisi */}
          {tData.status === "crown" && (
            <path d="M7 4 L11 7 L14 3 L17 7 L21 4 L20 9 L8 9 Z" fill="#8b5cf6" opacity="0.9" />
          )}

          {/* Olingan tish — X belgisi */}
          {tData.status === "missing" && (
            <g stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round">
              <line x1="5" y1="5" x2="21" y2="35" />
              <line x1="21" y1="5" x2="5" y2="35" />
            </g>
          )}
        </svg>

        {/* Holat belgisi / badge */}
        <div
          style={{
            marginTop: 4,
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: cond.color,
            boxShadow: `0 0 6px ${cond.color}`,
          }}
        />

        {/* Izoh mavjudligi belgisi */}
        {hasNote && (
          <span
            style={{
              position: "absolute",
              top: 2,
              right: 2,
              fontSize: "8px",
              color: "#3b82f6",
            }}
          >
            💬
          </span>
        )}
      </div>
    );
  };

  return (
    <div className="dental-chart-container" style={{ background: "var(--color-bg)", borderRadius: 12, padding: 16 }}>
      {/* Yuqori boshqaruv paneli */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <h3 style={{ margin: 0, display: "flex", alignItems: "center", gap: 6, fontSize: "1.1rem" }}>
            <span>🦷</span>
            <span>{isChild ? "Sut tishlari formulasi (20 ta)" : "Odontogramma — Doimiy tishlar (32 ta)"}</span>
          </h3>
          <button
            type="button"
            className={`btn small ${isChild ? "" : "secondary"}`}
            onClick={() => setIsChild(!isChild)}
            style={{ fontSize: "0.8rem", padding: "3px 10px" }}
          >
            {isChild ? "Kattalar tishlari (FDI 11-48)" : "👶 Bolalar (Sut tishlari 51-85)"}
          </button>
        </div>

        {/* Saqlash tugmasi */}
        {onSave && !readonly && (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {isDirty && <span style={{ fontSize: "0.85rem", color: "#f59e0b" }}>⚠️ O'zgarishlar bor</span>}
            <button
              type="button"
              className="btn small"
              onClick={() => {
                onSave(chart);
                setIsDirty(false);
              }}
              style={{ background: "#10b981", borderColor: "#10b981" }}
            >
              💾 Formulani saqlash
            </button>
          </div>
        )}
      </div>

      {/* Rangli Legend va Filtrlar */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16, padding: "8px 12px", background: "#ffffff", borderRadius: 8, border: "1px solid var(--color-border)" }}>
        <span style={{ fontSize: "0.8rem", fontWeight: "bold", alignSelf: "center", marginRight: 4 }}>
          Holatlar:
        </span>
        {Object.entries(TOOTH_CONDITIONS).map(([k, v]) => {
          const count = stats[k] || 0;
          const isSelected = filterCondition === k;
          return (
            <button
              type="button"
              key={k}
              onClick={() => setFilterCondition(isSelected ? null : k)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                fontSize: "0.75rem",
                padding: "3px 8px",
                borderRadius: 14,
                border: `1px solid ${isSelected ? v.color : v.border}`,
                background: isSelected ? v.bg : "#ffffff",
                color: "var(--color-text)",
                cursor: "pointer",
                fontWeight: isSelected ? "bold" : "normal",
              }}
            >
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: v.color }} />
              <span>{v.label}</span>
              <span style={{ opacity: 0.7, fontSize: "0.7rem", fontWeight: "bold" }}>({count})</span>
            </button>
          );
        })}
        {filterCondition && (
          <button
            type="button"
            className="btn small secondary"
            onClick={() => setFilterCondition(null)}
            style={{ fontSize: "0.7rem", padding: "2px 6px" }}
          >
            ✕ Tozalash
          </button>
        )}
      </div>

      {/* ODONTOGRAMMA JADVALI */}
      <div
        style={{
          background: "#ffffff",
          borderRadius: 10,
          border: "1px solid var(--border)",
          padding: "16px 12px",
          overflowX: "auto",
          WebkitOverflowScrolling: "touch",
        }}
      >
        <div style={{ minWidth: 620, margin: "0 auto" }}>
          {/* YUQORI JAG' (MAXILLA) */}
          <div style={{ textAlign: "center", marginBottom: 6 }}>
            <span style={{ fontSize: "0.75rem", fontWeight: "bold", textTransform: "uppercase", letterSpacing: 1, color: "var(--muted)" }}>
              ▲ Yuqori jag' (Maxilla)
            </span>
          </div>
          <div style={{ display: "flex", justifyContent: "center", gap: 12, marginBottom: 16 }}>
            {/* Yuqori O'ng (1-kvadrant) */}
            <div style={{ display: "flex", gap: 4 }}>
              {upperRight.map((n) => renderToothVisual(n))}
            </div>

            {/* Markaziy chiziq */}
            <div style={{ width: 2, background: "var(--border)", margin: "0 4px" }} />

            {/* Yuqori Chap (2-kvadrant) */}
            <div style={{ display: "flex", gap: 4 }}>
              {upperLeft.map((n) => renderToothVisual(n))}
            </div>
          </div>

          {/* Gorizontal bo'linuvchi chiziq */}
          <div style={{ height: 1, background: "var(--border)", margin: "10px 0 16px 0", position: "relative" }}>
            <span
              style={{
                position: "absolute",
                top: -8,
                left: "50%",
                transform: "translateX(-50%)",
                background: "#ffffff",
                padding: "0 8px",
                fontSize: "0.7rem",
                color: "var(--muted)",
              }}
            >
              O'ng tomon ⟵ ❖ ⟶ Chap tomon
            </span>
          </div>

          {/* PASTKI JAG' (MANDIBULA) */}
          <div style={{ display: "flex", justifyContent: "center", gap: 12 }}>
            {/* Pastki O'ng (4-kvadrant) */}
            <div style={{ display: "flex", gap: 4 }}>
              {lowerRight.map((n) => renderToothVisual(n))}
            </div>

            {/* Markaziy chiziq */}
            <div style={{ width: 2, background: "var(--border)", margin: "0 4px" }} />

            {/* Pastki Chap (3-kvadrant) */}
            <div style={{ display: "flex", gap: 4 }}>
              {lowerLeft.map((n) => renderToothVisual(n))}
            </div>
          </div>
          <div style={{ textAlign: "center", marginTop: 8 }}>
            <span style={{ fontSize: "0.75rem", fontWeight: "bold", textTransform: "uppercase", letterSpacing: 1, color: "var(--muted)" }}>
              ▼ Pastki jag' (Mandibula)
            </span>
          </div>
        </div>
      </div>

      {/* TANLANGAN TISH BO'YICHA TAHRIRLASH / MA'LUMOT PANELI */}
      {activeTooth && (
        <div
          style={{
            marginTop: 16,
            background: "#ffffff",
            borderRadius: 10,
            border: "1px solid var(--color-border)",
            padding: 16,
            boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: "50%",
                  background: activeCondition?.bg,
                  border: `2px solid ${activeCondition?.color}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "1.1rem",
                  fontWeight: "bold",
                  color: activeCondition?.color,
                }}
              >
                {activeTooth}
              </div>
              <div>
                <strong style={{ fontSize: "1rem" }}>
                  {activeTooth}-tish ({getToothType(activeTooth) === "molar" ? "Katta oziq" : getToothType(activeTooth) === "premolar" ? "Kichik oziq" : getToothType(activeTooth) === "canine" ? "Qoziq tish" : "Kurak tish"})
                </strong>
                <div style={{ fontSize: "0.85rem", color: activeCondition?.color, fontWeight: 500 }}>
                  Holati: {activeCondition?.label}
                </div>
              </div>
            </div>

            {/* Tezkor tanlov tugmasi (Selectable mode uchun) */}
            {selectable && (
              <button
                type="button"
                className="btn small"
                onClick={() => {
                  if (onSelectTooth) onSelectTooth(String(activeTooth));
                }}
              >
                ✓ Qabulga tanlash ({activeTooth})
              </button>
            )}

            {onOpenGallery && (
              <button
                type="button"
                className="btn small secondary"
                style={{ color: "#0284c7", borderColor: "#bae6fd" }}
                onClick={() => onOpenGallery(String(activeTooth))}
              >
                📸 #{activeTooth} Rentgen & Rasmlar
              </button>
            )}
          </div>

          {/* Holatni o'zgartirish tugmalari */}
          {!readonly && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: "0.8rem", fontWeight: "bold", color: "var(--color-muted)", marginBottom: 6 }}>
                Holatni belgilash:
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {Object.entries(TOOTH_CONDITIONS).map(([k, v]) => {
                  const isActive = activeToothData?.status === k;
                  return (
                    <button
                      type="button"
                      key={k}
                      onClick={() => updateToothStatus(activeTooth, k)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        padding: "6px 12px",
                        borderRadius: 6,
                        border: isActive ? `2px solid ${v.color}` : "1px solid var(--color-border)",
                        background: isActive ? v.bg : "#ffffff",
                        fontWeight: isActive ? "bold" : "normal",
                        cursor: "pointer",
                        fontSize: "0.85rem",
                      }}
                    >
                      <span>{v.icon}</span>
                      <span>{v.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Izoh / Tashxis kiritish */}
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 240 }}>
              <label style={{ fontSize: "0.8rem", fontWeight: "bold", color: "var(--color-muted)", display: "block", marginBottom: 4 }}>
                Ushbu tish bo'yicha klinik izoh / tashxis:
              </label>
              <input
                type="text"
                value={editNote}
                onChange={(e) => setEditNote(e.target.value)}
                placeholder="Masalan: Chuqur karies, okklyuzion sirt, vaqtinchalik plomba qo'yildi..."
                disabled={readonly}
                style={{ width: "100%", padding: "8px 12px", borderRadius: 6, border: "1px solid var(--color-border)" }}
              />
            </div>
            {!readonly && (
              <button
                type="button"
                className="btn secondary small"
                onClick={saveToothNote}
                style={{ height: 38 }}
              >
                Izohni saqlash
              </button>
            )}
          </div>

          {/* Ushbu tish bo'yicha o'tgan muolajalar tarixi */}
          {toothProcedures.length > 0 && (
            <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--color-border)" }}>
              <div style={{ fontSize: "0.85rem", fontWeight: "bold", marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
                <span>📋</span>
                <span>{activeTooth}-tish bo'yicha o'tkazilgan muolajalar tarixi:</span>
              </div>
              <table style={{ width: "100%", fontSize: "0.85rem" }}>
                <thead>
                  <tr style={{ background: "var(--color-bg)" }}>
                    <th style={{ padding: 6 }}>Sana</th>
                    <th style={{ padding: 6 }}>Muolaja / Xizmat</th>
                    <th style={{ padding: 6 }}>Shifokor</th>
                    <th style={{ padding: 6 }}>Summa</th>
                  </tr>
                </thead>
                <tbody>
                  {toothProcedures.map((tp, idx) => (
                    <tr key={idx} style={{ borderBottom: "1px solid var(--color-border)" }}>
                      <td style={{ padding: 6 }}>{tp.procedure_date || "—"}</td>
                      <td style={{ padding: 6, fontWeight: 500 }}>{tp.service_name}</td>
                      <td style={{ padding: 6 }}>{tp.staff_name || "—"}</td>
                      <td style={{ padding: 6 }}>{Number(tp.price || 0).toLocaleString("ru-RU")} so'm</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
