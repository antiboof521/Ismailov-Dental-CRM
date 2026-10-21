/**
 * DentalGallery.jsx — Rentgen va Klinik fotosuratlar galereyasi
 * Xususiyatlari:
 * - OPG, Viziograf, Intraoral, Before/After, KT toifalari
 * - Drag-and-drop va fayl tanlash orqali yuklash
 * - Professional Rentgen ko'rish: Zoom, Kontrast, Yorqinlik, Negativ (Invert)
 * - Oldin / Keyin (Before & After) interaktiv taqqoslash slayderi va Yonma-yon ko'rish
 */

import React, { useState, useEffect, useRef } from "react";
import dayjs from "dayjs";
import { api } from "../api.js";
import { useLang } from "../i18n.jsx";
import { Modal, Empty, ErrorBanner } from "./ui.jsx";

export default function DentalGallery({ patientId, patientName, onSelectTooth }) {
  const { t } = useLang();
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");
  const [selectedToothFilter, setSelectedToothFilter] = useState("all");

  // Modallar
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [viewingImage, setViewingImage] = useState(null);
  const [comparingPair, setComparingPair] = useState(null); // { before, after }
  const [selectModeForCompare, setSelectModeForCompare] = useState(false);
  const [selectedForCompare, setSelectedForCompare] = useState([]);

  const loadImages = () => {
    setLoading(true);
    api.get(`/api/patients/${patientId}/images`)
      .then((d) => setImages(d.images || []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadImages();
  }, [patientId]);

  // SSE real-vaqt yangilanishi
  useEffect(() => {
    const onSSE = (e) => {
      try {
        const payload = JSON.parse(e.data);
        if (payload.patient_id === patientId && ["dental_image:new", "dental_image:deleted"].includes(payload.type)) {
          loadImages();
        }
      } catch (_) {}
    };
    window.addEventListener("clinic:sse", onSSE);
    return () => window.removeEventListener("clinic:sse", onSSE);
  }, [patientId]);

  const deleteImage = async (imgId) => {
    if (!confirm(t("confirmDelete") || "Haqiqatan ham o'chirmoqchimisiz?")) return;
    try {
      await api.del(`/api/patients/${patientId}/images/${imgId}`);
      if (viewingImage && viewingImage.id === imgId) setViewingImage(null);
      loadImages();
    } catch (e) {
      setError(e.message);
    }
  };

  // Filtrlangan rasmlar
  const filtered = images.filter((img) => {
    if (activeCategory !== "all" && img.category !== activeCategory) return false;
    if (selectedToothFilter !== "all" && img.tooth !== selectedToothFilter) return false;
    return true;
  });

  // Tish raqamlari ro'yxati (rasmlarda mavjud bo'lgan)
  const availableTeeth = Array.from(new Set(images.map((i) => i.tooth).filter((x) => x && x !== "general"))).sort();

  const categories = [
    { id: "all", label: "Barchasi", icon: "🌟" },
    { id: "panoramic", label: t("img_panoramic"), icon: "🩻" },
    { id: "periapical", label: t("img_periapical"), icon: "🦷" },
    { id: "intraoral", label: t("img_intraoral"), icon: "📸" },
    { id: "before_after", label: t("img_beforeAfter"), icon: "🔄" },
    { id: "ct", label: t("img_ct"), icon: "💀" },
  ];

  const handleToggleSelectForCompare = (img) => {
    if (selectedForCompare.find((x) => x.id === img.id)) {
      setSelectedForCompare(selectedForCompare.filter((x) => x.id !== img.id));
    } else {
      if (selectedForCompare.length >= 2) {
        setSelectedForCompare([selectedForCompare[1], img]);
      } else {
        setSelectedForCompare([...selectedForCompare, img]);
      }
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {error && <ErrorBanner message={error} />}

      {/* Yuqori asboblar paneli */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        {/* Toifalar bo'yicha filter */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {categories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              className={`btn small ${activeCategory === cat.id ? "" : "secondary"}`}
              style={{
                fontSize: "0.82rem",
                padding: "5px 10px",
                background: activeCategory === cat.id ? "var(--color-primary)" : "#f1f5f9",
                borderColor: activeCategory === cat.id ? "var(--color-primary)" : "#cbd5e1",
                color: activeCategory === cat.id ? "#fff" : "#334155",
              }}
              onClick={() => setActiveCategory(cat.id)}
            >
              {cat.icon} {cat.label}
            </button>
          ))}
        </div>

        {/* Tugmalar: Taqqoslash rejimi va Yuklash */}
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {availableTeeth.length > 0 && (
            <select
              value={selectedToothFilter}
              onChange={(e) => setSelectedToothFilter(e.target.value)}
              style={{ fontSize: "0.85rem", padding: "4px 8px", minWidth: "120px" }}
            >
              <option value="all">Barcha tishlar</option>
              {availableTeeth.map((th) => (
                <option key={th} value={th}>
                  🦷 {th}-tish
                </option>
              ))}
            </select>
          )}

          <button
            type="button"
            className={`btn small ${selectModeForCompare ? "" : "secondary"}`}
            style={{
              borderColor: selectModeForCompare ? "#6366f1" : "",
              background: selectModeForCompare ? "#6366f1" : "",
              color: selectModeForCompare ? "#fff" : "",
            }}
            onClick={() => {
              if (selectModeForCompare && selectedForCompare.length === 2) {
                setComparingPair({
                  before: selectedForCompare[0].url || selectedForCompare[0].before_url,
                  after: selectedForCompare[1].url || selectedForCompare[1].after_url,
                  title: `${selectedForCompare[0].title} ⇄ ${selectedForCompare[1].title}`,
                });
                setSelectModeForCompare(false);
                setSelectedForCompare([]);
              } else {
                setSelectModeForCompare(!selectModeForCompare);
                setSelectedForCompare([]);
              }
            }}
          >
            {selectModeForCompare
              ? selectedForCompare.length === 2
                ? "✨ 2 ta rasm tanlandi: Solishtirish!"
                : `Tanlang (${selectedForCompare.length}/2)`
              : `🔄 ${t("img_compare")}`}
          </button>

          <button
            type="button"
            className="btn small"
            style={{ background: "#0284c7", borderColor: "#0284c7" }}
            onClick={() => setShowUploadModal(true)}
          >
            + {t("img_upload")}
          </button>
        </div>
      </div>

      {selectModeForCompare && (
        <div style={{ background: "#e0e7ff", border: "1px dashed #6366f1", borderRadius: 8, padding: "8px 14px", fontSize: "0.85rem", color: "#3730a3", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>💡 <strong>Solishtirish rejimi:</strong> Yonma-yon taqqoslash uchun quyidagi rasmlardan istalgan <strong>2 tasini</strong> tanlang.</span>
          <button className="btn small secondary" style={{ padding: "2px 8px", fontSize: "0.75rem" }} onClick={() => { setSelectModeForCompare(false); setSelectedForCompare([]); }}>
            Bekor qilish
          </button>
        </div>
      )}

      {/* Rasmlar panjarasi (Gallery Grid) */}
      {loading ? (
        <div style={{ padding: 40, textAlign: "center", color: "#64748b" }}>Yuklanmoqda...</div>
      ) : filtered.length === 0 ? (
        <div style={{ border: "2px dashed #cbd5e1", borderRadius: 12, padding: "40px 20px", textAlign: "center", background: "#f8fafc" }}>
          <div style={{ fontSize: "2.5rem", marginBottom: 8 }}>🩻</div>
          <div style={{ fontWeight: 600, color: "#334155", marginBottom: 4 }}>{t("img_noImages")}</div>
          <div style={{ fontSize: "0.85rem", color: "#64748b", marginBottom: 14 }}>
            Ushbu bemor uchun rentgen, panoramali OPG yoki davolashdan oldingi/keyingi klinik fotosurat yuklang.
          </div>
          <button className="btn small" onClick={() => setShowUploadModal(true)}>
            + {t("img_upload")}
          </button>
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
            gap: 14,
          }}
        >
          {filtered.map((img) => {
            const isSelectedForCompare = selectedForCompare.some((x) => x.id === img.id);
            const isBeforeAfter = img.category === "before_after" || (img.before_url && img.after_url);

            return (
              <div
                key={img.id}
                style={{
                  border: isSelectedForCompare ? "2px solid #6366f1" : "1px solid #e2e8f0",
                  borderRadius: 10,
                  overflow: "hidden",
                  background: "#fff",
                  boxShadow: isSelectedForCompare ? "0 0 0 3px rgba(99, 102, 241, 0.2)" : "0 1px 3px rgba(0,0,0,0.06)",
                  display: "flex",
                  flexDirection: "column",
                  transition: "all 0.15s ease",
                  cursor: selectModeForCompare ? "pointer" : "default",
                }}
                onClick={() => {
                  if (selectModeForCompare) {
                    handleToggleSelectForCompare(img);
                  }
                }}
              >
                {/* Rasm maydoni */}
                <div
                  style={{
                    position: "relative",
                    background: "#090d16",
                    height: "170px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    overflow: "hidden",
                  }}
                >
                  <img
                    src={img.url || img.after_url || img.before_url}
                    alt={img.title}
                    style={{
                      maxHeight: "100%",
                      maxWidth: "100%",
                      objectFit: "contain",
                    }}
                  />

                  {/* Toifa yorlig'i */}
                  <div
                    style={{
                      position: "absolute",
                      top: 8,
                      left: 8,
                      background: "rgba(15, 23, 42, 0.8)",
                      backdropFilter: "blur(4px)",
                      color: "#fff",
                      fontSize: "0.72rem",
                      fontWeight: 600,
                      padding: "2px 8px",
                      borderRadius: 6,
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    {img.category === "panoramic" && "🩻 OPG"}
                    {img.category === "periapical" && "🦷 Viziograf"}
                    {img.category === "intraoral" && "📸 Intraoral"}
                    {img.category === "before_after" && "🔄 Oldin / Keyin"}
                    {img.category === "ct" && "💀 KT"}
                  </div>

                  {/* Tish raqami belgisi */}
                  {img.tooth && img.tooth !== "general" && (
                    <div
                      style={{
                        position: "absolute",
                        top: 8,
                        right: 8,
                        background: "#0284c7",
                        color: "#fff",
                        fontSize: "0.72rem",
                        fontWeight: 700,
                        padding: "2px 7px",
                        borderRadius: 6,
                      }}
                    >
                      🦷 #{img.tooth}
                    </div>
                  )}

                  {/* Solishtirish tanlangan indikatori */}
                  {selectModeForCompare && (
                    <div
                      style={{
                        position: "absolute",
                        bottom: 8,
                        right: 8,
                        width: 24,
                        height: 24,
                        borderRadius: "50%",
                        background: isSelectedForCompare ? "#6366f1" : "rgba(0,0,0,0.5)",
                        color: "#fff",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontWeight: "bold",
                        border: "2px solid #fff",
                      }}
                    >
                      {isSelectedForCompare ? "✓" : ""}
                    </div>
                  )}
                </div>

                {/* Tafsilotlar maydoni */}
                <div style={{ padding: 12, flex: 1, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: "0.9rem", color: "#1e293b", marginBottom: 4, lineHeight: 1.3 }}>
                      {img.title}
                    </div>
                    {img.description && (
                      <div style={{ fontSize: "0.78rem", color: "#64748b", marginBottom: 8, lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                        {img.description}
                      </div>
                    )}
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", color: "#94a3b8", marginTop: 4 }}>
                      <span>🗓 {img.created_at}</span>
                      <span>{img.doctor_name || "Shifokor"}</span>
                    </div>
                  </div>

                  {/* Harakatlar */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10, paddingTop: 8, borderTop: "1px solid #f1f5f9" }}>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button
                        type="button"
                        className="btn small"
                        style={{ padding: "3px 8px", fontSize: "0.78rem", background: "#0284c7", borderColor: "#0284c7" }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setViewingImage(img);
                        }}
                      >
                        🔍 Ko'rish
                      </button>

                      {isBeforeAfter && (
                        <button
                          type="button"
                          className="btn small secondary"
                          style={{ padding: "3px 8px", fontSize: "0.78rem", color: "#6366f1" }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setComparingPair({
                              before: img.before_url || img.url,
                              after: img.after_url || img.url,
                              title: img.title,
                            });
                          }}
                        >
                          🔄 Slayder
                        </button>
                      )}
                    </div>

                    <button
                      type="button"
                      className="btn small danger"
                      style={{ padding: "3px 6px", fontSize: "0.75rem" }}
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteImage(img.id);
                      }}
                      title="O'chirish"
                    >
                      🗑
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 1. RASM YUKLASH MODALI (DRAG-AND-DROP & CLICK PICKER) */}
      {showUploadModal && (
        <UploadDentalImageModal
          patientId={patientId}
          onClose={() => setShowUploadModal(false)}
          onUploaded={() => {
            setShowUploadModal(false);
            loadImages();
          }}
        />
      )}

      {/* 2. DIAGNOSTIK RENTGEN VA FOTO VIEWER (ZOOM, CONTRAST, BRIGHTNESS, INVERT) */}
      {viewingImage && (
        <RadiographViewerModal
          image={viewingImage}
          onClose={() => setViewingImage(null)}
          onDelete={() => deleteImage(viewingImage.id)}
          onCompare={() => {
            if (viewingImage.before_url && viewingImage.after_url) {
              setComparingPair({
                before: viewingImage.before_url,
                after: viewingImage.after_url,
                title: viewingImage.title,
              });
              setViewingImage(null);
            }
          }}
        />
      )}

      {/* 3. OLDIN / KEYIN INTERAKTIV SLAYDER VA YONMA-YON TAQQOSLASH */}
      {comparingPair && (
        <BeforeAfterCompareModal
          pair={comparingPair}
          onClose={() => setComparingPair(null)}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 1. UploadDentalImageModal — Drag-and-drop va fayl yuklash
// ─────────────────────────────────────────────────────────────
function UploadDentalImageModal({ patientId, onClose, onUploaded }) {
  const { t } = useLang();
  const [category, setCategory] = useState("periapical");
  const [tooth, setTooth] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [doctorName, setDoctorName] = useState("Dr. Rustam Karimov");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Rasmlar (Oddiy yoki Oldin/Keyin)
  const [singleImage, setSingleImage] = useState(null);
  const [beforeImage, setBeforeImage] = useState(null);
  const [afterImage, setAfterImage] = useState(null);

  const fileInputRef = useRef(null);
  const beforeInputRef = useRef(null);
  const afterInputRef = useRef(null);

  const handleDrop = (e, target = "single") => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    readFileAsDataUrl(file, target);
  };

  const handleFileChange = (e, target = "single") => {
    const file = e.target.files?.[0];
    if (!file) return;
    readFileAsDataUrl(file, target);
  };

  const readFileAsDataUrl = (file, target) => {
    if (!file.type.startsWith("image/")) {
      setError("Faqat rasm formatidagi fayllar qabul qilinadi (JPG, PNG, WEBP)");
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target.result;
      if (target === "single") {
        setSingleImage(dataUrl);
        if (!title) setTitle(file.name.replace(/\.[^/.]+$/, ""));
      } else if (target === "before") {
        setBeforeImage(dataUrl);
      } else if (target === "after") {
        setAfterImage(dataUrl);
      }
    };
    reader.readAsDataURL(file);
  };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");

    if (category === "before_after") {
      if (!beforeImage || !afterImage) {
        setError("Iltimos, ikkala rasmni ham yuklang (Davolashdan oldingi va keyingi)");
        setBusy(false);
        return;
      }
    } else {
      if (!singleImage) {
        setError("Iltimos, rasm yoki rentgen faylini tanlang");
        setBusy(false);
        return;
      }
    }

    try {
      const payload = {
        category,
        tooth: tooth || "general",
        title: title || (category === "before_after" ? "Oldin / Keyin restavratsiya" : "Klinik rasm"),
        description,
        doctor_name: doctorName,
        url: singleImage || afterImage,
        before_url: beforeImage || undefined,
        after_url: afterImage || undefined,
      };

      await api.post(`/api/patients/${patientId}/images`, payload);
      onUploaded();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={`📸 ${t("img_upload")}`} onClose={onClose}>
      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {error && <div className="error-msg">{error}</div>}

        <div className="form-grid">
          <div className="form-row">
            <label>Rasm toifasi *</label>
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="periapical">🦷 {t("img_periapical")}</option>
              <option value="panoramic">🩻 {t("img_panoramic")}</option>
              <option value="intraoral">📸 {t("img_intraoral")}</option>
              <option value="before_after">🔄 {t("img_beforeAfter")}</option>
              <option value="ct">💀 {t("img_ct")}</option>
            </select>
          </div>

          <div className="form-row">
            <label>Tish raqami (ixtiyoriy)</label>
            <input
              type="text"
              placeholder="Masalan: 16 yoki 21"
              value={tooth}
              onChange={(e) => setTooth(e.target.value)}
            />
          </div>

          <div className="form-row" style={{ gridColumn: "span 2" }}>
            <label>Sarlavha / Izoh *</label>
            <input
              type="text"
              required
              placeholder="Masalan: 16-tish ildiz kanali nazorat rentgeni"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
        </div>

        {/* FAYL YUKLASH ZONASI (DRAG & DROP + CLICK) */}
        {category === "before_after" ? (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {/* Oldin */}
            <div>
              <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "#e11d48", marginBottom: 6 }}>
                1. Davolashdan oldingi holat (Oldin)
              </div>
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => handleDrop(e, "before")}
                onClick={() => beforeInputRef.current?.click()}
                style={{
                  border: "2px dashed #fda4af",
                  borderRadius: 10,
                  padding: 14,
                  textAlign: "center",
                  background: "#fff1f2",
                  cursor: "pointer",
                  minHeight: 130,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {beforeImage ? (
                  <img src={beforeImage} alt="Before" style={{ maxHeight: 100, maxWidth: "100%", borderRadius: 6 }} />
                ) : (
                  <>
                    <div style={{ fontSize: "1.8rem" }}>📁</div>
                    <div style={{ fontSize: "0.78rem", color: "#9f1239" }}>Rasm tashlang yoki bosing</div>
                  </>
                )}
                <input
                  ref={beforeInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: "none" }}
                  onChange={(e) => handleFileChange(e, "before")}
                />
              </div>
            </div>

            {/* Keyin */}
            <div>
              <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "#059669", marginBottom: 6 }}>
                2. Davolashdan keyingi natija (Keyin)
              </div>
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => handleDrop(e, "after")}
                onClick={() => afterInputRef.current?.click()}
                style={{
                  border: "2px dashed #6ee7b7",
                  borderRadius: 10,
                  padding: 14,
                  textAlign: "center",
                  background: "#ecfdf5",
                  cursor: "pointer",
                  minHeight: 130,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {afterImage ? (
                  <img src={afterImage} alt="After" style={{ maxHeight: 100, maxWidth: "100%", borderRadius: 6 }} />
                ) : (
                  <>
                    <div style={{ fontSize: "1.8rem" }}>📁</div>
                    <div style={{ fontSize: "0.78rem", color: "#065f46" }}>Rasm tashlang yoki bosing</div>
                  </>
                )}
                <input
                  ref={afterInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: "none" }}
                  onChange={(e) => handleFileChange(e, "after")}
                />
              </div>
            </div>
          </div>
        ) : (
          <div>
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => handleDrop(e, "single")}
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: "2px dashed #93c5fd",
                borderRadius: 10,
                padding: 24,
                textAlign: "center",
                background: "#eff6ff",
                cursor: "pointer",
                transition: "background 0.2s ease",
              }}
            >
              {singleImage ? (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                  <img
                    src={singleImage}
                    alt="Preview"
                    style={{ maxHeight: 160, maxWidth: "100%", borderRadius: 8, boxShadow: "0 2px 8px rgba(0,0,0,0.15)" }}
                  />
                  <div style={{ fontSize: "0.8rem", color: "#0284c7", marginTop: 8 }}>Boshqa rasm tanlash uchun bosing</div>
                </div>
              ) : (
                <>
                  <div style={{ fontSize: "2.4rem", marginBottom: 6 }}>🩻</div>
                  <div style={{ fontWeight: 600, color: "#1e3a8a", fontSize: "0.95rem", marginBottom: 4 }}>
                    {t("img_dragDrop")}
                  </div>
                  <div style={{ fontSize: "0.78rem", color: "#64748b" }}>
                    PNG, JPG, JPEG, WEBP formatlari qo'llab-quvvatlanadi
                  </div>
                </>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={(e) => handleFileChange(e, "single")}
              />
            </div>
          </div>
        )}

        <div className="form-row">
          <label>Klinik tavsif / Shifokor xulosasi</label>
          <textarea
            rows={2}
            placeholder="Rentgenologik tahlil: ildiz uchida yallig'lanish yo'q, suyak zichligi me'yorda..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <div className="form-actions">
          <button className="btn" disabled={busy} type="submit">
            {busy ? "Yuklanmoqda..." : "Saqlash va biriktirish"}
          </button>
          <button className="btn secondary" type="button" onClick={onClose}>
            {t("cancel")}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────
// 2. RadiographViewerModal — Professional Rentgen Viewer
// ─────────────────────────────────────────────────────────────
function RadiographViewerModal({ image, onClose, onDelete, onCompare }) {
  const { t } = useLang();
  const [zoom, setZoom] = useState(1);
  const [contrast, setContrast] = useState(100); // 50% to 200%
  const [brightness, setBrightness] = useState(100); // 50% to 200%
  const [isInverted, setIsInverted] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [panPos, setPanPos] = useState({ x: 0, y: 0 });
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });

  const resetFilters = () => {
    setZoom(1);
    setContrast(100);
    setBrightness(100);
    setIsInverted(false);
    setPanPos({ x: 0, y: 0 });
  };

  const handleMouseDown = (e) => {
    if (zoom > 1) {
      setIsPanning(true);
      setStartPos({ x: e.clientX - panPos.x, y: e.clientY - panPos.y });
    }
  };

  const handleMouseMove = (e) => {
    if (isPanning) {
      setPanPos({ x: e.clientX - startPos.x, y: e.clientY - startPos.y });
    }
  };

  const handleMouseUp = () => setIsPanning(false);

  const isBeforeAfter = image.category === "before_after" || (image.before_url && image.after_url);

  return (
    <Modal
      title={`🩻 Diagnostik Viewer: ${image.title}`}
      onClose={onClose}
      style={{ maxWidth: "900px", width: "95vw" }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {/* BOSHQARUV ASBOBLAR PANELI (ZOOM, KONTRAST, YORQINLIK, NEGATIV) */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            background: "#0f172a",
            padding: "8px 14px",
            borderRadius: 8,
            color: "#fff",
            flexWrap: "wrap",
            gap: 10,
          }}
        >
          {/* Zoom tugmalari */}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: "0.8rem", color: "#94a3b8" }}>Zoom:</span>
            <button
              type="button"
              className="btn small secondary"
              style={{ padding: "2px 8px", background: "#1e293b", color: "#fff", borderColor: "#334155" }}
              onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.25).toFixed(2)))}
            >
              −
            </button>
            <span style={{ fontSize: "0.85rem", minWidth: "42px", textAlign: "center", fontFamily: "monospace" }}>
              {Math.round(zoom * 100)}%
            </span>
            <button
              type="button"
              className="btn small secondary"
              style={{ padding: "2px 8px", background: "#1e293b", color: "#fff", borderColor: "#334155" }}
              onClick={() => setZoom((z) => Math.min(3.5, +(z + 0.25).toFixed(2)))}
            >
              +
            </button>
          </div>

          {/* Kontrast slayderi */}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: "0.8rem", color: "#94a3b8" }}>{t("img_contrast")}:</span>
            <input
              type="range"
              min="50"
              max="200"
              value={contrast}
              onChange={(e) => setContrast(Number(e.target.value))}
              style={{ width: "80px", cursor: "pointer" }}
            />
            <span style={{ fontSize: "0.75rem", fontFamily: "monospace", width: "35px" }}>{contrast}%</span>
          </div>

          {/* Yorqinlik slayderi */}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: "0.8rem", color: "#94a3b8" }}>{t("img_brightness")}:</span>
            <input
              type="range"
              min="50"
              max="200"
              value={brightness}
              onChange={(e) => setBrightness(Number(e.target.value))}
              style={{ width: "80px", cursor: "pointer" }}
            />
            <span style={{ fontSize: "0.75rem", fontFamily: "monospace", width: "35px" }}>{brightness}%</span>
          </div>

          {/* Negativ (Invert) tugmasi */}
          <button
            type="button"
            className="btn small"
            style={{
              padding: "3px 10px",
              background: isInverted ? "#f59e0b" : "#334155",
              borderColor: isInverted ? "#f59e0b" : "#475569",
              color: "#fff",
              fontSize: "0.78rem",
            }}
            onClick={() => setIsInverted(!isInverted)}
          >
            ☯️ {t("img_invert")}
          </button>

          {/* Qaytarish (Reset) */}
          <button
            type="button"
            className="btn small secondary"
            style={{ padding: "3px 8px", background: "#1e293b", color: "#94a3b8", borderColor: "#334155", fontSize: "0.75rem" }}
            onClick={resetFilters}
          >
            ↺ {t("img_reset")}
          </button>
        </div>

        {/* ASOSIY RASM SAHNASI (LIGHTBOX VIEWPORT) */}
        <div
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          style={{
            background: "#070a12",
            height: "460px",
            borderRadius: 8,
            overflow: "hidden",
            position: "relative",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: zoom > 1 ? (isPanning ? "grabbing" : "grab") : "default",
          }}
        >
          <img
            src={image.url || image.after_url || image.before_url}
            alt={image.title}
            draggable={false}
            style={{
              maxHeight: "100%",
              maxWidth: "100%",
              transform: `scale(${zoom}) translate(${panPos.x / zoom}px, ${panPos.y / zoom}px)`,
              filter: `contrast(${contrast}%) brightness(${brightness}%) ${isInverted ? "invert(1)" : ""}`,
              transition: isPanning ? "none" : "filter 0.1s ease, transform 0.1s ease",
              userSelect: "none",
            }}
          />

          {/* Tish raqami va ma'lumot overlay */}
          <div
            style={{
              position: "absolute",
              bottom: 12,
              left: 14,
              background: "rgba(15, 23, 42, 0.75)",
              backdropFilter: "blur(4px)",
              color: "#e2e8f0",
              padding: "4px 10px",
              borderRadius: 6,
              fontSize: "0.78rem",
            }}
          >
            {image.tooth && image.tooth !== "general" && <strong>🦷 #{image.tooth}-tish | </strong>}
            <span>🗓 {image.created_at}</span> | <span>{image.doctor_name || "Shifokor"}</span>
          </div>
        </div>

        {/* TAVSIF VA HARAKATLAR */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 14, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: "1rem", color: "#1e293b" }}>{image.title}</div>
            {image.description && (
              <div style={{ fontSize: "0.85rem", color: "#475569", marginTop: 4, maxWidth: "600px" }}>
                {image.description}
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            {isBeforeAfter && (
              <button
                type="button"
                className="btn small"
                style={{ background: "#6366f1", borderColor: "#6366f1" }}
                onClick={onCompare}
              >
                🔄 Oldin / Keyin taqqoslash slayderi
              </button>
            )}
            <button type="button" className="btn small danger" onClick={onDelete}>
              🗑 O'chirish
            </button>
            <button type="button" className="btn small secondary" onClick={onClose}>
              Yopish
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────
// 3. BeforeAfterCompareModal — Interaktiv Split Slayder
// ─────────────────────────────────────────────────────────────
function BeforeAfterCompareModal({ pair, onClose }) {
  const [sliderPos, setSliderPos] = useState(50); // 0 to 100%
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef(null);

  const handleMove = (clientX) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const pct = Math.max(0, Math.min(100, (x / rect.width) * 100));
    setSliderPos(pct);
  };

  const onMouseDown = () => setIsDragging(true);
  const onMouseUp = () => setIsDragging(false);

  const onMouseMove = (e) => {
    if (isDragging) handleMove(e.clientX);
  };

  const onTouchMove = (e) => {
    if (e.touches[0]) handleMove(e.touches[0].clientX);
  };

  return (
    <Modal
      title={`🔄 Oldin va Keyin Solishtirish: ${pair.title || "Klinik natija"}`}
      onClose={onClose}
      style={{ maxWidth: "850px", width: "95vw" }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.85rem", color: "#64748b" }}>
          <span>💡 <strong>Ko'rsatma:</strong> O'rtadagi chiziqni sichqoncha bilan chapga yoki o'ngga suring.</span>
          <div style={{ display: "flex", gap: 8 }}>
            <span style={{ color: "#e11d48", fontWeight: 700 }}>◀ OLDIN</span>
            <span style={{ color: "#059669", fontWeight: 700 }}>KEYIN ▶</span>
          </div>
        </div>

        {/* SLAYDER INTERAKTIV CONTAINER */}
        <div
          ref={containerRef}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
          onTouchMove={onTouchMove}
          onTouchEnd={onMouseUp}
          style={{
            position: "relative",
            width: "100%",
            height: "440px",
            background: "#0b0f19",
            borderRadius: 10,
            overflow: "hidden",
            userSelect: "none",
            cursor: "ew-resize",
          }}
        >
          {/* 1. KEYIN RASMI (Tagda turadi) */}
          <img
            src={pair.after}
            alt="After"
            draggable={false}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              height: "100%",
              objectFit: "contain",
            }}
          />
          <div
            style={{
              position: "absolute",
              top: 14,
              right: 14,
              background: "rgba(5, 150, 105, 0.85)",
              color: "#fff",
              padding: "4px 10px",
              borderRadius: 6,
              fontSize: "0.8rem",
              fontWeight: 700,
            }}
          >
            KEYIN (Natija)
          </div>

          {/* 2. OLDIN RASMI (SliderPos bo'yicha qirqiladi) */}
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: `${sliderPos}%`,
              height: "100%",
              overflow: "hidden",
              borderRight: "3px solid #ffffff",
              boxShadow: "2px 0 10px rgba(0,0,0,0.5)",
            }}
          >
            {/* Ichidagi rasm asl container kengligida bo'lishi kerak */}
            <div
              style={{
                width: containerRef.current ? containerRef.current.clientWidth : "100%",
                height: "100%",
              }}
            >
              <img
                src={pair.before}
                alt="Before"
                draggable={false}
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "contain",
                }}
              />
            </div>

            <div
              style={{
                position: "absolute",
                top: 14,
                left: 14,
                background: "rgba(225, 29, 72, 0.85)",
                color: "#fff",
                padding: "4px 10px",
                borderRadius: 6,
                fontSize: "0.8rem",
                fontWeight: 700,
              }}
            >
              OLDIN
            </div>
          </div>

          {/* 3. SLIDER TUTQICHI (HANDLE) */}
          <div
            onMouseDown={onMouseDown}
            onTouchStart={onMouseDown}
            style={{
              position: "absolute",
              top: "50%",
              left: `${sliderPos}%`,
              transform: "translate(-50%, -50%)",
              width: 38,
              height: 38,
              borderRadius: "50%",
              background: "#ffffff",
              boxShadow: "0 2px 10px rgba(0,0,0,0.4)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "ew-resize",
              zIndex: 10,
              fontWeight: "bold",
              fontSize: "1rem",
              color: "#334155",
            }}
          >
            ⇄
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 4 }}>
          <button type="button" className="btn secondary" onClick={onClose}>
            Yopish
          </button>
        </div>
      </div>
    </Modal>
  );
}
