import type { Lang, SectionId } from "../../worker/src/chat/protocol";
import { COPY } from "./generated/copy";

/** Every string the panel shows, in English and Arabic. `{s}` / `{n}` / `{max}` are placeholders (Western digits in both). */
const en = {
  title: "Hatem's AI assistant",
  disclaimer: "AI answers can be wrong. Check anything important with Hatem directly.",
  newChat: "New conversation",
  cleared: "Conversation cleared.",
  undo: "Undo",
  close: "Close",
  send: "Send",
  stop: "Stop",
  input: "Your question",
  placeholder: "Ask about Hatem's experience…",
  counter: "{n} / {max}",
  long: "Only the first {n} characters will be read. If it's longer, paste the requirements part.",
  trimmed: "Trimmed to the first {n} characters.",
  conversation: "Conversation",
  welcome:
    "Hi! I'm Hatem's AI assistant. Ask me about his work, his stack, or whether he fits a role. You can paste a job description too.",
  privacy:
    "Your messages are sent to Google's Gemini API, and Google may use them to improve its services. Please don't share personal or confidential information.",
  suggested: "Try asking",
  thinking: "Thinking…",
  slow: "Still thinking, almost there…",
  verifying: "Checking you're human…",
  verifyPrompt: "Please complete the quick check below.",
  stopped: "Stopped",
  cut: "The answer was cut short. Ask me to continue.",
  retry: "Try again",
  offline: "You're offline. Reconnect to keep chatting.",
  answered: "Answer: ",
  contactTitle: "Get in touch with Hatem",
  whatsapp: "WhatsApp",
  email: "Email",
  linkedin: "LinkedIn",
  copy: "Copy",
  copied: "Copied",
  copyEmail: "Copy email address",
  copyPhone: "Copy phone number",
  copiedEmail: "Email address copied",
  copiedPhone: "Phone number copied",
  waText: "Hi Hatem, I found you on mohamedhatem.dev and would like to talk.",
  mailSubject: "Hello from mohamedhatem.dev",
  jump: "Go to {s}",
  e_rate: "You're sending messages quickly. You can try again in {s} s.",
  e_rateReady: "You can try again now.",
  e_busy: "The assistant is very busy right now. Try again in a minute, or reach Hatem directly:",
  e_timeout: "The answer took too long. Please try again.",
  e_generic: "Something went wrong on our side. Please try again.",
  e_network: "The connection dropped. Check your network and try again.",
  e_blocked: "I can't help with that. Ask me about Hatem's experience, projects or how to reach him.",
  e_long: "That message is too long. Please shorten it and try again.",
  e_verify: "We couldn't verify you're human. Please try again.",
  e_unavailable: "The assistant is unavailable right now. You can still reach Hatem directly:",
  e_bad: "That message couldn't be sent. Try rephrasing it.",
};

export type Strings = typeof en;

