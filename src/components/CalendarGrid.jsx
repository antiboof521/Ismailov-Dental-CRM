/**
 * CalendarGrid.jsx — Google Calendar uslubidagi vizual Time-Grid taqvim
 */

import React, { useState, useEffect } from "react";
import dayjs from "dayjs";
import { useLang } from "../i18n.jsx";
import { StatusBadge } from "./ui.jsx";

// 08:00 dan 20:00 gacha 30 daqiqalik oraliqlar
const START_HOUR = 8;
const END_HOUR = 20;
const SLOT_HEIGHT = 48; // har 30 daqiqa uchun 48px

const TIME_SLOTS = [];
for (let h = START_HOUR; h < END_HOUR; h++) {
  TIME_SLOTS.push(`${String(h).padStart(2, "0")}:00`);
  TIME_SLOTS.push(`${String(h).padStart(2, "0")}:30`);
}

function timeToMinutes(timeStr) {
  if (!timeStr) return 0;
  const parts = String(timeStr).slice(0, 5).split(":");
  const h = parseInt(parts[0], 10) || 0;
  const m = parseInt(parts[1], 10) || 0;
  return h * 60 + m;
}

function getSlotOffset(timeStr) {
  const mins = timeToMinutes(timeStr);
  const startMins = START_HOUR * 60;
  const diff = Math.max(0, mins - startMins);
  return (diff / 30) * SLOT_HEIGHT;
}

function getCardHeight(durationMin) {
  const dur = Math.max(20, parseInt(durationMin, 10) || 30);
  return Math.max(40, (dur / 30) * SLOT_HEIGHT - 4);
}

const STATUS_THEMES = {
  scheduled: {
    bg: "#eff6ff",
    border: "#3b82f6",
    text: "#1e40af",
    badge: "blue",
    label: "Kutilmoqda",
  },
  arrived: {
    bg: "#fffbeb",
    border: "#f59e0b",
    text: "#92400e",
    badge: "yellow",
    label: "Keldi / Qabulda",
  },
  completed: {
    bg: "#ecfdf5",
    border: "#10b981",
    text: "#065f46",
    badge: "green",
    label: "Tugallandi",
  },
  no_show: {
    bg: "#f8fafc",
    border: "#64748b",
    text: "#334155",
    badge: "gray",
    label: "Kelmadi",
  },
  cancelled: {
    bg: "#fef2f2",
    border: "#ef4444",
    text: "#991b1b",
    badge: "red",
    label: "Bekor",
  },
};

