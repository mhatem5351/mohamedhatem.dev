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
  /\b(?:is|would|could)\s+(?:he|hatem|mohamed)\b[^?\n]{0,60}\b(?:fit|suitable|good match|right for|qualified)\b|\bfit for\b[^?\n]{0,40}\b(?:role|job|position)\b|\b(?:strengths|gaps)\b[^?\n]{0,40}\b(?:role|job|position)\b|يناسب|مناسب ل|ملاءمت|مؤهل ل/i;

/** True when the visitor asks how well he fits a role (with or without a pasted job description). */
export function asksAboutFit(text: string): boolean {
  return isJobDescription(text) || FIT.test(text);
}

const CONTACT_EN =
  /\b(contact|reach|get in touch|touch base|hire|hiring|recruit\w*|e-?mail|mail him|phone|whats\s?app|call him|linkedin|github|cv|r[ée]sum[ée]|interview|job offer|an offer|availab\w*|notice period|start date|relocat\w*|visa|salary|compensation|(?:his|hourly|daily|day) rates?|freelance|contract|work with (?:him|hatem)|talk to (?:him|hatem)|speak (?:to|with) (?:him|hatem)|meet (?:him|hatem)|book|schedule|(?:a )?fit|suitable|good match)\b/i;
const CONTACT_AR =
  /تواصل|أتواصل|اتواصل|التواصل|للتواصل|أكلم|اكلم|أكلّم|كلمه|رقم|واتس|بريد|إيميل|ايميل|توظيف|أوظف|اوظف|نوظف|مقابلة|السيرة الذاتية|سيرته|الراتب|راتب|الانتقال|ينتقل|متاح|التعاقد|عرض عمل|أتصل|اتصل|لينكد|يناسب|مناسب|ملاءم/;

/** True when the visitor wants to reach or hire him, or is assessing him for a role (the contact card helps then). */
export function wantsContact(text: string): boolean {
  return CONTACT_EN.test(text) || CONTACT_AR.test(text) || isJobDescription(text);
}

/**
 * Follow-up chips must lead to an answer: no topic the knowledge base says is not stated (notice period, salary,
 * visa, team size, thesis, metrics, private details), nothing about the knowledge base itself, and nothing about who
 * the unnamed client is.
 */
const UNANSWERABLE =
  /notice period|start date|when can he start|salary|compensation|\brates?\b|\bpay\b|\bvisa\b|work permit|team size|size of (?:his|the) team|how (?:big|large) is (?:his|the) team|how many (?:people|engineers|reports)|thesis|\bgpa\b|\bgrades?\b|\bage\b|how old|married|religio|nationality|listed (?:only|without)|without (?:a |any )?projects?|knowledge (?:base|file)|reasons? for leaving|why did he leave|references|stand for|percentage|how many users|daily users|\btraffic\b|\buptime\b|who (?:is|was) the client|client'?s name|name of the client|فترة الإشعار|موعد البدء|متى يمكنه البدء|الراتب|راتب|التأشيرة|تأشيرة|حجم الفريق|عدد أعضاء|أطروحة|المعدل|عمره|متزوج|ديانته|جنسيته|بدون مشروع|قاعدة المعرفة|ماذا يعني اختصار|إلى ماذا يرمز|نسبة|عدد المستخدمين|اسم العميل|اسم الجهة|من هي الجهة/i;

export function answerableFollowup(question: string): boolean {
  return !UNANSWERABLE.test(question);
}
