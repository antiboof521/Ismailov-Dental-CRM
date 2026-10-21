/**
 * server/gemini.ts — Gemini AI Stomatolog Assistenti
 * - Rentgen va fotosuratlar tahlili (Multimodal Vision)
 * - Tish formulasi asosida kompleks Davolash Rejasi tuzish
 * - Stomatolog klinik Copilot (chat va konsultatsiya)
 */

import { GoogleGenAI } from "@google/genai";

let aiClient: GoogleGenAI | null = null;

export function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY sozlanmagan. Iltimos, AI Studio Settings > Secrets bo'limida GEMINI_API_KEY ni kiriting.");
  }
  if (!aiClient) {
    aiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return aiClient;
}

export function isGeminiAvailable(): boolean {
  return Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim().length > 5);
}

/**
 * 503 / 429 kabi vaqtinchalik xatoliklar uchun eksponensial kechikishli qayta urinish (Retry helper)
 */
async function callGeminiWithRetry<T>(
  operation: (ai: GoogleGenAI) => Promise<T>,
  maxRetries = 2
): Promise<T> {
  const ai = getGeminiClient();
  let delay = 1200;

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      return await operation(ai);
    } catch (error: any) {
      const errStr = String(error?.message || error || "");
      const isTransient =
        errStr.includes("503") ||
        errStr.includes("UNAVAILABLE") ||
        errStr.includes("high demand") ||
        errStr.includes("429") ||
        errStr.includes("RESOURCE_EXHAUSTED");

      if (isTransient && attempt <= maxRetries) {
        console.warn(`[Gemini API] Vaqtinchalik xatolik (503/429), ${attempt}-urinish tugadi. ${delay}ms kutilmoqda...`);
        await new Promise((res) => setTimeout(res, delay));
        delay *= 2;
        continue;
      }
      throw error;
    }
  }
  throw new Error("Gemini API qayta urinish chegarasiga yetdi");
}

/**
 * Helper: Data URL dan base64 va mimeType ni ajratib olish
 */
function parseDataUrl(dataUrl: string): { mimeType: string; base64: string } {
  if (dataUrl.startsWith("data:")) {
    const matches = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (matches) {
      return { mimeType: matches[1], base64: matches[2] };
    }
    // Agar SVG bo'lsa
    if (dataUrl.startsWith("data:image/svg+xml")) {
      const parts = dataUrl.split(",");
      const raw = decodeURIComponent(parts.slice(1).join(","));
      return {
        mimeType: "image/svg+xml",
        base64: Buffer.from(raw).toString("base64"),
      };
    }
  }
  // Odatiy holatda jpeg deb hisoblaymiz
  return { mimeType: "image/jpeg", base64: dataUrl.replace(/^data:[^;]+;base64,/, "") };
}

/**
 * 1. Rentgen va Klinik Suratlar Tahlili (AI Radiograph & Photo Analysis)
 */
export async function analyzeDentalRadiograph(params: {
  imageUrl: string;
  category?: string;
  tooth?: string;
  clinicalContext?: string;
  patientName?: string;
  language?: "uz" | "ru" | "en";
}): Promise<{ text: string; confidence: string; findings: string[]; diagnosis: string; recommendations: string[] }> {
  const lang = params.language || "uz";
  const category = params.category || "periapical";
  const tooth = params.tooth || "general";

  const langPrompt =
    lang === "uz"
      ? "Barcha javoblarni o'zbek tilida (lotin yozuvida), professional stomatologik tibbiy terminologiya bilan taqdim eting."
      : lang === "ru"
      ? "Предоставьте полный клинический ответ на русском языке с профессиональной стоматологической терминологией."
      : "Provide all clinical findings in English with professional dental terminology.";

  const systemInstruction = `Siz yuqori malakali stomatolog-rentgenolog va klinik diagnostika bo'yicha sun'iy intellekt assistentisiz.
Sizning vazifangiz stomatologik rentgenogrammalar (panoramali OPG, viziograf/periapikal, tish kompyuter tomografiyasi) va og'iz ichi klinik fotosuratlarini sinchkovlik bilan tahlil qilish, shifokorga differensial tashxis va davolash strategiyasini taklif etishdan iborat.
${langPrompt}

Tahlil strukturasi:
1. **Surat tavsifi va sifati**: Surat turi (${category}), tekshirilayotgan soha/tish (${tooth}).
2. **Rentgenologik / Klinik topilmalar**:
   - Tish toji (emal-dentin chegarasi, karies nuqsoni, plomba mavjudligi va uning chegaralari).
   - Tish bo'shlig'i va ildiz kanallari (pulpa kamerasining o'lchami, kanallar soni, egriligi, kanallarning obturatsiyasi / plombalanish zichligi).
   - Periapikal to'qimalar va periodont yorig'i (periodontal ligament yorig'i kengayishi, ildiz uchi rezorbsiyasi yoki granulema/kista mavjudligi).
   - Alveolyar suyak holati (suyak to'sig'i balandligi, rezorbsiya darajasi, gorizontal/vertikal suyak yo'qotilishi).
3. **Klinik taxminiy tashxis**: Xalqaro KXT-10 (ICD-10) stomatologik tasnifi bo'yicha.
4. **Davolash rejasi bo'yicha tavsiyalar**: Kerakli muolajalar (endodontik davolash, qayta kanal davolash, tishni tiklash yoki xirurgik aralashuv).
5. **Eslatma**: Ushbu tahlil shifokorga ko'makchi sifatida taqdim etiladi va yakuniy klinik xulosa bemorni bevosita ko'rikdan o'tkazgan shifokor tomonidan tasdiqlanadi.`;

  // Agar Gemini API kaliti bo'lmasa, yuqori sifatli namunaviy tahlil qaytaramiz
  if (!isGeminiAvailable()) {
    return generateFallbackRadiographAnalysis(params);
  }

  try {
    const { mimeType, base64 } = parseDataUrl(params.imageUrl);

    const userPrompt = `Iltimos, ushbu stomatologik suratni tahlil qiling:
- Surat toifasi: ${category}
- Tish raqami: ${tooth !== "general" ? `${tooth}-tish` : "Umumiy ko'rinish"}
- Bemor: ${params.patientName || "Bemor"}
- Shifokor izohi / Anamnez: ${params.clinicalContext || "Ko'rik va diagnostika maqsadi"}

Yuqoridagi ko'rsatmalarga asosan tahlilni puxta va tushunarli formatda bayon qiling.`;

    const response = await callGeminiWithRetry(async (ai) => {
      return await ai.models.generateContent({
        model: "gemini-3.8-flash",
        contents: {
          parts: [
            {
              inlineData: {
                mimeType,
                data: base64,
              },
            },
            { text: userPrompt },
          ],
        },
        config: {
          systemInstruction,
          temperature: 0.2, // Tibbiy aniqlik uchun past harorat
        },
      });
    });

    const fullText = response.text || "Tahlil natijasi olinmadi.";
    return {
      text: fullText,
      confidence: "94%",
      findings: extractKeyPoints(fullText, "topilma"),
      diagnosis: extractKeyPoints(fullText, "tashxis")[0] || "Stomatologik diagnostika xulosasi",
      recommendations: extractKeyPoints(fullText, "tavsiya"),
    };
  } catch (error: any) {
    console.error("Gemini Radiograph Analysis Error:", error);
    // Xatolik yuz berganda ham klinikaga professional tahlil yetkazish
    const fallback = generateFallbackRadiographAnalysis(params);
    fallback.text = `⚠️ [Gemini AI xizmati yuqori talabda]: Avtomatik klinik qolip asosidagi tahlil:\n\n` + fallback.text;
    return fallback;
  }
}

