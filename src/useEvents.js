/**
 * useEvents.js — Server-Sent Events bilan real-time bildirishnomalar hook'i
 */

import { useEffect, useRef, useState } from "react";

export function useEvents() {
  const [toasts, setToasts] = useState([]); // { id, kind, title, body }
  const idRef = useRef(1);

  useEffect(() => {
    const token = localStorage.getItem("dc_token") || "";
    const apiKey = localStorage.getItem("dc_api_key") || "";
    const baseUrl = localStorage.getItem("dc_base_url") !== null ? localStorage.getItem("dc_base_url") : "";
    if (!token) return undefined;

    const qs = new URLSearchParams({ token, ...(apiKey ? { api_key: apiKey } : {}) });
    const targetUrl = baseUrl ? `${baseUrl.replace(/\/$/, '')}/api/events?${qs.toString()}` : `/api/events?${qs.toString()}`;

    let es = null;
    try {
      es = new EventSource(targetUrl);
    } catch (_) {
      return undefined;
    }

    const push = (kind, title, body) => {
      const id = idRef.current++;
      setToasts((prev) => [...prev.slice(-4), { id, kind, title, body }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 8000);
    };

    const handleEvent = (type, e) => {
      let d = {};
      try {
        d = JSON.parse(e.data);
      } catch (_) {
        d = { raw: e.data };
      }
      // Barcha sahifalarga xabar yuborish (real-vaqtda jadvallar darhol yangilanadi)
      window.dispatchEvent(new CustomEvent("clinic:sse", { detail: { type, data: d } }));
      return d;
    };

    es.addEventListener("patient:new", (e) => {
      const d = handleEvent("patient:new", e);
      push("patient", `🧑‍🤝‍🧑 Yangi bemor: ${d.name || d.full_name}`, `Telegram orqali ro'yxatdan o'tdi · ${d.phone || "telefonsiz"}`);
    });

    es.addEventListener("patient:updated", (e) => {
      handleEvent("patient:updated", e);
    });

    es.addEventListener("patient:telegram_linked", (e) => {
      const d = handleEvent("patient:telegram_linked", e);
      push("patient", `✈️ Telegram ulandi`, `${d.full_name || "Bemor"} Telegram botga muvaffaqiyatli bog'landi`);
    });

    es.addEventListener("appointment:new", (e) => {
      const d = handleEvent("appointment:new", e);
      const src = d.source === "telegram" ? "Telegram bot orqali" : "Klinikada";
      push("appointment", `📅 Yangi navbat: ${d.patient || "Bemor"}`, `${d.date || ""} ${d.time || ""} · ${d.doctor || "Shifokor"} · ${src}`);
    });

    es.addEventListener("appointment:updated", (e) => {
      handleEvent("appointment:updated", e);
    });

    es.addEventListener("complaint:new", (e) => {
      const d = handleEvent("complaint:new", e);
      push("complaint", `💬 Yangi murojaat: ${d.patient_name || "Bemor"}`, d.message || "Telegram orqali xabar yuborildi");
    });

    es.addEventListener("user:access_requested", (e) => {
      const d = handleEvent("user:access_requested", e);
      push("user", `🔔 Yangi kirish so'rovi: ${d.user?.full_name || "Xodim"}`, `${d.user?.email || ""} tizimga ruxsat so'radi`);
    });

    es.addEventListener("storage:updated", (e) => {
      handleEvent("storage:updated", e);
    });

    es.addEventListener("clinic:sse", (e) => {
      handleEvent("clinic:sse", e);
    });

    es.onmessage = (e) => {
      handleEvent("message", e);
    };

    es.onerror = () => {
      // EventSource fail gracefully in preview or if offline
    };

    return () => {
      if (es) es.close();
    };
  }, []);

  const dismiss = (id) => setToasts((prev) => prev.filter((t) => t.id !== id));
  return { toasts, dismiss };
}
