/**
 * bot.ts — Telegram bot (grammY) va AI assistent integratsiyasi
 * 
 * Imkoniyatlar:
 * - 3 tilda ishlash (uz/ru/en)
 * - Bemorlarni ro'yxatdan o'tkazish
 * - Ish vaqti: 09:00 dan 18:00 gacha
 * - Ish vaqtidan tashqari vaqt so'ralganda shifokor bilan bog'lanishni so'rash (telefon / telegram)
 * - Sun'iy intellekt (Gemini) orqali interaktiv shikoyat tahlili va muolaja vaqtini avtomatik hisoblash
 *   (Yuzaki karies: 20-30 daqiqa, oldingi tishlar endodontiyasi: 45 daqiqa, katta oziq tishlar endodontiyasi: 60+ daqiqa)
 * - Webhook integratsiyasi: Ilova brauzerda ochiq bo'lmasa ham Cloud Run avtomatik uyg'onib 24/7 javob beradi
 * - Navbat holati va 30 daqiqalik avtomatik eslatmalar
 */

import { Bot, InlineKeyboard, webhookCallback } from "grammy";
import dayjs from "dayjs";
import { GoogleGenAI } from "@google/genai";
import { analyzeDentalComplaintAndEstimateTime, DentalTriageResult } from "./gemini.js";
import { CLINIC_PHONE, CLINIC_TG } from "./config.js";
import { storage } from "./storage.js";

/**
 * O'zbekiston (Toshkent / Osiyo) mahalliy vaqtini aniq olish helperi (UTC+5)
 */
export function getClinicNow(): { dateStr: string; timeStr: string; hour: number; minute: number; totalMinutes: number } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Tashkent',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    hourCycle: 'h23',
  }).formatToParts(new Date());

  const get = (type: string) => parts.find(p => p.type === type)?.value || '00';
  const yyyy = get('year');
  const mm = get('month');
  const dd = get('day');
  const rawH = parseInt(get('hour'), 10);
  const hh = rawH === 24 ? 0 : rawH;
  const min = parseInt(get('minute'), 10);

  return {
    dateStr: `${yyyy}-${mm}-${dd}`,
    timeStr: `${String(hh).padStart(2, '0')}:${String(min).padStart(2, '0')}`,
    hour: hh,
    minute: min,
    totalMinutes: hh * 60 + min,
  };
}

export interface BotPatient {
  id: number;
  full_name: string;
  phone: string;
  birth_date?: string;
  gender: "male" | "female" | "";
  address: string;
  allergies?: string;
  notes?: string;
  source: "clinic" | "telegram";
  telegram_id?: string;
  telegram_username?: string;
  connect_code?: string;
  lang?: string;
  created_at: string;
}

export interface BotAppointment {
  id: number;
  patient_id: number;
  patient_name: string;
  staff_id: number | null;
  staff_name: string;
  scheduled_at: string;
  date: string;
  time: string;
  duration_min: number;
  complaint: string;
  turn_notified?: number;
  status: "scheduled" | "arrived" | "completed" | "no_show" | "cancelled";
}

export interface BotStaff {
  id: number;
  full_name: string;
  position: "doctor" | "assistant" | "admin";
  phone: string;
  telegram_username?: string;
  active: boolean;
}

export interface BotComplaint {
  id: number;
  patient_name: string;
  telegram_id?: string;
  message: string;
  status: "open" | "in_progress" | "closed";
  reply_text?: string;
}

// Bot matnlari (i18n)
const TRANSLATIONS: Record<string, Record<string, string>> = {
  uz: {
    welcome: "Assalomu alaykum! {clinic} stomatologiya klinikasi rasmiy botiga xush kelibsiz.",
    mainMenu: "Asosiy menyu:",
    btnAppointment: "📅 Qabulga yozilish",
    btnMyInfo: "📋 Mening ma'lumotlarim",
    btnPosition: "📍 Navbatim",
    btnFeedback: "✍️ Fikr/shikoyat",
    btnLang: "🌐 Tilni o'zgartirish",
    langSet: "Til muvaffaqiyatli tanlandi: O'zbekcha",
    btnRegister: "Ro'yxatdan o'tish",
    btnLinkClinic: "🔗 Klinikadagi kartamni ulash",
    askName: "Iltimos, to'liq ism-sharifingizni kiriting (F.I.Sh):",
    askPhone: "Telefon raqamingizni kiriting (masalan: +998901234567):",
    phoneInvalid: "Telefon raqami noto'g'ri. Iltimos tekshirib qaytadan kiriting:",
    askBirth: "Tug'ilgan sanangizni kiriting (masalan: 1995-05-15 yoki 15.05.1995):",
    birthInvalid: "Sana noto'g'ri kiritildi. Masalan: 1995-05-15 yoki 15.05.1995 ko'rinishida kiriting:",
    askGender: "Jinsingizni tanlang:",
    genderMale: "👨 Erkak",
    genderFemale: "👩 Ayol",
    askAddress: "Yashash manzilingizni kiriting:",
    askConnectCode: "Klinika tomonidan berilgan 6 xonali ulanish kodini (masalan: 582910) yoki telefon raqamingizni kiriting:",
    linkedSuccess: "🎉 Hurmatli {name}!\n\nSizning Telegram hisobingiz klinika tizimidagi kartangizga (#ID: {id}) muvaffaqiyatli ulandi! ✅\n\nEndi barcha qabullaringiz, jonli navbatingiz va eslatmalaringiz shu yerda aks etadi.",
    linkNotFound: "Kechirasiz, ushbu kod yoki telefon raqamiga mos bemor kartasi topilmadi. Klinika qabulxonasiga murojaat qiling yoki yangitdan ro'yxatdan o'ting.",
    btnEditProfile: "✏️ Ma'lumotlarni o'zgartirish",
    btnEditName: "✏️ F.I.Sh (Ism-sharif)",
    btnEditBirth: "📅 Tug'ilgan sana",
    btnEditAddress: "📍 Yashash manzili",
    btnEditPhone: "📞 Telefon raqami",
    askEditName: "Iltimos, yangi to'liq ism-sharifingizni kiriting (F.I.Sh):",
    askEditBirth: "Iltimos, to'g'ri tug'ilgan sanangizni kiriting (masalan: 1995-05-15 yoki 15.05.1995):",
    askEditPhone: "Iltimos, yangi telefon raqamingizni kiriting (+998...):",
    profileUpdated: "✅ Ma'lumotlaringiz muvaffaqiyatli saqlandi va serverda yangilandi!",
    askComplaint: "🦷 Shikoyatingiz yoki bezovta qilayotgan holat haqida yozing:\n\n• Aynan qaysi tishingiz yoki og'zingizning qaysi qismi og'riyapti (oldingi tishmi yoki orqadagi katta oziq tishmi)?\n• Og'riq qanday va qachon bezovta qiladi (sovuq/shirin yegandami yoki tunda o'z-o'zidan qattiq simillaydimi)?",
    registered: "✅ Siz muvaffaqiyatli ro'yxatdan o'tdingiz!\n\n👤 Ism: {name}\n📞 Tel: {phone}\n⚧ Jins: {gender}\n📍 Manzil: {address}",
    alreadyRegistered: "Siz allaqachon ro'yxatdan o'tgansiz: {name}",
    chooseDoctor: "Qaysi shifokor qabuliga yozilmoqchisiz?",
    noSlots: "Tanlangan kunda bo'sh vaqtlar mavjud emas.",
    chooseDate: "Qabul kunini tanlang:",
    chooseTime: "Qabul vaqtini tanlang (Ish vaqti: 09:00 - 18:00):",
    customTime: "⌨️ Boshqa vaqt kiritish",
    btnOutOfHours: "📞 09:00 - 18:00 dan tashqari (Shifokorga bog'lanish)",
    askCustomTime: "Qabul vaqtini HH:mm formatida kiriting (masalan: 14:30).\nKlinikamiz ish vaqti: soat 09:00 dan 18:00 gacha:",
    timeInvalid: "Vaqt noto'g'ri kiritildi yoki band. Iltimos qaytadan kiriting (masalan: 11:30):",
    timeTaken: "Kechirasiz, bu vaqt yoki muolaja oralig'i allaqachon band. Boshqa vaqt tanlang:",
    outOfHoursTitle: "⚠️ Ish vaqtidan tashqari vaqt!",
    outOfHoursNotice: "⚠️ **Klinikamiz ish vaqti soat 09:00 dan 18:00 gacha.**\n\nAgar sizga ushbu vaqtdan tashqari (erta tongda yoki kechki payt) shoshilinch qabul zarur bo'lsa, iltimos shifokor yoki navbatchi ma'muriyat bilan to'g'ridan-to'g'ri bog'laning:\n\n📞 Shifokor telefoni: {phone}\n💬 Telegram: {tg}\n\nIltimos, ish vaqti (09:00 - 18:00) oralig'idagi vaqtni tanlang yoki shifokorga qo'ng'iroq qiling.",
    btnCallDoctor: "📞 Shifokorga qo'ng'iroq qilish",
    btnMsgDoctor: "💬 Shifokor bilan bog'lanish",
    btnChooseWorkingHours: "⏰ 09:00 - 18:00 oralig'ida vaqt tanlash",
    appointmentDone: "✅ Navbatingiz muvaffaqiyatli band qilindi!\n\n📅 Sana: {date}\n⏰ Vaqt: {time}\n⏱ Ajratilgan vaqt: {duration} daqiqa\n👨‍⚕️ Shifokor: {doctor}\n🏥 Klinika: {clinic}",
    msgFromClinic: "🏥 Klinika xabari:\n\n{text}",
    sendFeedback: "Klinika haqida fikr yoki shikoyatingizni yozing. Biz uni albatta ko'rib chiqamiz:",
    feedbackThanks: "Rahmat! Sizning fikringiz qabul qilindi va mutaxassislarimizga yetkazildi.",
    myInfo: "📋 Sizning ma'lumotlaringiz:\n\n👤 F.I.Sh: {name}\n📞 Tel: {phone}\n⚧ Jins: {gender}\n📍 Manzil: {address}\n🗓 Ro'yxatdan o'tgan sana: {registered}",
    myAppointments: "Sizning yaqinlashayotgan navbatlaringiz:",
    noQueue: "Sizda bugun uchun faol navbat yo'q.",
    yourTurn: "📍 Sizning navbatingiz:\n\nSiz bugun navbatda {pos}-o'rindasiz!\n⏰ Rejalashtirilgan vaqt: {time}\n👨‍⚕️ Shifokor: {doctor}\n📝 Shikoyat: {complaint}",
    reminder: "⏰ Eslatma!\n\nErtaga {date} kuni soat {time} da {doctor} qabuliga navbatingiz bor.\n🏥 {clinic}",
    turnSoon: "🔔 Diqqat!\n\nSizning qabulingizga taxminan 30 daqiqa qoldi.\n⏰ Vaqt: {time}\n👨‍⚕️ Shifokor: {doctor}\n🏥 {clinic}",
    cancel: "Bekor qilish",
    back: "Orqaga",
    skip: "O'tkazib yuborish",
    error: "Xatolik yuz berdi. Qaytadan urinib ko'ring.",
    notFound: "Kechirasiz, savolingizni tushunmadim. Qabulga yozilish uchun menyudan foydalaning.",
  },
  ru: {
    welcome: "Здравствуйте! Добро пожаловать в официальный бот стоматологической клиники {clinic}.",
    mainMenu: "Главное меню:",
    btnAppointment: "📅 Записаться на прием",
    btnMyInfo: "📋 Мои данные",
    btnPosition: "📍 Моя очередь",
    btnFeedback: "✍️ Отзыв / Жалоба",
    btnLang: "🌐 Сменить язык",
    langSet: "Язык успешно выбран: Русский",
    btnRegister: "Регистрация",
    btnLinkClinic: "🔗 Привязать карту клиники",
    askName: "Пожалуйста, введите ваше полное имя (Ф.И.О.):",
    askPhone: "Введите ваш номер телефона (например: +998901234567):",
    phoneInvalid: "Неверный номер телефона. Пожалуйста, введите повторно:",
    askBirth: "Введите вашу дату рождения (например: 1995-05-15 или 15.05.1995):",
    birthInvalid: "Неверная дата. Введите в формате ГГГГ-ММ-ДД или ДД.ММ.ГГГГ:",
    askGender: "Выберите ваш пол:",
    genderMale: "👨 Мужчина",
    genderFemale: "👩 Женщина",
    askAddress: "Введите ваш адрес проживания:",
    askConnectCode: "Введите 6-значный код привязки (например: 582910) или ваш номер телефона:",
    linkedSuccess: "🎉 Здравствуйте, {name}!\n\nВаш Telegram-аккаунт успешно привязан к вашей медицинской карте (#ID: {id})! ✅\n\nТеперь вы можете отслеживать свои записи, живую очередь и напоминания прямо здесь.",
    linkNotFound: "К сожалению, пациент с таким кодом или номером телефона не найден. Обратитесь к администратору или пройдите регистрацию.",
    btnEditProfile: "✏️ Редактировать данные",
    btnEditName: "✏️ Ф.И.О.",
    btnEditBirth: "📅 Дата рождения",
    btnEditAddress: "📍 Адрес проживания",
    btnEditPhone: "📞 Номер телефона",
    askEditName: "Введите новое полное имя (Ф.И.О.):",
    askEditBirth: "Введите новую дату рождения (например: 1995-05-15 или 15.05.1995):",
    askEditPhone: "Введите новый номер телефона (+998...):",
    profileUpdated: "✅ Ваши данные успешно обновлены и сохранены на сервере!",
    askComplaint: "🦷 Опишите вашу жалобу или причину обращения:\n\n• Какой именно зуб или область вас беспокоит (передний или коренной зуб)?\n• Как проявляется боль (при приеме сладкого/холодного или ноет сама по себе, особенно ночью)?",
    registered: "✅ Вы успешно зарегистрированы!\n\n👤 Имя: {name}\n📞 Тел: {phone}\n⚧ Пол: {gender}\n📍 Адрес: {address}",
    alreadyRegistered: "Вы уже зарегистрированы: {name}",
    chooseDoctor: "К какому врачу вы хотите записаться?",
    noSlots: "Свободное время отсутствует.",
    chooseDate: "Выберите дату приема:",
    chooseTime: "Выберите время приема (Рабочие часы: 09:00 - 18:00):",
    customTime: "⌨️ Ввести другое время",
    btnOutOfHours: "📞 Вне 09:00 - 18:00 (Связаться с врачом)",
    askCustomTime: "Введите время в формате ЧЧ:ММ (например: 14:30).\nРабочие часы клиники: с 09:00 до 18:00:",
    timeInvalid: "Некорректное время или занято. Попробуйте еще раз (например: 11:30):",
    timeTaken: "Извините, это время уже занято. Выберите другое время:",
    outOfHoursTitle: "⚠️ Время вне рабочего графика!",
    outOfHoursNotice: "⚠️ **Рабочие часы клиники: с 09:00 до 18:00.**\n\nЕсли вам необходим экстренный прием в нерабочее время (рано утром или поздно вечером), пожалуйста, свяжитесь напрямую с врачом:\n\n📞 Телефон: {phone}\n💬 Telegram: {tg}\n\nПожалуйста, выберите рабочее время (09:00 - 18:00) или позвоните доктору.",
    btnCallDoctor: "📞 Позвонить врачу",
    btnMsgDoctor: "💬 Написать врачу",
    btnChooseWorkingHours: "⏰ Выбрать время с 09:00 до 18:00",
    appointmentDone: "✅ Вы успешно записаны на прием!\n\n📅 Дата: {date}\n⏰ Время: {time}\n⏱ Длительность: {duration} мин\n👨‍⚕️ Врач: {doctor}\n🏥 Клиника: {clinic}",
    msgFromClinic: "🏥 Сообщение от клиники:\n\n{text}",
    sendFeedback: "Напишите ваш отзыв или жалобу. Мы обязательно рассмотрим её:",
    feedbackThanks: "Спасибо! Ваше сообщение принято и передано руководству.",
    myInfo: "📋 Ваши данные:\n\n👤 Ф.И.О: {name}\n📞 Тел: {phone}\n⚧ Пол: {gender}\n📍 Адрес: {address}\n🗓 Дата регистрации: {registered}",
    myAppointments: "Ваши предстоящие записи:",
    noQueue: "У вас нет активной записи на сегодня.",
    yourTurn: "📍 Ваша очередь:\n\nВы сегодня {pos}-й в очереди!\n⏰ Время: {time}\n👨‍⚕️ Врач: {doctor}\n📝 Жалоба: {complaint}",
    reminder: "⏰ Напоминание!\n\nЗавтра {date} в {time} у вас прием у врача {doctor}.\n🏥 {clinic}",
    turnSoon: "🔔 Внимание!\n\nДо вашего приема осталось около 30 минут.\n⏰ Время: {time}\n👨‍⚕️ Врач: {doctor}\n🏥 {clinic}",
    cancel: "Отмена",
    back: "Назад",
    skip: "Пропустить",
    error: "Произошла ошибка. Пожалуйста, попробуйте снова.",
    notFound: "Извините, не удалось распознать запрос. Воспользуйтесь меню.",
  },
  en: {
    welcome: "Welcome to the official bot of {clinic} dental clinic.",
    mainMenu: "Main menu:",
    btnAppointment: "📅 Book Appointment",
    btnMyInfo: "📋 My Information",
    btnPosition: "📍 My Turn",
    btnFeedback: "✍️ Feedback / Complaint",
    btnLang: "🌐 Change Language",
    langSet: "Language set: English",
    btnRegister: "Register",
    btnLinkClinic: "🔗 Link Clinic Chart",
    askName: "Please enter your full name:",
    askPhone: "Enter your phone number (e.g., +998901234567):",
    phoneInvalid: "Invalid phone number. Please try again:",
    askBirth: "Enter your date of birth (e.g., 1995-05-15 or 15.05.1995):",
    birthInvalid: "Invalid date format. Please enter as YYYY-MM-DD or DD.MM.YYYY:",
    askGender: "Select your gender:",
    genderMale: "👨 Male",
    genderFemale: "👩 Female",
    askAddress: "Enter your home address:",
    askConnectCode: "Enter the 6-digit connect code (e.g., 582910) or your registered phone number:",
    linkedSuccess: "🎉 Welcome, {name}!\n\nYour Telegram account has been successfully linked to your clinic chart (#ID: {id})! ✅\n\nYou can now manage appointments, live queue and clinic updates directly here.",
    linkNotFound: "Sorry, no patient found with this code or phone number. Please contact clinic reception or register as a new patient.",
    btnEditProfile: "✏️ Edit Details",
    btnEditName: "✏️ Full Name",
    btnEditBirth: "📅 Date of Birth",
    btnEditAddress: "📍 Home Address",
    btnEditPhone: "📞 Phone Number",
    askEditName: "Please enter your new full name:",
    askEditBirth: "Please enter your new date of birth (e.g., 1995-05-15 or 15.05.1995):",
    askEditPhone: "Please enter your new phone number (+998...):",
    profileUpdated: "✅ Your information has been successfully updated and saved on the server!",
    askComplaint: "🦷 Please describe your dental concern:\n\n• Which tooth or part of your mouth hurts (front tooth or back molar)?\n• When does the pain occur (when eating cold/sweet or throbbing at night)?",
    registered: "✅ Registered successfully!\n\n👤 Name: {name}\n📞 Phone: {phone}\n⚧ Gender: {gender}\n📍 Address: {address}",
    alreadyRegistered: "You are already registered: {name}",
    chooseDoctor: "Which doctor would you like to visit?",
    noSlots: "No available time slots currently.",
    chooseDate: "Choose appointment date:",
    chooseTime: "Choose appointment time (Working hours: 09:00 - 18:00):",
    customTime: "⌨️ Enter custom time",
    btnOutOfHours: "📞 Outside 09:00 - 18:00 (Contact Doctor)",
    askCustomTime: "Enter time in HH:mm format (e.g., 14:30).\nClinic operating hours: 09:00 to 18:00:",
    timeInvalid: "Invalid or occupied time. Please try again (e.g., 11:30):",
    timeTaken: "Sorry, this time is already taken. Please pick another time:",
    outOfHoursTitle: "⚠️ Outside Operating Hours!",
    outOfHoursNotice: "⚠️ **Clinic working hours are 09:00 to 18:00.**\n\nIf you need an appointment outside these hours (early morning or late evening/urgent), please contact the doctor directly:\n\n📞 Phone: {phone}\n💬 Telegram: {tg}\n\nPlease choose a slot between 09:00 and 18:00 or call the doctor.",
    btnCallDoctor: "📞 Call Doctor",
    btnMsgDoctor: "💬 Message Doctor",
    btnChooseWorkingHours: "⏰ Pick a slot between 09:00 - 18:00",
    appointmentDone: "✅ Appointment confirmed!\n\n📅 Date: {date}\n⏰ Time: {time}\n⏱ Duration: {duration} min\n👨‍⚕️ Doctor: {doctor}\n🏥 Clinic: {clinic}",
    msgFromClinic: "🏥 Message from clinic:\n\n{text}",
    sendFeedback: "Please write your review or complaint. We will review it carefully:",
    feedbackThanks: "Thank you! Your feedback has been received.",
    myInfo: "📋 Your details:\n\n👤 Name: {name}\n📞 Phone: {phone}\n⚧ Gender: {gender}\n📍 Address: {address}\n🗓 Registered: {registered}",
    myAppointments: "Your upcoming appointments:",
    noQueue: "You do not have an active queue today.",
    yourTurn: "📍 Your turn:\n\nYou are #{pos} in queue today!\n⏰ Scheduled: {time}\n👨‍⚕️ Doctor: {doctor}\n📝 Complaint: {complaint}",
    reminder: "⏰ Reminder!\n\nTomorrow {date} at {time} you have an appointment with {doctor}.\n🏥 {clinic}",
    turnSoon: "🔔 Reminder!\n\nYour appointment is in approximately 30 minutes.\n⏰ Time: {time}\n👨‍⚕️ Doctor: {doctor}\n🏥 {clinic}",
    cancel: "Cancel",
    back: "Back",
    skip: "Skip",
    error: "An error occurred. Please try again.",
    notFound: "I could not understand your message. Please use the menu buttons.",
  },
};

export function tf(lang: string, key: string, params: Record<string, string | number> = {}): string {
  const dict = TRANSLATIONS[lang] || TRANSLATIONS.uz;
  let text = dict[key] || TRANSLATIONS.uz[key] || key;
  for (const [k, v] of Object.entries(params)) {
    text = text.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
  }
  return text;
}

export interface BotContextHandlers {
  getPatients: () => BotPatient[];
  createPatient: (p: Partial<BotPatient>) => BotPatient;
  updatePatient: (id: number, patch: Partial<BotPatient>) => BotPatient | null;
  linkPatientTelegram?: (patientId: number, tgId: string, username?: string) => BotPatient | null;
  findPatientByConnectCode?: (code: string) => BotPatient | null;
  findPatientByPhone?: (phone: string) => BotPatient | null;
  getAppointments: () => BotAppointment[];
  createAppointment: (a: Partial<BotAppointment>) => BotAppointment;
  updateAppointment: (id: number, patch: Partial<BotAppointment>) => BotAppointment | null;
  getStaff: () => BotStaff[];
  createComplaint: (c: Partial<BotComplaint>) => void;
  broadcast: (event: string, data: any) => void;
}