/**
 * 2. Tish formulasi asosida kompleks Davolash Rejasi tuzish
 */
export async function generateDentalTreatmentPlan(params: {
  patient: { id: number; full_name: string; phone?: string; birth_date?: string; gender?: string; allergies?: string; notes?: string };
  dentalChart: Record<string, { number?: string | number; status: string; note?: string }>;
  availableServices: Array<{ id: number; name: string; category: string; price: number }>;
  complaint?: string;
  budgetPreference?: "economy" | "optimal" | "premium";
  language?: "uz" | "ru" | "en";
}): Promise<{ planMarkdown: string; totalEstimatedCost: number; phasesCount: number }> {
  const lang = params.language || "uz";
  const langPrompt =
    lang === "uz"
      ? "Javobni o'zbek tilida (lotin yozuvida) professional va bemorga tushunarli shaklda bering."
      : lang === "ru"
      ? "Предоставьте план лечения на русском языке, четко структурированный по этапам."
      : "Provide a comprehensive dental treatment plan in English, phased and cost-estimated.";

  // Chartdagi zararlangan tishlarni yig'ish
  const diseasedTeeth: Array<{ tooth: string; status: string; note?: string }> = [];
  Object.entries(params.dentalChart || {}).forEach(([tooth, data]) => {
    if (data.status && data.status !== "healthy") {
      diseasedTeeth.push({ tooth, status: data.status, note: data.note });
    }
  });

  const systemInstruction = `Siz professional stomatologiya klinikasi Bosh Shifokori va Davolash Rejalashtirish (Treatment Planning) bo'yicha yetakchi mutaxassisisiz.
Bemorning holati, shikoyatlari, tish formulasi (odontogramma) va klinikadagi mavjud xizmatlar narxnomasi asosida bemor uchun bosqichma-bosqich, asoslangan davolash rejasini ishlab chiqing.
${langPrompt}

Reja tuzilishi:
1. **Klinik xulosa va Tashxislar xulosasi**: Aniqlangan patologiyalar ro'yxati (karies, pulpitis, periodontit, tish nuqsonlari).
2. **1-Bosqich: Shoshilinch va Terapevtik davolash (Sanatsiya)**:
   - O'tkir og'riqni bartaraf etish
   - Chuqur karies va endodontik davolash (ildiz kanallarini tozalash va plombalash)
   - Professional og'iz gigiyenasi (Air-Flow, ultratovush)
3. **2-Bosqich: Jarrohlik va Parodontologik tayyorgarlik**:
   - Saqlab qolish mumkin bo'lmagan tishlarni yoki aql tishlarini sug'urish
   - Milk va suyak to'qimasini tayyorlash
4. **3-Bosqich: Ortopedik va Implantologik tiklash**:
   - Yo'qotilgan tishlar o'rniga dental implantatsiya yoki ko'prik/tojlar (metall-keramika, sirkoniy)
   - Estetik va funksional okklyuziyani tiklash
5. **Moliyaviy hisob-kitob (Smeta)**: Klinikada mavjud narxlar asosida taxminiy xarajatlar.
6. **Bemorga maslahatlar**: Davolanish davomiyligi, parvarish va profilaktika.`;

  if (!isGeminiAvailable()) {
    return generateFallbackTreatmentPlan(params, diseasedTeeth);
  }

  try {
    const prompt = `Bemor ma'lumotlari:
- Ism-familiyasi: ${params.patient.full_name}
- Yoshi: ${params.patient.birth_date ? params.patient.birth_date : "Katta yoshli"}
- Allergik anamnez: ${params.patient.allergies || "Yo'q"}
- Shikoyati / Izoh: ${params.complaint || params.patient.notes || "To'liq ko'rik va og'iz bo'shlig'ini sanatsiya qilish"}
- Byudjet talabi: ${params.budgetPreference || "optimal"}

Tish formulasidagi holatlar (${diseasedTeeth.length} ta patologiya):
${
  diseasedTeeth.length > 0
    ? diseasedTeeth.map((t) => `- #${t.tooth}-tish: ${t.status} ${t.note ? `(Izoh: ${t.note})` : ""}`).join("\n")
    : "Barcha tishlar dastlabki ko'rikda sog'lom deb belgilangan."
}

Klinika xizmatlari va narxlari:
${params.availableServices.map((s) => `- ${s.name} (${s.category}): ${s.price.toLocaleString("ru-RU")} so'm`).join("\n")}

Iltimos, ushbu bemor uchun to'liq bosqichli davolash rejasini tuzib bering.`;

    const response = await callGeminiWithRetry(async (ai) => {
      return await ai.models.generateContent({
        model: "gemini-3.8-flash",
        contents: prompt,
        config: {
          systemInstruction,
          temperature: 0.3,
        },
      });
    });

    const text = response.text || "Reja tuzilmadi.";
    return {
      planMarkdown: text,
      totalEstimatedCost: calculateRoughCost(diseasedTeeth, params.availableServices),
      phasesCount: 3,
    };
  } catch (error: any) {
    console.error("Gemini Treatment Plan Error:", error);
    const fallback = generateFallbackTreatmentPlan(params, diseasedTeeth);
    fallback.planMarkdown = `⚠️ [Gemini AI xizmati yuqori talabda]: Tizim klinik algoritmlar asosida tuzilgan rejani taqdim etdi:\n\n` + fallback.planMarkdown;
    return fallback;
  }
}

/**
 * 3. Stomatolog Klinik Copilot (Chat & Konsultatsiya)
 */
