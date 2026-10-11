/**
 * Cheap, deterministic reading of the visitor's latest message and of the model's UI requests. The model decides
 * what to say; these rules decide what the Worker lets through, because the smaller fallback models over-use the
 * contact card and suggest follow-ups the knowledge base can't answer (audit AST-10).
 */

const JD_WORDS =
  /\b(requirements?|responsibilities|qualifications|nice[- ]to[- ]have|what you(?:'|’)ll do|about the role|job description|we are looking for|you will|must have|years of experience)\b|المتطلبات|المسؤوليات|المؤهلات|الوصف الوظيفي|سنوات من الخبرة|نبحث عن/i;

/** True when the message is (or contains) a pasted job description. */
export function isJobDescription(text: string): boolean {
  const lines = text.split("\n").filter((l) => l.trim()).length;
  return text.length > 500 || (JD_WORDS.test(text) && (lines >= 3 || text.length > 200));
}

const FIT =
  /\b(?:is|would|could)\s+(?:he|hatem|mohamed)\b[^?\n]{0,60}\b(?:fit|suitable|good match|right for|qualified)\b|\bfit for\b[^?\n]{0,40}\b(?:role|job|position)\b|\b(?:strengths|gaps)\b[^?\n]{0,40}\b(?:role|job|position)\b|\b(?:would|could|does|do|will)\s+(?:he|hatem|mohamed)\s+suit\b|\bsuit(?:s|ed)?\s+(?:an?|the|our|this|that)\b[^?\n]{0,40}\b(?:role|job|position|opening)\b|\bmatch(?:es)?\s+(?:our|the|this)\b[^?\n]{0,40}\b(?:role|job|position|opening|requirements?|team)\b|\bgood hire\b|\bright (?:person|candidate|fit)\b|يناسب|مناسب(?:ًا)? ل|هل (?:هو|حاتم) مناسب|ملاءمت|ملائم|مؤهل ل|يصلح/i;

/** True when the visitor asks how well he fits a role (with or without a pasted job description). */
export function asksAboutFit(text: string): boolean {
  return isJobDescription(text) || FIT.test(text);
}

/**
 * Reach, hire or availability. Fit questions are {@link asksAboutFit}'s ("fit" alone also matched "Did the model fit
 * on one GPU?", audit R6-13); Arabic availability needs a person ("متاحة" also matched "Is Noura available now?").
 */
const CONTACT_EN =
  /\b(contact|reach|get in touch|touch base|hire|hiring|recruit\w*|e-?mail|mail him|phone|whats\s?app|call him|linkedin|github|cv|r[ée]sum[ée]|interview|job offer|an offer|(?:is|are|when is|when's)\s+(?:he|hatem|mohamed)\s+(?:\w+\s+)?available|his availability|availability for|notice period|start date|relocat\w*|move to|visa|salary|compensation|(?:his|hourly|daily|day) rates?|freelanc\w*|contract|work with (?:him|hatem)|talk to (?:him|hatem)|speak (?:to|with) (?:him|hatem)|meet (?:him|hatem)|message him|dm|book|schedule|calendly|telegram)\b/i;
const CONTACT_AR =
  /تواصل|أتواصل|اتواصل|التواصل|للتواصل|أكلم|اكلم|أكلّم|كلمه|رقم(?:ه| الهاتف| الواتساب| واتساب| جواله| جوال| تليفونه| موبايله)|واتس|بريد|إيميل|ايميل|توظيف|أوظف|اوظف|نوظف|مقابلة|السيرة الذاتية|سيرته|الراتب|راتب|الانتقال|ينتقل|متاح(?:ًا)? للعمل|متاح(?:ًا)? للتوظيف|هل (?:هو|حاتم) متاح|التعاقد|العمل الحر|عرض عمل|أتصل|اتصل|لينكد/;

/** True when the visitor wants to reach or hire him, or is assessing him for a role (the contact card helps then). */
export function wantsContact(text: string): boolean {
  return CONTACT_EN.test(text) || CONTACT_AR.test(text) || asksAboutFit(text);
}

const UNANSWERABLE =
  /notice period|start date|when can he start|salary|compensation|\brates?\b|\bpay\b|\bvisa\b|work permit|how many (?:engineers|reports)|direct reports|thesis|\bgpa\b|\bgrades?\b|\bage\b|how old|married|religio|nationality|listed (?:only|without)|without (?:a |any )?projects?|knowledge (?:base|file)|reasons? for leaving|why did he leave|references|stand for|percentage|how many users|daily users|\btraffic\b|\buptime\b|who (?:is|was) the client|client'?s name|name of the client|which (?:ministry|government|agency|authority|entity|sector)|still active|current status|initials?|first letter|same (?:client|organi[sz]ation|entity)|\bnoura\b[^?]{0,30}\b(?:live|launch\w*|production|available|users?|try)\b|\bwhen (?:will|does|did)\b[^?]{0,40}\b(?:launch|go live|release)\w*|التقنيات المستخدمة في (?:المشروع|المساعد)|ما النموذج|ما النماذج|متى (?:ستطلق|سيطلق|تطلق|يطلق)|من هو العميل|ما (?:هي )?الجهة|فترة الإشعار|موعد البدء|متى يمكنه البدء|الراتب|راتب|التأشيرة|تأشيرة|أطروحة|المعدل|عمره|متزوج|ديانته|جنسيته|بدون مشروع|قاعدة المعرفة|ماذا يعني اختصار|إلى ماذا يرمز|نسبة|عدد المستخدمين|اسم العميل|اسم الجهة|من هي الجهة/i;
/** What a system runs on: not public for the STA project or the government assistant. */
const RUNS_ON =
  /\b(?:which|what)\s+(?:llms?|models?|providers?|cloud|vector (?:db|database|store)|infrastructure|architecture|hosting|gpus?)\b|\b(?:hosted|deployed|runs?) on\b|ما (?:هي )?(?:النماذج|البنية)/i;
/** Its stack or tools: public for STA (the case-study page lists it), not for the government assistant. */
const STACK = /\b(?:which|what)\s+(?:stack|tech(?:nolog\w+)?|tools?|frameworks?)\b|ما (?:هي )?التقنيات/i;
const STA_SYSTEM = /\bnoura\b|\bsta\b|tourism|staff assistant|نورة|السياحة/i;
const GOV_SYSTEM = /\bgovernment\b|حكومي/i;
/** "the assistant" / "the project" with no name usually means one of those two (seen after STA and GADD answers). */
const VAGUE_SYSTEM = /\b(?:the|that|this) (?:assistant|project)\b|المساعد|المشروع/i;
const NAMED_SYSTEM = /arabs\s?stock|wakeb|\baip\b|empoweromics|tabaqat|logic controls|chatbot|evaluator|harness|rag-answering/i;

/**
 * Follow-up chips must lead to an answer: no topic the knowledge base says is not stated (notice period, salary,
 * visa, reports, thesis, metrics, private details), nothing about the knowledge base itself, nothing about who the
 * unnamed client is, and nothing about what the STA project or the government assistant run on (audit R6-14).
 */
export function answerableFollowup(question: string): boolean {
  if (UNANSWERABLE.test(question)) return false;
  const vague = VAGUE_SYSTEM.test(question) && !NAMED_SYSTEM.test(question);
  if (RUNS_ON.test(question) && (STA_SYSTEM.test(question) || GOV_SYSTEM.test(question) || vague)) return false;
  if (STACK.test(question) && (GOV_SYSTEM.test(question) || (vague && !STA_SYSTEM.test(question)))) return false;
  return true;
}

/**
 * GADD (a client of the Wakeb role as a whole) and the bilingual assistant for the unnamed Saudi government client
 * never meet in one answer, list or chip (audit R6-01, R6-02): a chip about one is dropped under an answer that
 * mentions the other.
 */
export const MENTIONS_GADD = /\bGADD\b|Ministry of Defen[cs]e|وزارة الدفاع/i;
export const MENTIONS_GOV_ASSISTANT =
  /\bgovernment (?:client|assistant|entity|body|project)\b|\bbilingual (?:enterprise |government )?assistant\b|جهة (?:ال)?حكومي|المساعد المؤسسي|مساعد(?:ًا)? مؤسسي|المساعد الحكومي/i;

export function keepsClientsApart(answer: string, question: string): boolean {
  if (MENTIONS_GADD.test(answer) && MENTIONS_GOV_ASSISTANT.test(question)) return false;
  if (MENTIONS_GOV_ASSISTANT.test(answer) && MENTIONS_GADD.test(question)) return false;
  return true;
}

/** The visitor asks about the bilingual assistant for the unnamed Saudi government client (or its client). */
export function asksAboutGovAssistant(text: string): boolean {
  return MENTIONS_GOV_ASSISTANT.test(text) || /\bgovernment\b[^?\n]{0,40}\b(?:client|assistant|chatbot|bot)\b|حكومي[^؟\n]{0,30}(?:مساعد|روبوت)|مساعد[^؟\n]{0,30}حكومي/i.test(text);
}

const CLIENTS = /\bclients?\b|\bcustomers?\b|who (?:did|does) he (?:work|build) for|for whom|عملاء|عملائه|عميل|لصالح من|لمن (?:بنى|عمل)/i;

/** The visitor asks who his clients are, or names GADD: GADD may be named, the government assistant may not appear. */
export function asksAboutClients(text: string): boolean {
  return CLIENTS.test(text) || MENTIONS_GADD.test(text);
}