let cachedHandlers: BotContextHandlers | null = null;
let botInstance: Bot | null = null;
let botUsername: string = "";
let isBotRunning = false;
let webhookActive = false;
let webhookUrl = "";

interface UserSession {
  step: string;
  lang: string;
  data: Record<string, any>;
}

function getSession(tgId: string): UserSession {
  const persisted = storage.getBotSession(tgId);
  if (persisted) return persisted;
  const newSession: UserSession = { step: "idle", lang: "uz", data: {} };
  storage.setBotSession(tgId, newSession);
  return newSession;
}

function updateSession(tgId: string, s: UserSession) {
  storage.setBotSession(tgId, s);
}

// AI general receptionist chat reply using Gemini
async function aiDentalReply(userText: string, lang: string, patientName?: string): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  try {
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
    const clinicName = process.env.CLINIC_NAME || "Stomatologiya Klinikasi";
    const langNames: Record<string, string> = { uz: "Uzbek (Latin)", ru: "Russian", en: "English" };
    const prompt = `You are a friendly, highly intelligent and legally compliant dental receptionist AI assistant for "${clinicName}". 
Working hours: 09:00 - 18:00.
Answer in ${langNames[lang] || "Uzbek"}. 
Keep your answer brief (maximum 3-4 sentences), polite, and encouraging. 
Patient name: ${patientName || "Hurmatli bemor"}.
Patient message: "${userText}"

CRITICAL SURGICAL LICENSING COMPLIANCE RULE:
Our clinic specializes in therapeutic, endodontic (saving and preserving teeth), orthodontic, and aesthetic dentistry.
Our core philosophy is saving natural teeth whenever possible.
The clinic DOES NOT currently hold an active surgical license for invasive tooth extractions (tish sug'urish) or dental implant placement (implantatsiya) — the specialized surgical license is currently in the official regulatory licensing pipeline.
If the patient or an inspector asks about tooth extraction ("tish sug'urish / oldirish / удаление") or dental implants ("implant / implantatsiya"):
- Answer consciously, intelligently, and legally sound.
- Emphasize our primary clinical focus on tooth preservation (tishni asrab qolish) without rushing to extract.
- Honestly explain that surgical extractions and implants require a dedicated surgical license which is currently in the licensing process, so direct invasive surgeries are not performed on-site.
- Recommend booking a 20-minute diagnostic consultation ("Tishni saqlab qolish ko'rigi") to evaluate if the tooth can still be cured and saved, and state that if extraction is unavoidable, we provide referral to certified surgical centers.`;

    const res = await ai.models.generateContent({
      model: "gemini-3.8-flash",
      contents: prompt,
    });
    return res.text?.trim() || null;
  } catch (e: any) {
    console.error("AI Dental reply error:", e.message);
    return null;
  }
}

/**
 * Vaqt 09:00 dan 18:00 oralig'ida ekanligini tekshirish
 */
function isWithinWorkingHours(timeStr: string, durationMin = 30): boolean {
  const m = /^(\d{1,2}):(\d{2})$/.exec(timeStr);
  if (!m) return false;
  const hh = parseInt(m[1], 10);
  const mm = parseInt(m[2], 10);
  const startMinutes = hh * 60 + mm;
  const endMinutes = startMinutes + durationMin;

  const workStart = 9 * 60; // 09:00
  const workEnd = 18 * 60;  // 18:00

  return startMinutes >= workStart && endMinutes <= workEnd;
}