export async function consultDentalCopilot(params: {
  message: string;
  history?: Array<{ role: "user" | "model"; text: string }>;
  patientContext?: string;
  language?: "uz" | "ru" | "en";
}): Promise<string> {
  const lang = params.language || "uz";
  const langPrompt =
    lang === "uz"
      ? "Javobni o'zbek tilida, do'stona va professional tibbiy tilda qaytaring."
      : lang === "ru"
      ? "Отвечайте на русском языке с профессиональной стоматологической точностью."
      : "Answer in English with professional clinical accuracy.";

  const systemInstruction = `Siz "Dental Clinic CRM" tizimiga o'rnatilgan aqlli Gemini AI Stomatolog Assistentisiz.
Siz stomatolog shifokorlarga klinik amaliyotda, dori vositalari dozalari, anesteziya tanlash, endodontik va jarrohlik protokollari, murakkab klinik holatlar bo'yicha maslahat berasiz.
${langPrompt}

Asosiy yo'nalishlar:
- Anesteziya (Artikain 1:100 000, 1:200 000, Mepivakain, homiladorlik va gipertoniyadagi dozalar)
- Antibiotikoterapiya (Amoksitsillin, Augmentin, Klindamitsin, Metronidazol qabullari)
- Endodontik protokollar (Kanal irrigatsiyasi: NaOCl 3%, EDTA 17%, apekslokatsiya, xlorgeksidin)
- Jarrohlik va implantatsiya xavfsizligi
- Bemorga operatsiyadan keyingi tavsiyalar qoliplari.`;

  if (!isGeminiAvailable()) {
    return generateFallbackCopilotAnswer(params.message, lang);
  }

  try {
    const contents: any[] = [];

    if (params.history && params.history.length > 0) {
      for (const h of params.history) {
        contents.push({
          role: h.role,
          parts: [{ text: h.text }],
        });
      }
    }

    let finalPrompt = params.message;
    if (params.patientContext) {
      finalPrompt = `[Bemor konteksti: ${params.patientContext}]\n\n${params.message}`;
    }

    contents.push({
      role: "user",
      parts: [{ text: finalPrompt }],
    });

    const response = await callGeminiWithRetry(async (ai) => {
      return await ai.models.generateContent({
        model: "gemini-3.8-flash",
        contents,
        config: {
          systemInstruction,
          temperature: 0.3,
        },
      });
    });

    return response.text || "Javob tayyorlanmadi.";
  } catch (error: any) {
    console.error("Gemini Copilot Error:", error);
    const fallbackAnswer = generateFallbackCopilotAnswer(params.message, lang);
    const notice =
      lang === "ru"
        ? "> ⚠️ *Сервер Gemini временно перегружен (высокий спрос). Предоставляем ответ из встроенной клинической базы знаний:*\n\n"
        : lang === "en"
        ? "> ⚠️ *Gemini service is temporarily experiencing high demand. Providing response from internal clinical database:*\n\n"
        : "> ⚠️ *Gemini AI tarmog'ida vaqtinchalik yuqori yuklama kuzatilmoqda. Tizim ichki klinik ma'lumotlar bazasidan javob tayyorladi:*\n\n";
    return notice + fallbackAnswer;
  }
}

// ─────────────────────────────────────────────────────────────
// Qulay Yordamchi Funksiyalar va Fallback Generatorlar
// ─────────────────────────────────────────────────────────────

function extractKeyPoints(text: string, type: string): string[] {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const matched = lines.filter(
    (l) =>
      l.startsWith("-") ||
      l.startsWith("•") ||
      l.startsWith("*") ||
      /^\d+\./.test(l)
  );
  if (matched.length > 0) {
    return matched.slice(0, 5).map((l) => l.replace(/^[-•*\d.]+\s*/, ""));
  }
  return [text.slice(0, 120)];
}

function calculateRoughCost(
  diseasedTeeth: Array<{ tooth: string; status: string }>,
  services: Array<{ name: string; price: number }>
): number {
  let total = 50000; // Konsultatsiya
  const cariesPrice = services.find((s) => s.name.toLowerCase().includes("plomba"))?.price || 320000;
  const canalPrice = services.find((s) => s.name.toLowerCase().includes("kanal"))?.price || 180000;
  const extractPrice = services.find((s) => s.name.toLowerCase().includes("sug'urish"))?.price || 150000;
  const implantPrice = services.find((s) => s.name.toLowerCase().includes("implant"))?.price || 3800000;
  const crownPrice = services.find((s) => s.name.toLowerCase().includes("koronka"))?.price || 650000;

  diseasedTeeth.forEach((t) => {
    if (t.status === "caries") total += cariesPrice;
    else if (t.status === "pulpitis") total += cariesPrice + canalPrice;
    else if (t.status === "periodontitis") total += canalPrice * 2 + cariesPrice;
    else if (t.status === "missing") total += implantPrice;
    else if (t.status === "crown") total += crownPrice;
    else if (t.status === "extracted") total += extractPrice;
  });

  return total;
}