const ar: Strings = {
  title: "مساعد حاتم الذكي",
  disclaimer: "قد تخطئ إجابات الذكاء الاصطناعي، فتحقّق من أي معلومة مهمة مع حاتم مباشرة.",
  newChat: "محادثة جديدة",
  cleared: "مُسحت المحادثة.",
  undo: "تراجع",
  close: "إغلاق",
  send: "إرسال",
  stop: "إيقاف",
  input: "سؤالك",
  placeholder: "اسأل عن خبرة حاتم…",
  counter: "{n} / {max}",
  long: "لن يُقرأ إلا أول {n} حرف. وإن كان النص أطول، فالصق قسم المتطلبات وحده.",
  trimmed: "اكتُفي بأول {n} حرف من رسالتك.",
  conversation: "المحادثة",
  welcome:
    "مرحبًا! أنا مساعد حاتم الذكي. اسألني عن أعماله وأدواته، أو عن مدى ملاءمته لوظيفة ما، أو الصق وصفًا وظيفيًا.",
  privacy:
    "تُرسَل رسائلك إلى Gemini API من Google، وقد تستخدمها Google لتحسين خدماتها، فلا تشارك أي معلومات شخصية أو سرية.",
  suggested: "جرّب أن تسأل",
  thinking: "يفكّر…",
  slow: "ما زال يفكّر، لحظات…",
  verifying: "نتحقّق من أنك لست روبوتًا…",
  verifyPrompt: "يُرجى إكمال التحقّق السريع أدناه.",
  stopped: "أُوقف",
  cut: "توقّفت الإجابة قبل اكتمالها. اطلب مني إكمالها.",
  retry: "أعد المحاولة",
  offline: "أنت غير متصل بالإنترنت. أعد الاتصال لمتابعة المحادثة.",
  answered: "الإجابة: ",
  contactTitle: "تواصل مع حاتم",
  whatsapp: "WhatsApp",
  email: "البريد",
  linkedin: "LinkedIn",
  copy: "نسخ",
  copied: "نُسخ",
  copyEmail: "نسخ البريد الإلكتروني",
  copyPhone: "نسخ رقم الهاتف",
  copiedEmail: "نُسخ البريد الإلكتروني",
  copiedPhone: "نُسخ رقم الهاتف",
  waText: "مرحبًا، تعرّفت عليك عبر موقع mohamedhatem.dev، وأودّ التواصل معك.",
  mailSubject: "رسالة عبر موقع mohamedhatem.dev",
  jump: "انتقل إلى {s}",
  e_rate: "أرسلت رسائل كثيرة بسرعة. أعد المحاولة بعد {s} ث.",
  e_rateReady: "يمكنك إعادة المحاولة الآن.",
  e_busy: "المساعد مشغول جدًا الآن. أعد المحاولة بعد دقيقة، أو تواصل مع حاتم مباشرة:",
  e_timeout: "استغرقت الإجابة وقتًا أطول مما ينبغي. أعد المحاولة.",
  e_generic: "حدث خطأ من جهتنا. أعد المحاولة.",
  e_network: "انقطع الاتصال. تحقّق من الشبكة وأعد المحاولة.",
  e_blocked: "لا يمكنني المساعدة في ذلك. اسألني عن خبرة حاتم أو مشروعاته أو طريقة التواصل معه.",
  e_long: "رسالتك طويلة جدًا. اختصرها وأعد المحاولة.",
  e_verify: "تعذّر التحقّق من أنك لست روبوتًا. أعد المحاولة.",
  e_unavailable: "المساعد غير متاح الآن، ويمكنك التواصل مع حاتم مباشرة:",
  e_bad: "تعذّر إرسال هذه الرسالة. جرّب صياغتها بطريقة أخرى.",
};

/**
 * Built-in strings, overridden by the content copy (content/i18n → chat, via gen-content.mjs). The built-in values
 * of the keys the content owns mirror that copy, so the fallback reads the same and costs almost nothing gzipped.
 */
export const STRINGS: Record<Lang, Strings> = { en: { ...en, ...COPY.en }, ar: { ...ar, ...COPY.ar } };

/** Error code (protocol + client-side "network") → message key; anything else → e_generic. */
const ERRORS: Record<string, keyof Strings> = {
  rate_limited: "e_rate",
  upstream_busy: "e_busy",
  timeout: "e_timeout",
  network: "e_network",
  blocked: "e_blocked",
  safety: "e_blocked",
  too_large: "e_long",
  turnstile_required: "e_verify",
  turnstile_failed: "e_verify",
  forbidden: "e_unavailable",
  unavailable: "e_unavailable",
  bad_request: "e_bad",
  unsupported: "e_bad",
};
export const errorKey = (code: string): keyof Strings => ERRORS[code] ?? "e_generic";

/**
 * Codes where the error box also shows the contact card (the assistant can't answer, so reaching Hatem directly is
 * the next step). "forbidden" (a page outside the site's origin) shares the "unavailable" message.
 */
export const CONTACT_ON_ERROR = new Set(["upstream_busy", "unavailable", "forbidden"]);

/** Codes where retrying the same message cannot help. */
export const FINAL_ERRORS = new Set(["blocked", "safety", "too_large", "forbidden", "bad_request", "unsupported"]);

export const SECTION_LABELS: Record<SectionId, Record<Lang, string>> = {
  about: { en: "About", ar: "نبذة" },
  work: { en: "Selected work", ar: "أعمال مختارة" },
  experience: { en: "Experience", ar: "الخبرات" },
  projects: { en: "Projects", ar: "المشروعات" },
  skills: { en: "Skills", ar: "المهارات" },
  education: { en: "Education & certifications", ar: "التعليم والشهادات" },
  contact: { en: "Contact", ar: "التواصل" },
};

export const fill = (s: string, vars: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ""));

/** 6000 → "6,000" (Western digits on the Arabic page too). */
export const num = (n: number) => n.toLocaleString("en");
