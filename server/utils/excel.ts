/**
 * excel.ts — Excel hisobotlar yaratish (ExcelJS)
 */

import ExcelJS from "exceljs";

/** Sarlavha qatori stillari */
function styleHeader(ws: ExcelJS.Worksheet) {
  const row = ws.getRow(1);
  row.font = { bold: true };
  row.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFD9E8F5" },
  };
}

export interface FinanceRow {
  tx_date: string;
  type: "income" | "expense" | string;
  category?: string;
  amount: number;
  method?: string;
  patient?: string;
  doctor?: string;
  comment?: string;
}

/** Moliyaviy hisobot: kirim/chiqim jadvali */
export function finance(txRows: FinanceRow[], from: string, to: string): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Dental Clinic";
  const ws = wb.addWorksheet("Kirim-chiqim");

  ws.columns = [
    { header: "Sana", key: "date", width: 12 },
    { header: "Turi", key: "type", width: 10 },
    { header: "Toifa", key: "category", width: 14 },
    { header: "Summa", key: "amount", width: 14 },
    { header: "To'lov usuli", key: "method", width: 12 },
    { header: "Bemor", key: "patient", width: 28 },
    { header: "Bajaruvchi (Shifokor)", key: "doctor", width: 26 },
    { header: "Izoh", key: "comment", width: 32 },
  ];
  styleHeader(ws);

  let income = 0;
  let expense = 0;
  for (const r of txRows) {
    const amt = Number(r.amount || 0);
    if (r.type === "income") income += amt;
    else expense += amt;
    ws.addRow({
      date: r.tx_date,
      type: r.type === "income" ? "Kirim" : "Xarajat",
      category: r.category || "",
      amount: amt,
      method: r.method || "",
      patient: r.patient || "",
      doctor: r.doctor || "—",
      comment: r.comment || "",
    });
  }

  ws.addRow({});
  const totalRow = ws.addRow({ date: "JAMI SOF FOYDA", amount: income - expense });
  totalRow.font = { bold: true };

  const summary = ws.addRow({
    date: `Kirim: ${income.toLocaleString()} | Xarajat: ${expense.toLocaleString()} | Sof foyda: ${(income - expense).toLocaleString()} (${from} → ${to})`,
  });
  summary.font = { bold: true };

  return wb;
}

export interface DoctorStatsRow {
  full_name: string;
  position: string;
  ishlar_soni: number;
  umumiy_summa: number;
}

/** Shifokor statistikasi varag'i */
export function doctorStats(rows: DoctorStatsRow[], from: string, to: string): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Dental Clinic";
  const ws = wb.addWorksheet("Shifokorlar");

  ws.columns = [
    { header: "Shifokor", key: "name", width: 30 },
    { header: "Lavozim", key: "position", width: 14 },
    { header: "Ishlar soni", key: "count", width: 14 },
    { header: "Umumiy summa (so'm)", key: "total", width: 20 },
  ];
  styleHeader(ws);

  for (const r of rows) {
    ws.addRow({
      name: r.full_name,
      position: r.position,
      count: Number(r.ishlar_soni || 0),
      total: Number(r.umumiy_summa || 0),
    });
  }

  const note = ws.addRow({});
  note.getCell("A").value = `Davr: ${from} → ${to}`;
  note.font = { italic: true };

  return wb;
}

export interface CompletedApptExcelRow {
  date: string;
  time: string;
  patient: string;
  doctor: string;
  complaint?: string;
  procedures?: string;
  procedures_cost: number;
  paid_amount: number;
  payment_status: string;
}

/** Yakunlangan qabullar va to'lovlar varag'i */
export function completedApptsExcel(rows: CompletedApptExcelRow[], from: string, to: string): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Dental Clinic";
  const ws = wb.addWorksheet("Yakunlangan qabullar");

  ws.columns = [
    { header: "Sana", key: "date", width: 12 },
    { header: "Vaqt", key: "time", width: 10 },
    { header: "Bemor", key: "patient", width: 28 },
    { header: "Shifokor", key: "doctor", width: 26 },
    { header: "Shikoyat / Tashxis", key: "complaint", width: 28 },
    { header: "Bajarilgan muolajalar", key: "procedures", width: 32 },
    { header: "Muolaja summasi (so'm)", key: "cost", width: 18 },
    { header: "To'langan summa (so'm)", key: "paid", width: 18 },
    { header: "To'lov holati", key: "status", width: 14 },
  ];
  styleHeader(ws);

  let totalCost = 0;
  let totalPaid = 0;
  for (const r of rows) {
    const cost = Number(r.procedures_cost || 0);
    const paid = Number(r.paid_amount || 0);
    totalCost += cost;
    totalPaid += paid;
    ws.addRow({
      date: r.date,
      time: r.time,
      patient: r.patient,
      doctor: r.doctor,
      complaint: r.complaint || "—",
      procedures: r.procedures || "—",
      cost,
      paid,
      status: r.payment_status,
    });
  }

  ws.addRow({});
  const totalRow = ws.addRow({
    patient: "JAMI",
    cost: totalCost,
    paid: totalPaid,
  });
  totalRow.font = { bold: true };

  const note = ws.addRow({});
  note.getCell("A").value = `Davr: ${from} → ${to}`;
  note.font = { italic: true };

  return wb;
}
