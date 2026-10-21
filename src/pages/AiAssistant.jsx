/**
 * src/pages/AiAssistant.jsx — Gemini AI Stomatolog Assistenti
 * - Rentgen va fotosuratlar tahlili (Multimodal Vision)
 * - Tish formulasi asosida kompleks Davolash Rejasi tuzish
 * - Stomatolog klinik Copilot (chat va konsultatsiya)
 */

import React, { useState, useEffect, useRef } from "react";
import { api } from "../api.js";
import { useLang } from "../i18n.jsx";
import { ErrorBanner } from "../components/ui.jsx";

export default function AiAssistant({ initialPatientId = null, initialImage = null }) {
  const { t, lang } = useLang();
  const [activeTab, setActiveTab] = useState("radiograph"); // 'radiograph' | 'treatment_plan' | 'copilot'
  const [patients, setPatients] = useState([]);
  const [selectedPatientId, setSelectedPatientId] = useState(initialPatientId || "");
  const [patientImages, setPatientImages] = useState([]);

  // AI Radiograph State
  const [selectedImage, setSelectedImage] = useState(initialImage || "");
  const [imageCategory, setImageCategory] = useState("periapical");
  const [imageTooth, setImageTooth] = useState("16");
  const [clinicalContext, setClinicalContext] = useState("");
  const [analyzingXray, setAnalyzingXray] = useState(false);
  const [xrayResult, setXrayResult] = useState(null);
  const [copiedXray, setCopiedXray] = useState(false);

  // Treatment Plan State
  const [generatingPlan, setGeneratingPlan] = useState(false);
  const [planComplaint, setPlanComplaint] = useState("");
  const [budgetPref, setBudgetPref] = useState("optimal");
  const [treatmentPlanResult, setTreatmentPlanResult] = useState(null);
  const [copiedPlan, setCopiedPlan] = useState(false);

  // Copilot Chat State
  const [chatMessages, setChatMessages] = useState([
    {
      role: "model",
      text:
        lang === "ru"
          ? "Здравствуйте, коллега! Я ваш клинический ассистент Gemini AI. Могу рассчитать дозировку анестетиков и антибиотиков, подсказать протоколы эндодонтического лечения или составить рекомендации для пациента."
          : lang === "en"
          ? "Hello, Doctor! I am your Gemini AI Dental Copilot. Ask me about anesthetic and antibiotic dosages, endodontic protocols, or post-op patient guidelines."
          : "Assalomu alaykum, shifokor! Men sizning Gemini AI Stomatolog assistentingizman. Dori vositalari dozalari, anesteziya tanlash, kanal davolash protokollari yoki bemor uchun tavsiyalar bo'yicha savol berishingiz mumkin.",
    },
  ]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const chatBottomRef = useRef(null);

  const [error, setError] = useState("");

  // Bemorlar ro'yxatini yuklash
  useEffect(() => {
    api.get("/api/patients?limit=100")
      .then((d) => {
        setPatients(d.patients || []);
        if (!selectedPatientId && d.patients && d.patients.length > 0) {
          setSelectedPatientId(String(d.patients[0].id));
        }
      })
      .catch((e) => setError(e.message));
  }, []);

  // Tanlangan bemorning rasmlarini yuklash
  useEffect(() => {
    if (!selectedPatientId) {
      setPatientImages([]);
      return;
    }
    api.get(`/api/patients/${selectedPatientId}/images`)
      .then((d) => {
        const imgs = d.images || [];
        setPatientImages(imgs);
        if (imgs.length > 0 && !selectedImage) {
          setSelectedImage(imgs[0].url);
          if (imgs[0].category) setImageCategory(imgs[0].category);
          if (imgs[0].tooth) setImageTooth(imgs[0].tooth);
        }
      })
      .catch(() => setPatientImages([]));
  }, [selectedPatientId]);

  // Chat pastiga scroll qilish
  useEffect(() => {
    if (activeTab === "copilot") {
      chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [chatMessages, activeTab]);

  // Fayl yuklash (yangi rasm)
  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setSelectedImage(reader.result);
    };
    reader.readAsDataURL(file);
  };

  // 1. Rentgen tahlilini yuborish
  const runRadiographAnalysis = async () => {
    if (!selectedImage) {
      setError("Iltimos, tahlil qilish uchun rentgen yoki fotosuratni tanlang");
      return;
    }
    setError("");
    setAnalyzingXray(true);
    setXrayResult(null);

    const selPatient = patients.find((p) => String(p.id) === String(selectedPatientId));

    try {
      const res = await api.post("/api/ai/analyze-radiograph", {
        imageUrl: selectedImage,
        category: imageCategory,
        tooth: imageTooth,
        clinicalContext,
        patientName: selPatient ? selPatient.full_name : "",
        language: lang,
      });
      if (res.ok && res.analysis) {
        setXrayResult(res.analysis);
      } else {
        throw new Error(res.error || "Tahlil qilib bo'lmadi");
      }
    } catch (err) {
      setError(err.message || "Xatolik yuz berdi");
    } finally {
      setAnalyzingXray(false);
    }
  };

  // 2. Davolash rejasini generatsiya qilish
  const runTreatmentPlan = async () => {
    if (!selectedPatientId) {
      setError("Iltimos, davolash rejasi uchun bemorni tanlang");
      return;
    }
    setError("");
    setGeneratingPlan(true);
    setTreatmentPlanResult(null);

    try {
      const res = await api.post("/api/ai/treatment-plan", {
        patientId: Number(selectedPatientId),
        complaint: planComplaint,
        budgetPreference: budgetPref,
        language: lang,
      });
      if (res.ok && res.plan) {
        setTreatmentPlanResult(res.plan);
      } else {
        throw new Error(res.error || "Reja tuzib bo'lmadi");
      }
    } catch (err) {
      setError(err.message || "Xatolik yuz berdi");
    } finally {
      setGeneratingPlan(false);
    }
  };

  // 3. Stomatolog Copilot ga savol berish
  const sendChatMessage = async (presetText) => {
    const textToSend = presetText || chatInput;
    if (!textToSend.trim() || chatLoading) return;

    const userMsg = { role: "user", text: textToSend };
    const nextHistory = [...chatMessages, userMsg];
    setChatMessages(nextHistory);
    setChatInput("");
    setChatLoading(true);

    const selPatient = patients.find((p) => String(p.id) === String(selectedPatientId));
    const patientContext = selPatient
      ? `Bemor: ${selPatient.full_name}, ${selPatient.gender || ""}, Allergiyalar: ${selPatient.allergies || "Yo'q"}`
      : "";

    try {
      const res = await api.post("/api/ai/copilot", {
        message: textToSend,
        history: chatMessages.slice(-8), // Oxirgi 8 ta xabar konteksti
        patientContext,
        language: lang,
      });

      if (res.ok && res.reply) {
        setChatMessages((prev) => [...prev, { role: "model", text: res.reply }]);
      } else {
        throw new Error(res.error || "Javob olinmadi");
      }
    } catch (err) {
      setChatMessages((prev) => [
        ...prev,
        { role: "model", text: `⚠️ Xatolik: ${err.message || "Server bilan aloqa uzildi"}` },
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  const copyToClipboard = (text, setFlag) => {
    navigator.clipboard.writeText(text);
    setFlag(true);
    setTimeout(() => setFlag(false), 2000);
  };

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", paddingBottom: 40 }}>
      {/* HEADER */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
        <div>
          <div className="page-title" style={{ display: "flex", alignItems: "center", gap: 10, margin: 0 }}>
            <span>🤖</span>
            <span>{t("ai_title")}</span>
          </div>
          <div style={{ color: "var(--color-muted)", fontSize: "0.9rem", marginTop: 4 }}>
            {t("ai_subtitle")}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#f0fdf4", border: "1px solid #bbf7d0", padding: "6px 14px", borderRadius: 20 }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#22c55e", display: "inline-block" }} />
          <span style={{ fontSize: "0.85rem", fontWeight: "bold", color: "#166534" }}>Gemini 3.8 Flash • Online</span>
        </div>
      </div>

      {error && <ErrorBanner message={error} onClose={() => setError("")} />}

      {/* ASOSIY TABLAR */}
      <div className="tabs-nav" style={{ borderBottom: "2px solid var(--border)", paddingBottom: 10, marginBottom: 16 }}>
        <button
          type="button"
          className={`btn ${activeTab === "radiograph" ? "" : "secondary"}`}
          onClick={() => setActiveTab("radiograph")}
          style={{ display: "flex", alignItems: "center", gap: 6 }}
        >
          <span>🩻</span>
          <span>{t("ai_tab_xray")}</span>
        </button>
        <button
          type="button"
          className={`btn ${activeTab === "treatment_plan" ? "" : "secondary"}`}
          onClick={() => setActiveTab("treatment_plan")}
          style={{ display: "flex", alignItems: "center", gap: 6 }}
        >
          <span>📋</span>
          <span>{t("ai_tab_plan")}</span>
        </button>
        <button
          type="button"
          className={`btn ${activeTab === "copilot" ? "" : "secondary"}`}
          onClick={() => setActiveTab("copilot")}
          style={{ display: "flex", alignItems: "center", gap: 6 }}
        >
          <span>💬</span>
          <span>{t("ai_tab_chat")}</span>
        </button>
      </div>

      {/* ───────────────────────────────────────────────────────────── */}
      {/* TAB 1: RENTGEN TAHLILI (VISION) */}
      {/* ───────────────────────────────────────────────────────────── */}
      {activeTab === "radiograph" && (
        <div className="ai-split-grid">
          {/* Chap ustun: Bemor va Surat tanlash */}
          <div className="panel" style={{ margin: 0 }}>
            <h3 style={{ marginTop: 0, display: "flex", alignItems: "center", gap: 8, fontSize: "1.05rem" }}>
              <span>🔍</span>
              <span>1. Surat va Parametrlarni Tanlash</span>
            </h3>

            {/* Bemor tanlash */}
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "block", fontSize: "0.85rem", fontWeight: "bold", marginBottom: 4 }}>
                {t("ai_select_patient")}:
              </label>
              <select
                value={selectedPatientId}
                onChange={(e) => setSelectedPatientId(e.target.value)}
                style={{ width: "100%", padding: 8, borderRadius: 6, border: "1px solid var(--color-border)" }}
              >
                <option value="">-- Bemorni tanlang --</option>
                {patients.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name} ({p.phone || "Telefon yo'q"})
                  </option>
                ))}
              </select>
            </div>

            {/* Bemordagi mavjud rasmlar karuseli */}
            {patientImages.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: "block", fontSize: "0.8rem", color: "var(--color-muted)", marginBottom: 6 }}>
                  Bemor arxivdagi suratlari ({patientImages.length} ta):
                </label>
                <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 6 }}>
                  {patientImages.map((img) => (
                    <div
                      key={img.id}
                      onClick={() => {
                        setSelectedImage(img.url);
                        if (img.category) setImageCategory(img.category);
                        if (img.tooth) setImageTooth(img.tooth);
                      }}
                      style={{
                        minWidth: 70,
                        width: 70,
                        height: 70,
                        borderRadius: 6,
                        overflow: "hidden",
                        border: selectedImage === img.url ? "2px solid var(--color-primary)" : "1px solid var(--color-border)",
                        cursor: "pointer",
                        position: "relative",
                        background: "#000",
                      }}
                    >
                      <img src={img.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      <span
                        style={{
                          position: "absolute",
                          bottom: 0,
                          left: 0,
                          right: 0,
                          background: "rgba(0,0,0,0.6)",
                          color: "#fff",
                          fontSize: "0.65rem",
                          textAlign: "center",
                          padding: "1px 0",
                        }}
                      >
                        #{img.tooth || "OPG"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Yangi rasm yuklash */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: "block", fontSize: "0.85rem", fontWeight: "bold", marginBottom: 4 }}>
                Yangi rentgen yuklash:
              </label>
              <input
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
                style={{ width: "100%", fontSize: "0.85rem" }}
              />
            </div>

            {/* Surat sozlamalari */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
              <div>
                <label style={{ display: "block", fontSize: "0.8rem", fontWeight: "bold", marginBottom: 4 }}>
                  Surat toifasi:
                </label>
                <select
                  value={imageCategory}
                  onChange={(e) => setImageCategory(e.target.value)}
                  style={{ width: "100%", padding: 6, borderRadius: 6, border: "1px solid var(--color-border)" }}
                >
                  <option value="periapical">🦷 Viziograf / Periapikal</option>
                  <option value="panoramic">🩻 Panoramali OPG</option>
                  <option value="intraoral">📸 Og'iz ichi fotosi</option>
                  <option value="ct">💀 Kompyuter Tomografiyasi</option>
                </select>
              </div>
              <div>
                <label style={{ display: "block", fontSize: "0.8rem", fontWeight: "bold", marginBottom: 4 }}>
                  Tish raqami (FDI):
                </label>
                <input
                  type="text"
                  value={imageTooth}
                  onChange={(e) => setImageTooth(e.target.value)}
                  placeholder="Masalan: 16, 21, 36 yoki All"
                  style={{ width: "100%", padding: 6, borderRadius: 6, border: "1px solid var(--color-border)" }}
                />
              </div>
            </div>

            {/* Shifokor klinik konteksti / shikoyat */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontSize: "0.8rem", fontWeight: "bold", marginBottom: 4 }}>
                Klinik alomatlar va shikoyatlar:
              </label>
              <textarea
                rows={2}
                value={clinicalContext}
                onChange={(e) => setClinicalContext(e.target.value)}
                placeholder="Masalan: Issiq/sovuqqa reaksiyasi, kechki og'riqlar, ildiz apeksida sezuvchanlik..."
                style={{ width: "100%", padding: 8, borderRadius: 6, border: "1px solid var(--color-border)" }}
              />
            </div>

            {/* Tanlangan surat oldindan ko'rish */}
            {selectedImage && (
              <div
                style={{
                  background: "#090d16",
                  padding: 10,
                  borderRadius: 8,
                  textAlign: "center",
                  marginBottom: 16,
                  border: "1px solid #1e293b",
                }}
              >
                <img
                  src={selectedImage}
                  alt="Radiograph Preview"
                  style={{
                    maxHeight: 220,
                    maxWidth: "100%",
                    borderRadius: 6,
                    objectFit: "contain",
                    boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
                  }}
                />
              </div>
            )}

            {/* TAHLIL TUGMASI */}
            <button
              type="button"
              className="btn"
              onClick={runRadiographAnalysis}
              disabled={analyzingXray || !selectedImage}
              style={{
                width: "100%",
                padding: "12px",
                fontSize: "1rem",
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                gap: 8,
                background: "linear-gradient(135deg, #2563eb, #7c3aed)",
                borderColor: "#4f46e5",
              }}
            >
              {analyzingXray ? (
                <>
                  <span className="spinner" style={{ width: 18, height: 18 }} />
                  <span>{t("ai_analyzing")}</span>
                </>
              ) : (
                <>
                  <span>🤖</span>
                  <span>{t("ai_analyze_now")}</span>
                </>
              )}
            </button>
          </div>

          {/* O'ng ustun: AI Tahlil Natijalari */}
          <div className="panel" style={{ margin: 0, display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h3 style={{ margin: 0, display: "flex", alignItems: "center", gap: 8, fontSize: "1.05rem" }}>
                <span>🔬</span>
                <span>2. Gemini AI Rentgenologik Xulosa</span>
              </h3>
              {xrayResult && (
                <button
                  type="button"
                  className="btn small secondary"
                  onClick={() => copyToClipboard(xrayResult.text, setCopiedXray)}
                >
                  {copiedXray ? `✓ ${t("ai_copied")}` : `📋 ${t("ai_copy")}`}
                </button>
              )}
            </div>

            {analyzingXray && (
              <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--color-muted)", flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                <div style={{ fontSize: "2rem", marginBottom: 12 }}>🧠</div>
                <div style={{ fontWeight: "bold", fontSize: "1.1rem", marginBottom: 6 }}>Rentgenogramma tahlil qilinmoqda...</div>
                <div style={{ fontSize: "0.85rem", maxWidth: 320 }}>
                  Gemini 3.8 Flash emal-dentin chegarasi, ildiz kanallari zichligi va periapikal to'qimalarni skanerlamoqda.
                </div>
              </div>
            )}

            {!analyzingXray && !xrayResult && (
              <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--color-muted)", flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                <div style={{ fontSize: "3rem", marginBottom: 12, opacity: 0.5 }}>🩻</div>
                <div style={{ fontWeight: 500 }}>Rentgen suratini tanlang va «Gemini AI orqali tahlil qilish» tugmasini bosing</div>
                <div style={{ fontSize: "0.8rem", marginTop: 6 }}>
                  AI model tish toji, kanallar, suyak to'qimasi va differensial tashxis bo'yicha batafsil xulosa taqdim etadi.
                </div>
              </div>
            )}

            {!analyzingXray && xrayResult && (
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 14 }}>
                {/* Ishonch va Tashxis bloki */}
                <div
                  style={{
                    background: "linear-gradient(to right, #eff6ff, #f5f3ff)",
                    border: "1px solid #bfdbfe",
                    padding: 12,
                    borderRadius: 8,
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: 8,
                  }}
                >
                  <div>
                    <span style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: 0.5, color: "#1e40af", fontWeight: "bold" }}>
                      Tashxis (ICD-10):
                    </span>
                    <div style={{ fontSize: "1.05rem", fontWeight: "bold", color: "#1e3a8a" }}>
                      {xrayResult.diagnosis}
                    </div>
                  </div>
                  <div style={{ background: "#dbeafe", color: "#1d4ed8", padding: "4px 10px", borderRadius: 12, fontSize: "0.85rem", fontWeight: "bold" }}>
                    Ishonch: {xrayResult.confidence}
                  </div>
                </div>

                {/* To'liq markdown tahlili */}
                <div
                  style={{
                    flex: 1,
                    background: "#f8fafc",
                    border: "1px solid var(--color-border)",
                    borderRadius: 8,
                    padding: 16,
                    fontSize: "0.9rem",
                    lineHeight: 1.6,
                    overflowY: "auto",
                    maxHeight: 480,
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {xrayResult.text}
                </div>

                {/* Tibbiy eslatma */}
                <div style={{ fontSize: "0.75rem", color: "var(--color-muted)", borderTop: "1px solid var(--color-border)", paddingTop: 8, fontStyle: "italic" }}>
                  ⚠️ {t("ai_disclaimer")}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* TAB 2: DAVOLASH REJASI (TREATMENT PLANNING) */}
      {/* ───────────────────────────────────────────────────────────── */}
      {activeTab === "treatment_plan" && (
        <div className="ai-split-grid">
          {/* Chap ustun: Bemor va reja parametrlari */}
          <div className="panel" style={{ margin: 0 }}>
            <h3 style={{ marginTop: 0, display: "flex", alignItems: "center", gap: 8, fontSize: "1.05rem" }}>
              <span>📋</span>
              <span>Davolash Rejasi Parametrlari</span>
            </h3>

            {/* Bemor tanlash */}
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "block", fontSize: "0.85rem", fontWeight: "bold", marginBottom: 4 }}>
                {t("ai_select_patient")}:
              </label>
              <select
                value={selectedPatientId}
                onChange={(e) => setSelectedPatientId(e.target.value)}
                style={{ width: "100%", padding: 8, borderRadius: 6, border: "1px solid var(--color-border)" }}
              >
                <option value="">-- Bemorni tanlang --</option>
                {patients.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name} ({p.phone || "Telefon yo'q"})
                  </option>
                ))}
              </select>
            </div>

            {/* Shikoyat / Maqsad */}
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "block", fontSize: "0.85rem", fontWeight: "bold", marginBottom: 4 }}>
                Bemorning asosiy shikoyati yoki talabi:
              </label>
              <textarea
                rows={3}
                value={planComplaint}
                onChange={(e) => setPlanComplaint(e.target.value)}
                placeholder="Masalan: O'ng yuqori jag'da sovuqqa og'riq, chaynashda noqulaylik, tishlar qatorini to'liq restavratsiya qilish..."
                style={{ width: "100%", padding: 8, borderRadius: 6, border: "1px solid var(--color-border)" }}
              />
            </div>

            {/* Byudjet va materiallar afzalligi */}
            <div style={{ marginBottom: 18 }}>
              <label style={{ display: "block", fontSize: "0.85rem", fontWeight: "bold", marginBottom: 6 }}>
                Byudjet va materiallar toifasi:
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                {[
                  { id: "economy", label: "Iqtisodiy", icon: "🪙", desc: "Asosiy plomba va metall-keramika" },
                  { id: "optimal", label: "Optimal", icon: "⭐", desc: "Fotopolimer va sifatli implantlar" },
                  { id: "premium", label: "Premium", icon: "👑", desc: "Sirkoniy tojburchak va premium implant" },
                ].map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => setBudgetPref(b.id)}
                    style={{
                      padding: "8px 6px",
                      borderRadius: 6,
                      border: budgetPref === b.id ? "2px solid var(--color-primary)" : "1px solid var(--color-border)",
                      background: budgetPref === b.id ? "#eff6ff" : "#fff",
                      cursor: "pointer",
                      textAlign: "center",
                    }}
                  >
                    <div style={{ fontSize: "1.1rem" }}>{b.icon}</div>
                    <div style={{ fontWeight: "bold", fontSize: "0.85rem" }}>{b.label}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Reja tuzish tugmasi */}
            <button
              type="button"
              className="btn"
              onClick={runTreatmentPlan}
              disabled={generatingPlan || !selectedPatientId}
              style={{
                width: "100%",
                padding: "12px",
                fontSize: "1rem",
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                gap: 8,
                background: "linear-gradient(135deg, #059669, #10b981)",
                borderColor: "#059669",
              }}
            >
              {generatingPlan ? (
                <>
                  <span className="spinner" style={{ width: 18, height: 18 }} />
                  <span>{t("ai_plan_generating")}</span>
                </>
              ) : (
                <>
                  <span>📋</span>
                  <span>{t("ai_generatePlan")}</span>
                </>
              )}
            </button>
          </div>

          {/* O'ng ustun: Reja natijasi */}
          <div className="panel" style={{ margin: 0, display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h3 style={{ margin: 0, display: "flex", alignItems: "center", gap: 8, fontSize: "1.05rem" }}>
                <span>🎯</span>
                <span>Kompleks Klinik Davolash Rejasi</span>
              </h3>
              {treatmentPlanResult && (
                <button
                  type="button"
                  className="btn small secondary"
                  onClick={() => copyToClipboard(treatmentPlanResult.planMarkdown, setCopiedPlan)}
                >
                  {copiedPlan ? `✓ ${t("ai_copied")}` : `📋 ${t("ai_copy")}`}
                </button>
              )}
            </div>

            {generatingPlan && (
              <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--color-muted)", flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                <div style={{ fontSize: "2rem", marginBottom: 12 }}>⏳</div>
                <div style={{ fontWeight: "bold", fontSize: "1.1rem", marginBottom: 6 }}>Reja hisoblanmoqda...</div>
                <div style={{ fontSize: "0.85rem", maxWidth: 320 }}>
                  Odontogrammadagi patologiyalar va klinika narxlari tahlil qilinmoqda.
                </div>
              </div>
            )}

            {!generatingPlan && !treatmentPlanResult && (
              <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--color-muted)", flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                <div style={{ fontSize: "3rem", marginBottom: 12, opacity: 0.5 }}>📝</div>
                <div style={{ fontWeight: 500 }}>Bemorni tanlang va «AI Davolash Rejasi tuzish» tugmasini bosing</div>
                <div style={{ fontSize: "0.8rem", marginTop: 6 }}>
                  Gemini AI terapevtik sanatsiya, jarrohlik va ortopediya bosqichlari bo'yicha tizimli reja tuzib beradi.
                </div>
              </div>
            )}

            {!generatingPlan && treatmentPlanResult && (
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 12 }}>
                <div
                  style={{
                    background: "#ecfdf5",
                    border: "1px solid #a7f3d0",
                    padding: 12,
                    borderRadius: 8,
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <span style={{ fontWeight: "bold", color: "#065f46" }}>💰 Taxminiy smeta:</span>
                  <span style={{ fontSize: "1.1rem", fontWeight: "bold", color: "#047857" }}>
                    ~{treatmentPlanResult.totalEstimatedCost.toLocaleString("ru-RU")} so'm
                  </span>
                </div>

                <div
                  style={{
                    flex: 1,
                    background: "#f8fafc",
                    border: "1px solid var(--color-border)",
                    borderRadius: 8,
                    padding: 16,
                    fontSize: "0.9rem",
                    lineHeight: 1.6,
                    overflowY: "auto",
                    maxHeight: 480,
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {treatmentPlanResult.planMarkdown}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* TAB 3: STOMATOLOG COPILOT (CHAT & KONSULTATSIYA) */}
      {/* ───────────────────────────────────────────────────────────── */}
      {activeTab === "copilot" && (
        <div className="panel" style={{ margin: 0, display: "flex", flexDirection: "column", height: "70vh", maxHeight: 720 }}>
          {/* Bemor konteksti tanlovi */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, paddingBottom: 10, borderBottom: "1px solid var(--color-border)", marginBottom: 12, flexWrap: "wrap" }}>
            <span style={{ fontSize: "0.85rem", fontWeight: "bold" }}>Bemor konteksti (ixtiyoriy):</span>
            <select
              value={selectedPatientId}
              onChange={(e) => setSelectedPatientId(e.target.value)}
              style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid var(--color-border)", fontSize: "0.85rem" }}
            >
              <option value="">-- Umumiy konsultatsiya (Bemor biriktirilmagan) --</option>
              {patients.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name} ({p.allergies ? `Allergiya: ${p.allergies}` : "Sog'lom"})
                </option>
              ))}
            </select>
          </div>

          {/* Xabarlar lentasi */}
          <div style={{ flex: 1, overflowY: "auto", paddingRight: 6, display: "flex", flexDirection: "column", gap: 12 }}>
            {chatMessages.map((msg, idx) => {
              const isUser = msg.role === "user";
              return (
                <div
                  key={idx}
                  style={{
                    display: "flex",
                    justifyContent: isUser ? "flex-end" : "flex-start",
                  }}
                >
                  <div
                    style={{
                      maxWidth: "80%",
                      padding: "10px 14px",
                      borderRadius: 12,
                      background: isUser ? "#2563eb" : "#f1f5f9",
                      color: isUser ? "#ffffff" : "#0f172a",
                      fontSize: "0.9rem",
                      lineHeight: 1.5,
                      whiteSpace: "pre-wrap",
                      boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
                    }}
                  >
                    {!isUser && <div style={{ fontWeight: "bold", fontSize: "0.75rem", color: "#6366f1", marginBottom: 4 }}>🤖 Gemini AI Stomatolog</div>}
                    {msg.text}
                  </div>
                </div>
              );
            })}

            {chatLoading && (
              <div style={{ display: "flex", justifyContent: "flex-start" }}>
                <div style={{ padding: "10px 14px", borderRadius: 12, background: "#f1f5f9", fontSize: "0.85rem", display: "flex", alignItems: "center", gap: 8 }}>
                  <span className="spinner" style={{ width: 14, height: 14 }} />
                  <span>Gemini javob tayyorlamoqda...</span>
                </div>
              </div>
            )}
            <div ref={chatBottomRef} />
          </div>

          {/* Tezkor namunaviy savollar */}
          <div style={{ paddingTop: 10, borderTop: "1px solid var(--color-border)", marginTop: 10 }}>
            <div style={{ fontSize: "0.75rem", fontWeight: "bold", color: "var(--color-muted)", marginBottom: 6 }}>
              {t("ai_ask_examples")}
            </div>
            <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 6 }}>
              {[
                t("ai_ex1"),
                t("ai_ex2"),
                t("ai_ex3"),
              ].map((ex, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => sendChatMessage(ex)}
                  style={{
                    background: "#f8fafc",
                    border: "1px solid #e2e8f0",
                    borderRadius: 14,
                    padding: "4px 10px",
                    fontSize: "0.75rem",
                    whiteSpace: "nowrap",
                    cursor: "pointer",
                  }}
                >
                  💡 {ex}
                </button>
              ))}
            </div>

            {/* Input form */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                sendChatMessage();
              }}
              style={{ display: "flex", gap: 8, marginTop: 6 }}
            >
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder={t("ai_chat_placeholder")}
                disabled={chatLoading}
                style={{ flex: 1, padding: "10px 14px", borderRadius: 8, border: "1px solid var(--color-border)" }}
              />
              <button
                type="submit"
                className="btn"
                disabled={chatLoading || !chatInput.trim()}
                style={{ padding: "0 20px" }}
              >
                {t("ai_chat_send")} ➔
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
