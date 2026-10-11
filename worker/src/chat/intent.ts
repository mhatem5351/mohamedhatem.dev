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
/**
 * Topics the knowledge base says are not public (audit R7-07): the government client, where to try Noura, UAT
 * results, the team's roles or how he runs it, the STA tools' names (their count is public) and evaluation tools.
 */
const NOT_PUBLIC =
  /\bgovernment client\b|\bwhere can i (?:try|use|test|see)\b|\b(?:uat|acceptance)\b[^?]{0,30}\b(?:results?|measure\w*|scores?|metrics?|pass\w*)\b|\b(?:results?|scores?|metrics?)\b[^?]{0,30}\b(?:uat|acceptance)\b|\bteam\b[^?]{0,30}\b(?:roles?|members?|manag\w*|run|runs|do|does|structure\w*|hir\w*)\b|\b(?:manag\w*|run|runs|structure\w*)\b[^?]{0,20}\bteam\b|\b(?:which|what)\s+tools?\b[^?]{0,30}\b(?:noura|sta|staff assistant|the agent)\b|\b(?:noura|sta|staff assistant)\b[^?]{0,30}\b(?:which|what)\s+tools?\b|\b(?:names? of|named) (?:the |its |his )?tools\b|\btool names?\b|\b(?:which|what)\s+(?:llm\s+)?evaluation\s+tools?\b|الأدوات المستخدمة|أسماء الأدوات|أدوات (?:نورة|المساعد|الوكيل)|أعضاء الفريق|أدوار (?:أعضاء )?الفريق|يدير فريق|إدارة الفريق|الجهة الحكومية|نتائج (?:اختبار|UAT)|أين يمكنني (?:تجربة|استخدام)/i;

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
  if (UNANSWERABLE.test(question) || NOT_PUBLIC.test(question)) return false;
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
export const MENTIONS_GADD =
  /\bGADD\b|Ministry of Defen[cs]e|Defen[cs]e Ministry|\bMoD\b|General Authority for Defen[cs]e Development|وزارة الدفاع|الهيئة العامة للتطوير الدفاعي|التطوير الدفاعي/i;
/**
 * The government assistant or its client, in the wordings the models use for it (audit R7-05): "a Saudi government
 * client", "the bilingual (Arabic/English) enterprise assistant" (the fixed reply's own words), "the confidential
 * client", «جهة حكومية», «المساعد المؤسسي».
 */
export const MENTIONS_GOV_ASSISTANT =
  /\bgovernment (?:client|assistant|entity|body|project|chatbot)s?\b|\bbilingual (?:\([^)]{0,24}\) )?(?:enterprise |government )?assistant\b|\benterprise assistant\b|\b(?:unnamed|confidential|undisclosed) (?:client|customer|organi[sz]ation|entity)\b|جهة (?:ال)?حكومي|الجهة الحكومية|المساعد المؤسسي|مساعد(?:ًا)? مؤسسي|المساعد الحكومي|المساعد ثنائي اللغة|مساعد(?:ًا)? ثنائي اللغة/i;
/** Looser paraphrases ("a public-sector organisation", "a second Saudi public body", "a government agency"). */
const GOV_PARAPHRASE =
  /\bgovernment (?:agenc(?:y|ies)|organi[sz]ations?|departments?|sector|ministr(?:y|ies))\b|\bpublic[- ]sector (?:client|organi[sz]ation|body|entity|agency)\b|\b(?:second|another|other|separate)\s+(?:Saudi\s+)?(?:public|government)\s+(?:body|agency|entity|organi[sz]ation|client)\b|جهة عامة|جهة حكومية أخرى/i;
/** Public organisations a paraphrase may describe (the Saudi Tourism Authority is a government body too). */
const NAMED_PUBLIC_ORG = /tourism|\bsta\b|noura|GADD|defen[cs]e|military|universit|college|السياحة|نورة|الدفاع|جامعة|الكلية/i;

/** True when the text mentions the government assistant or its client, in any of the wordings above. */
export function mentionsGovAssistant(text: string): boolean {
  return MENTIONS_GOV_ASSISTANT.test(text) || (GOV_PARAPHRASE.test(text) && !NAMED_PUBLIC_ORG.test(text));
}

export function keepsClientsApart(answer: string, question: string): boolean {
  if (MENTIONS_GADD.test(answer) && mentionsGovAssistant(question)) return false;
  if (mentionsGovAssistant(answer) && MENTIONS_GADD.test(question)) return false;
  return true;
}

/** The assistant itself ("the bilingual assistant", "the Wakeb assistant"), not bilingual work in general. */
export const ITS_ASSISTANT =
  /\b(?:bilingual (?:\([^)]{0,24}\) )?(?:enterprise |government )?(?:assistant|chatbot|bot)|enterprise assistant|government (?:assistant|chatbot|bot|project)|wakeb(?: data)?(?:'s|’s)? (?:enterprise |bilingual |government )?assistant)\b|المساعد المؤسسي|مساعد(?:ًا)? مؤسسي(?:ًا)?|المساعد ثنائي اللغة|مساعد(?:ًا)? ثنائي اللغة|المساعد الحكومي/iu;
/** Another employer, client or project by name: the question is about that one. */
export const OTHER_WORK =
  /globant|\bsta\b|touris|noura|arabs\s?stock|empoweromics|tabaqat|aestheticspro|logic controls|\baip\b|misria|\bmdp\b|military technical|british university|\bbuid\b|umm al|\b(?:6|six|14|fourteen)[- ]agents?\b|papers research|staged-llm|prompt-reliability|rag-answering|\bcurrent (?:client|role|job|employer|project)|سياح|نورة|جلوبانت|غلوبانت|آرابز|طبقات|لوجيك|(?:6|٦) وكلاء|(?:14|١٤) وكيل/iu;


/**
 * The visitor asks about the bilingual assistant for the unnamed Saudi government client (or its client), not about
 * another project that a "government client" phrase sits beside (R7-01: "Was it a government client or a private
 * company that he built the 6-agent chatbot for?" got the government-assistant hint, and the model brought it up).
 */
export function asksAboutGovAssistant(text: string): boolean {
  const gov = MENTIONS_GOV_ASSISTANT.test(text) || /\bgovernment\b[^?\n]{0,40}\b(?:client|assistant|chatbot|bot)\b|حكومي[^؟\n]{0,30}(?:مساعد|روبوت)|مساعد[^؟\n]{0,30}حكومي/i.test(text);
  return gov && (ITS_ASSISTANT.test(text) || !OTHER_WORK.test(text));
}

const CLIENTS =
  /\bclients?\b|\bcustomers?\b|who (?:did|does|has) he (?:work|worked|build|built) (?:for|with)|for whom|\b(?:organi[sz]ations?|companies|employers|entities|institutions|ministries|agencies)\b[^?\n]{0,40}\b(?:work\w*|serve\w*|with)\b|\bwork(?:ed)? (?:with|for)\b[^?\n]{0,40}\b(?:organi[sz]ations?|compan\w+|government\w*|ministr\w+|defen[cs]e|military|entit\w+)|\bwho (?:was|is) (?:the work|it) for\b|\bwho (?:the work|it) (?:was|is) for\b|عملاء|عملائه|عميل|لصالح من|لمن (?:بنى|عمل)|الجهات (?:التي|السعودية|الحكومية)|جهات (?:عمل|تعامل)/i;

/** The visitor asks who his clients are, or names GADD: GADD may be named, the government assistant may not appear. */
export function asksAboutClients(text: string): boolean {
  return CLIENTS.test(text) || MENTIONS_GADD.test(text);
}