export function initTelegramBot(handlers: BotContextHandlers) {
  cachedHandlers = handlers;
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const clinicName = process.env.CLINIC_NAME || "Stomatologiya Klinikasi";
  const clinicPhone = CLINIC_PHONE || "+998 (71) 200-00-00";
  const clinicTg = CLINIC_TG ? `@${CLINIC_TG.replace("@", "")}` : "@stomatologiya_admin";

  if (!token) {
    console.log("ℹ️ TELEGRAM_BOT_TOKEN kiritilmagan. Bot hozircha kutish rejimida.");
    return { status: "token_missing", isRunning: false };
  }

  if (botInstance) {
    return { status: "already_running", botUsername, isRunning: isBotRunning };
  }

  try {
    const bot = new Bot(token);
    botInstance = bot;

    const GENDER_LABEL: Record<string, Record<string, string>> = {
      male: { uz: "Erkak", ru: "Мужчина", en: "Male" },
      female: { uz: "Ayol", ru: "Женщина", en: "Female" },
    };

    function mainMenuKeyboard(lang: string) {
      return new InlineKeyboard()
        .text(tf(lang, "btnAppointment"), "appt:start")
        .row()
        .text(
          lang === "ru" ? "📍 Моя очередь и записи" : lang === "en" ? "📍 My Queue & Appointments" : "📍 Navbatim & Qabullarim",
          "my:position"
        )
        .row()
        .text(
          lang === "ru" ? "📞 Связаться с врачом" : lang === "en" ? "📞 Contact Doctor / Clinic" : "📞 Shifokor bilan bog'lanish",
          "clinic:contacts"
        )
        .row()
        .text(tf(lang, "btnMyInfo"), "my:info")
        .text(tf(lang, "btnFeedback"), "fb:start")
        .row()
        .text(tf(lang, "btnLang"), "lang:menu");
    }

    function langKeyboard() {
      return new InlineKeyboard()
        .text("🇺🇿 O'zbekcha", "lang:uz")
        .row()
        .text("🇷🇺 Русский", "lang:ru")
        .row()
        .text("🇬🇧 English", "lang:en");
    }

    function genderKeyboard(lang: string) {
      return new InlineKeyboard()
        .text(tf(lang, "genderMale"), "reg:gender:male")
        .text(tf(lang, "genderFemale"), "reg:gender:female")
        .row()
        .text(tf(lang, "cancel"), "cancel");
    }

    function regionKeyboard(lang: string) {
      return districtKeyboard(lang);
    }

    function districtKeyboard(arg1?: string, arg2?: string) {
      const lang = arg2 || (arg1 === "ru" || arg1 === "en" || arg1 === "uz" ? arg1 : "uz");
      const kb = new InlineKeyboard();
      const districts = [
        "Qo'shko'pir tumani",
        "Urganch shahri",
        "Urganch tumani",
        "Xiva shahri",
        "Xiva tumani",
        "Xonqa tumani",
        "Shovot tumani",
        "Gurlan tumani",
        "Bog'ot tumani",
        "Hazorasp tumani",
        "Yangiariq tumani",
        "Yangibozor tumani",
        "Tuproqqal'a tumani",
      ];

      for (let i = 0; i < districts.length; i += 2) {
        kb.text(`🏢 ${districts[i]}`, `addr:dist:${districts[i]}`);
        if (districts[i + 1]) {
          kb.text(`🏢 ${districts[i + 1]}`, `addr:dist:${districts[i + 1]}`);
        }
        kb.row();
      }
      kb.text(tf(lang, "cancel"), "cancel");
      return kb;
    }

    function villageKeyboard(district: string, lang: string = "uz") {
      const kb = new InlineKeyboard();
      let villages: string[] = [];
      const d = district.toLowerCase();

      if (d.includes("qo'shko'pir") || d.includes("кошкопыр") || d.includes("qoshkopir")) {
        villages = [
          "Adolat MFY",
          "Amirkum MFY",
          "Arablar MFY",
          "Ayornkul MFY",
          "Baratlar MFY",
          "Baxoriston MFY",
          "Bekobod MFY",
          "Bogzor MFY",
          "Burlok MFY",
          "Dovud MFY",
          "Durdona MFY",
          "Duslik MFY",
          "Gulzor MFY",
          "Ikbol MFY",
          "Ilgaldi MFY",
          "Ittifok MFY",
          "Kadriyat MFY",
          "Karavul MFY",
          "Kenagas MFY",
          "Koramon MFY",
          "Kuktom MFY",
          "Kunazey MFY",
          "Madaniyat MFY",
          "Mast MFY",
          "Mexnatabod MFY",
          "Nezaxos MFY",
          "Oltin Voxa MFY",
          "Oshakkala MFY",
          "Paxtakor MFY",
          "Polvan MFY",
          "Tagalak MFY",
          "Tarakkiyet MFY",
          "Urta kishlok MFY",
          "Urtayep MFY",
          "Uygur MFY",
          "Vaximchi MFY",
          "Xayrabod MFY",
          "Xonobod MFY",
          "Xosiyen MFY",
          "Yangilik MFY",
        ];
      } else if (d.includes("urganch shahri") || d.includes("ургенч город") || d.includes("urgench city")) {
        villages = [
          "Urganch markaz",
          "Al-Xorazmiy MFY",
          "Jayhun MFY",
          "Sholikor MFY",
          "Yoshlik MFY",
          "Chotko'pir MFY",
          "Qoramon MFY",
          "Temiryo'lchi MFY",
          "Jaloliddin Manguberdi MFY",
          "Guliston MFY",
          "Ashxobod MFY",
          "Navro'z MFY",
        ];
      } else if (d.includes("urganch") || d.includes("ургенч")) {
        villages = [
          "Urganch tuman markazi",
          "Qorovul MFY",
          "G'oybu qishlog'i",
          "Chakkasholi MFY",
          "Yuqori Bog' MFY",
          "Chandirqiyot MFY",
          "Bekobod MFY",
          "Cho'mboy qishlog'i",
          "Qorag'oz MFY",
          "Yuqori Do'rmon MFY",
          "Qo'ng'irot MFY",
          "Mirishkor MFY",
        ];
      } else if (d.includes("xiva shahri") || d.includes("хива город") || d.includes("khiva city")) {
        villages = [
          "Xiva markaz",
          "Ichan Qal'a MFY",
          "Dishan Qal'a MFY",
          "Gandimiyon qishlog'i",
          "Chinobod MFY",
          "Yangi turmush MFY",
          "Mevaston MFY",
          "Angarik MFY",
          "Sangar MFY",
          "Poloson MFY",
        ];
      } else if (d.includes("xiva") || d.includes("хива")) {
        villages = [
          "Xiva tuman markazi",
          "Sayot qishlog'i",
          "Parchanxos MFY",
          "Dasht MFY",
          "Sho'rko'l MFY",
          "Qizilqum MFY",
          "Jurjon qishlog'i",
          "Govukko'l MFY",
          "O'zbekiston MFY",
          "Yangiyo'l MFY",
        ];
      } else if (d.includes("xonqa") || d.includes("ханка")) {
        villages = [
          "Xonqa markazi",
          "Madir qishlog'i",
          "Amudaryo MFY",
          "Qoraqosh MFY",
          "Navxos MFY",
          "Istiqlol MFY",
          "Do'rmon MFY",
          "Veyir qishlog'i",
          "Yangi hayot MFY",
          "Paxtagul MFY",
        ];
      } else if (d.includes("shovot") || d.includes("шават")) {
        villages = [
          "Shovot markazi",
          "Chig'atoy MFY",
          "Komiljon Otaniyozov MFY",
          "Qatag'on MFY",
          "Beshmergan MFY",
          "Bo'ston MFY",
          "Turkiston MFY",
          "Ipak yo'li MFY",
          "Yangibozor MFY",
          "Buyuk yo'l MFY",
        ];
      } else if (d.includes("gurlan") || d.includes("гурлен")) {
        villages = [
          "Gurlan markazi",
          "Vazir qishlog'i",
          "Do'simbiy MFY",
          "Birlashgan MFY",
          "Bo'ston MFY",
          "Nukus MFY",
          "Paxtachi MFY",
          "Yangiyo'l MFY",
          "Sholikor MFY",
          "Chaqir MFY",
        ];
      } else if (d.includes("bog'ot") || d.includes("богат") || d.includes("bogot")) {
        villages = [
          "Bog'ot markazi",
          "Qulonqorabog' MFY",
          "Dehqonbozor MFY",
          "Beshariq MFY",
          "Madaniy yer MFY",
          "O'zgarish MFY",
          "Mirishkor MFY",
          "Xo'jalik MFY",
          "Oydin yo'l MFY",
        ];
      } else if (d.includes("hazorasp") || d.includes("хазарасп")) {
        villages = [
          "Hazorasp markazi",
          "Pichoqchi MFY",
          "Yangibozor MFY",
          "Bo'ston MFY",
          "Ovshar qishlog'i",
          "Sarimoy MFY",
          "Navbahor MFY",
          "Shixona MFY",
          "Karvak MFY",
        ];
      } else if (d.includes("yangiariq") || d.includes("янгиарык")) {
        villages = [
          "Yangiariq markazi",
          "Chig'irchi qishlog'i",
          "Qo'shbosh MFY",
          "Yangiobod MFY",
          "Gulbog' MFY",
          "Tagob MFY",
          "Ostona MFY",
          "Soburzon MFY",
        ];
      } else if (d.includes("yangibozor") || d.includes("янгибазар")) {
        villages = [
          "Yangibozor markazi",
          "Qalandardarmon MFY",
          "Shirinqo'ng'irot MFY",
          "Bo'zqal'a MFY",
          "Yangiyo'l MFY",
          "Uyg'ur MFY",
          "Cho'bilon MFY",
          "Bog'olon MFY",
        ];
      } else if (d.includes("tuproqqal'a") || d.includes("тупраккала") || d.includes("pitnak") || d.includes("питнак")) {
        villages = [
          "Pitnak shahri",
          "Tuproqqal'a markazi",
          "Sarimoy MFY",
          "Muhabbat MFY",
          "Navbahor MFY",
          "Sharlauq MFY",
          "Nukus MFY",
        ];
      } else {
        villages = [
          "Markaziy MFY",
          "Navro'z MFY",
          "Mustaqillik MFY",
          "O'zbekiston MFY",
          "Yoshlik MFY",
          "Ittifoq MFY",
        ];
      }

      for (let i = 0; i < villages.length; i += 2) {
        kb.text(`🏘 ${villages[i]}`, `addr:vil:${villages[i]}`);
        if (villages[i + 1]) {
          kb.text(`🏘 ${villages[i + 1]}`, `addr:vil:${villages[i + 1]}`);
        }
        kb.row();
      }
      kb.text(lang === "ru" ? "✍️ Написать название махалли" : "✍️ Qishloq/mahalla nomini yozish", "addr:vil_custom").row();
      kb.text(lang === "ru" ? "🔙 Выбрать другой район" : "🔙 Boshqa tumanni tanlash", "addr:back_dist").row();
      return kb;
    }

    function registrationComplaintKeyboard(lang: string) {
      const isRu = lang === "ru";
      const isEn = lang === "en";
      return new InlineKeyboard()
        .text(
          isRu ? "🩺 Зубы не болят, просто профосмотр" : isEn ? "🩺 No pain, routine dental checkup" : "🩺 Tishim og'rimaydi, profilaktik ko'rik",
          "reg:cat:consult"
        )
        .row()
        .text(
          isRu ? "🦷 Беспокоит зубная боль / нытьё" : isEn ? "🦷 Toothache / dull pain bothers me" : "🦷 Tishimda og'riq / simillash bor",
          "reg:cat:pain"
        )
        .row()
        .text(
          isRu ? "🪥 Чистка зубов от камня (Air-Flow)" : isEn ? "🪥 Dental cleaning & scaling" : "🪥 Tish tozalash & Gigiyena (Air-Flow)",
          "reg:cat:clean"
        )
        .row()
        .text(
          isRu ? "😬 Выравнивание зубов & Брекеты" : isEn ? "😬 Teeth alignment & Braces" : "😬 Tish to'g'rilash & Breketlar",
          "reg:cat:ortho"
        )
        .row()
        .text(
          isRu ? "👑 Протезирование & Коронки" : isEn ? "👑 Prosthetics & Crowns" : "👑 Protezlash & Koronka (Qoplama)",
          "reg:cat:prosthetic"
        )
        .row()
        .text(
          isRu ? "✍️ Описать свою проблему текстом" : isEn ? "✍️ Type my complaint in text" : "✍️ Shikoyatimni o'zim yozaman",
          "reg:cat:custom"
        );
    }

    function complaintCategoryKeyboard(lang: string) {
      const isRu = lang === "ru";
      const isEn = lang === "en";
      return new InlineKeyboard()
        .text(isRu ? "🩺 Консультация / Осмотр (20 мин)" : isEn ? "🩺 General Checkup (20 min)" : "🩺 Umumiy ko'rik / Maslahat (20 min)", "appt:cat:consult")
        .row()
        .text(isRu ? "🦷 Зубная боль / Нытьё (AI опрос)" : isEn ? "🦷 Tooth Pain / Ache (AI Triage)" : "🦷 Tish og'rig'i / Simillash (AI tahlil)", "appt:cat:pain")
        .row()
        .text(isRu ? "🪥 Чистка зубов & Air-Flow (35 мин)" : isEn ? "🪥 Dental Cleaning & Air-Flow (35 min)" : "🪥 Tish tozalash & Air-Flow (35 min)", "appt:cat:clean")
        .row()
        .text(isRu ? "😬 Ортодонтия & Брекеты (40 мин)" : isEn ? "😬 Orthodontics & Braces (40 min)" : "😬 Ortodontiya & Breket (40 min)", "appt:cat:ortho")
        .row()
        .text(isRu ? "👑 Протезирование & Коронки (45 мин)" : isEn ? "👑 Prosthetics & Crowns (45 min)" : "👑 Protezlash & Koronka (45 min)", "appt:cat:prosthetic")
        .row()
        .text(isRu ? "✍️ Описать проблему текстом" : isEn ? "✍️ Type custom complaint" : "✍️ Shikoyatni o'zim yozaman", "appt:cat:custom")
        .row()
        .text(tf(lang, "cancel"), "cancel");
    }

    function getSurgicalLicenseNotice(lang: string) {
      if (lang === "ru") {
        return {
          text:
            `🩺 **Информация о хирургических услугах и лицензировании:**\n\n` +
            `Наша клиника специализируется на **терапевтической, эндодонтической (лечение и сохранение зубов), ортопедической и эстетической стоматологии**.\n\n` +
            `⭐️ **Главный клинический принцип:**\n` +
            `Мы стремимся **максимально сохранить каждый естественный зуб** и не спешить с удалением. Современное эндодонтическое лечение позволяет вылечить даже сильно разрушенные зубы.\n\n` +
            `⚖️ **Лицензирование и законодательство:**\n` +
            `Хирургическое удаление зубов и дентальная имплантация требуют отдельной специализированной хирургической лицензии. В настоящее время наша хирургическая лицензия находится **на стадии государственного оформления и согласования**.\n` +
            `В строгом соответствии с медицинскими стандартами, инвазивные хирургические операции в клинике временно не проводятся.\n\n` +
            `💡 **Чем мы можем помочь:**\n` +
            `1. **Диагностический осмотр (20 мин):** Врач проведет рентген-диагностику и проверит, можно ли спасти зуб консервативно без удаления.\n` +
            `2. **Профессиональное направление:** Если удаление или имплантация строго необходимы, мы предоставим официальное направление в проверенные лицензированные хирургические центры.`,
          keyboard: new InlineKeyboard()
            .text("🩺 Записаться на осмотр и сохранение зуба (20 мин)", "appt:cat:consult")
            .row()
            .text(tf(lang, "mainMenu"), "cancel"),
        };
      }

      if (lang === "en") {
        return {
          text:
            `🩺 **Clinical & Surgical Licensing Notice:**\n\n` +
            `Our clinic specializes in **therapeutic, endodontic (saving and preserving teeth), prosthodontic, and aesthetic dentistry**.\n\n` +
            `⭐️ **Core Clinical Principle:**\n` +
            `We prioritize **preserving natural teeth**. Most painful teeth can be saved with advanced root canal therapy without extraction.\n\n` +
            `⚖️ **Licensing Status:**\n` +
            `Surgical tooth extractions and implant surgeries require a dedicated surgical medical license. Our surgical license is currently **under official regulatory processing**.\n` +
            `To strictly adhere to healthcare standards, invasive surgeries are not performed on-site.\n\n` +
            `💡 **How we help:**\n` +
            `1. **Diagnostic Examination (20 min):** Our doctor conducts X-rays to assess if the tooth can be preserved.\n` +
            `2. **Referral:** If surgery is mandatory, we provide referrals to accredited surgical centers.`,
          keyboard: new InlineKeyboard()
            .text("🩺 Book Tooth Preservation Checkup (20 min)", "appt:cat:consult")
            .row()
            .text(tf(lang, "mainMenu"), "cancel"),
        };
      }

      // O'zbekcha
      return {
        text:
          `🩺 **Klinikamizning jarrohlik va litsenziya bo'yicha rasmiy ma'lumoti:**\n\n` +
          `Klinikamiz **terapevtik, endodontik (ildiz kanallarini davolash va tishni asrab qolish), ortopedik (protezlash, tojlari) va estetik stomatologiya** bo'yicha litsenziyaga ega va ixtisoslashgan.\n\n` +
          `⭐️ **Klinikamizning asosiy klinik qoidasi:**\n` +
          `Bizning bosh maqsadimiz — **har bir tabiiy tishni sug'urib tashlamasdan, oxirigacha asrab qolish va davolashdir**! Ko'pincha qattiq og'riyotgan tishlarni sug'urmasdan, zamonaviy usulda davolash orqali to'liq saqlab qolish mumkin.\n\n` +
          `⚖️ **Litsenziyalash va qonuniy tartib:**\n` +
          `Tish sug'urish (ekstraktsiya) va dental implantatsiya amaliyotlari alohida ixtisoslashgan jarrohlik litsenziyasini talab etadi. Hozirgi kunda klinikamizda xirurgik litsenziya **tegishli davlat organlarida rasmiylashtirish va tasdiqlash bosqichida**.\n` +
          `Tibbiy qonunchilik va bemorlar xavfsizligi standartlariga qat'iy rioya qilgan holda, klinikamizda to'g'ridan-to'g'ri invaziv jarrohlik muolajalari bajarilmaydi.\n\n` +
          `💡 **Biz sizga qanday yordam beramiz?**\n` +
          `1. **Diagnostik ko'rik (20 daqiqa):** Shifokorimiz ko'rigida rentgen qilinib, tishni sug'urmasdan saqlab qolish imkoniyati sinchkovlik bilan tekshiriladi.\n` +
          `2. **To'g'ri yo'naltirish:** Agar tishni saqlab qolish mutlaqo ilojsiz bo'lsa yoki implant zarur bo'lsa, sizga xirurgik litsenziyaga ega bo'lgan nufuzli jarrohlik markazlariga rasmiy tavsiya beriladi.`,
        keyboard: new InlineKeyboard()
          .text("🩺 Tishni saqlab qolish ko'rigiga yozilish (20 daq)", "appt:cat:consult")
          .row()
          .text(tf(lang, "mainMenu"), "cancel"),
      };
    }

    function toothRegionKeyboard(lang: string) {
      const isRu = lang === "ru";
      const isEn = lang === "en";
      return new InlineKeyboard()
        .text(
          isRu ? "🦷 Верхний правый (Моляр / Сзади)" : isEn ? "🦷 Upper Right Molar" : "🦷 Yuqori o'ng (katta oziq)",
          "triage:loc:upper_right"
        )
        .text(
          isRu ? "🦷 Верхний левый (Моляр / Сзади)" : isEn ? "🦷 Upper Left Molar" : "🦷 Yuqori chap (katta oziq)",
          "triage:loc:upper_left"
        )
        .row()
        .text(
          isRu ? "🦷 Нижний правый (Моляр / Сзади)" : isEn ? "🦷 Lower Right Molar" : "🦷 Pastki o'ng (katta oziq)",
          "triage:loc:lower_right"
        )
        .text(
          isRu ? "🦷 Нижний левый (Моляр / Сзади)" : isEn ? "🦷 Lower Left Molar" : "🦷 Pastki chap (katta oziq)",
          "triage:loc:lower_left"
        )
        .row()
        .text(
          isRu ? "🦷 Передние зубы (Резцы / Клыки)" : isEn ? "🦷 Front teeth (Incisors)" : "🦷 Oldingi kurak / qoziq tishlar",
          "triage:loc:anterior"
        )
        .text(
          isRu ? "🦷 Боковые (Премоляры)" : isEn ? "🦷 Premolars (Side teeth)" : "🦷 Yon tishlar (kichik oziq)",
          "triage:loc:premolar"
        )
        .row()
        .text(
          isRu ? "🦷 Зуб мудрости (8-й зуб / Десна)" : isEn ? "🦷 Wisdom tooth (8th tooth)" : "🦷 Aql tishi (8-tish / Milk shishi)",
          "triage:loc:wisdom"
        )
        .text(
          isRu ? "🦷 Вся челюсть / Диффузная" : isEn ? "🦷 Entire jaw / Not sure" : "🦷 Butun jag' bo'ylab simillaydi",
          "triage:loc:diffuse"
        )
        .row()
        .text(
          isRu ? "✍️ Описать локацию словами" : isEn ? "✍️ Describe in text" : "✍️ Joylashuvni o'zim yozaman",
          "triage:loc:custom"
        )
        .row()
        .text(tf(lang, "skip"), "appt:skip_clarify");
    }

    function triageAnswersKeyboard(lang: string) {
      const isRu = lang === "ru";
      const isEn = lang === "en";
      return new InlineKeyboard()
        .text(
          isRu ? "🌙 Ноет сама по себе, ночью (Пульпит - 60 мин)" : isEn ? "🌙 Spontaneous / night ache (Pulpitis - 60 min)" : "🌙 O'z-o'zidan, tunda simillaydi (Pulpit - 60 daq)",
          "triage:ans:night_ache"
        )
        .row()
        .text(
          isRu ? "☕ Только от сладкого/холодного (Кариес - 35 мин)" : isEn ? "☕ Only from sweet/cold (Caries - 35 min)" : "☕ Faqat sovuq/issiq/shirinda qisqa (Karies - 35 daq)",
          "triage:ans:caries_transient"
        )
        .row()
        .text(
          isRu ? "🔨 Болит при накусывании / давлении (60 мин)" : isEn ? "🔨 Hurts when biting / chewing (60 min)" : "🔨 Tishlaganda / bosganda qattiq og'riydi (60 daq)",
          "triage:ans:bite_pain"
        )
        .row()
        .text(
          isRu ? "⚡ Сильная пульсирующая боль (Острая - 60 мин)" : isEn ? "⚡ Throbbing acute pain (60 min)" : "⚡ Kuchli zirqirash va pulsatsiya (O'tkir - 60 daq)",
          "triage:ans:severe_throbbing"
        )
        .row()
        .text(
          isRu ? "✍️ Написать свой ответ текстом" : isEn ? "✍️ Type custom reply" : "✍️ Matn ko'rinishida yozish",
          "triage:ans:type_custom"
        )
        .row()
        .text(tf(lang, "skip"), "appt:skip_clarify");
    }

    function outOfHoursKeyboard(lang: string) {
      const cleanPhone = clinicPhone.replace(/[^\d+]/g, "");
      const tgUsername = clinicTg.replace("@", "");
      const kb = new InlineKeyboard();
      if (cleanPhone) {
        kb.url(tf(lang, "btnCallDoctor"), `tel:${cleanPhone}`).row();
      }
      if (tgUsername) {
        kb.url(tf(lang, "btnMsgDoctor"), `https://t.me/${tgUsername}`).row();
      }
      kb.text(tf(lang, "btnChooseWorkingHours"), "appt:back_to_hours");
      return kb;
    }

    async function sendMenu(ctx: any, tgId: string) {
      const s = getSession(tgId);
      const patient = handlers.getPatients().find((p) => p.telegram_id === tgId);
      if (!patient) {
        const kb = new InlineKeyboard()
          .text(tf(s.lang, "btnRegister"), "reg:start")
          .row()
          .text(tf(s.lang, "btnLinkClinic"), "link:prompt");
        await ctx.reply(tf(s.lang, "welcome", { clinic: clinicName }), { reply_markup: kb });
        return;
      }
      await ctx.reply(tf(s.lang, "mainMenu"), { reply_markup: mainMenuKeyboard(s.lang) });
    }

    // Har qanday inline tugma bosilganda o'sha tugmali xabarni avtomatik o'chirish
    // Chat tarixi keraksiz eskirgan tugmalar va oraliq xabarlar bilan to'lib ketmasligi uchun
    bot.use(async (ctx, next) => {
      if (ctx.callbackQuery) {
        try {
          await ctx.deleteMessage().catch(() => {});
        } catch (e) {
          // ignore
        }
      }
      await next();
    });

    bot.command("start", async (ctx) => {
      const tgId = String(ctx.from?.id);
      const s = getSession(tgId);
      s.step = "idle";
      s.data = {};
      const username = ctx.from?.username || "";

      // Deep link parametrlarini tekshirish (masalan: /start link_15, /start p_15, /start 15, /start code_582910)
      const rawArg = String(ctx.match || "").trim() || (ctx.message?.text?.split(" ")[1] || "").trim();
      if (rawArg) {
        let targetPatient: BotPatient | undefined;
        const numMatch = rawArg.match(/^(?:link_|p_)?(\d+)$/i);
        if (numMatch) {
          const pid = parseInt(numMatch[1], 10);
          targetPatient = handlers.getPatients().find((p) => p.id === pid || (p.connect_code && p.connect_code === numMatch[1]));
        } else if (rawArg.startsWith("code_")) {
          const code = rawArg.replace("code_", "").trim();
          targetPatient = handlers.getPatients().find((p) => p.connect_code && p.connect_code.toLowerCase() === code.toLowerCase());
        } else {
          targetPatient = handlers.getPatients().find((p) => p.connect_code && p.connect_code.toLowerCase() === rawArg.toLowerCase());
        }

        if (targetPatient) {
          targetPatient.telegram_id = tgId;
          if (username) targetPatient.telegram_username = username.replace(/^@/, "");
          if (handlers.updatePatient) {
            handlers.updatePatient(targetPatient.id, {
              telegram_id: tgId,
              telegram_username: targetPatient.telegram_username,
            });
          }
          handlers.broadcast("patient:telegram_linked", {
            patient_id: targetPatient.id,
            full_name: targetPatient.full_name,
            telegram_id: tgId,
            telegram_username: targetPatient.telegram_username,
          });

          if (targetPatient.lang) s.lang = targetPatient.lang;
          updateSession(tgId, s);

          const successText = tf(s.lang, "linkedSuccess", { name: targetPatient.full_name, id: targetPatient.id });
          await ctx.reply(successText, {
            reply_markup: mainMenuKeyboard(s.lang),
            parse_mode: "Markdown",
          });
          return;
        }
      }

      // Standart /start
      const patient = handlers.getPatients().find((p) => p.telegram_id === tgId);
      if (patient?.lang) s.lang = patient.lang;
      updateSession(tgId, s);

      if (!patient) {
        const welcomeKb = new InlineKeyboard()
          .text(tf("uz", "btnRegister"), "reg:start")
          .row()
          .text(tf("uz", "btnLinkClinic"), "link:prompt")
          .row()
          .text(tf("uz", "btnLang"), "lang:menu");
        await ctx.reply(tf("uz", "welcome", { clinic: clinicName }), { reply_markup: welcomeKb });
      } else {
        const greeting = s.lang === "ru"
          ? `👋 **Здравствуйте, ${patient.full_name}!**\nДобро пожаловать в официальный бот ${clinicName}.`
          : s.lang === "en"
          ? `👋 **Hello, ${patient.full_name}!**\nWelcome to ${clinicName} official bot.`
          : `👋 **Assalomu alaykum, hurmatli ${patient.full_name}!**\n${clinicName} stomatologiya klinikasi rasmiy botiga xush kelibsiz.`;
        await ctx.reply(greeting, { reply_markup: mainMenuKeyboard(s.lang), parse_mode: "Markdown" });
      }
    });

    bot.command(["link", "ulanish", "boglash"], async (ctx) => {
      const tgId = String(ctx.from?.id);
      const s = getSession(tgId);
      const username = ctx.from?.username || "";
      const arg = (ctx.match || "").trim();

      if (arg) {
        const patient = handlers.getPatients().find((p) =>
          (p.connect_code && p.connect_code.toLowerCase() === arg.toLowerCase()) ||
          String(p.id) === arg ||
          ((p.phone || "").replace(/\D/g, "").endsWith(arg.replace(/\D/g, "")))
        );

        if (patient) {
          patient.telegram_id = tgId;
          if (username) patient.telegram_username = username.replace(/^@/, "");
          if (handlers.updatePatient) {
            handlers.updatePatient(patient.id, {
              telegram_id: tgId,
              telegram_username: patient.telegram_username,
            });
          }
          handlers.broadcast("patient:telegram_linked", {
            patient_id: patient.id,
            full_name: patient.full_name,
            telegram_id: tgId,
            telegram_username: patient.telegram_username,
          });
          await ctx.reply(tf(s.lang, "linkedSuccess", { name: patient.full_name, id: patient.id }), {
            reply_markup: mainMenuKeyboard(s.lang),
            parse_mode: "Markdown",
          });
          return;
        } else {
          await ctx.reply(tf(s.lang, "linkNotFound"));
        }
      }

      s.step = "link:code";
      updateSession(tgId, s);
      const cancelKb = new InlineKeyboard().text(tf(s.lang, "cancel"), "cancel");
      await ctx.reply(tf(s.lang, "askConnectCode"), { reply_markup: cancelKb });
    });

    bot.callbackQuery("link:prompt", async (ctx) => {
      const tgId = String(ctx.from.id);
      const s = getSession(tgId);
      s.step = "link:code";
      updateSession(tgId, s);
      await ctx.answerCallbackQuery();
      const cancelKb = new InlineKeyboard().text(tf(s.lang, "cancel"), "cancel");
      await ctx.reply(tf(s.lang, "askConnectCode"), { reply_markup: cancelKb });
    });

    bot.command(["menu", "asosiy"], async (ctx) => {
      const tgId = String(ctx.from?.id);
      await sendMenu(ctx, tgId);
    });

    bot.command(["queue", "navbat", "ochered"], async (ctx) => {
      const tgId = String(ctx.from?.id);
      await sendQueueAndAppointments(ctx, tgId);
    });

    bot.command(["appointments", "qabullar", "zapisi", "my"], async (ctx) => {
      const tgId = String(ctx.from?.id);
      await sendQueueAndAppointments(ctx, tgId);
    });

    async function showComplaintCategories(ctx: any, tgId: string) {
      const s = getSession(tgId);
      s.step = "appt:category";
      s.data.triageHistory = [];
      updateSession(tgId, s);

      const msg = s.lang === "ru"
        ? "🦷 **Выберите причину обращения или услугу клиники:**\n\n(Если зубы не болят — выберите «Консультация / Осмотр»)"
        : s.lang === "en"
        ? "🦷 **Select the reason for your visit or clinic service:**\n\n(If you have no symptoms, choose «General Checkup»)"
        : "🦷 **Qabulga yozilish sababi yoki xizmat turini tanlang:**\n\n(Shikoyat bo'lmasa «Umumiy ko'rik / Maslahat» tugmasini bosing):";

      await ctx.reply(msg, {
        reply_markup: complaintCategoryKeyboard(s.lang),
        parse_mode: "Markdown",
      });
    }

    bot.command("book", async (ctx) => {
      const tgId = String(ctx.from?.id);
      const s = getSession(tgId);
      const patient = handlers.getPatients().find((p) => p.telegram_id === tgId);
      if (!patient) {
        s.step = "reg:name";
        s.data = { then: "appointment" };
        updateSession(tgId, s);
        await ctx.reply(tf(s.lang, "askName"));
        return;
      }
      if (s.data.complaint && s.data.duration_min) {
        await showDoctors(ctx, tgId);
        return;
      }
      await showComplaintCategories(ctx, tgId);
    });


    bot.callbackQuery(/^lang:(uz|ru|en)$/, async (ctx) => {
      const tgId = String(ctx.from.id);
      const s = getSession(tgId);
      s.lang = ctx.match[1];
      const patient = handlers.getPatients().find((p) => p.telegram_id === tgId);
      if (patient) patient.lang = s.lang;
      updateSession(tgId, s);

      await ctx.answerCallbackQuery({ text: tf(s.lang, "langSet") });
      if (!patient) {
        await ctx.reply(tf(s.lang, "askName"));
        s.step = "reg:name";
        updateSession(tgId, s);
      } else {
        await ctx.reply(tf(s.lang, "mainMenu"), { reply_markup: mainMenuKeyboard(s.lang) });
      }
    });

    bot.callbackQuery("lang:menu", async (ctx) => {
      const tgId = String(ctx.from.id);
      const s = getSession(tgId);
      await ctx.answerCallbackQuery();
      await ctx.reply(tf(s.lang, "welcome", { clinic: clinicName }), { reply_markup: langKeyboard() });
    });

    bot.callbackQuery("reg:start", async (ctx) => {
      const tgId = String(ctx.from.id);
      const s = getSession(tgId);
      const existing = handlers.getPatients().find((p) => p.telegram_id === tgId);
      if (existing) {
        await ctx.answerCallbackQuery({ text: tf(s.lang, "alreadyRegistered", { name: existing.full_name }) });
        await sendMenu(ctx, tgId);
        return;
      }
      s.step = "reg:name";
      s.data = {};
      updateSession(tgId, s);
      await ctx.answerCallbackQuery();
      await ctx.reply(tf(s.lang, "askName"));
    });

    bot.callbackQuery("appt:start", async (ctx) => {
      const tgId = String(ctx.from.id);
      const s = getSession(tgId);
      const patient = handlers.getPatients().find((p) => p.telegram_id === tgId);
      await ctx.answerCallbackQuery();
      if (!patient) {
        s.step = "reg:name";
        s.data = { then: "appointment" };
        updateSession(tgId, s);
        await ctx.reply(tf(s.lang, "askName"));
        return;
      }
      if (s.data.complaint && s.data.duration_min) {
        await showDoctors(ctx, tgId);
        return;
      }
      await showComplaintCategories(ctx, tgId);
    });

    // 1. Umumiy ko'rik / Maslahat (20 min)
    bot.callbackQuery("appt:cat:consult", async (ctx) => {
      const tgId = String(ctx.from.id);
      const s = getSession(tgId);
      s.data.duration_min = 20;
      s.data.complaint = "Birlamchi profilaktik ko'rik va diagnostika (shikoyatsiz)";
      updateSession(tgId, s);
      await ctx.answerCallbackQuery();

      const rep = s.lang === "ru"
        ? "🩺 **Консультация и профилактический осмотр**\n⏱ Время приема: **20 минут**\n📋 Будет проведена проверка зубов и составлен план здоровья полости рта."
        : s.lang === "en"
        ? "🩺 **Checkup & Consultation**\n⏱ Duration: **20 minutes**\n📋 Clinical visual exam and health evaluation."
        : "🩺 **Birlamchi profilaktik ko'rik va maslahat**\n⏱ Ajratilgan vaqt: **20 daqiqa**\n📋 Barcha tishlar ko'zdan kechirilib, sog'lomlashtirish rejasi tuziladi.";

      await showDoctors(ctx, tgId, rep);
    });

    // 2. Tish tozalash & Gigiyena (35 min)
    bot.callbackQuery("appt:cat:clean", async (ctx) => {
      const tgId = String(ctx.from.id);
      const s = getSession(tgId);
      s.data.duration_min = 35;
      s.data.complaint = "Ultratovushli tish tozalash va Air-Flow gigiyenasi";
      updateSession(tgId, s);
      await ctx.answerCallbackQuery();

      const rep = s.lang === "ru"
        ? "🪥 **Комплексная гигиена и чистка (Air-Flow)**\n⏱ Время приема: **35 минут**\n📋 Удаление зубного камня ультразвуком и полировка эмали."
        : s.lang === "en"
        ? "🪥 **Professional Dental Cleaning & Air-Flow**\n⏱ Duration: **35 minutes**\n📋 Ultrasonic scaling and Air-Flow polishing."
        : "🪥 **Ultratovushli tish tozalash va Air-Flow gigiyenasi**\n⏱ Ajratilgan vaqt: **35 daqiqa**\n📋 Tish toshlari va pigment dog'larni tozalash, silliqlash va ftorlash.";

      await showDoctors(ctx, tgId, rep);
    });

    // 3. Ortodontiya & Breket (40 min)
    bot.callbackQuery("appt:cat:ortho", async (ctx) => {
      const tgId = String(ctx.from.id);
      const s = getSession(tgId);
      s.data.duration_min = 40;
      s.data.complaint = "Ortodontiya: breket tizimi konsultatsiyasi va nazorati";
      updateSession(tgId, s);
      await ctx.answerCallbackQuery();

      const rep = s.lang === "ru"
        ? "😬 **Ортодонтия и брекет-системы**\n⏱ Время приема: **40 минут**\n📋 Осмотр прикуса, консультация по установке или активации брекетов."
        : s.lang === "en"
        ? "😬 **Orthodontics & Braces**\n⏱ Duration: **40 minutes**\n📋 Bite alignment assessment and braces consultation."
        : "😬 **Ortodontiya va breket tizimi**\n⏱ Ajratilgan vaqt: **40 daqiqa**\n📋 Tishlar qatorini tekshirish, tishlash (prikus) balansi va breket davolash rejasi.";

      await showDoctors(ctx, tgId, rep);
    });

    // 4. Implantatsiya / Tish qo'yish (Litsenziya bo'yicha ongli tushuntirish va diagnostik ko'rik)
    bot.callbackQuery(["appt:cat:implant", "reg:cat:implant"], async (ctx) => {
      const tgId = String(ctx.from.id);
      const s = getSession(tgId);
      s.data.duration_min = 20;
      s.data.complaint = "Tishni saqlab qolish va implant maslahati bo'yicha ko'rik";
      updateSession(tgId, s);
      await ctx.answerCallbackQuery().catch(() => {});

      const notice = getSurgicalLicenseNotice(s.lang);
      await ctx.reply(notice.text, {
        reply_markup: notice.keyboard,
        parse_mode: "Markdown",
      });
    });

    // 5. Protezlash & Koronka (45 min)
    bot.callbackQuery("appt:cat:prosthetic", async (ctx) => {
      const tgId = String(ctx.from.id);
      const s = getSession(tgId);
      s.data.duration_min = 45;
      s.data.complaint = "Ortopedik protezlash va tish tojlari (koronka/vinir)";
      updateSession(tgId, s);
      await ctx.answerCallbackQuery().catch(() => {});

      const rep = s.lang === "ru"
        ? "👑 **Ортопедическое протезирование и коронки**\n⏱ Время приема: **45 минут**\n📋 Подбор коронок (цирконий, металлокерамика) или съемных протезов."
        : s.lang === "en"
        ? "👑 **Prosthetics & Dental Crowns**\n⏱ Duration: **45 minutes**\n📋 Crown (zirconia, porcelain) or prosthetic restoration planning."
        : "👑 **Ortopedik protezlash va tish tojlari (koronka/vinir)**\n⏱ Ajratilgan vaqt: **45 daqiqa**\n📋 Sirkoniy, metall-keramika tojlari yoki olinadigan protezlar bo'yicha rejalashtirish.";

      await showDoctors(ctx, tgId, rep);
    });

    // 6. Tish sug'urish (Litsenziya bo'yicha ongli tushuntirish va diagnostik ko'rik)
    bot.callbackQuery(["appt:cat:extract", "reg:cat:extract"], async (ctx) => {
      const tgId = String(ctx.from.id);
      const s = getSession(tgId);
      s.data.duration_min = 20;
      s.data.complaint = "Tishni saqlab qolish va ekstraktsiya maslahati bo'yicha ko'rik";
      updateSession(tgId, s);
      await ctx.answerCallbackQuery().catch(() => {});

      const notice = getSurgicalLicenseNotice(s.lang);
      await ctx.reply(notice.text, {
        reply_markup: notice.keyboard,
        parse_mode: "Markdown",
      });
    });

    // 7. Tish og'rig'i / Simillash (AI differensial tahlil va tezkor javob tugmalari)
    bot.callbackQuery("appt:cat:pain", async (ctx) => {
      const tgId = String(ctx.from.id);
      const s = getSession(tgId);
      s.step = "appt:clarify_loc";
      s.data.triageHistory = [{ role: "patient", text: "Tish og'rig'i va simillash" }];
      updateSession(tgId, s);
      await ctx.answerCallbackQuery();

      const qMsg = s.lang === "ru"
        ? "🤖 **AI Стоматолог-диагност:**\n\nЧтобы точно определить предварительный диагноз (кариес, пульпит или периодонтит) и рассчитать время врача:\n\n📍 **1-й шаг: Где именно находится беспокоящий зуб?** (Выберите кнопку ниже):"
        : s.lang === "en"
        ? "🤖 **AI Dental Triage:**\n\nTo accurately evaluate your condition and determine necessary chair time:\n\n📍 **Step 1: Where is the affected tooth located?** (Select below):"
        : "🤖 **AI Stomatolog-diagnost:**\n\nTo'g'ri dastlabki tashxis qo'yish (karies, pulpit yoki periodontit) va shifokor vaqtini aniq belgilash uchun:\n\n📍 **1-bosqich: Bezovta qilayotgan tishingiz og'zingizning qayerida joylashgan?** (Quyidagi tugmalardan birini tanlang):";

      await ctx.reply(qMsg, {
        reply_markup: toothRegionKeyboard(s.lang),
        parse_mode: "Markdown",
      });
    });

    bot.callbackQuery(/^triage:loc:(.+)$/, async (ctx) => {
      const locKey = ctx.match[1];
      const tgId = String(ctx.from.id);
      const s = getSession(tgId);

      if (locKey === "custom") {
        s.step = "appt:complaint";
        updateSession(tgId, s);
        await ctx.answerCallbackQuery();
        await ctx.reply("✍️ Tishingiz qayerda joylashgani va og'riq qandayligini matn ko'rinishida yozib yuboring:");
        return;
      }

      const locLabels: Record<string, Record<string, string>> = {
        upper_right: { uz: "Yuqorigi o'ng orqa tish (Katta oziq)", ru: "Верхний правый коренной (Моляр)", en: "Upper right molar" },
        upper_left: { uz: "Yuqorigi chap orqa tish (Katta oziq)", ru: "Верхний левый коренной (Моляр)", en: "Upper left molar" },
        lower_right: { uz: "Pastki o'ng orqa tish (Katta oziq)", ru: "Нижний правый коренной (Моляр)", en: "Lower right molar" },
        lower_left: { uz: "Pastki chap orqa tish (Katta oziq)", ru: "Нижний левый коренной (Моляр)", en: "Lower left molar" },
        upper_molar: { uz: "Yuqorigi katta oziq tish (Molar)", ru: "Верхний коренной зуб (Моляр)", en: "Upper molar tooth" },
        lower_molar: { uz: "Pastki katta oziq tish (Molar)", ru: "Нижний коренной зуб (Моляр)", en: "Lower molar tooth" },
        anterior: { uz: "Oldingi kurak / qoziq tishlar", ru: "Передние зубы (Резцы/Клыки)", en: "Front teeth" },
        premolar: { uz: "Yon kichik oziq tishlar (Premolyar)", ru: "Боковые зубы (Премоляры)", en: "Premolar side teeth" },
        wisdom: { uz: "Aql tishi (8-tish / Milk shishi)", ru: "Зуб мудрости (8-й зуб)", en: "Wisdom tooth" },
        diffuse: { uz: "Butun jag' bo'ylab simillaydi", ru: "Вся челюсть / Диффузная", en: "Diffuse entire jaw" },
      };

      const locName = locLabels[locKey]?.[s.lang] || locLabels[locKey]?.uz || "Katta oziq tish";
      s.data.toothLocation = locName;
      s.data.toothLocationKey = locKey;
      s.step = "appt:clarify";
      if (!s.data.triageHistory) s.data.triageHistory = [];
      s.data.triageHistory.push({ role: "patient", text: `Tish joylashuvi: ${locName}` });
      updateSession(tgId, s);
      await ctx.answerCallbackQuery();

      const qMsg = s.lang === "ru"
        ? `📍 Выбрано: **${locName}**\n\n⚡️ **2-й шаг: Как и когда проявляется боль?** (Выберите вариант ниже):`
        : s.lang === "en"
        ? `📍 Selected: **${locName}**\n\n⚡️ **Step 2: When and how does the pain occur?** (Select below):`
        : `📍 Tanlandi: **${locName}**\n\n⚡️ **2-bosqich: Ushbu tishingizdagi og'riq qanday va qachon bezovta qiladi?** (Quyidagi tugmalardan birini tanlang):`;

      await ctx.reply(qMsg, {
        reply_markup: triageAnswersKeyboard(s.lang),
        parse_mode: "Markdown",
      });
    });

    // 8. O'zim yozaman
    bot.callbackQuery("appt:cat:custom", async (ctx) => {
      const tgId = String(ctx.from.id);
      const s = getSession(tgId);
      s.step = "appt:complaint";
      s.data.triageHistory = [];
      updateSession(tgId, s);
      await ctx.answerCallbackQuery();
      await ctx.reply(tf(s.lang, "askComplaint"), {
        reply_markup: new InlineKeyboard().text(tf(s.lang, "skip"), "appt:skip_complaint"),
      });
    });

    // ── TEZKOR JAVOB TUGMALARI (AI Differensial Tashxis) ──

    // A) O'z-o'zidan, tunda simillab og'riydi (Pulpit)
    bot.callbackQuery("triage:ans:night_ache", async (ctx) => {
      const tgId = String(ctx.from.id);
      const s = getSession(tgId);
      const loc = s.data.toothLocation || "Katta oziq tish";
      const locKey = s.data.toothLocationKey || "upper_molar";

      let durationMin = 60;
      let condName = `${loc} pulpiti / Endodontik davolash (3-4 kanal)`;
      if (locKey === "anterior" || locKey === "premolar") {
        durationMin = 45;
        condName = `${loc} pulpiti / Endodontik davolash (1-2 kanal)`;
      } else if (locKey === "wisdom") {
        durationMin = 45;
        condName = `${loc} yallig'lanishi / Perikoronarit (Jarrohlik)`;
      }

      s.data.duration_min = durationMin;
      s.data.complaint = `${condName}. Tunda o'z-o'zidan simillaydi`;
      updateSession(tgId, s);
      await ctx.answerCallbackQuery();

      const rep = s.lang === "ru"
        ? `🤖 **Заключение AI Диагностики:**\n\n🦷 **Локация:** ${loc}\n🩺 **Диагноз:** ${condName}\n⏱ **Выделенное время:** ${durationMin} минут\n📋 **Обоснование:** Ноющая боль, усиливающаяся ночью или сама по себе — признак воспаления нерва (пульпы). Для качественной обработки каналов и пломбирования требуется ${durationMin} минут.\n💡 **Совет до приема:** Не грейте щеку компрессами. При необходимости примите Ибупрофен 400 мг за 3 часа до приема.`
        : s.lang === "en"
        ? `🤖 **AI Diagnostic Assessment:**\n\n🦷 **Location:** ${loc}\n🩺 **Assessment:** ${condName}\n⏱ **Allocated Time:** ${durationMin} minutes\n📋 **Clinical Basis:** Spontaneous nocturnal aching indicates pulp inflammation. Thorough root canal treatment takes ${durationMin} min.\n💡 **Pre-care Tip:** Avoid heat compresses. Analgesic like Ibuprofen 400mg may be used if needed.`
        : `🤖 **Sun'iy Intellekt Tashxis Xulosasi:**\n\n🦷 **Tish sohasining joylashuvi:** ${loc}\n🩺 **Taxminiy tashxis:** ${condName}\n⏱ **Ajratilgan vaqt:** ${durationMin} daqiqa\n📋 **Klinik asos:** O'z-o'zidan va tunda kuchayuvchi simillash asab (pulpa) to'qimasining yallig'langanidan — pulpitdan dalolat beradi. Kanallarni to'liq tozalash, antiseptik ishlov berish va germetik plombalash uchun ${durationMin} daqiqa vaqt ajratiladi.\n💡 **Shifokorgacha tavsiya:** Og'riyotgan tishga issiq narsa bosmang. Og'riq qoldiruvchi dori (Ibuprofen 400 mg yoki Nimesil) ichishingiz mumkin.`;

      if (s.step.startsWith("reg")) {
        await finishPatientRegistration(ctx, tgId, rep);
      } else {
        await proceedAfterTriage(ctx, tgId, rep);
      }
    });

    // B) Faqat sovuq/issiq/shirinda qisqa og'riydi (Karies - 35 daqiqa)
    bot.callbackQuery("triage:ans:caries_transient", async (ctx) => {
      const tgId = String(ctx.from.id);
      const s = getSession(tgId);
      const loc = s.data.toothLocation || "Tish";
      s.data.duration_min = 35;
      s.data.complaint = `${loc} — Chuqur / O'rtacha karies (asoratsiz). Faqat sovuq/shirinda qisqa og'riydi`;
      updateSession(tgId, s);
      await ctx.answerCallbackQuery();

      const rep = s.lang === "ru"
        ? `🤖 **Заключение AI Диагностики:**\n\n🦷 **Локация:** ${loc}\n🩺 **Диагноз:** Глубокий/средний кариес (без пульпита)\n⏱ **Выделенное время:** 35 минут\n📋 **Обоснование:** Кратковременная боль только при контакте с раздражителями указывает на сохранность нерва. Препарирование и светоотверждаемая пломба занимают около 35 минут.`
        : s.lang === "en"
        ? `🤖 **AI Diagnostic Assessment:**\n\n🦷 **Location:** ${loc}\n🩺 **Assessment:** Dental Caries (vital pulp)\n⏱ **Allocated Time:** 35 minutes\n📋 **Clinical Basis:** Transient pain strictly with cold/sweet foods confirms vital pulp without pulpitis. Preparation and aesthetic filling take ~35 min.`
        : `🤖 **Sun'iy Intellekt Tashxis Xulosasi:**\n\n🦷 **Tish sohasining joylashuvi:** ${loc}\n🩺 **Taxminiy tashxis:** Chuqur / O'rtacha karies (pulpa asoratlarisiz)\n⏱ **Ajratilgan vaqt:** 35 daqiqa\n📋 **Klinik asos:** Og'riq faqat shirin yoki sovuq tekkanda qisqa muddatli bo'lib, darhol to'xtashi asab to'qimasi saqlanganini (karies asoratlanmaganini) ko'rsatadi. Bo'shliqni tozalash va fotopolimer plomba qo'yish uchun taxminan 35 daqiqa kifoya qiladi.`;

      if (s.step.startsWith("reg")) {
        await finishPatientRegistration(ctx, tgId, rep);
      } else {
        await proceedAfterTriage(ctx, tgId, rep);
      }
    });

    // C) Tishlaganda / bosganda qattiq og'riydi (Periodontit - 60 daqiqa)
    bot.callbackQuery("triage:ans:bite_pain", async (ctx) => {
      const tgId = String(ctx.from.id);
      const s = getSession(tgId);
      const loc = s.data.toothLocation || "Tish";
      s.data.duration_min = 60;
      s.data.complaint = `${loc} — O'tkir/surunkali Periodontit. Tishlaganda va bosganda og'riydi`;
      updateSession(tgId, s);
      await ctx.answerCallbackQuery();

      const rep = s.lang === "ru"
        ? `🤖 **Заключение AI Диагностики:**\n\n🦷 **Локация:** ${loc}\n🩺 **Диагноз:** Периодонтит (воспаление тканей у верхушки корня)\n⏱ **Выделенное время:** 60 минут\n📋 **Обоснование:** Боль при накусывании указывает на периодонтальное воспаление. Необходима механическая и медикаментозная обработка каналов.`
        : s.lang === "en"
        ? `🤖 **AI Diagnostic Assessment:**\n\n🦷 **Location:** ${loc}\n🩺 **Assessment:** Apical Periodontitis\n⏱ **Allocated Time:** 60 minutes\n📋 **Clinical Basis:** Pain upon mastication or tapping indicates periapical ligament inflammation requiring root canal treatment.`
        : `🤖 **Sun'iy Intellekt Tashxis Xulosasi:**\n\n🦷 **Tish sohasining joylashuvi:** ${loc}\n🩺 **Taxminiy tashxis:** O'tkir yoki surunkali Periodontit (ildiz uchi yallig'lanishi)\n⏱ **Ajratilgan vaqt:** 60 daqiqa\n📋 **Klinik asos:** Tishni bosganda va ovqat chaynaganda kuchli og'riq bo'lishi ildiz uchi to'qimalari yallig'langanini bildiradi. Kanallarni ochish, antiseptik yuvish va dori qo'yish uchun 60 daqiqa vaqt ajratiladi.`;

      if (s.step.startsWith("reg")) {
        await finishPatientRegistration(ctx, tgId, rep);
      } else {
        await proceedAfterTriage(ctx, tgId, rep);
      }
    });

    // D) Kuchli zirqirash / pulsatsiya (O'tkir pulpit - 60 daqiqa)
    bot.callbackQuery("triage:ans:severe_throbbing", async (ctx) => {
      const tgId = String(ctx.from.id);
      const s = getSession(tgId);
      s.data.duration_min = 60;
      s.data.complaint = "O'tkir diffuz pulpit (Shoshilinch). Kuchli pulsatsiya va zirqirash";
      updateSession(tgId, s);
      await ctx.answerCallbackQuery();

      const rep = s.lang === "ru"
        ? "🤖 **Заключение AI Диагностики:**\n\n🦷 **Диагноз:** Острый пульпит (неотложная помощь)\n⏱ **Выделенное время:** 60 минут\n📋 **Обоснование:** Пульсирующая острая боль требует неотложного снятия болевого синдрома и депульпирования зуба."
        : s.lang === "en"
        ? "🤖 **AI Diagnostic Assessment:**\n\n🦷 **Assessment:** Acute Throbbing Pulpitis (Urgent)\n⏱ **Allocated Time:** 60 minutes\n📋 **Clinical Basis:** Intense pulsating pain requires urgent pain relief and endodontic extirpation."
        : "🤖 **Sun'iy Intellekt Tashxis Xulosasi:**\n\n🦷 **Taxminiy tashxis:** O'tkir diffuz pulpit (Shoshilinch yordam)\n⏱ **Ajratilgan vaqt:** 60 daqiqa\n📋 **Klinik asos:** Kuchli pulsatsiya beruvchi og'riq asab to'qimasining o'tkir yallig'lanishini bildiradi. Og'riqni zudlik bilan qoldirish va endodontik ishlov berish uchun 60 daqiqa ajratiladi.";

      if (s.step.startsWith("reg")) {
        await finishPatientRegistration(ctx, tgId, rep);
      } else {
        await proceedAfterTriage(ctx, tgId, rep);
      }
    });

    async function proceedAfterTriage(ctx: any, tgId: string, rep?: string) {
      const s = getSession(tgId);
      const patient = handlers.getPatients().find((p) => p.telegram_id === tgId);
      if (!patient) {
        s.step = "reg:name";
        s.data.then = "appointment";
        updateSession(tgId, s);
        await ctx.reply(rep ? `${rep}\n\n${tf(s.lang, "askName")}` : tf(s.lang, "askName"), { parse_mode: "Markdown" });
        return;
      }
      await showDoctors(ctx, tgId, rep);
    }

    // E) O'zim yozaman
    bot.callbackQuery("triage:ans:type_custom", async (ctx) => {
      const tgId = String(ctx.from.id);
      const s = getSession(tgId);
      s.step = s.step.startsWith("reg") ? "reg:complaint_text" : "appt:complaint";
      updateSession(tgId, s);
      await ctx.answerCallbackQuery();
      await ctx.reply("✍️ Tishingizdagi og'riq qandayligi va qachon boshlanganini xabarda yozib yuboring:");
    });

    bot.callbackQuery("appt:skip_complaint", async (ctx) => {
      const tgId = String(ctx.from.id);
      const s = getSession(tgId);
      s.data.duration_min = 30;
      s.data.complaint = "Birlamchi ko'rik va konsultatsiya";
      updateSession(tgId, s);
      await ctx.answerCallbackQuery();
      await showDoctors(ctx, tgId);
    });

    bot.callbackQuery("appt:skip_clarify", async (ctx) => {
      const tgId = String(ctx.from.id);
      const s = getSession(tgId);
      if (!s.data.duration_min) s.data.duration_min = 45;
      updateSession(tgId, s);
      await ctx.answerCallbackQuery();
      await showDoctors(ctx, tgId);
    });

    bot.callbackQuery("appt:outofhours", async (ctx) => {
      const tgId = String(ctx.from.id);
      const s = getSession(tgId);
      await ctx.answerCallbackQuery();
      await ctx.reply(
        tf(s.lang, "outOfHoursNotice", {
          phone: clinicPhone,
          tg: clinicTg,
        }),
        { reply_markup: outOfHoursKeyboard(s.lang) }
      );
    });

    /**
     * Shifokorning ayni damdagi jonli navbat soni va taxminan bo'shash vaqtini hisoblash
     * Tushlik vaqti: 14:00 dan 15:00 gacha hisobga olinadi (bemorlar bu vaqtga yozilmaydi)
     */
    function getDoctorQueueStatus(docId: number, targetDate?: string) {
      const clinicNow = getClinicNow();
      const date = targetDate || clinicNow.dateStr;
      const isToday = date === clinicNow.dateStr;

      const activeAppts = handlers.getAppointments().filter(
        (a) => a.date === date && a.staff_id === docId && ["scheduled", "arrived", "in_progress"].includes(a.status)
      );
      activeAppts.sort((x, y) => x.time.localeCompare(y.time));
      const queueCount = activeAppts.length;

      const nowMin = clinicNow.totalMinutes;
      const workStart = 9 * 60;   // 09:00
      const workEnd = 18 * 60;     // 18:00
      const LUNCH_START = 14 * 60; // 14:00 (840)
      const LUNCH_END = 15 * 60;   // 15:00 (900)

      const isDuringLunch = isToday && nowMin >= LUNCH_START && nowMin < LUNCH_END;

      if (queueCount === 0) {
        if (isToday) {
          if (nowMin < workStart) {
            return {
              queueCount: 0,
              freeTime: "09:00",
              freeText: "soat 09:00 da qabul boshlanadi",
              isFree: false,
              isLunch: false,
            };
          } else if (isDuringLunch) {
            return {
              queueCount: 0,
              freeTime: "15:00",
              freeText: "🍱 tushlik vaqti (14:00–15:00), qabul 15:00 da",
              isFree: false,
              isLunch: true,
            };
          } else if (nowMin >= workEnd) {
            return {
              queueCount: 0,
              freeTime: "18:00",
              freeText: "bugungi ish vaqti tugagan",
              isFree: false,
              isLunch: false,
            };
          } else {
            return {
              queueCount: 0,
              freeTime: clinicNow.timeStr,
              freeText: "ayni damda bo'sh (navbat yo'q)",
              isFree: true,
              isLunch: false,
            };
          }
        } else {
          return {
            queueCount: 0,
            freeTime: "09:00",
            freeText: "hozircha navbat yo'q (09:00 dan bo'sh)",
            isFree: true,
            isLunch: false,
          };
        }
      }

      // Navbatdagi bemorlar bo'yicha tushlik vaqtini chetlab hisoblash
      let cursorMin = isToday ? Math.max(workStart, nowMin) : workStart;
      if (cursorMin >= LUNCH_START && cursorMin < LUNCH_END) {
        cursorMin = LUNCH_END;
      }

      for (const a of activeAppts) {
        if (cursorMin >= LUNCH_START && cursorMin < LUNCH_END) {
          cursorMin = LUNCH_END;
        }
        const dur = a.duration_min || 30;
        cursorMin += dur;
        if (cursorMin > LUNCH_START && cursorMin < LUNCH_END) {
          cursorMin = LUNCH_END;
        }
      }

      if (cursorMin >= LUNCH_START && cursorMin < LUNCH_END) {
        cursorMin = LUNCH_END;
      }

      const roundedMin = Math.min(23 * 60 + 55, Math.ceil(cursorMin / 5) * 5);
      const freeH = Math.floor(roundedMin / 60);
      const freeM = roundedMin % 60;
      const freeTimeStr = `${String(freeH).padStart(2, "0")}:${String(freeM).padStart(2, "0")}`;

      let freeText = "";
      if (isDuringLunch) {
        freeText = `🍱 tushlik vaqti (14:00–15:00), so'ng taxminan soat ${freeTimeStr} larda`;
      } else if (roundedMin >= workEnd) {
        freeText = "bugungi qabullar soat 18:00 gacha to'liq band";
      } else {
        freeText = `taxminan soat ${freeTimeStr} larda`;
      }

      return {
        queueCount,
        freeTime: freeTimeStr,
        freeText,
        isFree: false,
        isLunch: isDuringLunch,
      };
    }

    /**
     * Bemor bot orqali qabulga yozilishida shifokorni so'rash butunlay olib tashlangan.
     * Bemor to'g'ridan-to'g'ri qabul kunini tanlaydi va jonli navbatga yoziladi.
     */
    async function showDoctors(ctx: any, tgId: string, introText?: string) {
      return showDates(ctx, tgId, introText);
    }

    /**
     * Qabul kunlarini tanlash:
     * - Bir kishi bir kunga faqat 1 ta navbat olishi mumkin!
     * - Agar bemor bugun allaqachon navbat olgan bo'lsa (yoki bugungi ish vaqti tugagan bo'lsa),
     *   faqatgina ertangi kun va kelgusi kunlar ko'rsatiladi (bugun ko'rsatilmaydi).
     * - Bemor faqat kunni belgilaydi (shifokor va soat tanlash olib tashlangan).
     */
    async function showDates(ctx: any, tgId: string, introText?: string) {
      const s = getSession(tgId);
      const kb = new InlineKeyboard();
      const clinicNow = getClinicNow();
      const base = dayjs(`${clinicNow.dateStr}T${clinicNow.timeStr}`);
      const nowMinutes = clinicNow.totalMinutes;
      const isPastWorkHours = nowMinutes >= 17 * 60 + 30; // 17:30 dan keyin bugungi qabul yopiladi

      const patient = handlers.getPatients().find((p) => p.telegram_id === tgId);
      const patientActiveAppts = patient
        ? handlers.getAppointments().filter(
            (a) => a.patient_id === patient.id && ["scheduled", "arrived", "in_progress"].includes(a.status) && a.id !== s.data.rescheduleId
          )
        : [];
      const patientBookedDates = new Set(patientActiveAppts.map((a) => a.date));
      const hasTodayBooked = patientBookedDates.has(clinicNow.dateStr);

      const startDay = (hasTodayBooked || isPastWorkHours) ? 1 : 0;

      let count = 0;
      for (let d = startDay; d <= 6; d++) {
        const dateObj = base.add(d, "day");
        const date = dateObj.format("YYYY-MM-DD");
        const alreadyBookedByMe = patientBookedDates.has(date);

        const qOnDate = handlers.getAppointments().filter(
          (a) => a.date === date && ["scheduled", "arrived", "in_progress"].includes(a.status)
        ).length;

        let label = "";
        if (d === 0) {
          const word = s.lang === "ru" ? "Сегодня" : s.lang === "en" ? "Today" : "Bugun";
          const qText = qOnDate > 0 ? (s.lang === "ru" ? `(${qOnDate} в очереди)` : `(${qOnDate} kishi)`) : (s.lang === "ru" ? "(свободно)" : "(navbat yo'q)");
          label = `⚡ ${word} ${qText}`;
        } else if (d === 1) {
          const word = s.lang === "ru" ? "Завтра" : s.lang === "en" ? "Tomorrow" : "Ertaga";
          const qText = alreadyBookedByMe ? (s.lang === "ru" ? "(вы записаны)" : "(navbatingiz bor)") : qOnDate > 0 ? `(${qOnDate} kishi)` : `(bo'sh)`;
          label = `🗓 ${word} ${qText}`;
        } else {
          const qText = alreadyBookedByMe ? (s.lang === "ru" ? "(вы записаны)" : "(navbatingiz bor)") : qOnDate > 0 ? `(${qOnDate} kishi)` : `(bo'sh)`;
          label = `🗓 ${dateObj.format("DD.MM")} ${qText}`;
        }

        kb.text(label, `appt:date:${date}`);
        count++;
        if (count % 2 === 0) kb.row();
      }
      if (count % 2 !== 0) kb.row();
      kb.text(tf(s.lang, "cancel"), "cancel");
      s.step = "appt:date";
      updateSession(tgId, s);

      let ruleNotice = "";
      if (hasTodayBooked) {
        ruleNotice = s.lang === "ru"
          ? "\n\n⚠️ *У вас уже есть активная запись на сегодня. По правилам клиники (1 запись в день) для вас отображены записи начиная с завтрашнего дня.*"
          : "\n\n⚠️ *Sizda bugungi kunga allaqachon faol navbat mavjud. Klinika qoidasiga ko'ra (bir kunga 1 ta navbat), yangi navbat olish uchun faqat ertangi va keyingi kunlar ochildi.*";
      }

      let headerText = "";
      if (introText) {
        headerText += `${introText}\n\n────────────────────\n\n`;
      }

      headerText += s.lang === "ru"
        ? `📅 **Выберите день приема в клинике:**\n\n💡 *В нашей клинике действует удобная система **живой электронной очереди**. Вы выбираете только день визита, а бот рассчитывает ориентировочное время без фиксации жесткого часа.*\n🍱 *Обеденный перерыв врачей (14:00–15:00) исключен из приема.*${ruleNotice}`
        : s.lang === "en"
        ? `📅 **Select the date of your visit:**\n\n💡 *Our clinic operates on a **live queue** system. Choose your preferred day, and the bot will immediately calculate your queue position and estimated arrival time (lunch 14:00–15:00 excluded).*${ruleNotice}`
        : `📅 **Klinikamiz qabuliga qaysi kuni kelmoqchisiz?**\n\n💡 *Klinikamizda qulay **jonli elektron navbat** tizimi amal qiladi. Qaysi kuni kelishingizni tanlang — bot sizga navbat raqamingizni, oldingizda nechta bemor borligini va taxminiy kelish vaqtingizni avtomatik hisoblab beradi (14:00–15:00 tushlik vaqti hisobga olingan).*${ruleNotice}`;

      await ctx.reply(headerText, { reply_markup: kb, parse_mode: "Markdown" });
    }

    bot.callbackQuery("appt:back_to_docs", async (ctx) => {
      const tgId = String(ctx.from.id);
      await ctx.answerCallbackQuery();
      await showDates(ctx, tgId);
    });

    bot.callbackQuery(/^appt:doc:(\d+)$/, async (ctx) => {
      const tgId = String(ctx.from.id);
      await ctx.answerCallbackQuery();
      await showDates(ctx, tgId);
    });

    /**
     * Kun tanlanganda bir kishi bir kunda faqat 1 ta navbat olishi tekshiriladi!
     * Soat kiritish talab qilinmaydi. Jonli navbat va taxminiy vaqt bir zumda hisoblanadi.
     */
    bot.callbackQuery(/^appt:date:(\d{4}-\d{2}-\d{2})$/, async (ctx) => {
      const tgId = String(ctx.from.id);
      const s = getSession(tgId);
      const date = ctx.match[1];
      const patient = handlers.getPatients().find((p) => p.telegram_id === tgId);

      // Agar qayta ko'chirish (reschedule) bo'lmasa, bir kunda 1 ta navbat qoidasini tekshirish
      if (patient && !s.data.rescheduleId) {
        const existingApptOnDate = handlers.getAppointments().find(
          (a) => a.patient_id === patient.id && a.date === date && ["scheduled", "arrived", "in_progress"].includes(a.status)
        );

        if (existingApptOnDate) {
          await ctx.answerCallbackQuery({ text: "⚠️ Ushbu kunga navbatingiz bor!", show_alert: true });

          const warnMsg = s.lang === "ru"
            ? `⚠️ **У вас уже есть активная запись на этот день (${date})!**\n\n` +
              `🔢 Ваша текущая запись: **${existingApptOnDate.time}**\n\n` +
              `По правилам клиники, один пациент может иметь **только одну запись в один день**.\n\n` +
              `Если хотите изменить дату приема, используйте кнопку ниже:`
            : `⚠️ **Hurmatli ${patient.full_name}!**\n\n` +
              `Siz ushbu kunga (**${date}**) allaqachon navbatga yozilgansiz!\n` +
              `🔢 Mavjud navbatingiz: soat **${existingApptOnDate.time} larda**\n\n` +
              `Klinika tartibiga ko'ra, **bir bemor bir kunda faqat 1 ta navbat** olishi mumkin.\n\n` +
              `Agar sanani o'zgartirmoqchi bo'lsangiz, quyidagi tugmadan foydalanishingiz mumkin:`;

          const kb = new InlineKeyboard()
            .text("📍 Navbatimni tekshirish", "my:position")
            .row()
            .text("✏️ Boshqa kunga ko'chirish", `appt:reschedule:${existingApptOnDate.id}`)
            .row()
            .text("❌ Navbatni bekor qilish", `appt:cancel_prompt:${existingApptOnDate.id}`)
            .row()
            .text(tf(s.lang, "mainMenu"), "cancel");

          await ctx.reply(warnMsg, { reply_markup: kb, parse_mode: "Markdown" });
          return;
        }
      }

      s.data.date = date;
      updateSession(tgId, s);
      await ctx.answerCallbackQuery({ text: "⏳ Navbat hisoblanmoqda..." });
      await completeQueueBooking(ctx, tgId, date);
    });

    /**
     * Jonli navbatni rasmiylashtirish va taxminiy vaqtni hisoblash
     * - Shifokorning tushlik vaqti (14:00 - 15:00) to'liq chetlab o'tiladi.
     * - Bir kishi bir kunda faqat 1 ta navbat olishi qat'iy kafolatlanadi.
     */
    async function completeQueueBooking(ctx: any, tgId: string, date: string) {
      const s = getSession(tgId);
      const patient = handlers.getPatients().find((p) => p.telegram_id === tgId);
      if (!patient) {
        await ctx.reply(tf(s.lang, "error"));
        return;
      }

      // Qayta yozilishni oldini olish (agar reschedule bo'lmasa)
      if (!s.data.rescheduleId) {
        const alreadyBooked = handlers.getAppointments().find(
          (a) => a.patient_id === patient.id && a.date === date && ["scheduled", "arrived", "in_progress"].includes(a.status)
        );
        if (alreadyBooked) {
          const warnMsg = s.lang === "ru"
            ? `⚠️ **У вас уже оформлена запись на ${date}!**\nОдин пациент может занимать только одну очередь в день.`
            : `⚠️ **Siz ushbu kunga (${date}) allaqachon navbat olgansiz!**\nBir kunda faqat 1 ta navbat olish mumkin.`;
          await ctx.reply(warnMsg, { reply_markup: new InlineKeyboard().text("📍 Navbatimni ko'rish", "my:position") });
          return;
        }
      }

      const staffList = handlers.getStaff();
      const staff = staffList.find((st) => st.id === s.data.staffId) || staffList[0];
      const durationMin = Number(s.data.duration_min) || 30;
      const clinicNow = getClinicNow();
      const isToday = date === clinicNow.dateStr;

      // Ushbu kunda shu shifokorga yozilgan mavjud bemorlar
      const existingAppts = handlers.getAppointments().filter(
        (a) => a.date === date && (staff ? a.staff_id === staff.id : true) && ["scheduled", "arrived", "in_progress"].includes(a.status)
      );
      existingAppts.sort((x, y) => x.time.localeCompare(y.time));

      const aheadCount = existingAppts.length;
      const queuePos = aheadCount + 1;

      // Taxminiy qabul vaqti hisoblash (Tushlik vaqti 14:00 - 15:00 chiqarib tashlanadi)
      const LUNCH_START = 14 * 60; // 14:00 (840 min)
      const LUNCH_END = 15 * 60;   // 15:00 (900 min)
      const workStart = 9 * 60;    // 09:00

      let cursorMin = isToday ? Math.max(workStart, clinicNow.totalMinutes) : workStart;
      if (cursorMin >= LUNCH_START && cursorMin < LUNCH_END) {
        cursorMin = LUNCH_END;
      }

      for (const a of existingAppts) {
        if (cursorMin >= LUNCH_START && cursorMin < LUNCH_END) {
          cursorMin = LUNCH_END;
        }
        const dur = a.duration_min || 30;
        cursorMin += dur;
        if (cursorMin > LUNCH_START && cursorMin < LUNCH_END) {
          cursorMin = LUNCH_END;
        }
      }

      if (cursorMin >= LUNCH_START && cursorMin < LUNCH_END) {
        cursorMin = LUNCH_END;
      }

      let estStartMin = Math.min(23 * 60, Math.ceil(cursorMin / 5) * 5);
      if (estStartMin >= LUNCH_START && estStartMin < LUNCH_END) {
        estStartMin = LUNCH_END;
      }
      const estEndMin = Math.min(23 * 60 + 55, estStartMin + durationMin);

      const formatMin = (m: number) => {
        const hh = Math.floor(m / 60);
        const mm = m % 60;
        return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
      };

      const estStartTimeStr = formatMin(estStartMin);
      const estEndTimeStr = formatMin(estEndMin);
      const timeWindow = `${estStartTimeStr} – ${estEndTimeStr}`;
      const timeSlotToStore = estStartTimeStr;

      // Agar qabulni qayta rejalashtirish (reschedule) bo'lsa:
      if (s.data.rescheduleId) {
        const rId = Number(s.data.rescheduleId);
        delete s.data.rescheduleId;
        handlers.updateAppointment(rId, {
          staff_id: staff?.id || null,
          staff_name: staff?.full_name || "Navbatchi shifokor",
          date,
          time: timeSlotToStore,
          scheduled_at: `${date}T${timeSlotToStore}:00`,
          duration_min: durationMin,
          status: "scheduled",
        });

        handlers.broadcast("appointment:updated", {
          id: rId,
          date,
          time: timeSlotToStore,
          staff_id: staff?.id,
          staff_name: staff?.full_name,
        });

        s.step = "idle";
        s.data = {};
        updateSession(tgId, s);

        const aheadLineRu = aheadCount === 0
          ? `👥 **Перед вами никого нет** (Вы следующий / первый в очереди!)`
          : `👥 **Перед вами в очереди:** **${aheadCount} человек(а)**`;

        const aheadLineUz = aheadCount === 0
          ? `👥 **Sizdan oldin hech kim yo'q** (Siz birinchi navbatdasiz! Keyingi qabul sizniki)`
          : `👥 **Sizdan oldinda:** **${aheadCount} ta bemor** navbatda`;

        const doneMsg = s.lang === "ru"
          ? `✅ **Запись успешно перенесена в очередь!**\n\n` +
            `🏥 Клиника: **${clinicName}**\n` +
            `📅 Дата приема: **${date}**\n` +
            `🔢 **Ваш номер в очереди: #${queuePos}-й**\n` +
            `${aheadLineRu}\n` +
            `⏰ **Ориентировочное время приема:** около **${timeWindow}**\n\n` +
            `🍱 *Обеденный перерыв врачей (14:00–15:00) исключен.*\n` +
            `⚠️ *Примечание: Прием ведется по живой очереди. Точное время зависит от длительности лечения предыдущих пациентов.*`
          : `✅ **Navbatingiz muvaffaqiyatli yangi kunga ko'chirildi!**\n\n` +
            `🏥 Klinika: **${clinicName}**\n` +
            `📅 Yangi sana: **${date}**\n` +
            `🔢 **Yangi navbat raqamingiz: #${queuePos}-o'rin**\n` +
            `${aheadLineUz}\n` +
            `⏰ **Taxminiy qabul vaqti:** soat **${timeWindow} larda**\n\n` +
            `🍱 *Shifokorlarning tushlik vaqti (14:00–15:00) hisobga olingan.*\n` +
            `⚠️ *Eslatma: Qabul jonli navbat tartibida o'tkaziladi. Bu vaqt oldingi bemorlarning muolajasiga qarab biroz o'zgarishi mumkin.*`;

        const kb = new InlineKeyboard()
          .text("📍 Navbatimni tekshirish", "my:position")
          .row()
          .text("📞 Shifokor bilan bog'lanish", "clinic:contacts")
          .row()
          .text("✏️ Boshqa kunga ko'chirish", `appt:reschedule:${rId}`)
          .row()
          .text("❌ Bekor qilish", `appt:cancel_prompt:${rId}`)
          .row()
          .text(tf(s.lang, "mainMenu"), "cancel");

        await ctx.reply(doneMsg, { reply_markup: kb, parse_mode: "Markdown" });
        return;
      }

      // Yangi qabul yaratish
      const newAppt = handlers.createAppointment({
        patient_id: patient.id,
        patient_name: patient.full_name,
        staff_id: null,
        staff_name: "Klinika navbati",
        date,
        time: timeSlotToStore,
        scheduled_at: `${date}T${timeSlotToStore}:00`,
        duration_min: durationMin,
        complaint: s.data.complaint || "Telegram jonli navbat",
        status: "scheduled",
      });

      handlers.broadcast("appointment:new", {
        patient: patient.full_name,
        date,
        time: timeSlotToStore,
        doctor: "Klinika navbati",
        source: "telegram",
        duration: durationMin,
      });

      s.step = "idle";
      s.data = {};
      updateSession(tgId, s);

      const kb = new InlineKeyboard()
        .text("📍 Navbatimni tekshirish (Jonli)", "my:position")
        .row()
        .text("📞 Shifokor bilan bog'lanish", "clinic:contacts")
        .row()
        .text("🗓 Boshqa kunga ko'chirish", `appt:reschedule:${newAppt.id}`)
        .row()
        .text("❌ Navbatni bekor qilish", `appt:cancel_prompt:${newAppt.id}`)
        .row()
        .text(tf(s.lang, "mainMenu"), "cancel");

      const successAheadLineRu = aheadCount === 0
        ? `👥 **Перед вами никого нет** (Вы следующий / первый в очереди!)`
        : `👥 **Перед вами ожидают:** **${aheadCount} человек(а)**`;

      const successAheadLineUz = aheadCount === 0
        ? `👥 **Sizdan oldin hech kim yo'q** (Siz birinchi bo'lib qabulga kirasiz!)`
        : `👥 **Sizdan oldinda:** **${aheadCount} ta bemor** navbatda turibdi`;

      const successMsg = s.lang === "ru"
        ? `🎉 **Вы успешно записаны в очередь на прием!**\n\n` +
          `🏥 Клиника: **${clinicName}**\n` +
          `📅 Дата: **${date}**\n\n` +
          `🔢 **Ваш номер в очереди: #${queuePos}-й**\n` +
          `${successAheadLineRu}\n` +
          `⏰ **Ориентировочное расчетное время:** около **${timeWindow}**\n` +
          `⏱ Планируемое время приема: **${durationMin} минут**\n\n` +
          `🍱 **Обед:** 14:00–15:00 исключен из записи.\n` +
          `⚠️ **ВАЖНОЕ ПРАВИЛО КЛИНИКИ (Живая очередь):**\n` +
          `В нашей клинике прием проходит в порядке **живой электронной очереди**. Указанное время является **ориентировочным**.\n\n` +
          `Рекомендуем подойти в клинику за 10-15 минут до ориентировочного времени. Нажмите кнопку «📍 Моя очередь», чтобы в любой момент видеть живой статус очереди.`
        : `🎉 **Qabulga navbatingiz muvaffaqiyatli rasmiylashtirildi!**\n\n` +
          `🏥 Klinika: **${clinicName}**\n` +
          `📅 Qabul kuni: **${date}**\n\n` +
          `🔢 **Sizning navbat raqamingiz: #${queuePos}-o'rin**\n` +
          `${successAheadLineUz}\n` +
          `⏰ **Taxminiy navbat kelish vaqti:** soat **${timeWindow} larda**\n` +
          `⏱ Muolaja uchun rejalashtirilgan vaqt: **${durationMin} daqiqa**\n\n` +
          `🍱 **Tushlik:** 14:00–15:00 oralig'i to'liq hisobga olingan.\n` +
          `⚠️ **MUHIM ESLATMA (Jonli Navbat Qoidasi):**\n` +
          `Klinikamizda aniq soatda qabulga kirish tartibi emas, balki **jonli elektron navbat** tizimi amal qiladi. Qabul qiluvchi shifokor klinika admin paneli orqali biriktiriladi. Yuqoridagi soat — **taxminiy vaqtdir**.\n\n` +
          `Navbatingiz kelishidan 10-15 daqiqa oldin klinikada bo'lishingizni so'raymiz. «📍 Navbatimni tekshirish» tugmasi orqali istalgan daqiqada oldingizda necha kishi qolganini jonli kuzatib turishingiz mumkin.`;

      await ctx.reply(successMsg, { reply_markup: kb, parse_mode: "Markdown" });
    }

    bot.callbackQuery("appt:back", async (ctx) => {
      const tgId = String(ctx.from.id);
      await ctx.answerCallbackQuery();
      await showDoctors(ctx, tgId);
    });

    // ── QABULNI BEKOR QILISH VA TAHRIRLASH ──

    bot.callbackQuery(/^appt:cancel_prompt:(\d+)$/, async (ctx) => {
      const id = Number(ctx.match[1]);
      const tgId = String(ctx.from.id);
      const s = getSession(tgId);
      const appt = handlers.getAppointments().find((a) => a.id === id);
      await ctx.answerCallbackQuery();

      if (!appt) {
        await ctx.reply("Qabul topilmadi yoki allaqachon bekor qilingan.");
        return;
      }

      const confirmKb = new InlineKeyboard()
        .text("❌ Ha, qabul bekor qilinsin", `appt:cancel_confirm:${id}`)
        .row()
        .text("🔙 Yo'q, qolsin", "my:position");

      const msg = s.lang === "ru"
        ? `⚠️ **Вы уверены, что хотите отменить запись?**\n\n📅 Дата: **${appt.date}**\n⏰ Время: **${appt.time}**\n👨‍⚕️ Врач: **${appt.staff_name}**\n\nПосле отмены это время станет доступно другим пациентам.`
        : `⚠️ **Haqiqatan ham qabulni bekor qilmoqchimisiz?**\n\n📅 Sana: **${appt.date}**\n⏰ Vaqt: **${appt.time}**\n👨‍⚕️ Shifokor: **${appt.staff_name}**\n\nNavbat bekor qilinsa, ushbu vaqt boshqa bemorlar uchun ochiladi.`;

      await ctx.reply(msg, { reply_markup: confirmKb, parse_mode: "Markdown" });
    });

    bot.callbackQuery(/^appt:cancel_confirm:(\d+)$/, async (ctx) => {
      const id = Number(ctx.match[1]);
      const tgId = String(ctx.from.id);
      const s = getSession(tgId);
      await ctx.answerCallbackQuery();

      const updated = handlers.updateAppointment(id, { status: "cancelled" });
      if (updated) {
        handlers.broadcast("appointment:cancelled", { id, patient_name: updated.patient_name, date: updated.date, time: updated.time });
        handlers.broadcast("appointment:updated", { id, status: "cancelled" });
      }

      const doneMsg = s.lang === "ru"
        ? "✅ **Ваша запись успешно отменена.**\n\nЕсли захотите записаться на другое время, используйте кнопку «📅 Записаться на прием»."
        : "✅ **Navbatingiz muvaffaqiyatli bekor qilindi.**\n\nAgar boshqa vaqtga yozilmoqchi bo'lsangiz, quyidagi tugmadan foydalanishingiz mumkin.";

      const kb = new InlineKeyboard()
        .text(tf(s.lang, "btnAppointment"), "appt:start")
        .row()
        .text(tf(s.lang, "mainMenu"), "cancel");

      await ctx.reply(doneMsg, { reply_markup: kb, parse_mode: "Markdown" });
    });

    bot.callbackQuery(/^appt:reschedule:(\d+)$/, async (ctx) => {
      const id = Number(ctx.match[1]);
      const tgId = String(ctx.from.id);
      const s = getSession(tgId);
      const appt = handlers.getAppointments().find((a) => a.id === id);
      await ctx.answerCallbackQuery();

      if (!appt) {
        await ctx.reply("Qabul topilmadi.");
        return;
      }

      s.data.rescheduleId = id;
      s.data.duration_min = appt.duration_min || 30;
      s.data.complaint = appt.complaint;
      updateSession(tgId, s);

      const msg = s.lang === "ru"
        ? `✏️ **Перенос записи с ${appt.date} ${appt.time}:**\n\nК какому врачу вы хотите перенести прием?`
        : `✏️ **Qabulni boshqa vaqtga ko'chirish (${appt.date} soat ${appt.time}):**\n\nQaysi shifokor qabuliga ko'chirmoqchisiz?`;

      await showDoctors(ctx, tgId, msg);
    });

    bot.callbackQuery(/^appt:change_doc:(\d+)$/, async (ctx) => {
      const id = Number(ctx.match[1]);
      const tgId = String(ctx.from.id);
      const s = getSession(tgId);
      const appt = handlers.getAppointments().find((a) => a.id === id);
      await ctx.answerCallbackQuery();

      if (!appt) {
        await ctx.reply("Qabul topilmadi.");
        return;
      }

      s.data.rescheduleId = id;
      s.data.duration_min = appt.duration_min || 30;
      s.data.complaint = appt.complaint;
      updateSession(tgId, s);

      const msg = s.lang === "ru"
        ? `👨‍⚕️ **Выберите нового врача для приема:**`
        : `👨‍⚕️ **Qaysi shifokor qabuliga o'tmoqchisiz?**`;

      await showDoctors(ctx, tgId, msg);
    });

    bot.callbackQuery("fb:start", async (ctx) => {
      const tgId = String(ctx.from.id);
      const s = getSession(tgId);
      s.step = "fb:text";
      updateSession(tgId, s);
      await ctx.answerCallbackQuery();
      await ctx.reply(tf(s.lang, "sendFeedback"));
    });

    async function sendPatientProfile(ctx: any, tgId: string, alertMsg?: string) {
      const s = getSession(tgId);
      const patient = handlers.getPatients().find((p) => p.telegram_id === tgId);
      if (!patient) {
        s.step = "reg:name";
        updateSession(tgId, s);
        await ctx.reply(tf(s.lang, "askName"));
        return;
      }
      const genderLabel = patient.gender ? GENDER_LABEL[patient.gender]?.[s.lang] || patient.gender : "—";
      const birthStr = patient.birth_date ? patient.birth_date.slice(0, 10) : (s.lang === "ru" ? "Не указана" : "Kiritilmagan");
      const appts = handlers.getAppointments().filter(
        (a) => a.patient_id === patient.id && ["scheduled", "arrived", "in_progress"].includes(a.status)
      );

      let text = alertMsg ? `${alertMsg}\n\n` : "";
      text += s.lang === "ru"
        ? `📋 **ВАШ ПРОФИЛЬ И ДАННЫЕ:**\n\n` +
          `👤 **Ф.И.О.:** ${patient.full_name}\n` +
          `📅 **Дата рождения:** ${birthStr}\n` +
          `📞 **Телефон:** ${patient.phone || "—"}\n` +
          `⚧ **Пол:** ${genderLabel}\n` +
          `📍 **Адрес проживания:** ${patient.address || "—"}\n` +
          `🗓 **Дата регистрации:** ${patient.created_at}\n` +
          `🆔 **Номер карты в клинике:** #${patient.id}\n` +
          `🔑 **Код привязки (PIN):** \`${patient.connect_code || patient.id}\``
        : s.lang === "en"
        ? `📋 **YOUR PROFILE & DETAILS:**\n\n` +
          `👤 **Full Name:** ${patient.full_name}\n` +
          `📅 **Date of Birth:** ${birthStr}\n` +
          `📞 **Phone:** ${patient.phone || "—"}\n` +
          `⚧ **Gender:** ${genderLabel}\n` +
          `📍 **Home Address:** ${patient.address || "—"}\n` +
          `🗓 **Registered:** ${patient.created_at}\n` +
          `🆔 **Patient Chart #:** #${patient.id}\n` +
          `🔑 **Connect PIN:** \`${patient.connect_code || patient.id}\``
        : `📋 **SIZNING PROFILINGIZ VA MA'LUMOTLARINGIZ:**\n\n` +
          `👤 **F.I.Sh:** ${patient.full_name}\n` +
          `📅 **Tug'ilgan sana:** ${birthStr}\n` +
          `📞 **Telefon raqami:** ${patient.phone || "—"}\n` +
          `⚧ **Jins:** ${genderLabel}\n` +
          `📍 **Yashash manzili:** ${patient.address || "—"}\n` +
          `🗓 **Ro'yxatdan o'tgan sana:** ${patient.created_at}\n` +
          `🆔 **Klinikadagi karta raqami:** #${patient.id}\n` +
          `🔑 **Ulanish kodi (PIN):** \`${patient.connect_code || patient.id}\``;

      const kb = new InlineKeyboard();

      if (appts.length > 0) {
        text += "\n\n" + (s.lang === "ru" ? "📅 **Ваши активные записи:**" : "📅 **Sizning faol navbatlaringiz:**");
        for (const a of appts) {
          text += `\n\n🗓 **${a.date} soat ${a.time}** (${a.duration_min} daq)\n👨‍⚕️ Shifokor: ${a.staff_name}\n🦷 ${a.complaint}`;
          kb.text(`✏️ ${a.date} ${a.time} ko'chirish`, `appt:reschedule:${a.id}`);
          kb.text(`❌ ${a.date} bekor qilish`, `appt:cancel_prompt:${a.id}`).row();
        }
      }

      // O'z ma'lumotlarini (ism-sharif, tug'ilgan sana, manzil, telefon) to'g'rilash tugmalari
      kb.text(tf(s.lang, "btnEditName"), "edit:name")
        .text(tf(s.lang, "btnEditBirth"), "edit:birth")
        .row()
        .text(tf(s.lang, "btnEditAddress"), "edit:address")
        .text(tf(s.lang, "btnEditPhone"), "edit:phone")
        .row()
        .text("📍 Navbatim & Qabullarim", "my:position")
        .text(tf(s.lang, "btnAppointment"), "appt:start")
        .row()
        .text(tf(s.lang, "mainMenu"), "cancel");

      await ctx.reply(text, { reply_markup: kb, parse_mode: "Markdown" });
    }

    bot.callbackQuery("my:info", async (ctx) => {
      const tgId = String(ctx.from.id);
      await ctx.answerCallbackQuery();
      await sendPatientProfile(ctx, tgId);
    });

    // ── FOYDALANUVCHI MA'LUMOTLARINI O'ZGARTIRISH ──
    bot.callbackQuery("edit:name", async (ctx) => {
      const tgId = String(ctx.from.id);
      const s = getSession(tgId);
      s.step = "edit:name";
      updateSession(tgId, s);
      await ctx.answerCallbackQuery();
      const cancelKb = new InlineKeyboard().text(tf(s.lang, "cancel"), "cancel");
      await ctx.reply(tf(s.lang, "askEditName"), { reply_markup: cancelKb });
    });

    bot.callbackQuery("edit:birth", async (ctx) => {
      const tgId = String(ctx.from.id);
      const s = getSession(tgId);
      s.step = "edit:birth";
      updateSession(tgId, s);
      await ctx.answerCallbackQuery();
      const cancelKb = new InlineKeyboard().text(tf(s.lang, "cancel"), "cancel");
      await ctx.reply(tf(s.lang, "askEditBirth"), { reply_markup: cancelKb });
    });

    bot.callbackQuery("edit:address", async (ctx) => {
      const tgId = String(ctx.from.id);
      const s = getSession(tgId);
      s.data.isEditing = true;
      s.step = "reg:district";
      updateSession(tgId, s);
      await ctx.answerCallbackQuery();
      await ctx.reply(
        s.lang === "ru"
          ? "📍 **Выберите ваш новый район или город проживания:**"
          : "📍 **Yangi yashash tumaningiz yoki shahringizni tanlang:**",
        { reply_markup: districtKeyboard(s.lang), parse_mode: "Markdown" }
      );
    });

    bot.callbackQuery("edit:phone", async (ctx) => {
      const tgId = String(ctx.from.id);
      const s = getSession(tgId);
      s.step = "edit:phone";
      updateSession(tgId, s);
      await ctx.answerCallbackQuery();
      const cancelKb = new InlineKeyboard().text(tf(s.lang, "cancel"), "cancel");
      await ctx.reply(tf(s.lang, "askEditPhone"), { reply_markup: cancelKb });
    });

    /**
     * Bemor o'z navbatini, oldinda necha kishi borligini,
     * taxminiy kutish vaqtini va barcha faol qabullarini ko'rishi
     */
    async function sendQueueAndAppointments(ctx: any, tgId: string) {
      const s = getSession(tgId);
      const patient = handlers.getPatients().find((p) => p.telegram_id === tgId);
      if (!patient) {
        const kb = new InlineKeyboard().text(tf(s.lang, "btnRegister"), "reg:start");
        await ctx.reply(tf(s.lang, "noQueue"), { reply_markup: kb });
        return;
      }

      const clinicNow = getClinicNow();
      const today = clinicNow.dateStr;
      const nowTotalMin = clinicNow.totalMinutes;

      const allPatientAppts = handlers.getAppointments().filter(
        (a) => a.patient_id === patient.id && ["scheduled", "arrived", "in_progress"].includes(a.status) && a.date >= today
      );
      allPatientAppts.sort((x, y) => (x.date + x.time).localeCompare(y.date + y.time));

      if (allPatientAppts.length === 0) {
        const kb = new InlineKeyboard().text(tf(s.lang, "btnAppointment"), "appt:start");
        const noQueueMsg = s.lang === "ru"
          ? "У вас нет активных записей. Чтобы записаться на прием к врачу, нажмите кнопку ниже:"
          : "Sizda hozircha faol qabul yoki navbat yo'q. Qabulga yozilish uchun quyidagi tugmadan foydalanishingiz mumkin:";
        await ctx.reply(noQueueMsg, { reply_markup: kb });
        return;
      }

      const todayAppt = allPatientAppts.find((a) => a.date === today);
      const futureAppts = allPatientAppts.filter((a) => a.date > today);

      const qKb = new InlineKeyboard();
      let queueMsg = "";

      if (todayAppt) {
        const allTodayDoc = handlers.getAppointments().filter(
          (a) => a.date === today && (todayAppt.staff_id ? a.staff_id === todayAppt.staff_id : true) && ["scheduled", "arrived", "in_progress", "completed"].includes(a.status)
        );
        allTodayDoc.sort((x, y) => x.time.localeCompare(y.time));

        const pos = allTodayDoc.findIndex((a) => a.id === todayAppt.id) + 1;
        const precedingActive = allTodayDoc.filter((a, idx) => idx < pos - 1 && a.status !== "completed");
        const aheadCount = precedingActive.length;

        // Aniq vaqt hisobi: hozirgi vaqt va belgilangan qabul vaqti oralig'i
        const [appH, appM] = todayAppt.time.split(":").map(Number);
        const apptTotalMin = appH * 60 + appM;
        const diffMinutes = apptTotalMin - nowTotalMin;

        let waitTimeText = "";
        if (diffMinutes > 60) {
          const h = Math.floor(diffMinutes / 60);
          const m = diffMinutes % 60;
          waitTimeText = s.lang === "ru"
            ? `⏳ **До приема осталось:** **${h} ч. ${m > 0 ? m + " мин." : ""}** (прием в **${todayAppt.time}**)`
            : `⏳ **Qabulingizgacha qolgan vaqt:** **${h} soat ${m > 0 ? m + " daqiqa" : ""}** (belgilangan vaqt: **${todayAppt.time}**)`;
        } else if (diffMinutes > 0) {
          waitTimeText = s.lang === "ru"
            ? `⏳ **До приема осталось:** **${diffMinutes} минут** (прием в **${todayAppt.time}**)`
            : `⏳ **Qabulingizgacha qolgan vaqt:** **${diffMinutes} daqiqa** (belgilangan vaqt: **${todayAppt.time}**)`;
        } else if (diffMinutes >= -(todayAppt.duration_min || 30)) {
          waitTimeText = s.lang === "ru"
            ? `🔔 **Сейчас время вашего приема (${todayAppt.time})!** Приготовьтесь к входу в кабинет.`
            : `🔔 **Aynan hozir sizning qabul vaqtingiz (${todayAppt.time})!** Shifokor xonasiga kirishga tayyorlaning.`;
        } else {
          waitTimeText = s.lang === "ru"
            ? `⚠️ **Время приема (${todayAppt.time}) прошло.** Если вы еще не зашли, обратитесь к администратору.`
            : `⚠️ **Belgilangan vaqtingiz (${todayAppt.time}) o'tgan.** Agar hali kirmagan bo'lsangiz, qabulxona bilan bog'laning.`;
        }

        // Band vaqtlar va bo'sh vaqtlar
        const bookedTimes = allTodayDoc.map((a) => `${a.time}${a.id === todayAppt.id ? " (Sizniki)" : ""}`);
        const occupiedSlots = new Set<string>();
        allTodayDoc.forEach((a) => {
          const [h, m] = a.time.split(":").map(Number);
          const start = h * 60 + m;
          const dur = a.duration_min || 30;
          for (let t = start; t < start + dur; t += 30) {
            occupiedSlots.add(`${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`);
          }
        });

        const freeSlotsSample: string[] = [];
        for (let t = 9 * 60; t <= 17 * 60; t += 30) {
          const timeS = `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
          if (!occupiedSlots.has(timeS) && t > nowTotalMin) {
            freeSlotsSample.push(timeS);
          }
        }

        const statusMap: Record<string, Record<string, string>> = {
          scheduled: { uz: "🟢 Rejalashtirilgan (Kutilmoqda)", ru: "🟢 Запланирован (Ожидает)", en: "🟢 Scheduled (Waiting)" },
          arrived: { uz: "🟡 Klinikaga yetib kelgan (Kutish zalida)", ru: "🟡 Прибыл в клинику", en: "🟡 Checked-in" },
          in_progress: { uz: "🔵 Qabul jarayonida (Kresloda)", ru: "🔵 На приеме", en: "🔵 In progress" },
        };
        const statusText = statusMap[todayAppt.status]?.[s.lang] || "🟢 Kutilmoqda";
        const docQ = getDoctorQueueStatus(todayAppt.staff_id || 0, today);
        const isLunchNow = clinicNow.totalMinutes >= 14 * 60 && clinicNow.totalMinutes < 15 * 60;
        const lunchNotice = isLunchNow
          ? (s.lang === "ru" ? "\n🍱 **Обед в клинике (14:00–15:00):** Прием пациентов возобновляется в 15:00.\n" : "\n🍱 **Klinika tushlik vaqti (14:00–15:00):** Qabul soat 15:00 da davom etadi.\n")
          : "";

        const aheadTextRu = aheadCount === 0
          ? `👥 **Перед вами никого нет** (Вы следующий / первый в очереди!)`
          : `👥 **Перед вами ожидают:** **${aheadCount} человек(а)**`;

        const aheadTextUz = aheadCount === 0
          ? `👥 **Sizdan oldin hech kim yo'q** (Siz birinchi navbatdasiz! Keyingi qabul sizniki)`
          : `👥 **Sizdan oldinda:** **${aheadCount} ta bemor** navbatda kutmoqda`;

        if (s.lang === "ru") {
          queueMsg += `📍 **ВАША ОЧЕРЕДЬ В КЛИНИКЕ СЕГОДНЯ (${today}):**\n` +
            `🕒 Время клиники: **${clinicNow.timeStr}**\n` +
            `${lunchNotice}\n` +
            `🔢 **Ваш номер в очереди:** **#${pos > 0 ? pos : 1}-й**\n` +
            `${aheadTextRu}\n` +
            `⏰ **Ориентировочное время приема:** около **${todayAppt.time}**\n` +
            `${waitTimeText}\n` +
            `👨‍⚕️ **Врач:** ${todayAppt.staff_name}\n` +
            `🦷 **Услуга / Жалоба:** ${todayAppt.complaint || "Осмотр"}\n` +
            `⏱ **Длительность приема:** ${todayAppt.duration_min} минут\n` +
            `📌 **Статус:** ${statusText}\n\n` +
            `📊 **Загрузка врача сегодня:**\n` +
            `• Пациентов в очереди: **${allTodayDoc.length} чел.**\n` +
            `• ⏳ Состояние врача: **${docQ.freeText}**\n\n` +
            `⚠️ *Примечание: Прием ведется по живой электронной очереди. Обед 14:00–15:00 исключен.*`;
        } else {
          queueMsg += `📍 **SIZNING BUGUNGI NAVBATINGIZ (${today}):**\n` +
            `🕒 Hozirgi klinika vaqti: **${clinicNow.timeStr}**\n` +
            `${lunchNotice}\n` +
            `🔢 **Navbat raqamingiz:** **#${pos > 0 ? pos : 1}-o'rin**\n` +
            `${aheadTextUz}\n` +
            `⏰ **Taxminiy qabul vaqtingiz:** soat **${todayAppt.time} larda**\n` +
            `${waitTimeText}\n` +
            `👨‍⚕️ **Shifokor:** ${todayAppt.staff_name}\n` +
            `🦷 **Muolaja / Sabab:** ${todayAppt.complaint || "Ko'rik"}\n` +
            `⏱ **Ajratilgan vaqt:** ${todayAppt.duration_min} daqiqa\n` +
            `📌 **Holati:** ${statusText}\n\n` +
            `📊 **Shifokorning bandlik holati:**\n` +
            `• Navbatdagi jami bemorlar: **${allTodayDoc.length} ta**\n` +
            `• ⏳ Shifokor ayni damda: **${docQ.freeText}**\n\n` +
            `⚠️ *Eslatma: Qabul jonli navbat tartibida o'tkaziladi. 14:00–15:00 tushlik vaqti hisobga olingan.*`;
        }

        qKb.text("🔄 Navbatni yangilash", "my:position").row();
        qKb.text("📞 Shifokor bilan bog'lanish", "clinic:contacts").row();
        qKb.text("✏️ Sanani ko'chirish", `appt:reschedule:${todayAppt.id}`);
        qKb.text("👨‍⚕️ Shifokorni o'zgartirish", `appt:change_doc:${todayAppt.id}`).row();
        qKb.text("❌ Bugungi navbatni bekor qilish", `appt:cancel_prompt:${todayAppt.id}`).row();
      }

      if (futureAppts.length > 0) {
        queueMsg += (todayAppt ? "\n────────────────────\n" : "") +
          (s.lang === "ru" ? "📅 **Предстоящие записи в очередь:**\n" : "📅 **Kelgusi kunlardagi faol navbatlaringiz:**\n");

        for (const fa of futureAppts) {
          const docApptsOnDate = handlers.getAppointments().filter(
            (a) => a.date === fa.date && (fa.staff_id ? a.staff_id === fa.staff_id : true) && ["scheduled", "arrived", "in_progress"].includes(a.status)
          );
          docApptsOnDate.sort((x, y) => x.time.localeCompare(y.time));

          if (s.lang === "ru") {
            queueMsg += `\n🗓 **${fa.date}** (ориентир: **${fa.time}**, ${fa.duration_min} мин.)\n` +
              `👨‍⚕️ Врач: ${fa.staff_name}\n` +
              `🦷 Услуга: ${fa.complaint}\n` +
              `👥 Записей на эту дату: **${docApptsOnDate.length} пациентов**\n`;
          } else {
            queueMsg += `\n🗓 **${fa.date}** (taxminiy vaqt: **${fa.time} larda**, ${fa.duration_min} daqiqa)\n` +
              `👨‍⚕️ Shifokor: ${fa.staff_name}\n` +
              `🦷 Muolaja: ${fa.complaint}\n` +
              `👥 Ushbu kunda navbatga yozilganlar: **${docApptsOnDate.length} ta bemor**\n`;
          }

          qKb.text(`✏️ ${fa.date} ko'chirish`, `appt:reschedule:${fa.id}`);
          qKb.text(`❌ ${fa.date} bekor qilish`, `appt:cancel_prompt:${fa.id}`).row();
        }

        queueMsg += "\n💡 *Qabul kunida bu yerda navbat raqamingiz va oldinda necha bemor borligi jonli ko'rinadi.*";
      }

      qKb.text(tf(s.lang, "btnAppointment"), "appt:start").row();
      qKb.text(tf(s.lang, "mainMenu"), "cancel");

      await ctx.reply(queueMsg, { reply_markup: qKb, parse_mode: "Markdown" });
    }

    bot.callbackQuery("my:position", async (ctx) => {
      const tgId = String(ctx.from.id);
      await ctx.answerCallbackQuery();
      await sendQueueAndAppointments(ctx, tgId);
    });

    async function showClinicContacts(ctx: any, tgId: string) {
      const s = getSession(tgId);
      const isRu = s.lang === "ru";
      try {
        const cName = clinicName;
        const cPhone = clinicPhone;
        const cTg = clinicTg;

        const staffList = (handlers.getStaff() || []).filter((st) => st.active !== false);
        const doctors = staffList.filter((st) => st.position === "doctor");
        const assistants = staffList.filter((st) => st.position === "assistant");

        const sanitizeTg = (raw?: string) => {
          if (!raw) return "";
          return String(raw).replace(/https?:\/\/t\.me\//gi, "").replace(/@/g, "").replace(/\s+/g, "").trim();
        };

        let msg = isRu
          ? `🏥 *Контакты клиники и врачей:*\n\n` +
            `🏢 *${cName}*\n` +
            `📞 Телефон регистратуры: *${cPhone}*\n` +
            (cTg ? `💬 Telegram: @${sanitizeTg(cTg)}\n` : "") +
            `⏰ Режим работы: *09:00 – 18:00* (Обед: 14:00 – 15:00)\n\n` +
            `👨‍⚕️ *Наши врачи и специалисты:*\n`
          : `🏥 *Klinika va shifokorlar bilan bog'lanish:*\n\n` +
            `🏢 *${cName}*\n` +
            `📞 Qabulxona (Registratura): *${cPhone}*\n` +
            (cTg ? `💬 Telegram: @${sanitizeTg(cTg)}\n` : "") +
            `⏰ Ish vaqti: *09:00 dan 18:00 gacha*\n` +
            `🍱 Tushlik: *14:00 dan 15:00 gacha*\n\n` +
            `👨‍⚕️ *Shifokorlarimiz va mutaxassislar:*\n`;

        if (doctors.length === 0 && assistants.length === 0) {
          msg += isRu ? `_(Список врачей обновляется)_\n` : `_(Shifokorlar ro'yxati yangilanmoqda)_\n`;
        }

        for (const d of doctors) {
          const cleanTg = sanitizeTg(d.telegram_username);
          const tgText = cleanTg ? ` | 💬 @${cleanTg}` : "";
          const phoneText = d.phone ? `📞 ${d.phone}` : `📞 ${cPhone}`;
          msg += `• *${d.full_name}* (Shifokor): ${phoneText}${tgText}\n`;
        }
        for (const a of assistants) {
          const cleanTg = sanitizeTg(a.telegram_username);
          const tgText = cleanTg ? ` | 💬 @${cleanTg}` : "";
          const phoneText = a.phone ? `📞 ${a.phone}` : `📞 ${cPhone}`;
          msg += `• *${a.full_name}* (Assistent): ${phoneText}${tgText}\n`;
        }

        msg += isRu
          ? `\n👇 *Нажмите на кнопку ниже, чтобы перейти в Telegram врача:*`
          : `\n👇 *Shifokorga Telegram orqali yozish uchun quyidagi tugmalarni bosing:*`;

        const kb = new InlineKeyboard();

        // Shifokorlarning Telegram tugmalari (faqat to'g'ri username bo'lsa)
        for (const d of doctors) {
          const u = sanitizeTg(d.telegram_username);
          if (u && /^[a-zA-Z0-9_]{3,32}$/.test(u)) {
            kb.url(`💬 ${d.full_name}`, `https://t.me/${u}`).row();
          }
        }
        for (const a of assistants) {
          const u = sanitizeTg(a.telegram_username);
          if (u && /^[a-zA-Z0-9_]{3,32}$/.test(u)) {
            kb.url(`💬 ${a.full_name}`, `https://t.me/${u}`).row();
          }
        }

        const cleanAdminTg = sanitizeTg(cTg);
        if (cleanAdminTg && /^[a-zA-Z0-9_]{3,32}$/.test(cleanAdminTg)) {
          kb.url(isRu ? "💬 Администратор клиники" : "💬 Klinika administratori", `https://t.me/${cleanAdminTg}`).row();
        }

        kb.text(tf(s.lang, "mainMenu"), "cancel");

        try {
          await ctx.reply(msg, { reply_markup: kb, parse_mode: "Markdown" });
        } catch {
          const plain = msg.replace(/\*/g, "").replace(/_/g, "");
          try {
            await ctx.reply(plain, { reply_markup: kb });
          } catch {
            const simpleKb = new InlineKeyboard().text(tf(s.lang, "mainMenu"), "cancel");
            await ctx.reply(plain, { reply_markup: simpleKb });
          }
        }
      } catch (err: any) {
        console.error("showClinicContacts error:", err);
        const fbText = `🏥 ${clinicName}\n📞 Qabulxona: ${clinicPhone}\n` + (clinicTg ? `💬 Telegram: @${clinicTg.replace("@", "")}\n` : "");
        const fallbackKb = new InlineKeyboard().text(tf(s.lang, "mainMenu"), "cancel");
        await ctx.reply(fbText, { reply_markup: fallbackKb }).catch(() => {});
      }
    }

    bot.callbackQuery(["clinic:contacts", "contacts"], async (ctx) => {
      if (!ctx.from) return;
      const tgId = String(ctx.from.id);
      await ctx.answerCallbackQuery().catch(() => {});
      await showClinicContacts(ctx, tgId);
    });

    bot.command(["contacts", "shifokor", "aloqa", "doctor", "telefon"], async (ctx) => {
      if (!ctx.from) return;
      const tgId = String(ctx.from.id);
      await showClinicContacts(ctx, tgId);
    });

    // ── INTERAKTIV MANZIL TANLASH (Viloyat -> Tuman -> Qishloq -> Uy) ──

    bot.callbackQuery(/^reg:gender:(male|female)$/, async (ctx) => {
      const tgId = String(ctx.from.id);
      const s = getSession(tgId);
      s.data.gender = ctx.match[1];
      s.data.addr_region = "Xorazm viloyati";
      s.step = "reg:district";
      updateSession(tgId, s);
      await ctx.answerCallbackQuery();
      await ctx.reply(
        s.lang === "ru"
          ? "📍 **Выберите ваш район или город (Хорезмская область):**"
          : "📍 **Yashash tumaningiz yoki shahringizni tanlang (Xorazm viloyati):**",
        { reply_markup: districtKeyboard(s.lang), parse_mode: "Markdown" }
      );
    });

    bot.callbackQuery(/^addr:reg:(.+)$/, async (ctx) => {
      const tgId = String(ctx.from.id);
      const s = getSession(tgId);
      s.data.addr_region = "Xorazm viloyati";
      s.step = "reg:district";
      updateSession(tgId, s);
      await ctx.answerCallbackQuery();
      await ctx.reply(
        s.lang === "ru"
          ? "📍 **Выберите ваш район или город (Хорезмская область):**"
          : "📍 **Yashash tumaningiz yoki shahringizni tanlang (Xorazm viloyati):**",
        { reply_markup: districtKeyboard(s.lang), parse_mode: "Markdown" }
      );
    });

    bot.callbackQuery(/^addr:dist:(.+)$/, async (ctx) => {
      const tgId = String(ctx.from.id);
      const s = getSession(tgId);
      const dist = ctx.match[1];
      if (!s.data.addr_region) s.data.addr_region = "Xorazm viloyati";
      s.data.addr_district = dist;
      s.step = "reg:village";
      updateSession(tgId, s);
      await ctx.answerCallbackQuery();

      await ctx.reply(
        s.lang === "ru"
          ? `📍 Выбран район / город: **${dist}**\n\n🏘 **Выберите село / махаллю:**`
          : `📍 Tanlangan tuman / shahar: **${dist}**\n\n🏘 **Qishloq yoki mahallangizni tanlang:**`,
        { reply_markup: villageKeyboard(dist, s.lang), parse_mode: "Markdown" }
      );
    });

    bot.callbackQuery(/^addr:vil:(.+)$/, async (ctx) => {
      const tgId = String(ctx.from.id);
      const s = getSession(tgId);
      const vil = ctx.match[1];
      if (!s.data.addr_region) s.data.addr_region = "Xorazm viloyati";
      s.data.addr_village = vil;
      const addrSummary = [s.data.addr_region, s.data.addr_district, vil].filter(Boolean).join(", ");
      s.data.address = addrSummary;
      updateSession(tgId, s);
      await ctx.answerCallbackQuery().catch(() => {});
      await finishPatientRegistration(ctx, tgId);
    });

    bot.callbackQuery("addr:back_dist", async (ctx) => {
      const tgId = String(ctx.from.id);
      const s = getSession(tgId);
      s.step = "reg:district";
      updateSession(tgId, s);
      await ctx.answerCallbackQuery().catch(() => {});
      await ctx.reply(
        s.lang === "ru"
          ? "📍 **Выберите ваш район или город (Хорезмская область):**"
          : "📍 **Yashash tumaningiz yoki shahringizni tanlang (Xorazm viloyati):**",
        { reply_markup: districtKeyboard(s.lang), parse_mode: "Markdown" }
      );
    });

    bot.callbackQuery("addr:skip_street", async (ctx) => {
      const tgId = String(ctx.from.id);
      const s = getSession(tgId);
      const addrParts = [
        s.data.addr_region,
        s.data.addr_district,
        s.data.addr_village
      ].filter(Boolean);
      s.data.address = addrParts.join(", ") || "—";
      updateSession(tgId, s);
      await ctx.answerCallbackQuery().catch(() => {});
      await finishPatientRegistration(ctx, tgId);
    });

    bot.callbackQuery("addr:dist_custom", async (ctx) => {
      const tgId = String(ctx.from.id);
      const s = getSession(tgId);
      s.step = "reg:dist_text";
      updateSession(tgId, s);
      await ctx.answerCallbackQuery().catch(() => {});
      await ctx.reply("✍️ Tumaningiz nomini yozib yuboring:");
    });

    bot.callbackQuery("addr:vil_custom", async (ctx) => {
      const tgId = String(ctx.from.id);
      const s = getSession(tgId);
      s.step = "reg:vil_text";
      updateSession(tgId, s);
      await ctx.answerCallbackQuery().catch(() => {});
      await ctx.reply("✍️ Qishlog'ingiz yoki mahallangiz nomini yozib yuboring:");
    });

    bot.callbackQuery("addr:custom", async (ctx) => {
      const tgId = String(ctx.from.id);
      const s = getSession(tgId);
      s.step = "reg:address_custom";
      updateSession(tgId, s);
      await ctx.answerCallbackQuery().catch(() => {});
      await ctx.reply("✍️ Yashash manzilingizni to'liq matn ko'rinishida yozib yuboring (masalan: Xorazm vil., Qo'shko'pir tum., Hayrobod q., 14-uy):");
    });

    // ── RO'YXATDAN O'TISHDA SHIKOYAT / SABAB TANLASH (Tugmalar orqali) ──

    bot.callbackQuery("reg:cat:consult", async (ctx) => {
      const tgId = String(ctx.from.id);
      const s = getSession(tgId);
      s.data.complaint = "Birlamchi profilaktik ko'rik va diagnostika (shikoyatsiz)";
      s.data.duration_min = 20;
      await ctx.answerCallbackQuery().catch(() => {});
      await finishPatientRegistration(ctx, tgId);
    });

    bot.callbackQuery("reg:cat:clean", async (ctx) => {
      const tgId = String(ctx.from.id);
      const s = getSession(tgId);
      s.data.complaint = "Ultratovushli tish tozalash va Air-Flow gigiyenasi";
      s.data.duration_min = 35;
      await ctx.answerCallbackQuery().catch(() => {});
      await finishPatientRegistration(ctx, tgId);
    });

    bot.callbackQuery("reg:cat:ortho", async (ctx) => {
      const tgId = String(ctx.from.id);
      const s = getSession(tgId);
      s.data.complaint = "Ortodontiya va breket tizimi konsultatsiyasi";
      s.data.duration_min = 40;
      await ctx.answerCallbackQuery().catch(() => {});
      await finishPatientRegistration(ctx, tgId);
    });

    bot.callbackQuery("reg:cat:pain", async (ctx) => {
      const tgId = String(ctx.from.id);
      const s = getSession(tgId);
      s.step = "reg:clarify";
      s.data.triageHistory = [{ role: "patient", text: "Tishimda og'riq va simillash bor" }];
      updateSession(tgId, s);
      await ctx.answerCallbackQuery().catch(() => {});

      const qMsg = s.lang === "ru"
        ? "🤖 **AI Стоматолог:**\n\nОпишите, как именно проявляется боль (выберите вариант ниже):"
        : "🤖 **AI Stomatolog:**\n\nTishingizdagi og'riq qachon va qanday bezovta qiladi? (Quyidagi tugmalardan birini tanlang):";

      await ctx.reply(qMsg, {
        reply_markup: triageAnswersKeyboard(s.lang),
        parse_mode: "Markdown",
      });
    });

    bot.callbackQuery("reg:cat:custom", async (ctx) => {
      const tgId = String(ctx.from.id);
      const s = getSession(tgId);
      s.step = "reg:complaint_text";
      updateSession(tgId, s);
      await ctx.answerCallbackQuery().catch(() => {});
      await ctx.reply("✍️ Klinikamizga nima maqsadda kelmoqchi ekanligingizni matn ko'rinishida yozib yuboring:");
    });

    bot.callbackQuery("reg:skip_birth", async (ctx) => {
      const tgId = String(ctx.from.id);
      const s = getSession(tgId);
      s.data.birth_date = "";
      s.step = "reg:gender";
      updateSession(tgId, s);
      await ctx.answerCallbackQuery();
      await ctx.reply(tf(s.lang, "askGender"), { reply_markup: genderKeyboard(s.lang) });
    });

    async function finishPatientRegistration(ctx: any, tgId: string, rep?: string) {
      const s = getSession(tgId);
      const name = s.data.name;
      const phone = s.data.phone;
      const birth_date = s.data.birth_date || "";
      const gender = s.data.gender || "";
      const address = s.data.address || "—";
      const complaint = s.data.complaint || "Birlamchi ko'rik";
      const durationMin = Number(s.data.duration_min) || 30;

      // Agar mavjud bemor o'z manzilini tahrirlayotgan bo'lsa
      if (s.data.isEditing) {
        delete s.data.isEditing;
        const patient = handlers.getPatients().find((p) => p.telegram_id === tgId);
        if (patient) {
          patient.address = address;
          if (handlers.updatePatient) {
            handlers.updatePatient(patient.id, { address });
          }
          handlers.broadcast("patient:updated", { id: patient.id, address });
          s.step = "idle";
          updateSession(tgId, s);
          await sendPatientProfile(ctx, tgId, tf(s.lang, "profileUpdated"));
          return;
        }
      }

      handlers.createPatient({
        full_name: name,
        phone,
        birth_date,
        gender,
        address,
        telegram_id: tgId,
        telegram_username: ctx.from?.username || "",
        lang: s.lang,
        source: "telegram",
        notes: `AI shikoyat: ${complaint}, ${durationMin} min`,
      });

      handlers.broadcast("patient:new", { name, phone, source: "telegram" });

      const genderLabel = gender ? GENDER_LABEL[gender]?.[s.lang] || gender : "—";

      if (s.data.then === "appointment") {
        delete s.data.then;
        if (s.data.complaint && s.data.duration_min) {
          await showDoctors(ctx, tgId, rep);
        } else {
          await showComplaintCategories(ctx, tgId);
        }
        return;
      }

      s.step = "idle";
      updateSession(tgId, s);

      const kb = new InlineKeyboard()
        .text(tf(s.lang, "btnAppointment"), "appt:start")
        .row()
        .text(tf(s.lang, "mainMenu"), "cancel");

      await ctx.reply(
        tf(s.lang, "registered", { name, phone, gender: genderLabel, address: address || "—" }),
        { reply_markup: kb, parse_mode: "Markdown" }
      );
    }

    bot.callbackQuery("cancel", async (ctx) => {
      const tgId = String(ctx.from.id);
      const s = getSession(tgId);
      s.step = "idle";
      s.data = {};
      updateSession(tgId, s);
      await ctx.answerCallbackQuery();
      await sendMenu(ctx, tgId);
    });

    // Matnli xabarlar
    bot.on("message:text", async (ctx) => {
      const tgId = String(ctx.from.id);
      const s = getSession(tgId);
      const text = (ctx.message.text || "").trim();

      // Ro'yxatdan o'tish yoki ma'lumot kiritish qadamlarida chat tarixi to'lib ketmasligi uchun xabarlarni tozalash
      if (s.step.startsWith("reg:") || s.step.startsWith("appt:") || s.step.startsWith("fb:") || s.step.startsWith("edit:") || s.step.startsWith("link:")) {
        try {
          await ctx.deleteMessage().catch(() => {});
        } catch (e) {}
      }

      // ── BEMOR MA'LUMOTLARINI O'ZGARTIRISH (ISMI, TUG'ILGAN SANASI, TELEFONI) ──
      if (s.step === "edit:name") {
        const patient = handlers.getPatients().find((p) => p.telegram_id === tgId);
        if (patient) {
          patient.full_name = text;
          if (handlers.updatePatient) {
            handlers.updatePatient(patient.id, { full_name: text });
          }
          handlers.broadcast("patient:updated", { id: patient.id, full_name: text });
        }
        s.step = "idle";
        updateSession(tgId, s);
        await sendPatientProfile(ctx, tgId, tf(s.lang, "profileUpdated"));
        return;
      }

      if (s.step === "edit:birth") {
        let normalized = text.trim();
        const dmyMatch = text.match(/^(\d{1,2})[\.\-\/](\d{1,2})[\.\-\/](\d{4})$/);
        if (dmyMatch) {
          normalized = `${dmyMatch[3]}-${dmyMatch[2].padStart(2, "0")}-${dmyMatch[1].padStart(2, "0")}`;
        }
        const patient = handlers.getPatients().find((p) => p.telegram_id === tgId);
        if (patient) {
          patient.birth_date = normalized;
          if (handlers.updatePatient) {
            handlers.updatePatient(patient.id, { birth_date: normalized });
          }
          handlers.broadcast("patient:updated", { id: patient.id, birth_date: normalized });
        }
        s.step = "idle";
        updateSession(tgId, s);
        await sendPatientProfile(ctx, tgId, tf(s.lang, "profileUpdated"));
        return;
      }

      if (s.step === "edit:phone") {
        const phoneOk = /^\+?\d{9,15}$/.test(text.replace(/[\s\-()]/g, ""));
        if (!phoneOk) {
          await ctx.reply(tf(s.lang, "phoneInvalid"));
          return;
        }
        const patient = handlers.getPatients().find((p) => p.telegram_id === tgId);
        if (patient) {
          patient.phone = text;
          if (handlers.updatePatient) {
            handlers.updatePatient(patient.id, { phone: text });
          }
          handlers.broadcast("patient:updated", { id: patient.id, phone: text });
        }
        s.step = "idle";
        updateSession(tgId, s);
        await sendPatientProfile(ctx, tgId, tf(s.lang, "profileUpdated"));
        return;
      }

      // ── KLINIKADAGI BEMOR KARTASINI TELEGRAM BOTGA ULASH (KOD YOKI TELEFON ORQALI) ──
      if (s.step === "link:code") {
        const cleanInput = text.trim();
        const patient = handlers.getPatients().find((p) =>
          (p.connect_code && p.connect_code.toLowerCase() === cleanInput.toLowerCase()) ||
          String(p.id) === cleanInput ||
          (cleanInput.length >= 7 && (p.phone || "").replace(/\D/g, "").endsWith(cleanInput.replace(/\D/g, "")))
        );

        if (patient) {
          patient.telegram_id = tgId;
          if (ctx.from?.username) patient.telegram_username = ctx.from.username.replace(/^@/, "");
          if (handlers.updatePatient) {
            handlers.updatePatient(patient.id, {
              telegram_id: tgId,
              telegram_username: patient.telegram_username,
            });
          }
          handlers.broadcast("patient:telegram_linked", {
            patient_id: patient.id,
            full_name: patient.full_name,
            telegram_id: tgId,
            telegram_username: patient.telegram_username,
          });
          s.step = "idle";
          updateSession(tgId, s);

          await ctx.reply(tf(s.lang, "linkedSuccess", { name: patient.full_name, id: patient.id }), {
            reply_markup: mainMenuKeyboard(s.lang),
            parse_mode: "Markdown",
          });
          return;
        } else {
          const retryKb = new InlineKeyboard()
            .text(tf(s.lang, "btnRegister"), "reg:start")
            .row()
            .text(tf(s.lang, "cancel"), "cancel");
          await ctx.reply(tf(s.lang, "linkNotFound"), { reply_markup: retryKb });
          return;
        }
      }

      if (s.step === "reg:name") {
        s.data.name = text;
        s.step = "reg:phone";
        updateSession(tgId, s);
        await ctx.reply(tf(s.lang, "askPhone"));
        return;
      }

      if (s.step === "reg:phone") {
        const phoneOk = /^\+?\d{9,15}$/.test(text.replace(/[\s\-()]/g, ""));
        if (!phoneOk) {
          await ctx.reply(tf(s.lang, "phoneInvalid"));
          return;
        }
        s.data.phone = text;

        // Klinika bazasida ushbu telefon bilan avval ro'yxatdan o'tgan bemor bormi?
        const existingClinicPatient = handlers.getPatients().find((p) => {
          const pClean = (p.phone || "").replace(/\D/g, "");
          const inClean = text.replace(/\D/g, "");
          return pClean && inClean && (pClean.endsWith(inClean) || inClean.endsWith(pClean));
        });

        if (existingClinicPatient && !existingClinicPatient.telegram_id) {
          existingClinicPatient.telegram_id = tgId;
          if (ctx.from?.username) existingClinicPatient.telegram_username = ctx.from.username.replace(/^@/, "");
          if (handlers.updatePatient) {
            handlers.updatePatient(existingClinicPatient.id, {
              telegram_id: tgId,
              telegram_username: existingClinicPatient.telegram_username,
            });
          }
          handlers.broadcast("patient:telegram_linked", {
            patient_id: existingClinicPatient.id,
            full_name: existingClinicPatient.full_name,
            telegram_id: tgId,
            telegram_username: existingClinicPatient.telegram_username,
          });
          s.step = "idle";
          updateSession(tgId, s);

          const linkedMsg = s.lang === "ru"
            ? `🎉 **Вы уже зарегистрированы в клинике как ${existingClinicPatient.full_name}!**\n\nВаша медицинская карта (#ID: ${existingClinicPatient.id}) успешно привязана к вашему Telegram! ✅`
            : `🎉 **Siz klinikamizda avval ${existingClinicPatient.full_name} sifatida ro'yxatdan o'tgansiz!**\n\nTibbiy kartangiz (#ID: ${existingClinicPatient.id}) muvaffaqiyatli Telegram akkauntingizga bog'landi! ✅`;

          await ctx.reply(linkedMsg, { reply_markup: mainMenuKeyboard(s.lang), parse_mode: "Markdown" });
          if (s.data.then === "appointment") {
            delete s.data.then;
            await showComplaintCategories(ctx, tgId);
          }
          return;
        }

        s.step = "reg:birth";
        updateSession(tgId, s);
        const birthKb = new InlineKeyboard().text(tf(s.lang, "skip"), "reg:skip_birth");
        await ctx.reply(tf(s.lang, "askBirth"), { reply_markup: birthKb });
        return;
      }

      if (s.step === "reg:birth") {
        let normalized = text.trim();
        const dmyMatch = text.match(/^(\d{1,2})[\.\-\/](\d{1,2})[\.\-\/](\d{4})$/);
        if (dmyMatch) {
          normalized = `${dmyMatch[3]}-${dmyMatch[2].padStart(2, "0")}-${dmyMatch[1].padStart(2, "0")}`;
        }
        s.data.birth_date = normalized;
        s.step = "reg:gender";
        updateSession(tgId, s);
        await ctx.reply(tf(s.lang, "askGender"), { reply_markup: genderKeyboard(s.lang) });
        return;
      }

      if (s.step === "reg:dist_text") {
        if (!s.data.addr_region) s.data.addr_region = "Xorazm viloyati";
        s.data.addr_district = text;
        s.step = "reg:village";
        updateSession(tgId, s);
        await ctx.reply(
          s.lang === "ru"
            ? `📍 Выбран район / город: **${text}**\n\n🏘 Выберите село / махаллю или напишите название:`
            : `📍 Tanlangan tuman / shahar: **${text}**\n\n🏘 Qishloq yoki mahallangizni tanlang yoki nomini yozing:`,
          { reply_markup: villageKeyboard(text, s.lang), parse_mode: "Markdown" }
        );
        return;
      }

      if (s.step === "reg:vil_text") {
        s.data.addr_village = text;
        const addrSummary = [s.data.addr_region, s.data.addr_district, text].filter(Boolean).join(", ");
        s.data.address = addrSummary;
        updateSession(tgId, s);
        await finishPatientRegistration(ctx, tgId);
        return;
      }

      if (s.step === "reg:street") {
        const addrParts = [
          s.data.addr_region,
          s.data.addr_district,
          s.data.addr_village,
          text,
        ].filter(Boolean);
        s.data.address = addrParts.join(", ") || "—";
        updateSession(tgId, s);
        await finishPatientRegistration(ctx, tgId);
        return;
      }

      if (s.step === "reg:address_custom" || s.step === "reg:address") {
        s.data.address = text || "—";
        updateSession(tgId, s);
        await finishPatientRegistration(ctx, tgId);
        return;
      }

      if (s.step === "reg:complaint_text") {
        s.data.complaint = text;
        s.data.duration_min = 30;
        await finishPatientRegistration(ctx, tgId);
        return;
      }

      // Ro'yxatdan o'tishdagi yoki navbat olishdagi interaktiv AI shikoyat tahlili
      if (s.step === "reg:complaint" || s.step === "reg:clarify" || s.step === "appt:complaint" || s.step === "appt:clarify") {
        if (!s.data.triageHistory) s.data.triageHistory = [];
        s.data.triageHistory.push({ role: "patient", text });

        // Gemini AI orqali shikoyatni tahlil qilish va vaqt hisoblash
        await ctx.replyWithChatAction?.("typing");
        const triage = await analyzeDentalComplaintAndEstimateTime(
          text,
          s.data.triageHistory,
          s.lang
        );

        // Agar sun'iy intellekt bemorga aniqlashtiruvchi savol bermoqchi bo'lsa
        const botQuestionsCount = (s.data.triageHistory || []).filter((h: any) => h.role === "bot").length;
        if (triage.needsClarification && triage.followUpQuestion && botQuestionsCount < 2) {
          s.data.triageHistory.push({ role: "bot", text: triage.followUpQuestion });
          s.step = s.step.startsWith("reg") ? "reg:clarify" : "appt:clarify";
          updateSession(tgId, s);

          const kb = triage.clarifyType === "location"
            ? toothRegionKeyboard(s.lang)
            : triageAnswersKeyboard(s.lang);

          await ctx.reply(`🤖 **AI Shifokor yordamchisi:**\n\n${triage.followUpQuestion}`, {
            reply_markup: kb,
            parse_mode: "Markdown",
          });
          return;
        }

        // Tahlil yakunlandi: muolaja vaqti va tashxis aniqlandi
        s.data.complaint = `${triage.condition} (${triage.toothRegion}). ${text}`;
        s.data.duration_min = triage.durationMinutes;
        s.data.triage = triage;

        const durLabel = triage.durationMinutes >= 60
          ? `${Math.floor(triage.durationMinutes / 60)} soat ${triage.durationMinutes % 60 ? triage.durationMinutes % 60 + " daqiqa" : ""}`
          : `${triage.durationMinutes} daqiqa`;

        const triageReport = `🤖 **Sun'iy Intellekt Tahlili va Vaqt Hisobi:**\n\n` +
          `🦷 **Tish va holat:** ${triage.condition} (${triage.toothRegion})\n` +
          `⏱ **Ajratilgan muolaja vaqti:** ${triage.durationMinutes} daqiqa (${durLabel})\n` +
          `📋 **Asos:** ${triage.explanation}\n` +
          `💡 **Shifokorgacha tavsiya:** ${triage.preCareAdvice}`;

        await ctx.reply(triageReport, { parse_mode: "Markdown" });

        // Agar bu ro'yxatdan o'tish qadami bo'lsa
        if (s.step.startsWith("reg")) {
          const name = s.data.name;
          const phone = s.data.phone;
          const gender = s.data.gender || "";
          const address = s.data.address || "";

          handlers.createPatient({
            full_name: name,
            phone,
            gender,
            address,
            telegram_id: tgId,
            lang: s.lang,
            source: "telegram",
            notes: `AI shikoyat: ${triage.condition}, ${triage.durationMinutes} min`,
          });

          handlers.broadcast("patient:new", { name, phone, source: "telegram" });

          const genderLabel = gender ? GENDER_LABEL[gender]?.[s.lang] || gender : "—";
          const kb = new InlineKeyboard().text(tf(s.lang, "btnAppointment"), "appt:start");
          await ctx.reply(
            tf(s.lang, "registered", { name, phone, gender: genderLabel, address: address || "—" }),
            { reply_markup: kb }
          );

          if (s.data.then === "appointment") {
            delete s.data.then;
            await showDoctors(ctx, tgId);
            return;
          }
          s.step = "idle";
          updateSession(tgId, s);
          return;
        }

        // Agar bu navbat olish qadami bo'lsa -> shifokor tanlashga o'tish
        await showDoctors(ctx, tgId);
        return;
      }

      if (s.step === "appt:customtime") {
        const date = s.data.date || getClinicNow().dateStr;
        await completeQueueBooking(ctx, tgId, date);
        return;
      }

      if (s.step === "fb:text") {
        const patient = handlers.getPatients().find((p) => p.telegram_id === tgId);
        handlers.createComplaint({
          patient_name: patient ? patient.full_name : "Telegram foydalanuvchisi",
          telegram_id: tgId,
          message: text,
          status: "open",
        });
        s.step = "idle";
        updateSession(tgId, s);
        await ctx.reply(tf(s.lang, "feedbackThanks"));
        return;
      }

      const lowerText = text.toLowerCase();

      // Agar foydalanuvchi shifokor bilan bog'lanish yoki aloqa haqida so'rasa / yozsa:
      const isContactInquiry =
        lowerText.includes("shifokor") ||
        lowerText.includes("aloqa") ||
        lowerText.includes("bog'lan") ||
        lowerText.includes("boglan") ||
        lowerText.includes("kontakt") ||
        lowerText.includes("vrach") ||
        lowerText.includes("telefon") ||
        lowerText.includes("связаться") ||
        lowerText.includes("врач") ||
        lowerText.includes("contact");

      if (isContactInquiry && (s.step === "idle" || !s.step.startsWith("reg:"))) {
        await showClinicContacts(ctx, tgId);
        return;
      }

      // Agar bemor tish sug'urish (ekstraktsiya) yoki implant haqida so'rasa / maslahatlashsa:
      // Klinikamiz hali xirurgik litsenziya olmaganligi sababli, ongli, tushunarli va qonuniy javob berish
      const isSurgicalInquiry =
        lowerText.includes("sug'ur") ||
        lowerText.includes("sugur") ||
        lowerText.includes("oldir") ||
        lowerText.includes("yulish") ||
        lowerText.includes("implant") ||
        lowerText.includes("имплант") ||
        lowerText.includes("удалит") ||
        lowerText.includes("вырват") ||
        lowerText.includes("экстракц") ||
        lowerText.includes("хирург") ||
        lowerText.includes("xirurg") ||
        lowerText.includes("jarroh") ||
        lowerText.includes("extract");

      if (isSurgicalInquiry) {
        const notice = getSurgicalLicenseNotice(s.lang);
        await ctx.reply(notice.text, {
          reply_markup: notice.keyboard,
          parse_mode: "Markdown",
        });
        return;
      }

      // Agar foydalanuvchi tish og'rig'i yoki stomatologik shikoyat haqida yozsa
      const isDentalSymptom =
        lowerText.includes("og'ri") ||
        lowerText.includes("ogri") ||
        lowerText.includes("simill") ||
        lowerText.includes("zirqir") ||
        lowerText.includes("zirkir") ||
        lowerText.includes("puls") ||
        lowerText.includes("tish") ||
        lowerText.includes("karies") ||
        lowerText.includes("pulpit") ||
        lowerText.includes("nerv") ||
        lowerText.includes("plomba") ||
        lowerText.includes("болит") ||
        lowerText.includes("боль") ||
        lowerText.includes("ноет") ||
        lowerText.includes("зуб") ||
        lowerText.includes("tooth") ||
        lowerText.includes("teeth") ||
        lowerText.includes("ache") ||
        lowerText.includes("pain");

      if (isDentalSymptom) {
        const hasSpecificLoc =
          lowerText.includes("yuqorigi") ||
          lowerText.includes("yuqori") ||
          lowerText.includes("pastki") ||
          lowerText.includes("past") ||
          lowerText.includes("o'ng") ||
          lowerText.includes("ong") ||
          lowerText.includes("chap") ||
          lowerText.includes("katta oziq") ||
          lowerText.includes("oziq") ||
          lowerText.includes("oldingi") ||
          lowerText.includes("kurak") ||
          lowerText.includes("qoziq") ||
          lowerText.includes("aql") ||
          lowerText.includes("моляр") ||
          lowerText.includes("передн") ||
          lowerText.includes("коренн") ||
          lowerText.includes("верхн") ||
          lowerText.includes("нижн") ||
          lowerText.includes("molar");

        s.data.triageHistory = [{ role: "patient", text }];

        if (!hasSpecificLoc) {
          s.step = "appt:clarify_loc";
          updateSession(tgId, s);

          const locPrompt = s.lang === "ru"
            ? `🤖 **AI Стоматолог-диагност:**\n\nВы написали: *«${text}»*\n\nЧтобы точно поставить предварительный диагноз (кариес, пульпит или периодонтит) и спланировать время приема врача:\n\n📍 **1-й шаг: Где именно находится беспокоящий зуб?** (Выберите кнопку ниже):`
            : s.lang === "en"
            ? `🤖 **AI Dental Triage:**\n\nYou mentioned: *«${text}»*\n\nTo formulate an accurate provisional diagnosis and allocate clinical chair time:\n\n📍 **Step 1: Where is the affected tooth located?** (Select below):`
            : `🤖 **AI Stomatolog-diagnost:**\n\nSiz yozdingiz: *«${text}»*\n\nTo'g'ri dastlabki tashxis qo'yish (karies, pulpit yoki periodontit) va shifokor qabuli vaqtini to'g'ri rejalashtirish uchun:\n\n📍 **1-bosqich: Bezovta qilayotgan tishingiz og'zingizning qayerida joylashgan?** (Quyidagi tugmalardan birini tanlang):`;

          await ctx.reply(locPrompt, {
            reply_markup: toothRegionKeyboard(s.lang),
            parse_mode: "Markdown",
          });
          return;
        } else {
          s.step = "appt:clarify";
          updateSession(tgId, s);

          const symPrompt = s.lang === "ru"
            ? `🤖 **AI Стоматолог-диагност:**\n\nВы написали: *«${text}»*\n\n⚡️ **2-й шаг: Как и когда именно проявляется боль?** (Выберите вариант ниже):`
            : s.lang === "en"
            ? `🤖 **AI Dental Triage:**\n\nYou mentioned: *«${text}»*\n\n⚡️ **Step 2: When and how does the pain occur?** (Select below):`
            : `🤖 **AI Stomatolog-diagnost:**\n\nSiz yozdingiz: *«${text}»*\n\n⚡️ **2-bosqich: Ushbu tishingizdagi og'riq qanday va qachon bezovta qiladi?** (Quyidagi tugmalardan birini tanlang):`;

          await ctx.reply(symPrompt, {
            reply_markup: triageAnswersKeyboard(s.lang),
            parse_mode: "Markdown",
          });
          return;
        }
      }

      // Oddiy xabar — AI qabulxona konsultatsiyasi
      const patient = handlers.getPatients().find((p) => p.telegram_id === tgId);
      const aiResponse = await aiDentalReply(text, s.lang, patient?.full_name);
      if (aiResponse) {
        await ctx.reply(aiResponse);
      } else {
        await ctx.reply(tf(s.lang, "notFound"));
      }
    });

    bot.catch((err) => {
      console.error("Telegram Bot xatoligi:", err.error || err.message);
    });

    // Webhook va Polling nazorati:
    // DIQQAT: Google AI Studio development URL-lari (ais-dev-...) tashqi serverlar uchun
    // Google Auth cookie check (302 Found) bilan himoyalangan. Telegram webhook bu URL ga 302 xato beradi!
    // Shu sababli, agar URL "ais-dev-" bo'lsa, avtomatik Polling rejimiga o'tiladi.
    const appUrl = process.env.APP_URL;
    const isDevUrl = !appUrl || appUrl.includes("ais-dev-") || appUrl.includes("localhost");

    if (!isDevUrl && appUrl.startsWith("https://")) {
      const hookTarget = `${appUrl.replace(/\/+$/, "")}/api/telegram/webhook`;
      bot.api.setWebhook(hookTarget, { drop_pending_updates: false })
        .then(() => {
          webhookActive = true;
          webhookUrl = hookTarget;
          isBotRunning = true;
          console.log(`🚀 Telegram Webhook muvaffaqiyatli yoqildi: ${hookTarget}`);
        })
        .catch((e) => {
          console.warn("Webhook o'rnatishda xatolik, pollingga o'tilmoqda:", e.message);
          startPolling(bot);
        });
    } else {
      // Dev muhitida yoki webhook o'rnatilmagan holatda har doim xavfsiz Long Polling ishlaydi
      bot.api.deleteWebhook({ drop_pending_updates: false })
        .then(() => {
          webhookActive = false;
          webhookUrl = "";
          console.log("🧹 Webhook holati tekshirildi, 24/7 Polling yoqilmoqda...");
          startPolling(bot);
          startWatchdog(bot);
        })
        .catch(() => {
          startPolling(bot);
          startWatchdog(bot);
        });
    }

    // Har doim qo'shimcha xavfsizlik uchun watchdog ishga tushadi
    startWatchdog(bot);

    return {
      status: "started",
      botUsername,
      isRunning: true,
      webhookActive,
    };
  } catch (e: any) {
    console.error("Botni ishga tushirishda xatolik:", e.message);
    return {
      status: "error",
      error: e.message,
      isRunning: false,
    };
  }
}

let watchdogTimer: NodeJS.Timeout | null = null;
let isPollingStarting = false;

function startPolling(bot: Bot) {
  if (webhookActive) return;
  if (isPollingStarting) return;
  isPollingStarting = true;

  console.log("🔄 Telegram bot 24/7 polling ishga tushirilmoqda...");
  bot.start({
    drop_pending_updates: false,
    onStart: (info) => {
      botUsername = info.username;
      isBotRunning = true;
      webhookActive = false;
      webhookUrl = "";
      isPollingStarting = false;
      console.log(`✅ Telegram bot 24/7 uzluksiz polling rejimida faol: @${info.username}`);
    },
  }).catch(async (e) => {
    isBotRunning = false;
    isPollingStarting = false;
    console.error("⚠️ Bot polling uzildi yoki to'xtadi:", e.message);

    // Agar 409 Conflict bo'lsa (masalan webhook qolgan bo'lsa)
    if (e.message?.includes("409") || e.description?.includes("conflict")) {
      try {
        console.log("🧹 409 Conflict: Lingering Webhook tozalanmoqda...");
        await bot.api.deleteWebhook({ drop_pending_updates: false });
      } catch {}
    }

    // 3 soniyadan keyin avtomatik qayta ulanish (Self-healing auto-recovery)
    setTimeout(() => {
      if (!webhookActive) {
        console.log("🔁 Telegram bot qayta tiklanmoqda (Self-healing auto-restart)...");
        startPolling(bot);
      }
    }, 3000);
  });
}

function startWatchdog(bot: Bot) {
  if (watchdogTimer) clearInterval(watchdogTimer);
  // Har 20 soniyada bot holatini tekshirish va uzluksiz 24/7 ishlashini ta'minlash
  watchdogTimer = setInterval(async () => {
    if (webhookActive) return;
    try {
      if (!isBotRunning && !isPollingStarting) {
        console.log("🚨 Watchdog: Bot to'xtab qolgan, avtomatik 24/7 qayta ishga tushirilmoqda...");
        startPolling(bot);
      } else {
        const me = await bot.api.getMe().catch(() => null);
        if (me) {
          botUsername = me.username;
          isBotRunning = true;
        }
      }
    } catch (err: any) {
      console.warn("⚠️ Watchdog tekshiruvida ogohlantirish:", err.message);
    }
  }, 20000);
}

/**
 * Express uchun Telegram Webhook middleware
 */
export function getTelegramWebhookMiddleware() {
  if (!botInstance) return null;
  return webhookCallback(botInstance, "express");
}

/**
 * Botni yangi sozlamalar bilan to'xtatib qayta ishga tushirish (Hot Restart)
 */
export async function restartTelegramBot(handlers?: BotContextHandlers, newToken?: string): Promise<{ status: string; isRunning: boolean; botUsername?: string; error?: string }> {
  if (watchdogTimer) {
    clearInterval(watchdogTimer);
    watchdogTimer = null;
  }
  if (botInstance) {
    try {
      await botInstance.stop();
    } catch {}
    botInstance = null;
  }
  isBotRunning = false;
  isPollingStarting = false;
  webhookActive = false;
  webhookUrl = "";

  if (newToken !== undefined) {
    process.env.TELEGRAM_BOT_TOKEN = newToken;
  }
  if (handlers) {
    cachedHandlers = handlers;
  }
  if (!cachedHandlers) {
    return { status: "no_handlers", isRunning: false };
  }
  const result = initTelegramBot(cachedHandlers);
  return {
    status: result.status,
    isRunning: Boolean(result.isRunning),
    botUsername,
    error: (result as any).error,
  };
}

/**
 * Polling rejimiga majburiy o'tkazish
 */
export async function switchToPolling(): Promise<{ ok: boolean; message: string }> {
  if (!botInstance) return { ok: false, message: "Bot mavjud emas" };
  try {
    await botInstance.api.deleteWebhook({ drop_pending_updates: false });
    webhookActive = false;
    webhookUrl = "";
    startPolling(botInstance);
    return { ok: true, message: "Bot muvaffaqiyatli Polling rejimiga o'tkazildi" };
  } catch (err: any) {
    return { ok: false, message: `Xatolik: ${err.message}` };
  }
}

/**
 * Webhook statusini olish
 */
export async function getBotWebhookStatus() {
  if (!botInstance) {
    return {
      configured: false,
      isRunning: false,
      mode: "none",
    };
  }
  try {
    const info = await botInstance.api.getWebhookInfo();
    return {
      configured: true,
      isRunning: isBotRunning,
      mode: info.url ? "webhook" : "polling",
      url: info.url,
      hasCustomCertificate: info.has_custom_certificate,
      pendingUpdateCount: info.pending_update_count,
      lastErrorDate: info.last_error_date,
      lastErrorMessage: info.last_error_message,
    };
  } catch (e: any) {
    return {
      configured: true,
      isRunning: isBotRunning,
      mode: webhookActive ? "webhook" : "polling",
      url: webhookUrl,
      error: e.message,
    };
  }
}

/**
 * Foydalanuvchi orqali Webhook manzilini o'rnatish
 */
export async function setBotWebhook(targetUrl: string): Promise<{ ok: boolean; message: string }> {
  if (!botInstance) {
    return { ok: false, message: "Bot hali initsializatsiya qilinmagan (TELEGRAM_BOT_TOKEN kiritilmagan)" };
  }
  try {
    if (!targetUrl || targetUrl === "delete" || targetUrl === "polling") {
      return await switchToPolling();
    }
    await botInstance.api.setWebhook(targetUrl);
    webhookActive = true;
    webhookUrl = targetUrl;
    return { ok: true, message: `Webhook muvaffaqiyatli ulandi: ${targetUrl}` };
  } catch (err: any) {
    return { ok: false, message: `Webhook ulanmadi: ${err.message}` };
  }
}

// Bemorga admin paneldan xabar yuborish
export async function sendPatientTelegramMessage(tgId: string, text: string): Promise<boolean> {
  if (!botInstance) return false;
  try {
    const s = getSession(tgId);
    await botInstance.api.sendMessage(String(tgId), tf(s.lang || "uz", "msgFromClinic", { text }));
    return true;
  } catch (e: any) {
    console.error("Xabar yuborishda xatolik:", e.message);
    return false;
  }
}

// Eslatmani telegramga yuborish
export async function sendReminderTelegram(tgId: string, reason: string): Promise<boolean> {
  if (!botInstance) return false;
  try {
    const clinicName = process.env.CLINIC_NAME || "Stomatologiya Klinikasi";
    await botInstance.api.sendMessage(String(tgId), `⏰ Eslatma: ${reason}\n\n🏥 ${clinicName}`);
    return true;
  } catch (e: any) {
    console.error("Eslatma yuborilmadi:", e.message);
    return false;
  }
}

// Navbati kelayotgan bemorlarga 1 soatlik va 30 daqiqalik avtomatik eslatma
export async function notifyUpcomingAppointments(appointments: BotAppointment[], patients: BotPatient[]): Promise<number> {
  if (!botInstance) return 0;
  const clinicName = process.env.CLINIC_NAME || "Stomatologiya Klinikasi";
  const now = dayjs();
  let count = 0;

  for (const a of appointments) {
    if (a.status !== "scheduled") continue;
    const apptTime = dayjs(a.scheduled_at);
    const diffMinutes = apptTime.diff(now, "minute");
    const patient = patients.find((p) => p.id === a.patient_id);
    if (!patient?.telegram_id) continue;
    const lang = patient.lang || "uz";

    // 1. Qabulga 1 SOAT qolganda yuboriladigan eslatma (45 - 75 daqiqa oralig'ida)
    if (diffMinutes >= 45 && diffMinutes <= 75 && !(a as any).hour_notified) {
      try {
        const kb = new InlineKeyboard()
          .text(lang === "ru" ? "📍 Моя очередь онлайн" : "📍 Navbatimni ko'rish", "my:position")
          .row()
          .text(lang === "ru" ? "📞 Связаться с клиникой" : "📞 Shifokor bilan bog'lanish", "clinic:contacts");

        const msg = lang === "ru"
          ? `⏰ **Напоминание о приеме (Остался ~1 час):**\n\n` +
            `Уважаемый(ая) **${patient.full_name}**!\n` +
            `До вашего приема у врача **${a.staff_name || "—"}** остался примерно 1 час.\n` +
            `📅 Сегодня, ориентировочно в **${a.time}**\n` +
            `🏥 **${clinicName}**\n\n` +
            `Просим вас подойти в клинику за 10–15 минут.\n` +
            `📍 Живую очередь можно отслеживать через кнопку ниже.`
          : `⏰ **Qabul eslatmasi (Navbatingizga 1 soat qoldi):**\n\n` +
            `Hurmatli **${patient.full_name}**!\n` +
            `Sizning shifokor **${a.staff_name || "—"}** qabuliga navbatingizga taxminan 1 soat vaqt qoldi.\n` +
            `📅 Bugun, taxminan soat **${a.time} larda**\n` +
            `🏥 **${clinicName}**\n\n` +
            `Iltimos, o'z vaqtida yoki 10-15 daqiqa oldinroq klinikaga yetib kelishingizni so'raymiz.\n` +
            `📍 Navbatingizni jonli kuzatish uchun quyidagi tugmadan foydalanishingiz mumkin.`;

        await botInstance.api.sendMessage(String(patient.telegram_id), msg, {
          parse_mode: "Markdown",
          reply_markup: kb,
        });
        (a as any).hour_notified = 1;
        count++;
      } catch (err: any) {
        console.error(`1 soatlik eslatma yuborilmadi (ID: ${patient.telegram_id}):`, err.message);
      }
    }

    // 2. Qabulga 30 DAQIQA qolganda yuboriladigan eslatma (0 - 35 daqiqa oralig'ida)
    if (diffMinutes >= 0 && diffMinutes <= 35 && !a.turn_notified) {
      try {
        const kb = new InlineKeyboard()
          .text(lang === "ru" ? "📍 Моя очередь онлайн" : "📍 Navbatimni ko'rish", "my:position")
          .row()
          .text(lang === "ru" ? "📞 Связаться с клиникой" : "📞 Shifokor bilan bog'lanish", "clinic:contacts");

        await botInstance.api.sendMessage(
          String(patient.telegram_id),
          tf(lang, "turnSoon", {
            time: a.time,
            doctor: a.staff_name || "—",
            clinic: clinicName,
          }),
          { reply_markup: kb, parse_mode: "Markdown" }
        );
        a.turn_notified = 1;
        count++;
      } catch (err: any) {
        console.error(`30 daqiqalik eslatma yuborilmadi (ID: ${patient.telegram_id}):`, err.message);
      }
    }
  }

  return count;
}

// Oldingi bemorning qabuli tugallanganda navbatdagi keyingi bemorlarga xabar yuborish
export async function notifyQueueProgressAfterCompletion(
  completedAppt: BotAppointment,
  patients: BotPatient[],
  allAppointments: BotAppointment[]
): Promise<number> {
  if (!botInstance) return 0;
  const clinicName = process.env.CLINIC_NAME || "Stomatologiya Klinikasi";
  const date = completedAppt.date;
  const staffId = completedAppt.staff_id;

  // Shu kunda shu shifokorga yozilgan navbatdagi qolgan bemorlar
  const remainingAppts = allAppointments
    .filter(
      (a) =>
        a.date === date &&
        (staffId ? a.staff_id === staffId : true) &&
        a.id !== completedAppt.id &&
        (a.status === "scheduled" || a.status === "arrived")
    )
    .sort((x, y) => x.time.localeCompare(y.time));

  let notifiedCount = 0;

  for (let idx = 0; idx < remainingAppts.length; idx++) {
    const appt = remainingAppts[idx];
    const patient = patients.find((p) => p.id === appt.patient_id);
    if (!patient?.telegram_id) continue;

    const aheadCount = idx; // 0 bo'lsa navbat yetib keldi, birinchi!
    const lang = patient.lang || "uz";
    const doctorName = completedAppt.staff_name || appt.staff_name || "Shifokor";

    let message = "";
    if (aheadCount === 0) {
      if (lang === "ru") {
        message =
          `🔔 **Очередь продвинулась! Прием предыдущего пациента завершен.**\n\n` +
          `🎉 **Ваша очередь подошла! Перед вами никого нет.**\n` +
          `👨‍⚕️ Врач: **${doctorName}**\n` +
          `🏥 **${clinicName}**\n\n` +
          `Пожалуйста, проходите в кабинет врача или будьте готовы в зоне ожидания!`;
      } else {
        message =
          `🔔 **Navbat siljidi! Sizdan oldingi bemorning muolajasi yakunlandi.**\n\n` +
          `🎉 **Sizning navbatingiz yetib keldi! Sizdan oldin hech kim yo'q.**\n` +
          `👨‍⚕️ Shifokor: **${doctorName}**\n` +
          `🏥 **${clinicName}**\n\n` +
          `Marhamat, shifokor xonasiga qabulga kirishingiz mumkin (yoki kutish zalida tayyor turing).`;
      }
    } else {
      if (lang === "ru") {
        message =
          `🔔 **Очередь продвинулась! Прием предыдущего пациента завершен.**\n\n` +
          `👥 **До вашей очереди осталось: ${aheadCount} человек(а)!**\n` +
          `🔢 Вы в очереди на **#${aheadCount + 1}-м месте**\n` +
          `⏰ Ориентировочное время приема: около **${appt.time}**\n` +
          `👨‍⚕️ Врач: **${doctorName}**\n\n` +
          `Пожалуйста, подойдите в клинику или будьте готовы к приему.`;
      } else {
        message =
          `🔔 **Navbat siljidi! Sizdan oldingi bemorning muolajasi yakunlandi.**\n\n` +
          `👥 **Sizning navbatingizga yana ${aheadCount} ta bemor qoldi!**\n` +
          `🔢 Siz navbatda **#${aheadCount + 1}-o'rindasiz**\n` +
          `⏰ Taxminiy qabul vaqtingiz: soat **${appt.time} larda**\n` +
          `👨‍⚕️ Shifokor: **${doctorName}**\n\n` +
          `Iltimos, kutish zalida tayyor bo'ling yoki klinikaga yaqinlashing.`;
      }
    }

    try {
      const kb = new InlineKeyboard()
        .text(lang === "ru" ? "📍 Моя очередь онлайн" : "📍 Navbatimni ko'rish", "my:position")
        .row()
        .text(lang === "ru" ? "📞 Связаться с клиникой" : "📞 Shifokor bilan bog'lanish", "clinic:contacts");

      await botInstance.api.sendMessage(String(patient.telegram_id), message, {
        parse_mode: "Markdown",
        reply_markup: kb,
      });
      notifiedCount++;
    } catch (e: any) {
      console.error(`Navbat siljish xabari yuborilmadi (tg: ${patient.telegram_id}):`, e.message);
    }
  }

  return notifiedCount;
}

// Yangi navbat band qilinganda bemorga telegram xabar yuborish
export async function notifyNewAppointment(
  appointment: BotAppointment,
  patient?: BotPatient
): Promise<boolean> {
  if (!botInstance) return false;
  const tgId = patient?.telegram_id;
  if (!tgId) return false;

  try {
    const clinicName = process.env.CLINIC_NAME || "Stomatologiya Klinikasi";
    const lang = patient?.lang || "uz";
    const msg = tf(lang, "appointmentDone", {
      date: appointment.date,
      time: appointment.time,
      duration: appointment.duration_min || 30,
      doctor: appointment.staff_name || "—",
      clinic: clinicName,
    });
    await botInstance.api.sendMessage(String(tgId), msg);
    return true;
  } catch (err: any) {
    console.error("Yangi navbat xabari yuborilmadi:", err.message);
    return false;
  }
}

export function getBotInfo() {
  return {
    configured: Boolean(process.env.TELEGRAM_BOT_TOKEN),
    running: isBotRunning,
    botUsername,
    webhookActive,
    webhookUrl,
  };
}