export default function CalendarGrid({
  viewMode = "day", // "day" | "week"
  date = dayjs().format("YYYY-MM-DD"),
  appointments = [],
  staff = [],
  selectedStaffId = "",
  onSlotClick, // ({ date, time, staff_id }) => void
  onApptClick, // (appointment) => void
  onStatusChange, // (id, status) => void
}) {
  const { t } = useLang();
  const [nowMins, setNowMins] = useState(timeToMinutes(dayjs().format("HH:mm")));

  // Hozirgi vaqt indikatori har daqiqada yangilanadi
  useEffect(() => {
    const timer = setInterval(() => {
      setNowMins(timeToMinutes(dayjs().format("HH:mm")));
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  const isToday = (dStr) => dStr === dayjs().format("YYYY-MM-DD");
  const showCurrentTimeLine = (dStr) => {
    if (!isToday(dStr)) return null;
    const startMins = START_HOUR * 60;
    const endMins = END_HOUR * 60;
    if (nowMins < startMins || nowMins > endMins) return null;
    const top = ((nowMins - startMins) / 30) * SLOT_HEIGHT;
    return (
      <div
        style={{
          position: "absolute",
          top: `${top}px`,
          left: 0,
          right: 0,
          height: "2px",
          backgroundColor: "#ef4444",
          zIndex: 25,
          pointerEvents: "none",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: "-5px",
            top: "-4px",
            width: "10px",
            height: "10px",
            borderRadius: "50%",
            backgroundColor: "#ef4444",
            boxShadow: "0 0 4px rgba(239, 68, 68, 0.6)",
          }}
        />
      </div>
    );
  };

  // Faol shifokorlar ro'yxati
  const activeStaff = staff.filter((s) => s.active !== false);
  const displayStaff = selectedStaffId
    ? activeStaff.filter((s) => s.id === parseInt(selectedStaffId, 10))
    : activeStaff;

  // Hafta kunlari (Dushanbadan Yakshanbagacha)
  const currentDay = dayjs(date);
  const weekStart = currentDay.startOf("week").add(1, "day"); // Dushanba
  const weekDays = [];
  for (let i = 0; i < 7; i++) {
    const d = weekStart.add(i, "day");
    weekDays.push({
      date: d.format("YYYY-MM-DD"),
      dayName: d.format("ddd"),
      dayNum: d.format("DD"),
      monthName: d.format("MMM"),
      isToday: isToday(d.format("YYYY-MM-DD")),
    });
  }

  // ==========================================
  // KUNLIK REJIM: Shifokorlar bo'yicha ustunlar
  // ==========================================
  if (viewMode === "day") {
    // Agar shifokor tanlanmagan bo'lsa, barcha shifokorlar bo'yicha ustunlar chiqadi
    const columns = displayStaff.length > 0 ? displayStaff : [{ id: 0, full_name: "Umumiy navbat" }];

    return (
      <div
        className="calendar-grid-container"
        style={{
          background: "var(--color-surface, #ffffff)",
          borderRadius: "12px",
          border: "1px solid var(--color-border, #e2e8f0)",
          overflow: "hidden",
          boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
        }}
      >
        {/* Ustunlar sarlavhasi */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `70px repeat(${columns.length}, minmax(220px, 1fr))`,
            borderBottom: "2px solid var(--color-border, #e2e8f0)",
            background: "#f8fafc",
            position: "sticky",
            top: 0,
            zIndex: 30,
          }}
        >
          <div
            style={{
              padding: "12px 6px",
              textAlign: "center",
              fontWeight: 600,
              fontSize: "0.8rem",
              color: "#64748b",
              borderRight: "1px solid var(--color-border, #e2e8f0)",
            }}
          >
            ⏱ Vaqt
          </div>
          {columns.map((col) => (
            <div
              key={col.id}
              style={{
                padding: "10px 12px",
                borderRight: "1px solid var(--color-border, #e2e8f0)",
                display: "flex",
                flexDirection: "column",
                gap: 2,
              }}
            >
              <div style={{ fontWeight: 600, fontSize: "0.95rem", color: "#1e293b", display: "flex", alignItems: "center", gap: 6 }}>
                <span>👨‍⚕️</span>
                <span className="truncate">{col.full_name}</span>
              </div>
              <div style={{ fontSize: "0.78rem", color: "#64748b" }}>
                {col.role || col.specialty || "Shifokor"} {col.phone ? `· ${col.phone}` : ""}
              </div>
            </div>
          ))}
        </div>

        {/* Vaqt va Slotlar maydoni */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `70px repeat(${columns.length}, minmax(220px, 1fr))`,
            maxHeight: "680px",
            overflowY: "auto",
            overflowX: "auto",
            position: "relative",
          }}
        >
          {/* Chapdagi vaqt belgisi */}
          <div
            style={{
              borderRight: "1px solid var(--color-border, #e2e8f0)",
              background: "#fafafa",
              userSelect: "none",
            }}
          >
            {TIME_SLOTS.map((tStr) => (
              <div
                key={tStr}
                style={{
                  height: `${SLOT_HEIGHT}px`,
                  boxSizing: "border-box",
                  borderBottom: "1px dashed #e2e8f0",
                  padding: "4px 6px",
                  textAlign: "right",
                  fontSize: "0.75rem",
                  color: tStr.endsWith(":00") ? "#1e293b" : "#94a3b8",
                  fontWeight: tStr.endsWith(":00") ? 600 : 400,
                }}
              >
                {tStr}
              </div>
            ))}
          </div>

          {/* Shifokorlar ustunlari */}
          {columns.map((col) => {
            const colAppts = appointments.filter((a) => {
              if (col.id === 0) return true;
              return a.staff_id === col.id || (!a.staff_id && columns.length === 1);
            });

            return (
              <div
                key={col.id}
                style={{
                  position: "relative",
                  borderRight: "1px solid var(--color-border, #e2e8f0)",
                  height: `${TIME_SLOTS.length * SLOT_HEIGHT}px`,
                  background: "#ffffff",
                }}
              >
                {/* Bugungi qizil chiziq */}
                {showCurrentTimeLine(date)}

                {/* Bo'sh vaqt slotlari (bosganda navbat qo'shiladi) */}
                {TIME_SLOTS.map((tStr) => (
                  <div
                    key={tStr}
                    onClick={() => onSlotClick && onSlotClick({ date, time: tStr, staff_id: col.id || "" })}
                    title={`${date} ${tStr} — Yangi navbat yozish`}
                    style={{
                      height: `${SLOT_HEIGHT}px`,
                      boxSizing: "border-box",
                      borderBottom: tStr.endsWith(":30") ? "1px solid #f1f5f9" : "1px dashed #e2e8f0",
                      cursor: "pointer",
                      transition: "background 0.15s",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "#f0f9ff")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  />
                ))}

                {/* Shu shifokorning navbat kartochkalari */}
                {colAppts.map((a) => {
                  const apptTime = (a.scheduled_at || "").slice(11, 16) || a.time || "09:00";
                  const topOffset = getSlotOffset(apptTime);
                  const cardH = getCardHeight(a.duration_min || 30);
                  const theme = STATUS_THEMES[a.status] || STATUS_THEMES.scheduled;

                  return (
                    <div
                      key={a.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        onApptClick && onApptClick(a);
                      }}
                      style={{
                        position: "absolute",
                        top: `${topOffset}px`,
                        left: "4px",
                        right: "4px",
                        height: `${cardH}px`,
                        backgroundColor: theme.bg,
                        borderLeft: `4px solid ${theme.border}`,
                        borderTop: `1px solid ${theme.border}40`,
                        borderRight: `1px solid ${theme.border}40`,
                        borderBottom: `1px solid ${theme.border}40`,
                        borderRadius: "6px",
                        padding: "4px 8px",
                        boxSizing: "border-box",
                        overflow: "hidden",
                        cursor: "pointer",
                        zIndex: 10,
                        boxShadow: "0 2px 4px rgba(0,0,0,0.06)",
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "space-between",
                        transition: "transform 0.15s, box-shadow 0.15s",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = "translateY(-1px)";
                        e.currentTarget.style.boxShadow = "0 4px 8px rgba(0,0,0,0.12)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = "none";
                        e.currentTarget.style.boxShadow = "0 2px 4px rgba(0,0,0,0.06)";
                      }}
                    >
                      <div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 4 }}>
                          <span style={{ fontWeight: 700, fontSize: "0.85rem", color: theme.text }} className="truncate">
                            👤 {a.patient_name}
                          </span>
                          <span
                            style={{
                              fontSize: "0.7rem",
                              fontWeight: 600,
                              color: theme.border,
                              whiteSpace: "nowrap",
                              background: "#ffffff",
                              padding: "1px 5px",
                              borderRadius: "4px",
                              border: `1px solid ${theme.border}40`,
                            }}
                          >
                            {apptTime} ({a.duration_min || 30}m)
                          </span>
                        </div>

                        {cardH >= 65 && a.complaint && (
                          <div
                            style={{
                              fontSize: "0.75rem",
                              color: "#475569",
                              marginTop: 2,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            💬 {a.complaint}
                          </div>
                        )}
                      </div>

                      {/* Pastki qism: Holat tugmasi / yorlig'i */}
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 2 }}>
                        <span style={{ fontSize: "0.72rem", fontWeight: 600, color: theme.border }}>
                          {theme.label}
                        </span>

                        {a.status === "scheduled" && (
                          <button
                            type="button"
                            className="btn small"
                            style={{ padding: "1px 6px", fontSize: "0.68rem", height: "auto" }}
                            onClick={(e) => {
                              e.stopPropagation();
                              onStatusChange && onStatusChange(a.id, "arrived");
                            }}
                          >
                            Keldi ✓
                          </button>
                        )}
                        {a.status === "arrived" && (
                          <button
                            type="button"
                            className="btn small"
                            style={{ padding: "1px 6px", fontSize: "0.68rem", height: "auto", background: "#10b981", borderColor: "#10b981" }}
                            onClick={(e) => {
                              e.stopPropagation();
                              onStatusChange && onStatusChange(a.id, "completed");
                            }}
                          >
                            Tugadi ✓
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ==========================================
  // HAFTALIK REJIM (WEEK VIEW: 7 KUNLIK GRID)
  // ==========================================
  return (
    <div
      className="calendar-grid-container"
      style={{
        background: "var(--color-surface, #ffffff)",
        borderRadius: "12px",
        border: "1px solid var(--color-border, #e2e8f0)",
        overflow: "hidden",
        boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
      }}
    >
      {/* Hafta kunlari sarlavhasi */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `70px repeat(7, minmax(140px, 1fr))`,
          borderBottom: "2px solid var(--color-border, #e2e8f0)",
          background: "#f8fafc",
          position: "sticky",
          top: 0,
          zIndex: 30,
        }}
      >
        <div
          style={{
            padding: "12px 6px",
            textAlign: "center",
            fontWeight: 600,
            fontSize: "0.8rem",
            color: "#64748b",
            borderRight: "1px solid var(--color-border, #e2e8f0)",
          }}
        >
          ⏱ Vaqt
        </div>
        {weekDays.map((day) => (
          <div
            key={day.date}
            style={{
              padding: "8px 6px",
              textAlign: "center",
              borderRight: "1px solid var(--color-border, #e2e8f0)",
              background: day.isToday ? "#eff6ff" : "transparent",
            }}
          >
            <div style={{ fontSize: "0.75rem", textTransform: "uppercase", color: day.isToday ? "#2563eb" : "#64748b", fontWeight: 600 }}>
              {day.dayName}
            </div>
            <div
              style={{
                display: "inline-block",
                fontSize: "1.1rem",
                fontWeight: 700,
                color: day.isToday ? "#ffffff" : "#1e293b",
                background: day.isToday ? "#2563eb" : "transparent",
                width: "28px",
                height: "28px",
                lineHeight: "28px",
                borderRadius: "50%",
                marginTop: "2px",
              }}
            >
              {day.dayNum}
            </div>
          </div>
        ))}
      </div>

      {/* Vaqt va 7 kunlik slotlar */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `70px repeat(7, minmax(140px, 1fr))`,
          maxHeight: "680px",
          overflowY: "auto",
          overflowX: "auto",
          position: "relative",
        }}
      >
        {/* Chapdagi vaqt belgisi */}
        <div
          style={{
            borderRight: "1px solid var(--color-border, #e2e8f0)",
            background: "#fafafa",
            userSelect: "none",
          }}
        >
          {TIME_SLOTS.map((tStr) => (
            <div
              key={tStr}
              style={{
                height: `${SLOT_HEIGHT}px`,
                boxSizing: "border-box",
                borderBottom: "1px dashed #e2e8f0",
                padding: "4px 6px",
                textAlign: "right",
                fontSize: "0.75rem",
                color: tStr.endsWith(":00") ? "#1e293b" : "#94a3b8",
                fontWeight: tStr.endsWith(":00") ? 600 : 400,
              }}
            >
              {tStr}
            </div>
          ))}
        </div>

        {/* 7 ta kun ustuni */}
        {weekDays.map((day) => {
          const dayAppts = appointments.filter((a) => {
            const aDate = (a.scheduled_at || "").slice(0, 10) || a.date;
            const matchesDate = aDate === day.date;
            if (!matchesDate) return false;
            if (selectedStaffId) return a.staff_id === parseInt(selectedStaffId, 10);
            return true;
          });

          return (
            <div
              key={day.date}
              style={{
                position: "relative",
                borderRight: "1px solid var(--color-border, #e2e8f0)",
                height: `${TIME_SLOTS.length * SLOT_HEIGHT}px`,
                background: day.isToday ? "#fafcff" : "#ffffff",
              }}
            >
              {/* Bugungi qizil chiziq */}
              {showCurrentTimeLine(day.date)}

              {/* Bo'sh slotlar */}
              {TIME_SLOTS.map((tStr) => (
                <div
                  key={tStr}
                  onClick={() =>
                    onSlotClick &&
                    onSlotClick({
                      date: day.date,
                      time: tStr,
                      staff_id: selectedStaffId || "",
                    })
                  }
                  title={`${day.date} ${tStr} — Yangi navbat yozish`}
                  style={{
                    height: `${SLOT_HEIGHT}px`,
                    boxSizing: "border-box",
                    borderBottom: tStr.endsWith(":30") ? "1px solid #f1f5f9" : "1px dashed #e2e8f0",
                    cursor: "pointer",
                    transition: "background 0.15s",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "#f0f9ff")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                />
              ))}

              {/* Shu kunning navbatlari */}
              {dayAppts.map((a) => {
                const apptTime = (a.scheduled_at || "").slice(11, 16) || a.time || "09:00";
                const topOffset = getSlotOffset(apptTime);
                const cardH = getCardHeight(a.duration_min || 30);
                const theme = STATUS_THEMES[a.status] || STATUS_THEMES.scheduled;

                return (
                  <div
                    key={a.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      onApptClick && onApptClick(a);
                    }}
                    style={{
                      position: "absolute",
                      top: `${topOffset}px`,
                      left: "3px",
                      right: "3px",
                      height: `${cardH}px`,
                      backgroundColor: theme.bg,
                      borderLeft: `3px solid ${theme.border}`,
                      borderTop: `1px solid ${theme.border}30`,
                      borderRight: `1px solid ${theme.border}30`,
                      borderBottom: `1px solid ${theme.border}30`,
                      borderRadius: "5px",
                      padding: "3px 6px",
                      boxSizing: "border-box",
                      overflow: "hidden",
                      cursor: "pointer",
                      zIndex: 10,
                      boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "space-between",
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 700, fontSize: "0.78rem", color: theme.text }} className="truncate">
                        {a.patient_name}
                      </div>
                      <div style={{ fontSize: "0.68rem", color: theme.border, fontWeight: 600 }}>
                        {apptTime} · {a.duration_min || 30}m
                      </div>
                      {a.staff_name && (
                        <div style={{ fontSize: "0.68rem", color: "#64748b" }} className="truncate">
                          👨‍⚕️ {a.staff_name}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