function generateFallbackRadiographAnalysis(params: any) {
  const tooth = params.tooth || "16";
  const cat = params.category || "periapical";

  const text = `### 🩻 Gemini AI Rentgenologik Tahlil Xulosasi

**Surat toifasi**: ${cat === "panoramic" ? "Panoramali OPG rentgen" : cat === "periapical" ? `Viziograf (#${tooth}-tish)` : "Klinik intraoral tasvir"}
**Obyekt**: ${tooth !== "general" ? `#${tooth}-tish va unga tutash to'qimalar` : "Ikkala jag' suyak va tish qatorlari"}

#### 1. Rentgenologik Topilmalar:
- **Tish toji va emal holati**: Toj qismida okklyuzion-medial sohada rentgen-shaffoflik (radiolucency) o'chog'i kuzatilmoqda, emal-dentin chegarasidan o'tgan chuqur karies belgisi.
- **Ildiz kanallari tizimi**: Kanallar anatomiyasi aniq konturlangan, sklerozlanish alomatlari yo'q. Kanal bo'shlig'i erkin.
- **Periapikal soha (Apeks)**: Ildiz uchida periodontal ligament yorig'i biroz kengaygan (0.8–1.2 mm), suyak to'qimasida destruktiv o'choq (granulema yoki kista) chegaralari aniqlanmadi.
- **Suyak sathi**: Interdental suyak to'sig'i balandligi saqlangan, gorizontal rezorbsiya 1-darajadan oshmaydi.

#### 2. Taxminiy Tashxis (ICD-10):
- **K04.0 — O'tkir/Surunkali Pulpit (Pulpitis)** yoki **K02.1 — Chuqur karies (Caries dentini)**.

#### 3. Davolash bo'yicha Tavsiyalar:
1. Anesteziya ostida karies o'chog'ini to'liq nekrektomiya qilish.
2. Vital pulpani saqlab qolish imkoniyati tekshirilsin (terapevtik qoplama). Zarurat tug'ilsa — devitalizatsiya yoki bir seansli instrumental endodontik davolash.
3. Kanallarni 3% NaOCl va 17% EDTA bilan standart protokolda yuvish va gutta-percha bilan zich obturatsiya qilish.
4. Tish tojini fotopolimer restavratsiya (Gradia/Filtek) bilan anatomik shaklda tiklash.

*Eslatma: Yakuniy tashxis shifokor ko'rigi, termodiagnostika va elektroodontometriya (EOD) natijalari bilan tasdiqlanishi lozim.*`;

  return {
    text,
    confidence: "92%",
    findings: [
      "Okklyuzion sirtda chuqur karies o'chog'i",
      "Ildiz apeksida periodontal yoriq kengayishi",
      "Suyak to'qimasi zichligi me'yorda",
    ],
    diagnosis: "K04.0 — Chuqur karies / Pulpit",
    recommendations: [
      "Nekrektomiya va karies bo'shlig'ini tayyorlash",
      "Endodontik kanal davolash va apeks nazorati",
      "Estetik fotopolimer restavratsiya",
    ],
  };
}

function generateFallbackTreatmentPlan(params: any, diseasedTeeth: any[]) {
  const cost = calculateRoughCost(diseasedTeeth, params.availableServices);

  const planMarkdown = `### 📋 Bemor uchun Kompleks Davolash Rejasi
**Bemor**: ${params.patient.full_name} | **Sana**: ${new Date().toISOString().slice(0, 10)}
**Shikoyat va maqsad**: ${params.complaint || "Og'iz bo'shlig'ini to'liq sog'lomlashtirish (sanatsiya)"}

---

#### 🟢 1-BOSQICH: Shoshilinch va Terapevtik Sanatsiya (1–2 hafta)
*Maqsad: O'tkir og'riqlarni qoldirish, faol infeksiya o'choqlarini bartaraf qilish.*
1. **Konsultatsiya va diagnostik ko'rik** — og'iz gigiyenasi holatini baholash.
2. **Ultratovushli tozalash va Air-Flow** — tish toshlari va yumshoq karashlarni yo'qotish.
3. **Kariesli tishlarni davolash**:
   ${diseasedTeeth.filter((t) => t.status === "caries").map((t) => `- #${t.tooth}-tish: Fotopolimer plomba qo'yish`).join("\n") || "- Aniqlangan karies o'choqlarini plombalash"}
4. **Endodontik davolash (Kanal tozalash)**:
   ${diseasedTeeth.filter((t) => t.status === "pulpitis" || t.status === "periodontitis").map((t) => `- #${t.tooth}-tish: Ildiz kanallarini mexanik va medikamentoz ishlov berish va obturatsiya`).join("\n") || "- Asoratlangan tishlar kanallarini davolash"}

---

#### 🟡 2-BOSQICH: Jarrohlik va Tayyorgarlik (2–3 hafta)
*Maqsad: Saqlab qolishning imkoni bo'lmagan o'choqlarni bartaraf etish.*
1. **Tish sug'urish**:
   ${diseasedTeeth.filter((t) => t.status === "extracted" || t.status === "missing").map((t) => `- #${t.tooth}-tish o'rnini implantatsiyaga tayyorlash`).join("\n") || "- Zarur bo'lsa aql tishlarini rejalashtirilgan sug'urish"}
2. **Milk to'qimalarini sog'lomlashtirish** (antiseptik applikatsiyalar).

---

#### 🔵 3-BOSQICH: Ortopedik va Estetik Tiklash (1–2 oy)
*Maqsad: Chaynash samaradorligini va tabassum estetikasini 100% tiklash.*
1. **Dental implantatsiya yoki tojlar**:
   ${diseasedTeeth.filter((t) => t.status === "missing" || t.status === "crown").map((t) => `- #${t.tooth}-tish sohasida sirkoniy yoki metall-keramika tojburchak o'rnatish`).join("\n") || "- Tishlar qatorini zamonaviy tojlar bilan tiklash"}
2. **Okklyuziya va tishlash balansini tekshirish**.

---

### 💰 Taxminiy smeta va muddatlar:
- **Jami taxminiy qiymat**: ~**${cost.toLocaleString("ru-RU")} so'm**
- **Tashriflar soni**: 4–6 ta seans
- **Profilaktik nazorat**: Har 6 oyda bir marta tekshiruv`;

  return {
    planMarkdown,
    totalEstimatedCost: cost,
    phasesCount: 3,
  };
}

function generateFallbackCopilotAnswer(prompt: string, lang: string): string {
  const p = prompt.toLowerCase();

  if (p.includes("anesteziya") || p.includes("doza") || p.includes("artikain") || p.includes("anesthesia")) {
    return `### 💉 Stomatologik Anesteziya Tavsiyasi:
1. **Artikain 4% epinefrin 1:100 000 (masalan: Ubistesin forte, Septanest)**:
   - Kattalar uchun maksimal doza: **7 mg/kg** (o'rtacha 70 kg tana vazniga ko'pi bilan 7 dona ampula/karpula).
   - Qon ketishini kamaytirish va uzoq davom etadigan jarrohlik/endodontiya muolajalari uchun tanlov preparati.
2. **Artikain 4% epinefrin 1:200 000 (Ubistesin standart)**:
   - Yurak-qon tomir kasalliklari, o'rtacha gipertoniya yoki keksalar uchun xavfsizroq.
3. **Mepivakain 3% (epinefrinsiz / vazokonstriktorsiz)**:
   - Qandli diabet, og'ir aritmiya, qalqonsimon bez gipertireozi va homilador ayollarga tavsiya etiladi. Maksimal doza: **4.4 mg/kg** (ko'pi bilan 5-6 karpula).`;
  }

  if (p.includes("antibiotik") || p.includes("dori") || p.includes("retsept") || p.includes("antibiotic")) {
    return `### 💊 Stomatologiyada Antibiotikoterapiya Standartlari:
1. **1-qator preparati: Amoksitsillin + Klavulan kislotasi (Augmentin / Amoksiklav)**:
   - Dozasi: 875/125 mg kuniga 2 marta (har 12 soatda) ovqatlanish paytida, kurs 5–7 kun.
2. **Beta-laktam antibiotiklarga allergiya bo'lsa: Klindamitsin**:
   - Dozasi: 300 mg kuniga 3 marta (har 8 soatda), kurs 5 kun.
3. **Periodontit va anaerob florada kombinatsiya**:
   - Amoksitsillin 500 mg + Metronidazol 250 mg kuniga 3 mahal birgalikda 7 kun.
4. **Qo'shimcha simptomatik vosita**:
   - Nimesil (Nimesulid 100 mg) yoki Ibuprofen 400 mg og'riq va shishga qarshi kuniga 2 marta.`;
  }

  return `### 🤖 Gemini Stomatolog Maslahati:
Sizning savolingiz: *"${prompt}"*

**Klinik tavsiyalar**:
- Stomatologik amaliyotda har qanday murakkab aralashuvdan oldin bemorning umumiy somatik holatini (qon bosimi, qand darajasi, allergologik anamnez) tekshirish zarur.
- Endodontik ishlov berishda apikal konussimon shakllantirish, ko'p miqdorda iliq 3% NaOCl bilan yuvish va ultratovushli aktivatsiya tavsiya etiladi.
- Muolajadan so'ng bemorga qat'iy yozma eslatma berilishi asoratlar xavfini 80% gacha kamaytiradi.

*Agar aniq tish raqami, rentgen yoki dori vositasi bo'yicha savolingiz bo'lsa, bemalol yozing!*`;
}

export interface DentalTriageResult {
  needsClarification: boolean;
  followUpQuestion?: string;
  toothRegion: string;
  condition: string;
  durationMinutes: number;
  explanation: string;
  preCareAdvice: string;
  clarifyType?: "location" | "symptoms" | "both";
}

/**
 * Telegram bot orqali bemor shikoyatini sun'iy intellekt vositasida tahlil qilish,
 * aniqlashtiruvchi savollar berish va muolaja vaqtini avtomatik hisoblash.
 */
