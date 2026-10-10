import type { Lang, SectionId } from "../../worker/src/chat/protocol";
import { COPY } from "./generated/copy";

/** Every string the panel shows, in English and Arabic. `{s}` / `{n}` / `{max}` are placeholders. */
const en = {
  title: "Hatem's AI assistant",
  disclaimer: "AI can make mistakes — verify important details.",
  newChat: "New chat",
  close: "Close",
  send: "Send",
  stop: "Stop",
  input: "Your question",
  placeholder: "Ask about Hatem's work…",
  counter: "{n} / {max}",
  conversation: "Conversation",
  welcome: "Hi! I'm Hatem's AI assistant. Ask me about his experience, projects and skills, or how to work with him.",
  privacy:
    "Your messages are sent to Google's Gemini API, and Google may use them to improve its services. Please don't share personal or confidential information.",
  suggested: "Suggested questions",
  thinking: "Thinking…",
  slow: "Still thinking, almost there…",
  verifying: "Checking you're human…",
  verifyPrompt: "Please complete the quick check below.",
  stopped: "Stopped",
  cut: "The answer was cut short. Ask me to continue.",
  retry: "Retry",
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
  selected: "Selected. Press Ctrl+C (⌘C on Mac) to copy.",
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
  e_forbidden: "This chat only works on mohamedhatem.dev.",
  e_unavailable: "The assistant is unavailable right now. You can still reach Hatem directly:",
  e_bad: "That message couldn't be sent. Try rephrasing it.",
};

export type Strings = typeof en;

const ar: Strings = {
  title: "مساعد حاتم الذكي",
  disclaimer: "قد يخطئ الذكاء الاصطناعي، فتحقّق من التفاصيل المهمة.",
  newChat: "محادثة جديدة",
  close: "إغلاق",
  send: "إرسال",
  stop: "إيقاف",
  input: "سؤالك",
  placeholder: "اسأل عن أعمال حاتم…",
  counter: "{n} / {max}",
  conversation: "المحادثة",
  welcome: "مرحبًا! أنا مساعد حاتم الذكي. اسألني عن خبرته ومشاريعه ومهاراته، أو عن طريقة العمل معه.",
  privacy: "تُرسَل رسائلك إلى Gemini API من Google، وقد تستخدمها Google لتحسين خدماتها، فيُرجى عدم مشاركة أي معلومات شخصية أو سرية.",
  suggested: "أسئلة مقترحة",
  thinking: "يفكّر…",
  slow: "ما زال يفكّر، لحظات…",
  verifying: "نتحقّق من أنك لست روبوتًا…",
  verifyPrompt: "يُرجى إكمال التحقّق السريع أدناه.",
  stopped: "تم الإيقاف",
  cut: "توقفت الإجابة قبل اكتمالها. اطلب مني المتابعة.",
  retry: "إعادة المحاولة",
  offline: "أنت غير متصل بالإنترنت. أعد الاتصال لمتابعة المحادثة.",
  answered: "الإجابة: ",
  contactTitle: "تواصل مع حاتم",
  whatsapp: "واتساب",
  email: "البريد",
  linkedin: "لينكدإن",
  copy: "نسخ",
  copied: "تم النسخ",
  copyEmail: "نسخ البريد الإلكتروني",
  copyPhone: "نسخ رقم الهاتف",
  copiedEmail: "تم نسخ البريد الإلكتروني",
  copiedPhone: "تم نسخ رقم الهاتف",
  selected: "تم التحديد. اضغط Ctrl+C (أو ⌘C على Mac) للنسخ.",
  waText: "مرحبًا حاتم، وجدتك عبر موقع mohamedhatem.dev وأودّ التواصل معك.",
  mailSubject: "مرحبًا من mohamedhatem.dev",
  jump: "انتقل إلى {s}",
  e_rate: "ترسل الرسائل بسرعة. يمكنك المحاولة مجددًا بعد {s} ث.",
  e_rateReady: "يمكنك المحاولة الآن.",
  e_busy: "المساعد مشغول جدًا الآن. حاول مجددًا بعد دقيقة، أو تواصل مع حاتم مباشرة:",
  e_timeout: "استغرقت الإجابة وقتًا طويلًا. يُرجى المحاولة مجددًا.",
  e_generic: "حدث خطأ من جهتنا. يُرجى المحاولة مجددًا.",
  e_network: "انقطع الاتصال. تحقّق من الشبكة وحاول مجددًا.",
  e_blocked: "لا يمكنني المساعدة في ذلك. اسألني عن خبرة حاتم أو مشاريعه أو طريقة التواصل معه.",
  e_long: "رسالتك طويلة جدًا. يُرجى اختصارها والمحاولة مجددًا.",
  e_verify: "تعذّر التحقّق من أنك لست روبوتًا. يُرجى المحاولة مجددًا.",
  e_forbidden: "تعمل هذه المحادثة على موقع mohamedhatem.dev فقط.",
  e_unavailable: "المساعد غير متاح الآن، ويمكنك التواصل مع حاتم مباشرة:",
  e_bad: "تعذّر إرسال هذه الرسالة. جرّب صياغتها بشكل مختلف.",
};

/** Built-in strings, overridden by the content agent's copy (content/i18n → chat, via gen-content.mjs). */
export const STRINGS: Record<Lang, Strings> = { en: { ...en, ...COPY.en }, ar: { ...ar, ...COPY.ar } };

/** Error code (protocol + client-side "network") → message key. */
export function errorKey(code: string): keyof Strings {
  switch (code) {
    case "rate_limited":
      return "e_rate";
    case "upstream_busy":
      return "e_busy";
    case "timeout":
      return "e_timeout";
    case "network":
      return "e_network";
    case "blocked":
    case "safety":
      return "e_blocked";
    case "too_large":
      return "e_long";
    case "turnstile_required":
    case "turnstile_failed":
      return "e_verify";
    case "forbidden":
      return "e_forbidden";
    case "unavailable":
      return "e_unavailable";
    case "bad_request":
    case "unsupported":
      return "e_bad";
    default:
      return "e_generic";
  }
}

/** Codes where the error box also shows the contact card (the assistant can't answer, so reaching Hatem directly is the next step). */
export const CONTACT_ON_ERROR = new Set(["upstream_busy", "unavailable"]);

/** Codes where retrying the same message cannot help. */
export const FINAL_ERRORS = new Set(["blocked", "safety", "too_large", "forbidden", "bad_request", "unsupported"]);

export const SECTION_LABELS: Record<SectionId, Record<Lang, string>> = {
  about: { en: "About", ar: "نبذة" },
  work: { en: "Selected work", ar: "أعمال مختارة" },
  experience: { en: "Experience", ar: "الخبرة" },
  projects: { en: "Projects", ar: "المشاريع" },
  skills: { en: "Skills", ar: "المهارات" },
  education: { en: "Education & certifications", ar: "التعليم والشهادات" },
  contact: { en: "Contact", ar: "تواصل" },
};

export const fill = (s: string, vars: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ""));
