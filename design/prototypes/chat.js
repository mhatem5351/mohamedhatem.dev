/* =============================================================================================
   mohamedhatem.dev: "Ask AI" chat widget. Prototype implementation; dependency-free, ES2020.
   Copy is verbatim from content/i18n/{en,ar}.ts (block `chat`, plus `common.showMore/showLess`,
   `contact.whatsappPrefill/emailSubject`) and content/chat/suggestions.json. Keys still missing from
   content are marked GAP below.

   INTEGRATION
   - window.MHChat.open({ question?, trigger? }) / close() / toggle() / isOpen().
   - Also listens for document "mh:open-chat" (detail.question), drains window.MHChatQueue (clicks
     queued by the inline loader before this file arrived), and opens on any [data-open-chat] click
     that nothing else handled (event.defaultPrevented === false). Safe to load late or twice.
   - "/" anywhere outside a form field opens the assistant (the ask bar shows that hint).
   - Transport: POST /api/chat { messages: [{role, content}], lang } -> streamed text/plain chunks.
     HTTP 429 = rate limited (Retry-After), 503 = unavailable, 504 / no first byte in 30 s = timeout,
     other non-2xx = server, fetch rejection while offline = network. The prototype uses a mock
     (canned answers from content/chat/knowledge.md, about 25 ms per word). Mock triggers: a message
     containing "error" (network), "timeout", "server", "limit" (rate limit) or "unavailable" fails once.
   - The contact card is attached client-side when an answer links to Hatem's email or WhatsApp (the
     system prompt already makes the model do that), or when the transport sends { card: true }.

   LAZY LOADING (production)
   - Every page ships only the launcher: its markup (ChatLauncher.astro) and PART A of chat.css
     inlined in <head> (about 1 KB min+gzip), plus a 0.5 KB inline loader:
       on the first pointerenter / focusin / touchstart of any [data-open-chat] -> inject
       <link rel=stylesheet href=chat.css> and import("chat.js") (prefetch, no UI change);
       on click -> push { question, trigger } to window.MHChatQueue, await the import, then the
       module drains the queue and opens. "/" does the same. No idle prefetch on Save-Data.
   - chat.js + chat.css (PART B) are fetched once, cached immutable (hashed names). Fonts, tokens and
     the photo are already on the page. Nothing renders until the first open.

   ACCESSIBILITY
   - Desktop (>= 640px): the panel is a NON-modal dialog (role=dialog, aria-modal=false,
     aria-labelledby = title, aria-describedby = subtitle). The page stays usable; Tab can leave it.
     Phones (< 640px): a modal full-height sheet: aria-modal=true, every other <body> child gets
     `inert`, page scroll is locked, Escape / Minimise / drag-down / scrim tap close it.
   - Focus: opening moves focus to the composer; Escape (from anywhere in the panel, or on the
     launcher) closes and returns focus to the element that opened it (launcher, ask bar, chip...).
     Controls that disappear (suggestions, Retry, language switch) hand focus to the composer.
   - Launcher: its accessible name is its visible text ("Ask AI", WCAG 2.5.3); the longer
     content `launcherLabel` is its tooltip. aria-haspopup=dialog, aria-expanded, aria-controls;
     while open its name becomes "Close assistant".
   - Live regions: the thread is role=log with aria-live=off, so tokens are never read one by one.
     A single polite status region announces "Thinking…", then once per answer
     "New reply from the assistant. <full text>"; also Copied, feedback thanks, validation errors.
     Error blocks use role=alert. aria-busy=true on the thread while an answer streams.
   - Keyboard: Enter sends, Shift+Enter adds a line (IME composition is respected); Escape closes;
     the thread is a focusable scroll region; every control is a real <button>/<a>.
   - Targets: launcher 56px; header buttons 40px with 44px hit areas (44px on phones); send 40/44;
     suggestions 44px; card rows 52px; small actions 32-36px visual with 44px hit areas.
   - Colour only through tokens (AA in both themes); 2px --color-focus rings; forced-colors support.
   - Bidi: each message gets dir/lang from its script majority (more robust than first-strong
     `dir=auto` when an Arabic line starts with "LangGraph"); code, phone, email, handles are LTR
     isolates; the composer uses dir=auto. The panel stays on the page's end edge, while its content
     follows the conversation language (the "Ask in English" / "اسأل بالعربية" switch).
   - Motion: open = scale .96 -> 1, translateY 8 -> 0, 380 ms spring (phones: slide up);
     reduced motion = opacity only, 120 ms; thinking graph and caret become static.
   ============================================================================================= */