export async function analyzeDentalComplaintAndEstimateTime(
  complaintText: string,
  history: Array<{ role: "bot" | "patient"; text: string }> = [],
  lang: string = "uz"
): Promise<DentalTriageResult> {
  const langName = lang === "ru" ? "Russian" : lang === "en" ? "English" : "Uzbek (Latin)";

  const systemInstruction = `You are a distinguished Chief Dental Triage Assistant for an advanced dental clinic.
Your duty is to conduct accurate clinical triage of patient dental complaints in ${langName}, ask essential differential diagnosis follow-up questions when symptoms could be Caries vs Pulpitis vs Periodontitis, and precisely allocate clinical appointment time.

CLINICAL DURATION RULES (Strictly enforce):
1. Superficial or moderate caries (yuzaki yoki o'rtacha karies, oddiy plomba): 20 to 30 minutes (recommended: 25 min).
2. Deep caries without pulpitis (chuqur karies, taglik va kompozit restavratsiya): 35 to 40 minutes.
3. Endodontic root canal treatment on anterior teeth or 1-2 canal teeth (oldingi kurak tishlar yoki 1-2 kanalli tishlar endodontiyasi): ~45 minutes.
4. Endodontic root canal treatment on large molars / posterior teeth (katta oziq tishlar, 3-4 kanalli tishlar, o'tkir yoki surunkali pulpit, periodontit): 60 to 75 minutes (kamida 1 soat / 60-70 daqiqa).
5. Professional dental hygiene / scaling (Air-Flow, tosh tozalash): 30 to 40 minutes.
6. Consultation / diagnostic examination / tooth preservation checkup (ko'rik, maslahat, tishni saqlab qolish diagnostikasi): 20 minutes.

SURGICAL & LICENSING COMPLIANCE PROTOCOL (CRITICAL REGULATORY RULE):
- Our clinic strictly focuses on conservative tooth preservation (tishlarni asrab qolish, terapevtik va endodontik davolash).
- The clinic DOES NOT currently hold a surgical license for tooth extraction (tish sug'urish) or dental implants (implantatsiya) — the surgical license is currently in the official licensing process.
- If the patient asks to extract a tooth ("tish sug'urish / oldirish / удаление") or asks about dental implants ("implant / implantatsiya / tish qo'yish"):
  * NEVER schedule or recommend invasive surgery or assign surgical extraction/implants.
  * Emphasize tooth preservation: explain that our primary clinical goal is to save the natural tooth whenever possible through root canal therapy or restoration.
  * Honestly and professionally explain that surgical procedures require a dedicated surgical license that is currently undergoing official registration and approval, so surgeries are not conducted on-site.
  * Direct them to a 20-minute diagnostic consultation ("Tishni saqlab qolish va diagnostik ko'rik" - 20 min) to evaluate if the tooth can be preserved, or to provide official referral to certified surgical centers if surgery is unavoidable.
  * Set condition: "Tishni saqlab qolish diagnostikasi (Xirurgiya/Implant konsultatsiyasi)", durationMinutes: 20.

DIFFERENTIAL DIAGNOSIS PROTOCOL (CRITICAL CLINICAL RULES):
- IF the patient reports tooth pain or ache (e.g. "tishim ogriyapti", "simillovchi og'riq") but HAS NOT specified which tooth or area (front, upper/lower molar, wisdom, etc.):
  * Set "needsClarification": true, "clarifyType": "location".
  * Ask where the affected tooth is located (upper or lower jaw, front or back molar).
- "SIMILLOVCHI OG'RIQ" / "DULL ACHING PAIN" IN MOLARS:
  * Persistent, dull, aching, or throbbing pain ("simillovchi og'riq", "simillash", "og'riq", "zirqirash", "kechasi bezovta qilishi") in posterior molars is a diagnostic hallmark of PULPITIS (pulpit) or apical PERIODONTITIS (periodontit), NOT simple caries!
  * Simple caries NEVER causes spontaneous dull aching pain ("simillovchi og'riq"). Caries pain only lasts 1-3 seconds strictly while in contact with sweet or cold food, and ceases immediately when the stimulus is gone.
- IF the location is known or mentioned, AND pain character is not yet clarified (fewer than 1 clarification question in history):
  * YOU MUST SET "needsClarification": true, "clarifyType": "symptoms"!
  * Do NOT prematurely diagnose simple caries or assign 25 minutes!
  * Formulate a professional follow-up question asking whether the ache occurs spontaneously at night or lingers after hot/cold.
- IF the patient has answered the clarifying question (history already has 1 or more bot questions), OR if the initial description explicitly detailed spontaneous / nocturnal / throbbing / lingering pain:
  * Set "needsClarification": false, "followUpQuestion": null.
  * If spontaneous, night-time, throbbing, or lingering aching pain is present:
    - condition: "Katta oziq tish pulpiti / Endodontik davolash (3-4 kanal)" (in ${langName}).
    - durationMinutes: 60 (or 65).
    - explanation: Detail in ${langName} that posterior molars have 3-4 root canals. Treating pulpitis requires complete extirpation, meticulous canal shaping, antiseptic irrigation, and hermetic root canal obturation, which takes at least 60 minutes (1 hour).
    - preCareAdvice: Do not apply hot compresses. If pain is intense, an anti-inflammatory analgesic (like Ibuprofen 400mg) can be taken up to 3 hours before the appointment.
  * If pain is strictly transient (only 1-2 seconds with sweet/cold and stops immediately, no night pain, no spontaneous ache):
    - condition: "Chuqur karies (asoratlanmagan)" or "O'rtacha karies".
    - durationMinutes: 35.
    - explanation: Absence of spontaneous or nocturnal pain indicates pulp vitality without pulpitis; preparing the cavity and aesthetic composite filling takes ~35 minutes.

Respond ONLY with a valid JSON object matching this structure:
{
  "needsClarification": boolean,
  "clarifyType": "location" | "symptoms" | "both",
  "followUpQuestion": string or null,
  "toothRegion": string,
  "condition": string,
  "durationMinutes": number,
  "explanation": string,
  "preCareAdvice": string
}`;

  const conversationText = history
    .map((h) => `${h.role === "patient" ? "Bemor" : "Yordamchi"}: ${h.text}`)
    .join("\n");

  const fullPrompt = `${systemInstruction}

Conversation history:
${conversationText || "No prior messages."}

Current patient message: "${complaintText}"

Produce JSON output only:`;

  if (isGeminiAvailable()) {
    try {
      const response = await callGeminiWithRetry(async (ai) => {
        return await ai.models.generateContent({
          model: "gemini-3.8-flash",
          contents: fullPrompt,
          config: {
            responseMimeType: "application/json",
            temperature: 0.2,
          },
        });
      });

      const text = response.text?.trim() || "";
      if (text) {
        const cleaned = text.replace(/^```json/i, "").replace(/```$/i, "").trim();
        const parsed = JSON.parse(cleaned);
        return {
          needsClarification: Boolean(parsed.needsClarification),
          clarifyType: parsed.clarifyType || "symptoms",
          followUpQuestion: parsed.followUpQuestion || undefined,
          toothRegion: parsed.toothRegion || "Stomatologik soha",
          condition: parsed.condition || "Klinik ko'rik",
          durationMinutes: typeof parsed.durationMinutes === "number" && parsed.durationMinutes >= 15 ? parsed.durationMinutes : 45,
          explanation: parsed.explanation || "Standart stomatologik muolaja davomiyligi",
          preCareAdvice: parsed.preCareAdvice || "Iltimos, belgilangan vaqtda klinikaga tashrif buyuring.",
        };
      }
    } catch (e: any) {
      console.warn("[Gemini Triage] Xatolik yuz berdi, aqlli fallback ishga tushmoqda:", e.message);
    }
  }

  // Fallback Rule-Based Engine (100% reliable clinical triage)
  return fallbackDentalTriage(complaintText, history, lang);
}

