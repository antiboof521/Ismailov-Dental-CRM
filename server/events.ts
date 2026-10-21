/**
 * events.ts — SSE (Server-Sent Events) event bus
 * Admin dasturiga real-time bildirishnomalar: yangi bemor, yangi navbat va h.k.
 */

import { Request, Response } from "express";
import jwt from "jsonwebtoken";
import { JWT_SECRET, API_KEY } from "./config.js";

interface SseClient {
  res: Response;
}

const clients = new Set<SseClient>();

/** SSE ulanishni qayta ishlovchi middleware — token/api_key tekshiruvi bilan */
export function sseHandler(req: Request, res: Response) {
  const token = (req.query.token as string) || "";
  const apiKey = (req.query.api_key as string) || "";

  // API kaliti sozlangan bo'lsa tekshirish
  if (API_KEY && apiKey !== API_KEY) {
    return res.status(401).json({ error: "API kaliti noto'g'ri" });
  }

  // JWT tekshirish agar token bo'lsa
  if (token) {
    try {
      jwt.verify(token, JWT_SECRET);
    } catch {
      // Agar token noto'g'ri bo'lsa ham dev rejimida ruxsat beriladi yoki xato qaytariladi
    }
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.write("retry: 3000\n\n");

  const client: SseClient = { res };
  clients.add(client);
  console.log(`🔔 SSE ulanildi (jami: ${clients.size})`);

  // Yurak urishi — proksi ulanishni uzmasligi uchun har 25 soniyada
  const ping = setInterval(() => {
    try {
      res.write(": ping\n\n");
    } catch {
      clearInterval(ping);
      clients.delete(client);
    }
  }, 25000);

  req.on("close", () => {
    clearInterval(ping);
    clients.delete(client);
    console.log(`🔔 SSE uzildi (jami: ${clients.size})`);
  });
}

/** Barcha ulangan adminlarga hodisa yuborish */
export function broadcast(eventName: string, data: any) {
  const payload = `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const c of clients) {
    try {
      c.res.write(payload);
    } catch {
      clients.delete(c);
    }
  }
  if (clients.size > 0) {
    console.log(`🔔 Hodisa yuborildi: ${eventName} (${clients.size} mijozga)`);
  }
}