(() => {
  "use strict";
  if (window.MHChat) return;
  const W = window, D = document, R = D.documentElement;
  const MAX = 4000, WARN = 3600;
  const PROTO = /\/prototypes\//.test(location.pathname);
  const CFG = Object.assign({
    avatar: PROTO ? "../assets/photo/mh-square-96.webp" : "/images/mh-square-96.webp",
    cv: PROTO ? "cv.html" : "/cv",
    endpoint: "/api/chat",
    mock: PROTO,
  }, W.MHChatConfig);
  const TIMEOUT = CFG.timeout || (CFG.mock ? 6000 : 30000);   // no first token by then = timeout
  const mqSheet = matchMedia("(max-width: 639.98px)");
  const WA = "201142070946", MAIL = "hatem@mohamedhatem.dev", IN = "https://www.linkedin.com/in/mohamed-hatem-6a5790173";

  /* ---------------- copy (verbatim from content/i18n) ---------------- */
  const S = {
    en: {
      launcher: "Ask AI", launcherLabel: "Open Hatem's AI assistant", title: "Hatem's AI assistant",
      subtitle: "Answers from his CV, LinkedIn and GitHub",
      greeting: "Hi! I'm Hatem's AI assistant. Ask me about his work, his stack, or whether he fits a role. You can paste a job description too.",
      suggestionsTitle: "Try asking", inputLabel: "Your question", placeholder: "Ask about Hatem's experience…",
      jdHint: "Tip: paste a job description and ask “Is he a fit?”", send: "Send", stop: "Stop", retry: "Try again",
      newChat: "New conversation", close: "Close assistant", minimize: "Minimise", copy: "Copy answer", copied: "Copied",
      you: "You", assistant: "Assistant", thinking: "Thinking…", charCount: "{count} / {max}",
      disclaimer: "AI answers can be wrong. Check anything important with Hatem directly.",
      privacy: "Your messages are sent to Google's Gemini API, and Google may use them to improve its services. Please don't share personal or confidential information.",
      contactPrompt: "Prefer to talk to Hatem?", contactEmail: "Email him", contactWhatsApp: "WhatsApp",
      helpful: "Helpful", notHelpful: "Not helpful", thanks: "Thanks for the feedback",
      srNewReply: "New reply from the assistant",
      noscript: "The assistant needs JavaScript. You can still reach Hatem by email or WhatsApp.",
      e: {
        empty: "Type a question first.",
        tooLong: "That message is too long. Please keep it under {max} characters.",
        network: "You seem to be offline. Check your connection and try again.",
        rateLimited: "That's a lot of questions in a short time. Please wait a minute and try again.",
        timeout: "The answer took too long. Please try again.",
        server: "The assistant hit a problem and couldn't answer. Please try again, or contact Hatem directly.",
        unavailable: "The assistant is offline right now. You can still reach Hatem by email or WhatsApp.",
      },
      showMore: "Show more", showLess: "Show less", copyFailed: "Couldn't copy. Please select the text and copy it manually.",
      waPrefill: "Hi Hatem, I found you through mohamedhatem.dev. ", mailSubject: "Hello from mohamedhatem.dev",
      /* GAP: not in content/i18n yet */
      linkedin: "LinkedIn", viewCv: "View CV", switchLang: "اسأل بالعربية", stopped: "Stopped.", jump: "Jump to latest", log: "Conversation",
    },
    ar: {
      launcher: "اسأل المساعد", launcherLabel: "افتح المساعد الذكي لحاتم", title: "مساعد حاتم الذكي",
      subtitle: "إجابات من سيرته الذاتية وملفيه على LinkedIn وGitHub",
      greeting: "مرحبًا! أنا مساعد حاتم الذكي. اسألني عن أعماله وأدواته، أو عن مدى ملاءمته لوظيفة ما. ويمكنك أيضًا لصق وصف وظيفي.",
      suggestionsTitle: "جرّب أن تسأل", inputLabel: "سؤالك", placeholder: "اسأل عن خبرة حاتم…",
      jdHint: "نصيحة: الصق وصفًا وظيفيًا واسأل «هل يناسب هذا الدور؟»", send: "إرسال", stop: "إيقاف", retry: "أعد المحاولة",
      newChat: "محادثة جديدة", close: "إغلاق المساعد", minimize: "تصغير", copy: "نسخ الإجابة", copied: "تم النسخ",
      you: "أنت", assistant: "المساعد", thinking: "يفكّر…", charCount: "{count} من {max}",
      disclaimer: "قد تحتوي إجابات الذكاء الاصطناعي على أخطاء، فتأكّد من أي معلومة مهمة بسؤال حاتم مباشرة.",
      privacy: "تُرسَل رسائلك إلى Gemini API من Google، وقد تستخدمها Google لتحسين خدماتها، فيُرجى عدم مشاركة أي معلومات شخصية أو سرية.",
      contactPrompt: "هل تفضّل التحدث مع حاتم مباشرة؟", contactEmail: "راسله بالبريد", contactWhatsApp: "WhatsApp",
      helpful: "مفيدة", notHelpful: "غير مفيدة", thanks: "شكرًا على ملاحظتك",
      srNewReply: "رد جديد من المساعد",
      noscript: "يحتاج المساعد إلى JavaScript. ويمكنك التواصل مع حاتم عبر البريد الإلكتروني أو WhatsApp.",
      e: {
        empty: "اكتب سؤالك أولًا.",
        tooLong: "الرسالة طويلة جدًا؛ يُرجى ألا يزيد عدد الأحرف على {max}.",
        network: "يبدو أنك غير متصل بالإنترنت. تحقّق من الاتصال وأعد المحاولة.",
        rateLimited: "أرسلت أسئلة كثيرة في وقت قصير. انتظر دقيقة ثم أعد المحاولة.",
        timeout: "استغرقت الإجابة وقتًا أطول من اللازم. أعد المحاولة.",
        server: "واجه المساعد مشكلة ولم يتمكن من الإجابة. أعد المحاولة، أو تواصل مع حاتم مباشرة.",
        unavailable: "المساعد غير متاح الآن، ويمكنك التواصل مع حاتم عبر البريد الإلكتروني أو WhatsApp.",
      },
      showMore: "عرض المزيد", showLess: "عرض أقل", copyFailed: "تعذّر النسخ. حدّد النص وانسخه يدويًا.",
      waPrefill: "مرحبًا يا حاتم، وصلت إليك عبر موقع mohamedhatem.dev. ", mailSubject: "رسالة عبر موقع mohamedhatem.dev",
      /* GAP */
      linkedin: "LinkedIn", viewCv: "عرض السيرة الذاتية", switchLang: "Ask in English", stopped: "توقّفت الإجابة.", jump: "الانتقال إلى آخر رسالة", log: "المحادثة",
    },
  };
  /* content/chat/suggestions.json (label shown, prompt sent) + icon and category colour */
  const SG = [["agents", "teal"], ["briefcase", "saffron"], ["serving", "slate"], ["mail", "coral"], ["image", "teal"], ["bilingual", "sage"], ["evaluate", "sky"], ["graduation", "saffron"]];
  const SUG = {
    en: [
      ["What has he built with LangGraph?", "What has he built with LangGraph?"],
      ["Is he a fit for a Senior LLM Engineer role?", "Is he a fit for a Senior LLM Engineer role? Give me his strengths and any gaps."],
      ["How does he run LLMs in production?", "How has he deployed and served LLMs in production?"],
      ["How can I contact him?", "How can I contact him?"],
      ["Tell me about the 14-agent assistant", "Tell me about the 14-agent Arabsstock Assistant."],
      ["What bilingual AI has he shipped?", "What Arabic and English AI products has he shipped?"],
      ["How does he evaluate LLM outputs?", "How does he evaluate and monitor LLM outputs?"],
      ["Education and certifications?", "What is his education, and which certifications does he hold?"],
    ],
    ar: [
      ["ماذا بنى باستخدام LangGraph؟", "ماذا بنى حاتم باستخدام LangGraph؟"],
      ["هل يناسب دور مهندس LLM أول؟", "هل يناسب حاتم دور مهندس LLM أول؟ اذكر نقاط قوته وأي فجوات."],
      ["كيف يشغّل النماذج في الإنتاج؟", "كيف نشر حاتم النماذج اللغوية وتولّى خدمتها في بيئة الإنتاج؟"],
      ["كيف أتواصل معه؟", "كيف أتواصل مع حاتم؟"],
      ["حدّثني عن المساعد ذي الـ14 وكيلًا", "حدّثني عن مساعد ArabsStock المكوّن من 14 وكيلًا."],
      ["ما الذي أطلقه بالعربية والإنجليزية؟", "ما منتجات الذكاء الاصطناعي ثنائية اللغة (العربية والإنجليزية) التي أطلقها حاتم؟"],
      ["كيف يقيّم مخرجات النماذج؟", "كيف يقيّم حاتم مخرجات النماذج اللغوية ويراقب جودتها؟"],
      ["المؤهلات والشهادات؟", "ما مؤهلات حاتم الدراسية، وما الشهادات التي حصل عليها؟"],
    ],
  };

  /* ---------------- icons (24 grid, 1.75 stroke; .f = node dot / fill) ---------------- */
  const P = {
    close: '<path d="m6 6 12 12m0-12L6 18"/>',
    min: '<path d="m6 9 6 6 6-6"/>',
    newchat: '<path d="M11.5 4h-5A2.5 2.5 0 0 0 4 6.5v11A2.5 2.5 0 0 0 6.5 20h11a2.5 2.5 0 0 0 2.5-2.5v-5"/><path d="M18.4 3.6a2.05 2.05 0 0 1 2.9 2.9l-7.6 7.6-3.7.9.9-3.7z"/>',
    send: '<path d="M12 19.5v-15m-6 6 6-6 6 6"/>',
    stop: '<rect width="9" height="9" x="7.5" y="7.5" rx="2" class="f"/>',
    copy: '<rect width="12.5" height="12.5" x="8.5" y="8.5" rx="2.5"/><path d="M15.5 8.5v-3A2.5 2.5 0 0 0 13 3H5.5A2.5 2.5 0 0 0 3 5.5V13a2.5 2.5 0 0 0 2.5 2.5h3"/>',
    check: '<path d="m4.5 12.5 5 5L19.5 7"/>',
    thumb: '<path d="M7 10v11"/><path d="M15 5.9 14 10h5.8a2 2 0 0 1 1.9 2.6l-2.3 7a2 2 0 0 1-1.9 1.4H4.5A1.5 1.5 0 0 1 3 19.5v-8A1.5 1.5 0 0 1 4.5 10h2.3a2 2 0 0 0 1.8-1.1L12 3a3 3 0 0 1 3 2.9"/>',
    refresh: '<path d="M20.5 12A8.5 8.5 0 1 1 12 3.5c2.4 0 4.6 1 6.3 2.6L20.5 8m0-4.5V8H16"/>',
    mail: '<rect width="18.5" height="14" x="2.75" y="5" rx="2.5"/><path d="m3.25 7 7.35 5.3a2.4 2.4 0 0 0 2.8 0L20.75 7"/>',
    whatsapp: '<path d="M12 3a9 9 0 0 0-7.8 13.5L3 21l4.6-1.2A9 9 0 1 0 12 3"/><path d="m9.4 8.1-.6.6c-.6.6-.6 1.7 0 3 .9 1.8 2.3 3.2 4.1 4 1.3.6 2.4.6 3-.1l.5-.6-1.9-1.5-1 .7a4 4 0 0 1-2-2l.7-1-1.5-1.9z"/>',
    linkedin: '<rect width="18" height="18" x="3" y="3" rx="3.5"/><path d="M8 10.5v6m3.75 0v-6m0 2.75a2.5 2.5 0 0 1 5 0v3.25"/><circle cx="8" cy="7.6" r="1.2" class="f"/>',
    file: '<path d="M14 3H6.5A2.5 2.5 0 0 0 4 5.5v13A2.5 2.5 0 0 0 6.5 21h11a2.5 2.5 0 0 0 2.5-2.5V9zm0 0v4.5A1.5 1.5 0 0 0 15.5 9H20M8 13h8m-8 4h5"/>',
    alert: '<path d="M10.3 4.2 2.9 17.5a2 2 0 0 0 1.7 3h14.8a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0M12 9.5v4.25"/><circle cx="12" cy="16.9" r="1.15" class="f"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
    wifioff: '<path d="m3 3 18 18M8.7 15.5a4.7 4.7 0 0 1 5.4-.7M5.4 12.2a9.3 9.3 0 0 1 3.8-2.3m4.6-.2a9.3 9.3 0 0 1 4.8 2.5M2 8.9a14 14 0 0 1 3.9-2.6M10 4.6A14 14 0 0 1 22 8.9"/><circle cx="12" cy="19" r="1.15" class="f"/>',
    plug: '<path d="M12 22v-4M8 2v5m8-5v5M5.5 7h13v3.5a6.5 6.5 0 0 1-13 0z"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5"/><circle cx="12" cy="7.75" r="1.2" class="f"/>',
    arrow: '<path d="M4.5 12h15m-6-6 6 6-6 6"/>',
    ext: '<path d="M7 17 17 7M8.5 7H17v8.5"/>',
    down: '<path d="m6 9 6 6 6-6"/>',
    agents: '<circle cx="12" cy="5" r="2.3"/><circle cx="5" cy="18" r="2.3"/><circle cx="19" cy="18" r="2.3"/><circle cx="12" cy="12.6" r="1.6" class="f"/><path d="M12 7.3V11m-1.4 2.6-3.8 2.9m6.6-2.9 3.8 2.9M7.3 18h9.4"/>',
    briefcase: '<rect width="18.5" height="13" x="2.75" y="7" rx="2.5"/><path d="M8.5 7V5.5a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2V7M2.75 12.5h18.5"/>',
    serving: '<rect width="17" height="7" x="3.5" y="4" rx="2"/><rect width="17" height="7" x="3.5" y="13" rx="2"/><circle cx="7.2" cy="7.5" r="1.1" class="f"/><circle cx="7.2" cy="16.5" r="1.1" class="f"/><path d="M11 7.5h6m-6 9h6"/>',
    image: '<rect width="18" height="16" x="3" y="4" rx="2.5"/><circle cx="8.5" cy="9.5" r="1.75"/><path d="m21 15-4-4a1.5 1.5 0 0 0-2.1 0L6 20"/>',
    bilingual: '<path d="m2.75 15.5 3.75-11 3.75 11M4.1 12h4.8m10.7-2.4c-.5-.6-1.3-1-2.2-1C16 8.6 15 9.7 15 11c0 1.5.4 2.6.9 3.4l5.1-.25m-5.1.25c-1.3.6-2.2 1.8-2.2 3.2 0 2.1 1.6 3.4 3.9 3.4 1.5 0 2.7-.45 3.6-1.2"/>',
    evaluate: '<path d="M5.4 18.6a8.6 8.6 0 1 1 13.2 0"/><path d="m8.6 13.4 2.4 2.4 4.4-4.8"/>',
    graduation: '<path d="M12 4.5 2.5 9l9.5 4.5L21.5 9zM6.5 11v4.5c0 1.5 2.5 3 5.5 3s5.5-1.5 5.5-3V11m4-2v5"/>',
  };
  const ico = (n, c = "") => `<svg class="chat-i ${c}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${P[n]}</svg>`;
  const GLYPH = '<span class="chat-glyph" aria-hidden="true"><svg viewBox="0 0 14 14"><circle cx="7" cy="7" r="4.6" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="7" cy="7" r="1.8" fill="currentColor"/></svg></span>';
  /* the brand's agent graph in miniature: orchestrator hub (teal) + retrieve, generate, evaluate, guard */
  const MARK = '<svg class="chat-mk" viewBox="0 0 116 52" aria-hidden="true" focusable="false"><path class="e" d="M58 26 15 12M58 26 21 41M58 26l42-15M58 26l44 15"/><path class="r" d="M21 41c20 9 60 9 81 0"/>'
    + '<g class="t"><circle class="o" cx="58" cy="26" r="16.5"/><circle class="n" cx="58" cy="26" r="10.5"/><circle class="d" cx="58" cy="26" r="3.4"/></g>'
    + [["sa", 15, 12], ["co", 21, 41], ["sk", 100, 11], ["sg", 102, 41]].map(([c, x, y]) => `<g class="${c}"><circle class="n" cx="${x}" cy="${y}" r="5.5"/><circle class="d" cx="${x}" cy="${y}" r="1.7"/></g>`).join("")
    + '<g class="sk"><circle class="h" cx="80" cy="18.4" r="5"/><circle class="d" cx="80" cy="18.4" r="2"/></g></svg>';
  const THINK = '<svg viewBox="0 0 46 14" aria-hidden="true" focusable="false"><path class="e" d="M10.5 7h7m10.5 0h7"/><circle class="n n1" cx="5" cy="7" r="3.5"/><circle class="n n2" cx="23" cy="7" r="3.5"/><circle class="n n3" cx="41" cy="7" r="3.5"/><g class="p"><circle cx="5" cy="7" r="5.5" opacity=".22"/><circle cx="5" cy="7" r="2"/></g></svg>';

  /* ---------------- helpers ---------------- */
  const esc = s => String(s).replace(/[&<>"']/g, c => "&#" + c.charCodeAt(0) + ";");
  const fmt = (s, o) => s.replace(/\{(\w+)\}/g, (_, k) => o[k]);
  const num = n => n.toLocaleString("en-US");                       // Latin digits in both locales
  const arabicShare = s => { const a = (s.match(/[؀-ۿ]/g) || []).length, l = (s.match(/[A-Za-z]/g) || []).length; return a && a >= l * .5; };
  const langOf = s => (arabicShare(s) ? "ar" : "en");
  const firstSentence = s => { const m = s.match(/^(.+?\.)\s+([\s\S]+)$/); return m ? [m[1], m[2]] : [s, ""]; };
  const pageLang = () => ((R.lang || "en").toLowerCase().startsWith("ar") ? "ar" : "en");
  const frag = html => { const t = D.createElement("template"); t.innerHTML = html.trim(); return t.content.firstElementChild; };
  const sleep = (ms, sig) => new Promise((ok, no) => {
    const id = setTimeout(ok, ms);
    sig && sig.addEventListener("abort", () => { clearTimeout(id); no(new DOMException("Aborted", "AbortError")); }, { once: true });
  });
  /* links: same-site absolute URLs become relative (prototype: just the #hash); external open in a new tab */
  const href = u => {
    const m = u.match(/^https:\/\/mohamedhatem\.dev(\/ar)?\/?(#[\w-]+)?$/);
    if (m && PROTO) return m[2] || (m[1] ? "index-ar.html" : "index.html");
    return m ? u.replace("https://mohamedhatem.dev", "") || "/" : u;
  };
  /* tiny, safe markdown: paragraphs, - / 1. lists, **bold**, `code`, [text](url). Everything else is text. */
  function md(src, caret) {
    let s = src;
    if (caret) { if ((s.match(/\*\*/g) || []).length % 2) s += "**"; if ((s.match(/`/g) || []).length % 2) s += "`"; s += "\u0001"; }
    const codes = [];
    s = s.replace(/`([^`\n]+)`/g, (_, c) => "\u0002" + (codes.push(c) - 1) + "\u0002");
    const inl = t => esc(t)
      .replace(/\*\*([^*]+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, x, u) => {
        if (!/^(https?:|mailto:|tel:|\/|#)/.test(u)) return x;
        const h = href(u.replace(/&#38;/g, "&")), ext = /^https?:/.test(h);
        return `<a href="${esc(h)}"${ext ? ' target="_blank" rel="noopener"' : ""}>${x}</a>`;
      })
      .replace(/\u0002(\d+)\u0002/g, (_, i) => `<code dir="ltr">${esc(codes[i])}</code>`)
      .replace("\u0001", '<span class="chat-caret" aria-hidden="true"></span>');
    let out = "", list = null, para = [];
    const fp = () => { if (para.length) out += `<p>${para.map(inl).join("<br>")}</p>`; para = []; };
    const fl = () => { if (list) out += `<${list.t}>${list.i.map(x => `<li>${inl(x)}</li>`).join("")}</${list.t}>`; list = null; };
    for (const ln of s.split("\n")) {
      const m = ln.match(/^\s*(?:([-*])|(\d+)[.)])\s+(.*)$/);
      if (m) { fp(); const t = m[1] ? "ul" : "ol"; if (!list || list.t !== t) { fl(); list = { t, i: [] }; } list.i.push(m[3]); }
      else if (!ln.trim()) { fp(); fl(); if (ln.includes("\u0001")) para.push(ln); }
      else { fl(); para.push(ln); }
    }
    fp(); fl();
    return out;
  }
  const plain = s => s.replace(/\*\*([^*]+)\*\*/g, "$1").replace(/`([^`]+)`/g, "$1").replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1").replace(/^\s*[-*]\s+/gm, "• ").trim();

  /* ---------------- mock transport (prototype only; answers follow content/chat/knowledge.md) ---------------- */
  const A = {
    langgraph: {
      en: "Two production multi-agent systems:\n- **Arabsstock Assistant** (ArabsStock): 14 specialised agents for semantic search, AI image generation, database operations and content moderation.\n- **Bilingual chatbot** (Wakeb Data): 6 async agents with LangGraph `Command` routing, hybrid RAG and web search over MCP, on Qwen served with vLLM on A100 GPUs.\n\nHe also published [staged-llm-evaluator](https://github.com/mhatem5351/staged-llm-evaluator), a LangGraph pipeline that grades LLM outputs and computes the verdict in code. More in [Selected work](https://mohamedhatem.dev/#work).",
      ar: "نظامان متعددا الوكلاء في بيئة الإنتاج:\n- **مساعد Arabsstock** في ArabsStock: ‏14 وكيلًا متخصصًا للبحث الدلالي وتوليد الصور وعمليات قواعد البيانات والإشراف على المحتوى.\n- **روبوت محادثة ثنائي اللغة** في Wakeb Data: ستة وكلاء غير متزامنين بتوجيه `Command` من LangGraph، وبحث هجين، وبحث في الويب عبر MCP، مع نماذج Qwen تُخدَّم عبر vLLM على معالجات A100.\n\nونشر أيضًا [staged-llm-evaluator](https://github.com/mhatem5351/staged-llm-evaluator)، وهو خط LangGraph يقيّم مخرجات النماذج ويحسب الحكم النهائي بالكود. المزيد في [أعمال مختارة](https://mohamedhatem.dev/ar/#work).",
    },
    arabsstock: {
      en: "The **Arabsstock Assistant** is a production multi-agent system Hatem architected at ArabsStock (2023–2024): **14 specialised agents** orchestrated with LangGraph.\n\n- **Search:** semantic search with OpenAI embeddings and Pinecone over **millions** of photos, videos and vector graphics, plus visual-similarity image search.\n- **Creation and operations:** AI image generation, database operations and content moderation.\n- **Quality:** agent evaluation that monitors reliability, response accuracy and routing in production.\n\nThe case study is in [Selected work](https://mohamedhatem.dev/#work).",
      ar: "**مساعد Arabsstock** نظام متعدد الوكلاء في بيئة الإنتاج صمّمه حاتم في ArabsStock (2023–2024)، ويضم **14 وكيلًا متخصصًا** تنسّق بينها LangGraph.\n\n- **البحث:** بحث دلالي بتضمينات OpenAI وقاعدة Pinecone عبر **ملايين** الصور ومقاطع الفيديو والرسوم المتجهية، إلى جانب البحث بالتشابه البصري.\n- **الإنشاء والعمليات:** توليد الصور بالذكاء الاصطناعي، وعمليات قواعد البيانات، والإشراف على المحتوى.\n- **الجودة:** تقييم الوكلاء لمراقبة الموثوقية ودقة الإجابات والتوجيه في بيئة الإنتاج.\n\nدراسة الحالة في [أعمال مختارة](https://mohamedhatem.dev/ar/#work).",
    },
    serving: {
      en: "At **Wakeb Data** (2024–2026) Hatem owned the model deployment lifecycle for a production multi-agent chatbot:\n\n- Served **Qwen** with `vLLM` on NVIDIA **A100** GPUs across multiple production servers.\n- Managed serving configuration, GPU allocation and model versions.\n- Added health monitoring and automated restart pipelines.\n- Shipped Dockerised FastAPI services behind Nginx, with CI/CD.\n\nHe also moved key internal APIs from REST to `gRPC` to reduce latency between services. Details in the [case study](https://mohamedhatem.dev/#work).",
      ar: "في **Wakeb Data** ‏(2024–2026) تولّى حاتم دورة نشر النماذج كاملة لروبوت محادثة متعدد الوكلاء في بيئة الإنتاج:\n\n- خدمة نماذج **Qwen** عبر `vLLM` على معالجات NVIDIA **A100** في عدة خوادم إنتاجية.\n- إدارة إعدادات الخدمة وتوزيع وحدات GPU وإصدارات النماذج.\n- مراقبة صحة الخوادم وإعادة التشغيل التلقائي.\n- خدمات FastAPI في حاويات Docker خلف Nginx، مع CI/CD.\n\nونقل أيضًا واجهات داخلية رئيسية من REST إلى `gRPC` لتقليل زمن الاستجابة بين الخدمات. التفاصيل في [دراسة الحالة](https://mohamedhatem.dev/ar/#work).",
    },
    fit: {
      en: "**Overall fit:** strong. Hatem has built and run production LLM systems since April 2023.\n\n**Strong matches:**\n- Multi-agent systems: the 14-agent Arabsstock Assistant and Wakeb's 6-agent chatbot (LangGraph).\n- LLM serving: Qwen on vLLM and A100 GPUs, with health checks and automated restarts.\n- RAG: hybrid vector + BM25 search with LLM reranking.\n- Evaluation: LLM evaluation and monitoring on the government assistant, and his open-source staged-llm-evaluator.\n\n**Gaps or not shown:** fine-tuning or training LLMs isn't mentioned in his profile.\n\n**Worth asking him:** start date and location.\n\nYou can reach him at [hatem@mohamedhatem.dev](mailto:hatem@mohamedhatem.dev) or on [WhatsApp](https://wa.me/201142070946).",
      ar: "**الملاءمة العامة:** قوية؛ فحاتم يبني أنظمة LLM ويشغّلها في بيئة الإنتاج منذ أبريل 2023.\n\n**نقاط التوافق:**\n- أنظمة الوكلاء المتعددة: مساعد Arabsstock ذو الـ14 وكيلًا، وروبوت محادثة Wakeb ذو الستة وكلاء (LangGraph).\n- خدمة النماذج: Qwen عبر vLLM على معالجات A100، مع فحوص الصحة وإعادة التشغيل التلقائي.\n- البحث الهجين: متجهات وBM25 مع إعادة الترتيب بنموذج لغوي.\n- التقييم: تقييم ومراقبة المساعد الحكومي، وأداته مفتوحة المصدر staged-llm-evaluator.\n\n**فجوات أو غير مذكور:** لا يذكر ملفه ضبط النماذج اللغوية أو تدريبها.\n\n**يستحق أن تسأله عنه:** موعد البدء ومكان العمل.\n\nيمكنك مراسلته على [hatem@mohamedhatem.dev](mailto:hatem@mohamedhatem.dev) أو عبر [WhatsApp](https://wa.me/201142070946).",
    },
    contact: {
      en: "Email and WhatsApp are the quickest ways to reach Hatem. There's also a [contact form](https://mohamedhatem.dev/#contact) on this site, and he's on LinkedIn.",
      ar: "أسرع طريقتين للتواصل مع حاتم هما البريد الإلكتروني وWhatsApp. ويوجد أيضًا [نموذج تواصل](https://mohamedhatem.dev/ar/#contact) في هذا الموقع، وتجده كذلك على LinkedIn.",
    },
    bilingual: {
      en: "Most of what Hatem has shipped works in Arabic and English:\n- **Wakeb chatbot:** a fully async 6-agent LangGraph chatbot on Qwen, served with vLLM.\n- **Government assistant** for a Saudi government client: an enterprise bilingual Arabic assistant with LLM evaluation and monitoring.\n- **Smart Search** at Empoweromics: finds clients from misspelled Arabic or English names.\n- **logic-controls.com:** a 4-language site with Arabic RTL.\n\nHis Arabic NLP work goes back to a 2022 [sentiment-analysis project](https://github.com/mhatem5351/Arabic-Sentiment-Analysis-With-Multiple-Models) on about 455k Arabic texts.",
      ar: "معظم ما أطلقه حاتم يعمل بالعربية والإنجليزية:\n- **روبوت محادثة Wakeb:** ستة وكلاء غير متزامنين بـLangGraph على نماذج Qwen تُخدَّم عبر vLLM.\n- **مساعد حكومي** لجهة حكومية سعودية: مساعد عربي مؤسسي ثنائي اللغة مع تقييم النماذج ومراقبتها.\n- **البحث الذكي** في Empoweromics: يجد العملاء رغم الأخطاء الإملائية في الأسماء العربية أو الإنجليزية.\n- **موقع logic-controls.com:** بأربع لغات منها العربية من اليمين إلى اليسار.\n\nوتعود أعماله في معالجة العربية إلى [مشروع لتحليل المشاعر](https://github.com/mhatem5351/Arabic-Sentiment-Analysis-With-Multiple-Models) عام 2022 على نحو 455 ألف نص عربي.",
    },
    evaluation: {
      en: "Hatem treats evaluation as part of shipping:\n- **Government assistant (Wakeb Data):** LLM evaluation and observability monitoring for response quality.\n- **ArabsStock:** agent evaluation for reliability, accuracy and routing in production.\n- **[staged-llm-evaluator](https://github.com/mhatem5351/staged-llm-evaluator):** grades outputs in quality, safety and retry stages; the verdict is computed in Python, not by the model.\n- **[prompt-reliability-harness](https://github.com/mhatem5351/prompt-reliability-harness):** checks how consistently a model answers paraphrased or noisy versions of a question.",
      ar: "يتعامل حاتم مع التقييم كجزء من الإطلاق:\n- **المساعد الحكومي (Wakeb Data):** تقييم النماذج اللغوية ومراقبة جودة الإجابات.\n- **في ArabsStock:** تقييم الوكلاء لقياس الموثوقية والدقة والتوجيه في بيئة الإنتاج.\n- **أداة [staged-llm-evaluator](https://github.com/mhatem5351/staged-llm-evaluator):** تقيّم المخرجات على مراحل للجودة والأمان وإعادة المحاولة، ويُحسب الحكم بلغة Python لا بالنموذج.\n- **أداة [prompt-reliability-harness](https://github.com/mhatem5351/prompt-reliability-harness):** تقيس ثبات إجابات النموذج عند إعادة صياغة السؤال أو إضافة تشويش إليه.",
    },
    background: {
      en: "- **M.Sc. in Data Science**, Cairo University (2023–2026)\n- **Diploma in Artificial Intelligence**, ITI with EPITA Paris (2021–2022)\n- **B.Eng. in Structural Engineering**, Tanta University (2015–2020)\n\nHe holds the **AWS Certified Machine Learning – Specialty** (2022), plus DataCamp tracks in data science with Python and data analysis with SQL Server.",
      ar: "- **ماجستير علوم البيانات**، جامعة القاهرة (2023–2026)\n- **دبلوم الذكاء الاصطناعي**، معهد تكنولوجيا المعلومات (ITI) بالشراكة مع EPITA في باريس (2021–2022)\n- **بكالوريوس الهندسة الإنشائية**، جامعة طنطا (2015–2020)\n\nويحمل شهادة **AWS Certified Machine Learning – Specialty** ‏(2022)، إلى جانب مسارات DataCamp في علم البيانات بلغة Python وتحليل البيانات بـSQL Server.",
    },
    fallback: {
      en: "I can answer questions about Hatem's experience, projects and skills, check his fit for a role, or tell you how to reach him. In short: **Mohamed Hatem** is an **AI Team Lead at Globant** with **7 years** in data and AI, focused on multi-agent LLM systems, RAG, LLM serving and evaluation.",
      ar: "أستطيع الإجابة عن خبرة حاتم ومشاريعه ومهاراته، وتقييم ملاءمته لوظيفة ما، وطرق التواصل معه. باختصار: **محمد حاتم** هو **قائد فريق الذكاء الاصطناعي في Globant**، ولديه **7 سنوات** من الخبرة في البيانات والذكاء الاصطناعي، ويركّز على أنظمة الوكلاء المتعددة وRAG وخدمة النماذج وتقييمها.",
    },
  };
  const RULES = [
    ["contact", /contact|reach|e-?mail|whatsapp|تواصل|واتساب|البريد/],
    ["fit", /\bfit\b|job description|requirements|hire|hiring|role|يناسب|ملاءم|وظيف|المتطلبات/],
    ["langgraph", /langgraph/],
    ["arabsstock", /arabs ?stock|14|عربستوك/],
    ["evaluation", /evaluat|monitor|quality|يقي|تقي|يراقب|مراقب/],
    ["bilingual", /bilingual|arabic|ثنائي/],
    ["background", /educat|certif|degree|مؤهل|شهاد/],
    ["serving", /serv(e|ed|ing)\b|deploy|vllm|a100|gpu|qwen|production|نشر|تشغ|خدمة|vllm/],
  ];
  const FAIL = [["unavailable", /unavailable/], ["rateLimited", /\blimit/], ["timeout", /timeout/], ["server", /\bserver\b/], ["network", /\berror\b|offline|خطأ/]];
  const failedOnce = new Set();
  async function* mock(hist, lang, signal) {
    const q = (hist.filter(m => m.role === "user").pop() || {}).content || "", ql = q.toLowerCase();
    await sleep(650 + Math.random() * 450, signal);
    const f = FAIL.find(([, r]) => r.test(ql));
    if (f && !failedOnce.has(q)) {
      failedOnce.add(q);
      if (f[0] === "timeout") await sleep(TIMEOUT + 1000, signal);
      throw Object.assign(new Error(f[0]), { code: f[0], retryAfter: 60 });
    }
    const key = f ? "fallback" : ((RULES.find(([, r]) => r.test(ql)) || ["fallback"])[0]);
    for (const tok of A[key][langOf(q)].match(/\s*\S+/g)) { await sleep(25, signal); yield { text: tok }; }
    if (key === "contact") yield { card: true };
  }
  async function* http(hist, lang, signal) {
    let r;
    try {
      r = await fetch(CFG.endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ messages: hist.slice(-12), lang }), signal });
    } catch (e) { if (e.name === "AbortError") throw e; throw Object.assign(e, { code: navigator.onLine ? "server" : "network" }); }
    if (!r.ok || !r.body) {
      const code = { 429: "rateLimited", 503: "unavailable", 504: "timeout" }[r.status] || "server";
      throw Object.assign(new Error(code), { code, retryAfter: +r.headers.get("retry-after") || 60 });
    }
    const rd = r.body.pipeThrough(new TextDecoderStream()).getReader();
    for (;;) { const { value, done } = await rd.read(); if (done) return; if (value) yield { text: value }; }
  }

  /* =============================== one widget instance =============================== */
  let uid = 0;
  function Chat(o = {}) {
    const n = ++uid, spec = !!o.specimen;
    let L = o.lang || pageLang();
    const t = k => k.split(".").reduce((v, p) => v[p], S[L]);
    const root = D.createElement("div");
    root.className = "chat" + (spec ? " chat--specimen chat--" + (o.device ? "device" : "frame") : "");
    root.dir = R.dir === "rtl" ? "rtl" : "ltr";
    if (spec) root.inert = true;
    root.innerHTML = `
<div class="chat-scrim" data-act="close"></div>
<section class="chat-panel" id="mh-chat-${n}" role="dialog" aria-modal="false" aria-labelledby="chat-t${n}" aria-describedby="chat-s${n}">
  <div class="chat-grab" aria-hidden="true"></div>
  <header class="chat-head">
    <span class="chat-head__avatar"><img src="${esc(CFG.avatar)}" alt="" width="40" height="40" decoding="async"></span>
    <div class="chat-head__text"><h2 class="chat-head__title" id="chat-t${n}" data-t="title"></h2><p class="chat-head__sub" id="chat-s${n}"><i class="chat-dot" aria-hidden="true"></i><span data-t="subtitle"></span></p></div>
    <div class="chat-head__actions">
      <button type="button" class="chat-iconbtn" data-act="reset" data-tl="newChat">${ico("newchat")}</button>
      <button type="button" class="chat-iconbtn chat-iconbtn--close" data-act="close" data-tl="close">${ico("close")}</button>
      <button type="button" class="chat-iconbtn chat-iconbtn--min" data-act="close" data-tl="minimize">${ico("min")}</button>
    </div>
  </header>
  <p class="chat-banner" hidden>${ico("wifioff")}<span data-t="e.network"></span></p>
  <div class="chat-body">
    <div class="chat-log" role="log" aria-live="off" aria-busy="false" tabindex="0" data-tl="log"></div>
    <button type="button" class="chat-jump" data-act="jump" tabindex="-1" data-tl="jump">${ico("down")}</button>
  </div>
  <form class="chat-foot" novalidate>
    <p class="chat-tip">${ico("file")}<span data-t="jdHint"></span></p>
    <div class="chat-box">
      <label class="chat-sr" for="chat-q${n}" data-t="inputLabel"></label>
      <textarea class="chat-ta" id="chat-q${n}" rows="1" dir="auto" enterkeyhint="send" autocomplete="off" aria-describedby="chat-m${n}"></textarea>
      <span class="chat-count" aria-hidden="true" hidden></span>
      <button type="submit" class="chat-send">${ico("send", "chat-send__go")}${ico("stop", "chat-send__stop")}<span class="chat-send__time" aria-hidden="true"></span></button>
    </div>
    <p class="chat-meta" id="chat-m${n}"></p>
  </form>
  <div class="chat-sr" role="status" aria-live="polite" aria-atomic="true" data-live></div>
</section>`;
    const $ = s => root.querySelector(s);
    const panel = $(".chat-panel"), log = $(".chat-log"), form = $(".chat-foot"), box = $(".chat-box"), ta = $(".chat-ta"),
      send = $(".chat-send"), time = $(".chat-send__time"), count = $(".chat-count"), meta = $(".chat-meta"),
      banner = $(".chat-banner"), live = $("[data-live]"), jump = $(".chat-jump"), tip = $(".chat-tip");
    const st = { busy: false, ctrl: null, until: 0, timer: 0, down: false, offline: false, flash: "", stick: true, frozen: 0 };
    const hist = [], texts = new WeakMap();
    let welcome = null, raf = 0, mid = 0;
    $(".chat-head__avatar img").addEventListener("error", e => {  // monogram if the photo is missing
      e.target.outerHTML = '<svg viewBox="0 0 32 32"><rect width="32" height="32" fill="var(--color-surface-inverse)"/><path d="M8.5 22V10l4.5 6 4.5-6v12M17.5 16h6M23.5 10v12" fill="none" stroke="var(--color-on-inverse)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="23.5" cy="10" r="2.1" fill="var(--color-accent-fill)"/></svg>';
    }, { once: true });

    const say = msg => { live.textContent = ""; setTimeout(() => { live.textContent = msg; }, 60); };
    const scrollEnd = force => { if (force) st.stick = true; if (st.stick) log.scrollTop = log.scrollHeight; };

    function paint() {
      panel.lang = L; panel.dir = L === "ar" ? "rtl" : "ltr";
      root.querySelectorAll("[data-t]").forEach(el => { el.textContent = t(el.dataset.t); });
      root.querySelectorAll("[data-tl]").forEach(el => { el.setAttribute("aria-label", t(el.dataset.tl)); if (el.tagName === "BUTTON") el.title = t(el.dataset.tl); });
      ta.placeholder = t("placeholder");
      if (welcome) renderWelcome();
      paintMeta(); paintSend();
    }
    function renderWelcome() {
      const [h, p] = firstSentence(t("greeting")), other = L === "ar" ? "en" : "ar";
      const el = frag(`<div class="chat-welcome">${MARK}
        <h3 class="chat-welcome__title">${esc(h)}</h3><p class="chat-welcome__text">${esc(p)}</p>
        <p class="chat-welcome__label" id="chat-sg${n}">${esc(t("suggestionsTitle"))}</p>
        <ul class="chat-suggest" aria-labelledby="chat-sg${n}">${SUG[L].map(([lab, q], i) => `<li><button type="button" class="chat-suggest__btn" data-act="ask" data-q="${esc(q)}" style="--c:var(--color-${SG[i][1]})">${ico(SG[i][0])}<span>${esc(lab)}</span>${ico("arrow", "chat-flip")}</button></li>`).join("")}</ul>
        <button type="button" class="chat-langswitch" data-act="lang">${ico("bilingual")}<span lang="${other}" dir="${other === "ar" ? "rtl" : "ltr"}">${esc(t("switchLang"))}</span></button>
        <p class="chat-privacy">${ico("info")}<span>${esc(t("privacy"))}</span></p></div>`);
      if (welcome) welcome.replaceWith(el); else log.prepend(el);
      welcome = el; tip.hidden = false;
    }
    const clearWelcome = () => { if (welcome) { welcome.remove(); welcome = null; } tip.hidden = true; };

    function paintMeta() {
      const len = ta.value.length, over = len > MAX, bad = over || !!st.flash;
      count.hidden = len < WARN;
      count.textContent = fmt(t("charCount"), { count: num(len), max: num(MAX) });
      count.toggleAttribute("data-over", over);
      box.toggleAttribute("data-invalid", bad);
      ta.setAttribute("aria-invalid", String(bad));
      meta.textContent = over ? fmt(t("e.tooLong"), { max: num(MAX) }) : st.flash || t("disclaimer");
      meta.dataset.tone = bad ? "danger" : "";
    }
    function paintSend() {
      const left = st.frozen || (st.until ? Math.max(0, Math.ceil((st.until - Date.now()) / 1000)) : 0);
      const locked = !!left || st.down;
      ta.disabled = locked;
      box.toggleAttribute("data-disabled", locked);
      send.toggleAttribute("data-stop", st.busy);
      send.toggleAttribute("data-wait", !!left);
      time.textContent = left ? `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}` : "";
      send.disabled = locked && !st.busy;
      send.setAttribute("aria-label", st.busy ? t("stop") : t("send"));
      send.title = st.busy ? t("stop") : t("send");
      send.setAttribute("aria-disabled", String(!st.busy && (locked || st.offline || !ta.value.trim() || ta.value.length > MAX)));
    }
    function grow() {
      ta.style.height = "auto";
      const max = parseFloat(getComputedStyle(ta).maxHeight) || 9e9;
      ta.style.height = Math.min(ta.scrollHeight, max) + "px";
      ta.style.overflowY = ta.scrollHeight > max + 1 ? "auto" : "hidden";
    }
    function setBusy(on) { st.busy = on; log.setAttribute("aria-busy", String(on)); paintSend(); }

    /* ---- thread items ---- */
    function addUser(q) {
      clearWelcome();
      const lang = langOf(q), id = `chat-b${n}-${++mid}`;
      const el = frag(`<div class="chat-msg chat-msg--user"><span class="chat-sr">${esc(t("you"))}:</span><p class="chat-bubble" id="${id}" lang="${lang}" dir="${lang === "ar" ? "rtl" : "ltr"}">${esc(q)}</p></div>`);
      log.append(el);
      const b = el.lastElementChild;
      b.setAttribute("data-clamp", "");
      if (b.scrollHeight > b.clientHeight + 4) el.insertAdjacentHTML("beforeend", `<button type="button" class="chat-more" data-act="more" aria-expanded="false" aria-controls="${id}">${esc(t("showMore"))}</button>`);
      else b.removeAttribute("data-clamp");
      scrollEnd(true);
    }
    function addThinking() {
      const el = frag(`<div class="chat-msg chat-msg--ai">${GLYPH}<div class="chat-main"><p class="chat-think">${THINK}<span>${esc(t("thinking"))}</span></p></div></div>`);
      log.append(el); scrollEnd(); return el;
    }
    function addAI() {
      const el = frag(`<div class="chat-msg chat-msg--ai" aria-busy="true">${GLYPH}<div class="chat-main"><span class="chat-sr">${esc(t("assistant"))}:</span><div class="chat-md"></div></div></div>`);
      log.append(el);
      return { el, main: el.lastElementChild, body: el.querySelector(".chat-md"), text: "" };
    }
    const setDir = (el, s) => { const l = langOf(s); el.lang = l; el.dir = l === "ar" ? "rtl" : "ltr"; };
    function paintNow(m, s, caret) { m.body.innerHTML = md(s, caret); setDir(m.body, s); scrollEnd(); }
    function draw(m, s) { m.text = s; if (!raf) raf = requestAnimationFrame(() => { raf = 0; paintNow(m, m.text, true); }); }
    function finish(m, s, card, stopped) {
      cancelAnimationFrame(raf); raf = 0;
      paintNow(m, s, false);
      m.el.removeAttribute("aria-busy");
      texts.set(m.el, s);
      if (stopped) m.main.insertAdjacentHTML("beforeend", `<p class="chat-note">${esc(t("stopped"))}</p>`);
      if (card) m.main.insertAdjacentHTML("beforeend", cardHTML(!spec));
      if (s) m.main.insertAdjacentHTML("beforeend", `<div class="chat-actions">
        <button type="button" class="chat-action" data-act="copy">${ico("copy")}<span>${esc(t("copy"))}</span></button>
        <i class="chat-actions__sep" aria-hidden="true"></i>
        <button type="button" class="chat-action chat-action--icon" data-act="fb" data-v="up" aria-pressed="false" aria-label="${esc(t("helpful"))}" title="${esc(t("helpful"))}">${ico("thumb")}</button>
        <button type="button" class="chat-action chat-action--icon" data-act="fb" data-v="down" aria-pressed="false" aria-label="${esc(t("notHelpful"))}" title="${esc(t("notHelpful"))}">${ico("thumb", "chat-down")}</button>
        <span class="chat-thanks" hidden>${esc(t("thanks"))}</span></div>`);
      log.querySelectorAll(".chat-msg--last").forEach(x => x.classList.remove("chat-msg--last"));
      m.el.classList.add("chat-msg--last");
      scrollEnd();
    }
    const contactBtns = () => `<a class="chat-btn chat-btn--mail" href="mailto:${MAIL}?subject=${encodeURIComponent(t("mailSubject"))}">${ico("mail")}${esc(t("contactEmail"))}</a><a class="chat-btn chat-btn--wa" href="https://wa.me/${WA}?text=${encodeURIComponent(t("waPrefill"))}" target="_blank" rel="noopener">${ico("whatsapp")}${esc(t("contactWhatsApp"))}</a>`;
    function cardHTML(anim) {
      const row = (i, tone, h, label, value, ext) => `<li><a class="chat-card__row" href="${esc(h)}"${ext ? ' target="_blank" rel="noopener"' : ""}><span class="chat-tile chat-tile--${tone}">${ico(i)}</span><span class="chat-card__text"><span class="chat-card__label">${esc(label)}</span><span class="chat-card__value" dir="ltr">${esc(value)}</span></span>${ico(ext ? "ext" : "arrow", "chat-flip")}</a></li>`;
      return `<div class="chat-card${anim ? " chat-card--new" : ""}" role="group" aria-label="${esc(t("contactPrompt"))}">
        <div class="chat-card__head"><p class="chat-card__title">${esc(t("contactPrompt"))}</p><span class="chat-stripe" aria-hidden="true"><i></i><i></i><i></i></span></div>
        <ul class="chat-card__list">
          ${row("mail", "teal", `mailto:${MAIL}?subject=${encodeURIComponent(t("mailSubject"))}`, t("contactEmail"), MAIL)}
          ${row("whatsapp", "sage", `https://wa.me/${WA}?text=${encodeURIComponent(t("waPrefill"))}`, t("contactWhatsApp"), "+20 114 207 0946", 1)}
          ${row("linkedin", "sky", IN, t("linkedin"), "in/mohamed-hatem", 1)}
        </ul>
        <a class="chat-card__foot" href="${esc(CFG.cv)}">${ico("file")}<span>${esc(t("viewCv"))}</span>${ico("arrow", "chat-flip")}</a></div>`;
    }
    function showError(code, q, frozen) {
      const [h, p] = firstSentence(t("e." + code) || t("e.server")), warn = code === "rateLimited" || code === "unavailable";
      const acts = (["network", "timeout", "server"].includes(code) ? `<button type="button" class="chat-btn" data-act="retry" data-q="${esc(q)}">${ico("refresh")}${esc(t("retry"))}</button>` : "")
        + (["server", "rateLimited", "unavailable"].includes(code) ? contactBtns() : "");
      const icon = { network: "wifioff", rateLimited: "clock", timeout: "clock", unavailable: "plug" }[code] || "alert";
      log.append(frag(`<div class="chat-msg chat-msg--alert"><div class="chat-alert${warn ? " chat-alert--warn" : ""}" role="alert" data-code="${code}">${ico(icon)}<p class="chat-alert__title">${esc(h)}</p>${p ? `<p class="chat-alert__text">${esc(p)}</p>` : ""}${acts ? `<div class="chat-alert__actions">${acts}</div>` : ""}</div></div>`));
      if (code === "rateLimited") cooldown(60, frozen);
      if (code === "unavailable") { st.down = true; paintSend(); }
      scrollEnd(true);
    }
    function cooldown(sec, frozen) {
      clearInterval(st.timer);
      if (frozen) { st.frozen = frozen; return paintSend(); }
      st.until = Date.now() + sec * 1000;
      const tick = () => { if (Date.now() >= st.until) { clearInterval(st.timer); st.until = 0; paintSend(); ta.focus({ preventScroll: true }); return; } paintSend(); };
      tick(); st.timer = setInterval(tick, 1000);
    }

    /* ---- asking ---- */
    async function ask(q, retry) {
      q = (q || "").trim();
      if (!q || st.busy) return;
      if (!retry) { addUser(q); hist.push({ role: "user", content: q }); }
      ta.focus({ preventScroll: true });
      setBusy(true);
      const think = addThinking();
      say(t("thinking"));
      const ctrl = st.ctrl = new AbortController();
      let m = null, acc = "", card = false, timedOut = false;
      const timer = setTimeout(() => { timedOut = true; ctrl.abort(); }, TIMEOUT);
      try {
        for await (const ev of (CFG.mock ? mock : http)(hist, L, ctrl.signal)) {
          clearTimeout(timer);
          if (!m) { think.remove(); m = addAI(); }
          if (ev.text) { acc += ev.text; draw(m, acc); }
          if (ev.card) card = true;
        }
        if (!m) { think.remove(); m = addAI(); }
        finish(m, acc, card || /wa\.me\/|mailto:hatem@/.test(acc));
        hist.push({ role: "assistant", content: acc });
        say(t("srNewReply") + ". " + plain(acc));
      } catch (err) {
        think.remove();
        if (err.name === "AbortError" && !timedOut) {
          if (!m) m = addAI();
          finish(m, acc, false, true);
          if (acc) hist.push({ role: "assistant", content: acc });
        } else {
          if (m) m.el.remove();
          showError(timedOut ? "timeout" : err.code || "server", q);
        }
      } finally { clearTimeout(timer); st.ctrl = null; setBusy(false); }
    }
    function reset() {
      st.ctrl && st.ctrl.abort();
      clearInterval(st.timer); Object.assign(st, { until: 0, frozen: 0, down: false, flash: "" });
      hist.length = 0; log.textContent = ""; welcome = null; renderWelcome();
      paintMeta(); paintSend(); ta.focus({ preventScroll: true });
      say(t("newChat"));
    }

    /* ---- events ---- */
    form.addEventListener("submit", e => {
      e.preventDefault();
      if (st.busy) return st.ctrl && st.ctrl.abort();
      const q = ta.value;
      if (send.disabled) return;
      if (st.offline) return say(t("e.network"));
      if (!q.trim()) { st.flash = t("e.empty"); paintMeta(); say(st.flash); return ta.focus(); }
      if (q.length > MAX) return say(fmt(t("e.tooLong"), { max: num(MAX) }));
      ta.value = ""; grow(); paintMeta(); paintSend();
      ask(q);
    });
    ta.addEventListener("input", () => { st.flash = ""; grow(); paintMeta(); paintSend(); });
    ta.addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); form.requestSubmit(); } });
    log.addEventListener("scroll", () => {
      st.stick = log.scrollHeight - log.scrollTop - log.clientHeight < 40;
      jump.toggleAttribute("data-show", !st.stick && log.scrollHeight - log.clientHeight > 160);
    }, { passive: true });
    root.addEventListener("keydown", e => { if (e.key === "Escape" && !e.isComposing && o.onClose) { e.preventDefault(); o.onClose(); } });
    root.addEventListener("click", async e => {
      const b = e.target.closest("[data-act]");
      if (!b) {   // in-page links close the phone sheet first
        const a = e.target.closest("a[href^='#'], a[href^='/'], a[href$='.html']");
        if (a && o.onClose && mqSheet.matches) o.onClose(false);
        return;
      }
      const act = b.dataset.act;
      if (act === "close") return o.onClose && o.onClose();
      if (act === "reset") return reset();
      if (act === "ask") return ask(b.dataset.q);
      if (act === "lang") { L = L === "ar" ? "en" : "ar"; paint(); return ta.focus({ preventScroll: true }); }
      if (act === "retry") { b.closest(".chat-msg").remove(); return ask(b.dataset.q, true); }
      if (act === "jump") return scrollEnd(true);
      if (act === "more") {
        const open = b.getAttribute("aria-expanded") !== "true", bub = D.getElementById(b.getAttribute("aria-controls"));
        bub.toggleAttribute("data-expanded", open); b.setAttribute("aria-expanded", String(open)); b.textContent = open ? t("showLess") : t("showMore");
        return;
      }
      if (act === "copy") {
        let ok = true;
        try { await navigator.clipboard.writeText(plain(texts.get(b.closest(".chat-msg")) || "")); } catch { ok = false; }
        b.innerHTML = ico(ok ? "check" : "copy") + `<span>${esc(ok ? t("copied") : t("copy"))}</span>`;
        b.toggleAttribute("data-done", ok); say(ok ? t("copied") : t("copyFailed"));
        return setTimeout(() => { b.innerHTML = ico("copy") + `<span>${esc(t("copy"))}</span>`; b.removeAttribute("data-done"); }, 1800);
      }
      if (act === "fb") feedback(b);
    });
    function feedback(b) {   // production: POST /api/feedback { id, value } (anonymous)
      const row = b.closest(".chat-actions");
      row.querySelectorAll("[data-act=fb]").forEach(x => { const on = x === b; x.setAttribute("aria-pressed", String(on)); x.hidden = !on; x.disabled = true; });
      row.querySelector(".chat-thanks").hidden = false; row.dataset.rated = b.dataset.v;
      say(t("thanks"));
    }
    if (!spec) {
      const net = () => { st.offline = !navigator.onLine; banner.hidden = !st.offline; paintSend(); };
      addEventListener("online", net); addEventListener("offline", net); net();
      /* phone sheet: drag the header down to minimise */
      let drag = null;
      panel.addEventListener("pointerdown", e => {
        if (!mqSheet.matches || !e.target.closest(".chat-head, .chat-grab") || e.target.closest("button")) return;
        drag = { y: e.clientY, t: performance.now(), dy: 0 }; panel.setPointerCapture(e.pointerId); root.setAttribute("data-dragging", "");
      });
      panel.addEventListener("pointermove", e => { if (drag) { drag.dy = Math.max(0, e.clientY - drag.y); panel.style.transform = `translateY(${drag.dy}px)`; } });
      const end = () => {
        if (!drag) return;
        const fast = drag.dy / (performance.now() - drag.t) > .6 && drag.dy > 30, far = drag.dy > 120;
        drag = null; root.removeAttribute("data-dragging"); panel.style.transform = "";
        if ((fast || far) && o.onClose) o.onClose();
      };
      panel.addEventListener("pointerup", end); panel.addEventListener("pointercancel", end);
    }
    const vv = () => {   // keep the sheet above the virtual keyboard
      const v = W.visualViewport; if (!v) return;
      root.style.setProperty("--chat-vvh", v.height + "px");
      root.style.setProperty("--chat-vv-top", v.offsetTop + "px");
      root.toggleAttribute("data-kb", W.innerHeight - v.height > 120);
      scrollEnd();
    };

    renderWelcome(); paint();
    return {
      root, panel, ta, vv,
      lang: () => L,
      isOpen: () => root.hasAttribute("data-open"),
      show(still) { root.setAttribute("data-open", ""); if (!still) requestAnimationFrame(() => { ta.focus({ preventScroll: true }); grow(); }); },
      hide() { root.removeAttribute("data-open"); },
      focus() { ta.focus({ preventScroll: true }); },
      ask(q) { if (st.busy) { ta.value = q; grow(); paintMeta(); paintSend(); } else ask(q); },
      _: { addUser, addAI, addThinking, paintNow, finish, showError, setBusy, st, ta, box, banner, hist, scrollEnd, paintMeta, paintSend, grow, feedback, log, clearWelcome },
    };
  }

  /* =============================== page singleton =============================== */
  let inst = null, back = null, trigger = null, inerted = [];
  const launcher = () => D.querySelector(".chat-launcher:not([data-chat-static])");
  const tl = k => S[pageLang()][k];
  function setLauncher(open) {
    const b = launcher(); if (!b) return;
    b.setAttribute("aria-expanded", String(open));
    if (inst) b.setAttribute("aria-controls", inst.panel.id);
    if (open) { b.dataset.seen = ""; b.setAttribute("aria-label", tl("close")); b.removeAttribute("title"); }
    else { if (b.dataset.label) b.setAttribute("aria-label", b.dataset.label); else b.removeAttribute("aria-label"); b.title = tl("launcherLabel"); }
  }
  function modal(on) {
    const m = on && mqSheet.matches, v = W.visualViewport;
    inst.panel.setAttribute("aria-modal", String(m));
    R.classList.toggle("chat-lock", m);
    if (m && !inerted.length) { inerted = [...D.body.children].filter(el => el !== inst.root && !el.inert && el.tagName !== "SCRIPT"); inerted.forEach(el => { el.inert = true; }); }
    if (!m && inerted.length) { inerted.forEach(el => { el.inert = false; }); inerted = []; }
    if (!v) return;
    if (m) { v.addEventListener("resize", inst.vv); v.addEventListener("scroll", inst.vv); inst.vv(); }
    else {
      v.removeEventListener("resize", inst.vv); v.removeEventListener("scroll", inst.vv);
      ["--chat-vvh", "--chat-vv-top"].forEach(p => inst.root.style.removeProperty(p)); inst.root.removeAttribute("data-kb");
    }
  }
  function open(opt = {}) {
    const trig = opt.trigger || trigger || D.activeElement; trigger = null;
    if (inst && inst.isOpen()) {
      if (trig === launcher() && !opt.question) return close(false);
      return opt.question ? inst.ask(opt.question) : inst.focus();
    }
    if (!inst) {
      inst = Chat({ onClose: r => close(r !== false) });
      D.body.append(inst.root);
      mqSheet.addEventListener("change", () => inst.isOpen() && modal(true));
    }
    back = trig && trig !== D.body ? trig : launcher();
    inst.show(); modal(true); setLauncher(true);
    if (opt.question) inst.ask(opt.question);
  }
  function close(restore = true) {
    if (!inst || !inst.isOpen()) return;
    inst.hide(); modal(false); setLauncher(false);
    if (restore) { const ok = back && back.isConnected && back.getClientRects().length && back.matches('a[href],button:not([disabled]),input,textarea,select,[tabindex]:not([tabindex="-1"])') && !back.closest("[aria-hidden=\"true\"]"); const r = ok ? back : launcher(); r && r.focus({ preventScroll: true }); }
  }
  function enhance() {
    const b = launcher(); if (!b || b.hasAttribute("data-chat-ready")) return;
    b.setAttribute("data-chat-ready", "");
    if (b.hasAttribute("aria-label")) b.dataset.label = b.getAttribute("aria-label");
    const ic = b.querySelector(".chat-launcher__icon");
    if (ic && !ic.querySelector(".chat-launcher__x")) ic.insertAdjacentHTML("beforeend", ico("close", "chat-launcher__x"));
    setLauncher(false);
    const hero = D.querySelector("[data-chat-compact-after]") || D.querySelector(".hero");
    if (hero && "IntersectionObserver" in W) new IntersectionObserver(([e]) => b.toggleAttribute("data-compact", !e.isIntersecting && e.boundingClientRect.top < 0)).observe(hero);
  }

  /* ---- states gallery: [data-chat-specimen="state"] renders a static instance (prototype only) ---- */
  const JD = {
    en: "Senior LLM Engineer (remote)\nWe're building multi-agent assistants for enterprise customers in English and Arabic. You will own the path from retrieval to serving: design LangGraph agents, build hybrid search over millions of documents, and run self-hosted models on GPUs with proper evaluation and monitoring.\nRequirements:\n- 5+ years in ML or software engineering, 2+ years shipping LLM applications to production\n- Strong Python, FastAPI, Docker and Kubernetes\n- vLLM or a similar serving stack on NVIDIA GPUs\n- RAG: vector databases, BM25, reranking\n- LLM evaluation, tracing and observability\n- Arabic NLP is a plus\nIs he a fit?",
    ar: "مهندس LLM أول (عن بُعد)\nنبني مساعدين متعددي الوكلاء لعملاء مؤسسيين بالعربية والإنجليزية. ستتولى المسار كاملًا من الاسترجاع إلى خدمة النماذج: تصميم وكلاء LangGraph، وبناء بحث هجين عبر ملايين المستندات، وتشغيل نماذج مستضافة ذاتيًا على وحدات GPU مع تقييم ومراقبة مناسبين.\nالمتطلبات:\n- خبرة 5 سنوات أو أكثر في تعلم الآلة أو هندسة البرمجيات، منها سنتان في إطلاق تطبيقات LLM\n- إتقان Python وFastAPI وDocker وKubernetes\n- خبرة في vLLM أو ما يماثلها على وحدات NVIDIA\n- قواعد بيانات المتجهات وBM25 وإعادة الترتيب\n- تقييم النماذج اللغوية وتتبّعها ومراقبتها\nهل يناسب هذا الدور؟",
  };
  function fixture(c, state) {
    const x = c._, L = c.lang(), q = i => SUG[L][i][1], ans = k => A[k][L];
    const qa = (i, k, card) => { x.addUser(q(i)); x.finish(x.addAI(), ans(k), card); };
    const cut = (s, f) => { const w = s.match(/\s*\S+/g); return w.slice(0, Math.round(w.length * f)).join(""); };
    const draft = (s, focus) => { x.ta.value = s; x.grow(); x.paintMeta(); x.paintSend(); if (focus) x.box.classList.add("is-focus"); };
    switch (state) {
      case "thinking": x.addUser(q(4)); x.addThinking(); x.setBusy(true); break;
      case "streaming": { x.addUser(q(4)); x.paintNow(x.addAI(), cut(ans("arabsstock"), .52), true); x.setBusy(true); break; }
      case "answer": qa(2, "serving"); break;
      case "contact": qa(3, "contact", true); break;
      case "jd": { x.addUser(JD[L]); const m = x.addAI(); x.finish(m, ans("fit"), true); x.feedback(m.el.querySelector("[data-v=up]")); break; }
      case "network": x.addUser(q(0)); x.showError("network", q(0)); break;
      case "timeout": x.addUser(q(1)); x.showError("timeout", q(1)); break;
      case "server": x.addUser(q(5)); x.showError("server", q(5)); break;
      case "ratelimit": qa(6, "evaluation"); x.addUser(q(7)); x.showError("rateLimited", q(7), 42); break;
      case "unavailable": x.addUser(q(0)); x.showError("unavailable", q(0)); break;
      case "offline": qa(7, "background"); x.st.offline = true; x.banner.hidden = false; draft(L === "ar" ? "وماذا عن خبرته في Kubernetes؟" : "And Kubernetes?"); break;
      case "empty": x.st.flash = S[L].e.empty; x.paintMeta(); x.box.classList.add("is-focus"); break;
      case "toolong": { qa(5, "bilingual"); let s = JD[L]; while (s.length <= MAX + 180) s += "\n\n" + JD[L]; draft(s.slice(0, MAX + 212), true); x.ta.scrollTop = x.ta.scrollHeight; break; }
      case "sheet": qa(1, "fit"); break;
      case "keyboard": qa(0, "langgraph"); draft(L === "ar" ? "هل لديه خبرة في Kubernetes" : "Does he have Kubernetes experience", true); break;
    }
    if (state !== "welcome" && state !== "empty") x.scrollEnd(true);
  }
  function specimens() {
    D.querySelectorAll("[data-chat-specimen]:not([data-ready])").forEach(host => {
      host.setAttribute("data-ready", "");
      const c = Chat({ specimen: true, device: host.hasAttribute("data-chat-device"), lang: host.dataset.chatLang });
      host.append(c.root); c.show(true);
      if (host.hasAttribute("data-chat-kb")) c.root.setAttribute("data-kb", "");
      fixture(c, host.dataset.chatSpecimen);
    });
  }

  /* ---------------- wiring ---------------- */
  W.MHChat = { open, close, toggle: o => (inst && inst.isOpen() ? close() : open(o)), isOpen: () => !!(inst && inst.isOpen()), version: "proto-2" };
  D.addEventListener("click", e => { const b = e.target.closest && e.target.closest("[data-open-chat]"); if (b) trigger = b; }, true);
  D.addEventListener("click", e => {
    if (e.defaultPrevented) return;
    const b = e.target.closest && e.target.closest("[data-open-chat]"); if (!b) return;
    e.preventDefault(); open({ question: b.dataset.question || "", trigger: b });
  });
  D.addEventListener("mh:open-chat", e => open(e.detail || {}));
  D.addEventListener("keydown", e => {
    if (e.key === "Escape" && inst && inst.isOpen() && D.activeElement === launcher()) return close();
    if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return;
    const a = e.target; if (a.isContentEditable || (a.closest && a.closest("input, textarea, select"))) return;
    e.preventDefault(); open({ trigger: launcher() });
  });
  const boot = () => { enhance(); specimens(); (W.MHChatQueue || []).splice(0).forEach(o => open(o)); };
  if (D.readyState === "loading") D.addEventListener("DOMContentLoaded", boot); else boot();
})();