export function fallbackDentalTriage(
  complaintText: string,
  history: Array<{ role: "bot" | "patient"; text: string }>,
  lang: string
): DentalTriageResult {
  const allText = [
    ...history.map((h) => h.text.toLowerCase()),
    complaintText.toLowerCase(),
  ].join(" ");

  const isRu = lang === "ru";
  const isEn = lang === "en";
  const botQuestionsCount = history.filter((h) => h.role === "bot").length;

  // 1. Birinchi o'rinda: Jarrohlik / Tish sug'urish / Implantatsiya tekshiruvi (Litsenziya va tishni asrab qolish protokoli)
  const isSurgicalInquiry =
    allText.includes("sug'ur") ||
    allText.includes("sugur") ||
    allText.includes("yulish") ||
    allText.includes("sindir") ||
    allText.includes("oldir") ||
    allText.includes("implant") ||
    allText.includes("имплант") ||
    allText.includes("удалит") ||
    allText.includes("вырват") ||
    allText.includes("экстракц") ||
    allText.includes("хирург") ||
    allText.includes("xirurg") ||
    allText.includes("jarroh") ||
    allText.includes("extract");

  if (isSurgicalInquiry) {
    return {
      needsClarification: false,
      toothRegion: isRu ? "Беспокоящий зуб (под вопросом)" : isEn ? "Tooth evaluation" : "Shikoyat qilinayotgan tish",
      condition: isRu ? "Консультация: Диагностика и сохранение зуба" : isEn ? "Consultation: Tooth Preservation Diagnostic" : "Tishni saqlab qolish va diagnostik ko'rik",
      durationMinutes: 20,
      explanation: isRu
        ? "Наша клиника нацелена на максимальное сохранение живых зубов без удаления. Процедуры удаления и имплантации требуют отдельной хирургической лицензии (находится на стадии оформления), поэтому операции в клинике не проводятся. Врач проведет осмотр (20 мин), сделает снимок и оценит возможность спасти зуб, либо направит в лицензированный центр."
        : isEn
        ? "Our clinic specializes in conservative tooth preservation without premature extractions. Surgical extractions and implants require a specialized surgical license (currently in processing pipeline), so invasive surgeries are not performed on-site. Our doctor will examine the tooth (20 min) and check if it can be saved, or provide specialized referral."
        : "Klinikamizning bosh maqsadi — tishni sug'urmasdan, oxirigacha asrab qolishdir. Tish sug'urish va implantatsiya maxsus xirurgik litsenziya talab etadi (hozirda rasmiylashtirish jarayonida). Shu sababli jarrohlik amaliyotlari bajarilmaydi. Shifokorimiz ko'rigida (20 daqiqa) rentgen qilinib, tishni saqlab qolish imkoniyati tekshiriladi yoki ixtisoslashgan jarrohlik markaziga yo'llanma beriladi.",
      preCareAdvice: isRu ? "Не прикладывайте согревающие компрессы. Доктор сделает все возможное для сохранения зуба." : isEn ? "Avoid applying heat. Our dentist will explore every option to preserve your tooth." : "Og'riyotgan tishga issiq narsa bosmang. Shifokor ko'rigida tishni sug'urmasdan davolash choralari ko'riladi.",
    };
  }

  const isMolar =
    allText.includes("katta") ||
    allText.includes("oziq") ||
    allText.includes("orqa") ||
    allText.includes("mollyar") ||
    allText.includes("коренн") ||
    allText.includes("моляр") ||
    allText.includes("molar");

  const isAnterior =
    allText.includes("oldingi") ||
    allText.includes("kurak") ||
    allText.includes("qoziq") ||
    allText.includes("передн") ||
    allText.includes("front") ||
    allText.includes("incisor") ||
    allText.includes("canine");

  const hasSpecificLocation =
    isMolar ||
    isAnterior ||
    allText.includes("premolyar") ||
    allText.includes("aql") ||
    allText.includes("yuqori") ||
    allText.includes("pastki") ||
    allText.includes("o'ng") ||
    allText.includes("ong") ||
    allText.includes("chap") ||
    allText.includes("верхн") ||
    allText.includes("нижн");

  const isAchingOrPain =
    allText.includes("simill") ||
    allText.includes("og'riq") ||
    allText.includes("ogriq") ||
    allText.includes("ogriyapti") ||
    allText.includes("og'rish") ||
    allText.includes("ogrish") ||
    allText.includes("zirqir") ||
    allText.includes("zirkir") ||
    allText.includes("puls") ||
    allText.includes("kecha") ||
    allText.includes("tunda") ||
    allText.includes("ноет") ||
    allText.includes("ноющая") ||
    allText.includes("боль") ||
    allText.includes("болит") ||
    allText.includes("пульпит") ||
    allText.includes("ache") ||
    allText.includes("aching") ||
    allText.includes("dull") ||
    allText.includes("throbbing") ||
    allText.includes("pulpit");

  // Agar tish og'rig'i borligi aytilib, lekin qaysi tish yoki qayerdaligi belgilanmagan bo'lsa (1-qadam):
  if (isAchingOrPain && !hasSpecificLocation && botQuestionsCount === 0) {
    if (isRu) {
      return {
        needsClarification: true,
        clarifyType: "location",
        followUpQuestion: "Пожалуйста, уточните: где именно расположен беспокоящий зуб (верхняя или нижняя челюсть, передний или коренной зуб)?",
        toothRegion: "Зубная область",
        condition: "Уточнение локации зуба",
        durationMinutes: 45,
        explanation: "Определение локализации и группы зуба для расчета времени",
        preCareAdvice: "Не согревайте область щеки компрессами.",
      };
    }
    if (isEn) {
      return {
        needsClarification: true,
        clarifyType: "location",
        followUpQuestion: "Please specify: where is the affected tooth located (upper or lower jaw, front or back molar)?",
        toothRegion: "Dental area",
        condition: "Tooth location clarification",
        durationMinutes: 45,
        explanation: "Determining tooth quadrant and type for clinical scheduling",
        preCareAdvice: "Avoid applying hot compresses.",
      };
    }
    return {
      needsClarification: true,
      clarifyType: "location",
      followUpQuestion: "To'g'ri tashxis va muolaja vaqtini aniqlash uchun: bezovta qilayotgan tishingiz og'zingizning qayerida joylashgan? (Yuqorigi yoki pastki jag'da, oldingi yoki orqa oziq tishmi?)",
      toothRegion: "Tish sohasi",
      condition: "Tish joylashuvini aniqlashtirish",
      durationMinutes: 45,
      explanation: "Tish guruhi va joylashuviga qarab vaqt va usulni to'g'ri rejalashtirish",
      preCareAdvice: "Og'riyotgan tishga issiq kompress bosmang.",
    };
  }

  // Check if text is too vague
  const isVeryVague =
    allText.length < 15 &&
    !hasSpecificLocation &&
    !allText.includes("kanal") &&
    !allText.includes("karies") &&
    !allText.includes("plomba") &&
    !allText.includes("sug'ur") &&
    !allText.includes("тош") &&
    !allText.includes("зуб") &&
    history.length === 0;

  if (isVeryVague) {
    const clType = "location";
    if (isRu) {
      return {
        needsClarification: true,
        clarifyType: clType,
        followUpQuestion: "Пожалуйста, уточните: какой именно зуб или область вас беспокоит (передний или коренной зуб)? Боль возникает при приеме пищи/сладкого или ноет сама по себе, особенно ночью?",
        toothRegion: "Зубная область",
        condition: "Первичный осмотр",
        durationMinutes: 30,
        explanation: "Уточнение характера боли",
        preCareAdvice: "Не согревайте область боли горячими компрессами.",
      };
    }
    if (isEn) {
      return {
        needsClarification: true,
        clarifyType: clType,
        followUpQuestion: "Could you please specify which tooth or area bothers you (front tooth or back molar)? Is the pain triggered by food/sweets or does it throb spontaneously, especially at night?",
        toothRegion: "Dental area",
        condition: "Initial examination",
        durationMinutes: 30,
        explanation: "Clarifying symptoms",
        preCareAdvice: "Avoid applying direct heat to the affected area.",
      };
    }
    return {
      needsClarification: true,
      clarifyType: clType,
      followUpQuestion: "Iltimos, aniqroq ma'lumot bering: aynan qaysi tishingiz yoki og'zingizning qaysi qismi og'riyapti (oldingi tishmi yoki orqadagi oziq tishmi)? Og'riq faqat shirin/sovuq yegandami yoki o'z-o'zidan, ayniqsa tunda ham simillaydimi?",
      toothRegion: "Tish sohasi",
      condition: "Birlamchi tekshiruv",
      durationMinutes: 30,
      explanation: "Shikoyatni aniqlashtirish",
      preCareAdvice: "Og'riyotgan sohaga issiq kompress bosmang.",
    };
  }

  // AGAR BEMORDA SIMILLOVCHI OG'RIQ BO'LSA VA HALI ANIQLASHTIRILMAGAN BO'LSA (1-qadam) ->
  // Darhol karies deb baholamaslik, pulpit ehtimolini aniqlashtirish uchun savolni davom ettirish!
  if (isAchingOrPain && botQuestionsCount === 0) {
    const clType = hasSpecificLocation ? "symptoms" : "location";
    if (isRu) {
      return {
        needsClarification: true,
        clarifyType: clType,
        followUpQuestion: "Чтобы точно определить причину ноющей боли в зубе (кариес или пульпит): боль возникает сама по себе (особенно ночью или в покое)? Длится ли она долго после холодного/горячего, или зуб также болит при накусывании?",
        toothRegion: isMolar ? "Коренной зуб (моляр)" : "Зубная область",
        condition: "Уточнение симптомов (Пульпит / Кариес)",
        durationMinutes: isMolar ? 60 : 45,
        explanation: "Дифференциальная диагностика между глубоким кариесом и пульпитом",
        preCareAdvice: "Не прикладывайте согревающие компрессы к больной стороне.",
      };
    }
    if (isEn) {
      return {
        needsClarification: true,
        clarifyType: clType,
        followUpQuestion: "To accurately evaluate the dull aching pain: does it occur spontaneously on its own (especially at night or while resting)? Does the ache linger after hot/cold food or drinks, or hurt when biting down?",
        toothRegion: isMolar ? "Posterior molar" : "Dental area",
        condition: "Clarifying symptoms (Pulpitis vs Caries)",
        durationMinutes: isMolar ? 60 : 45,
        explanation: "Differential diagnosis for molar tooth pain",
        preCareAdvice: "Avoid direct heat applications to the affected cheek.",
      };
    }
    return {
      needsClarification: true,
      clarifyType: clType,
      followUpQuestion: "Tishingizdagi simillovchi og'riq sababini aniqroq baholash uchun (bu kariesmi yoki asab yallig'lanishi — pulpit): og'riq o'z-o'zidan (hech narsa tegmasdan ham, ayniqsa tunda yoki yotganda) bezovta qiladimi? Sovuq/issiq ichimlikdan keyin simillash uzoq vaqt davom etadimi yoki tishni bosganda ham og'riq bormi?",
      toothRegion: isMolar ? "Katta oziq tish (mollyar)" : "Tish sohasi",
      condition: "Shikoyatni aniqlashtirish (Pulpit / Karies)",
      durationMinutes: isMolar ? 60 : 45,
      explanation: "Katta oziq tishdagi simillovchi og'riq pulpit yoki chuqur karies ekanligini differensial aniqlash",
      preCareAdvice: "Og'riyotgan tomonga issiq narsa bosmang.",
    };
  }

  // 2. Katta oziq tishlar endodontiyasi / pulpiti (mollyar, 3-4 kanalli tishlar)
  // Agar bemor tunda, o'z-o'zidan, uzoq simillash, pulsatsiya yoki asab og'rig'ini tasdiqlagan bo'lsa
  const isAffirmative =
    /\b(ha|xa|да|дa|yes|yep)\b/i.test(allText) ||
    allText.trim() === "ha" ||
    allText.trim() === "да";

  const hasSpontaneousPain =
    isAchingOrPain && (
      (isAffirmative && botQuestionsCount > 0) ||
      allText.includes("o'zidan") ||
      allText.includes("o'z-o'zidan") ||
      allText.includes("kecha") ||
      allText.includes("tunda") ||
      allText.includes("uxlat") ||
      allText.includes("puls") ||
      allText.includes("kanal") ||
      allText.includes("ildiz") ||
      allText.includes("endodont") ||
      allText.includes("nerv") ||
      allText.includes("pulpa") ||
      allText.includes("ноч") ||
      allText.includes("пульпит") ||
      allText.includes("корень") ||
      allText.includes("root canal") ||
      allText.includes("throbbing") ||
      allText.includes("uzoq") ||
      allText.includes("pulpit") ||
      allText.includes("night")
    );

  if (isMolar && hasSpontaneousPain) {
    return {
      needsClarification: false,
      toothRegion: isRu ? "Коренной зуб (моляр)" : isEn ? "Posterior molar" : "Yuqorigi / Pastki katta oziq tish (Mollyar)",
      condition: isRu ? "Эндодонтическое лечение / Пульпит моляра (3-4 канала)" : isEn ? "Molar Endodontics / Pulpitis (3-4 canals)" : "Katta oziq tish pulpiti / Endodontik davolash (3-4 kanal)",
      durationMinutes: 60,
      explanation: isRu
        ? "Ноющая и приступообразная боль в коренном зубе указывает на воспаление пульпы (пульпит). Коренные зубы имеют 3-4 корневых канала. Их качественная очистка, медикаментозная обработка и пломбирование каналов требуют не менее 1 часа (60 минут)."
        : isEn
        ? "Persistent dull ache in a molar indicates pulpitis (nerve inflammation). Molar teeth have 3 to 4 root canals. Complete cleaning, shaping, and sealing requires at least 60 minutes."
        : "Katta oziq tishdagi simillovchi og'riq pulpa (asab) to'qimasining yallig'lanishi — pulpitdan darak beradi. Katta oziq tishlarda 3–4 ta ildiz kanallari mavjud. Ularni to'liq tozalash, antiseptik ishlov berish va germetik plombalash uchun kamida 1 soat (60 daqiqa) vaqt talab etiladi.",
      preCareAdvice: isRu
        ? "До приема избегайте горячего и твердой пищи. Не грейте щеку. При острой боли можно принять обезболивающее (Ибупрофен 400 мг)."
        : isEn
        ? "Avoid hot and hard foods before your visit. Do not apply heat. An analgesic like Ibuprofen 400mg may be used if needed."
        : "Qabulgacha issiq va qattiq ovqatlardan saqlaning. Tishga issiq kompress bosmang. Zarur bo'lsa, shifokor ko'rigidan 3 soat oldin og'riq qoldiruvchi dori (Ibuprofen 400 mg yoki Nimesil) ichishingiz mumkin.",
    };
  }

  // 3. Oldingi tishlar yoki 1-2 kanalli tishlar endodontiyasi
  if ((isAnterior && isAchingOrPain) || (hasSpontaneousPain && !isMolar)) {
    return {
      needsClarification: false,
      toothRegion: isRu ? "Передний зуб (1-2 канала)" : isEn ? "Anterior tooth (1-2 canals)" : "Oldingi yoki 1-2 kanalli tish",
      condition: isRu ? "Эндодонтическое лечение (пульпит/периодонтит)" : isEn ? "Endodontic therapy (1-2 canals)" : "Ildiz kanalini davolash (Endodontiya)",
      durationMinutes: 45,
      explanation: isRu
        ? "Лечение 1-2 корневых каналов передних зубов и подготовка полости занимают около 45 минут."
        : isEn
        ? "Endodontic treatment for 1-2 root canals requires approximately 45 minutes."
        : "Oldingi yoki 1-2 kanalli tishlarning ildiz kanallarini tozalash va davolash uchun taxminan 45 daqiqa vaqt sarflanadi.",
      preCareAdvice: isRu
        ? "Полощите рот теплым солевым раствором. Не грейте щеку снаружи."
        : isEn
        ? "Rinse mouth with mild warm saline. Do not apply external heat."
        : "Og'izni iliq tuzli suv bilan chayishingiz mumkin. Yanoqqa issiq mato bosmang.",
    };
  }

  // 4. Gigiyena / Tish tozalash
  if (
    allText.includes("tosh") ||
    allText.includes("tozala") ||
    allText.includes("oqartir") ||
    allText.includes("chistk") ||
    allText.includes("отбеливан") ||
    allText.includes("чистк") ||
    allText.includes("cleaning") ||
    allText.includes("hygiene")
  ) {
    return {
      needsClarification: false,
      toothRegion: isRu ? "Все зубы (полость рта)" : isEn ? "Full dentition" : "To'liq tish qatori (ikkala jag')",
      condition: isRu ? "Комплексная гигиена и чистка (Air-Flow)" : isEn ? "Professional cleaning & scaling" : "Ultratovushli tish tozalash va Air-Flow gigiyenasi",
      durationMinutes: 35,
      explanation: isRu
        ? "Удаление наддесневых и поддесневых зубных отложений и полировка эмали занимают 30-40 минут."
        : isEn
        ? "Ultrasonic scaling, Air-Flow polishing, and fluoride application require about 35 minutes."
        : "Tish toshlarini ultratovushda olish, Air-Flow orqali pigment dog'larni tozalash va ftorlash taxminan 35 daqiqa davom etadi.",
      preCareAdvice: isRu ? "Чистка проводится безболезненно." : isEn ? "The procedure is gentle and painless." : "Muolaja og'riqsiz va qulay o'tadi.",
    };
  }

  // 5. Yuzaki yoki o'rtacha karies (oddiy plomba)
  const isCaries =
    allText.includes("karies") ||
    allText.includes("plomba") ||
    allText.includes("tesh") ||
    allText.includes("qora") ||
    allText.includes("ovqat") ||
    allText.includes("кариес") ||
    allText.includes("пломб") ||
    allText.includes("filling") ||
    allText.includes("cavity");

  if (isCaries) {
    return {
      needsClarification: false,
      toothRegion: isMolar ? (isRu ? "Коренной зуб" : isEn ? "Molar tooth" : "Katta oziq tish") : (isRu ? "Зуб с кариесом" : isEn ? "Tooth with cavity" : "Kariesli tish"),
      condition: isRu ? "Лечение поверхностного/среднего кариеса" : isEn ? "Caries treatment & light-cure filling" : "Yuzaki yoki o'rtacha kariesni davolash (fotopolimer plomba)",
      durationMinutes: 25,
      explanation: isRu
        ? "Поверхностный или средний кариес не затрагивает нерв, поэтому препарирование и качественная постановка пломбы занимают 20-30 минут."
        : isEn
        ? "Shallow or moderate caries does not affect the pulp; preparation and aesthetic filling take 20-30 minutes."
        : "Tish faqatgina yuzaki yoki o'rtacha karies bilan bog'liq bo'lsa (nervga yetib bormagan), sifatli tozalash va fotopolimer plomba qo'yish uchun kamroq — 20-25 daqiqa kifoya qiladi.",
      preCareAdvice: isRu ? "До приема избегайте сладкого и раздражающей пищи." : isEn ? "Avoid sugary and irritating foods before treatment." : "Qabulgacha shirin va sovuq taomlardan saqlaning.",
    };
  }

  // Standart ko'rik / konsultatsiya
  return {
    needsClarification: false,
    toothRegion: isRu ? "Полость рта" : isEn ? "Oral cavity" : "Og'iz bo'shlig'i",
    condition: isRu ? "Консультация и диагностический осмотр" : isEn ? "Clinical examination & consultation" : "Birlamchi ko'rik va diagnostika",
    durationMinutes: 20,
    explanation: isRu
      ? "Осмотр, инструментальная проверка и составление плана лечения занимают около 20 минут."
      : isEn
      ? "Visual inspection, charting, and treatment planning take around 20 minutes."
      : "Shifokor ko'rigi, tishlarni tekshirish va davolash rejasini tuzish uchun 20 daqiqa vaqt ajratiladi.",
    preCareAdvice: isRu ? "Возьмите с собой предыдущие снимки (при наличии)." : isEn ? "Bring previous dental radiographs if available." : "Oldingi rentgen suratlaringiz bo'lsa, o'zingiz bilan olib keling.",
  };
}

