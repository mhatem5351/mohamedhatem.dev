/* Prototype behaviour. In Astro this splits into: ThemeToggle (inline head script + tiny island),
   Nav scroll state (CSS scroll-driven or 10-line script), Timeline keyboard enhancement,
   CopyButton, AskBar (opens the lazy chat widget), Reveal (optional). */
(() => {
  const root = document.documentElement;
  const qs = new URLSearchParams(location.search);
  root.classList.add("js");

  /* ---- theme: system | light | dark (persisted). Prototype also accepts ?theme= ---- */
  const KEY = "mh-theme";
  const mq = matchMedia("(prefers-color-scheme: dark)");
  let mode = qs.get("theme") || (() => { try { return localStorage.getItem(KEY); } catch { return null; } })() || "system";
  function applyTheme() {
    const resolved = mode === "system" ? (mq.matches ? "dark" : "light") : mode;
    root.dataset.theme = resolved;
    document.querySelectorAll(".theme-toggle").forEach(b => {
      b.dataset.mode = mode;
      const ar = root.lang === "ar";
      const label = { system: ar ? "المظهر: حسب النظام" : "Theme: system", light: ar ? "المظهر: فاتح" : "Theme: light", dark: ar ? "المظهر: داكن" : "Theme: dark" }[mode];
      if (!b.textContent.trim()) b.setAttribute("aria-label", label); b.title = label;
    });
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", resolved === "dark" ? "#080E1C" : "#F7F6F3");
  }
  applyTheme();
  mq.addEventListener("change", () => mode === "system" && applyTheme());
  document.addEventListener("click", e => {
    const t = e.target.closest(".theme-toggle"); if (!t) return;
    mode = { system: "light", light: "dark", dark: "system" }[mode];
    try { localStorage.setItem(KEY, mode); } catch {}
    applyTheme();
  });

  /* segmented theme control (mobile menu) */
  document.addEventListener("click", e => {
    const t = e.target.closest("[data-set-theme]"); if (!t) return;
    mode = t.dataset.setTheme; try { localStorage.setItem(KEY, mode); } catch {}
    applyTheme();
  });
  const syncSeg = () => document.querySelectorAll("[data-set-theme]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.setTheme === mode)));
  syncSeg(); document.addEventListener("click", () => setTimeout(syncSeg));

  /* ---- mobile menu sheet ---- */
  const menuBtn = document.querySelector(".nav__menu"), sheet = document.getElementById("menu-sheet");
  if (menuBtn && sheet) {
    const set = open => { sheet.hidden = !open; menuBtn.setAttribute("aria-expanded", String(open)); if (!open) menuBtn.focus({ preventScroll: true }); };
    menuBtn.addEventListener("click", () => set(sheet.hidden));
    sheet.addEventListener("click", e => { if (e.target.closest("a")) set(false); });
    document.addEventListener("keydown", e => { if (e.key === "Escape" && !sheet.hidden) set(false); });
    document.addEventListener("click", e => { if (!sheet.hidden && !sheet.contains(e.target) && !menuBtn.contains(e.target)) set(false); });
    if (qs.get("menu") === "1") set(true);
  }

  /* ---- screenshot + annotation modes ---- */
  if (qs.has("shots")) document.body.classList.add("shots");
  if (qs.get("notes") === "1") document.body.classList.add("show-notes");
  document.addEventListener("click", e => { if (e.target.closest("[data-toggle-notes]")) document.body.classList.toggle("show-notes"); });

  /* ---- nav border once scrolled ---- */
  const nav = document.querySelector(".nav");
  if (nav) { const on = () => nav.dataset.scrolled = String(scrollY > 8); on(); addEventListener("scroll", on, { passive: true }); }

  /* ---- reveal on scroll (skipped for screenshots and reduced motion) ---- */
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const items = document.querySelectorAll("[data-reveal]");
  if (qs.has("shots") || reduce || !("IntersectionObserver" in window)) items.forEach(el => el.classList.add("is-in"));
  else {
    const io = new IntersectionObserver(es => es.forEach(en => { if (en.isIntersecting) { en.target.classList.add("is-in"); io.unobserve(en.target); } }), { rootMargin: "0px 0px -8% 0px" });
    items.forEach(el => io.observe(el));
  }

  /* ---- experience trace: arrow-key navigation between rows; single-open accordion ---- */
  document.querySelectorAll("[data-trace]").forEach(trace => {
    const rows = [...trace.querySelectorAll("details.span")];
    const sums = rows.map(r => r.querySelector("summary"));
    rows.forEach(r => r.addEventListener("toggle", () => { if (r.open) rows.forEach(o => o !== r && (o.open = false)); }));
    trace.addEventListener("keydown", e => {
      const i = sums.indexOf(document.activeElement); if (i < 0) return;
      const to = { ArrowDown: i + 1, ArrowUp: i - 1, Home: 0, End: sums.length - 1 }[e.key];
      if (to == null) return; e.preventDefault(); sums[Math.max(0, Math.min(sums.length - 1, to))].focus();
    });
  });

  /* ---- copy buttons ---- */
  document.addEventListener("click", async e => {
    const b = e.target.closest("[data-copy]"); if (!b) return;
    e.preventDefault();
    try { await navigator.clipboard.writeText(b.dataset.copy); } catch {}
    const live = document.getElementById("live"); const ar = root.lang === "ar";
    b.dataset.state = "copied"; if (live) live.textContent = ar ? "تم النسخ" : "Copied to clipboard";
    setTimeout(() => { b.dataset.state = ""; }, 1600);
  });

  /* ---- ask bar: rotating example questions (typed), opens the chat ---- */
  const bar = document.querySelector("[data-ask-bar]");
  if (bar) {
    const out = bar.querySelector(".ask-bar__text span");
    const qsList = JSON.parse(bar.dataset.examples || "[]");
    if (out && qsList.length && !reduce && !qs.has("shots")) {
      let qi = 0, ci = 0, dir = 1, wait = 0;
      setInterval(() => {
        if (document.hidden) return;
        if (wait-- > 0) return;
        const q = qsList[qi];
        ci += dir; out.textContent = q.slice(0, ci);
        if (ci >= q.length) { dir = -1; wait = 38; }
        if (ci <= 0) { dir = 1; qi = (qi + 1) % qsList.length; wait = 6; }
      }, 45);
    }
  }
  document.addEventListener("click", e => {
    const t = e.target.closest("[data-open-chat]"); if (!t) return;
    e.preventDefault();
    const q = t.dataset.question || "";
    if (window.MHChat?.open) window.MHChat.open({ question: q }); else document.dispatchEvent(new CustomEvent("mh:open-chat", { detail: { question: q } }));
  });

  /* live Cairo time (hero meta + contact facts); frozen in screenshot mode */
  const times = document.querySelectorAll("[data-cairo-time]");
  if (times.length && !qs.has("shots")) {
    const fmt = new Intl.DateTimeFormat(root.lang === "ar" ? "ar-EG-u-nu-latn" : "en-GB", { timeZone: "Africa/Cairo", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
    const tick = () => times.forEach(t => { t.textContent = fmt.format(new Date()); });
    tick(); setInterval(tick, 30000);
  }

  /* "/" opens the assistant from anywhere outside a text field */
  document.addEventListener("keydown", e => {
    if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
    const t = e.target; if (t.closest("input, textarea, select, [contenteditable='true']")) return;
    e.preventDefault();
    if (window.MHChat?.open) window.MHChat.open({}); else document.dispatchEvent(new CustomEvent("mh:open-chat", { detail: {} }));
  });

  /* ---- inline diagram SVGs so they inherit page tokens (Astro: import ?raw + set:html) ---- */
  document.querySelectorAll("img[data-inline]").forEach(async img => {
    try {
      const txt = await (await fetch(img.getAttribute("src"))).text();
      const box = document.createElement("div"); box.innerHTML = txt.trim();
      const svg = box.querySelector("svg"); if (!svg) return;
      // decorative thumbnail: hide from AT and drop ids so repeated diagrams never duplicate them
      svg.setAttribute("aria-hidden", "true"); ["role", "aria-labelledby", "aria-describedby", "width", "height"].forEach(a => svg.removeAttribute(a));
      svg.querySelectorAll("title, desc").forEach(n => n.remove()); svg.querySelectorAll("[id]").forEach(n => n.removeAttribute("id"));
      svg.classList.add(...img.classList); svg.setAttribute("style", img.getAttribute("style") || "");
      img.replaceWith(svg);
    } catch {}
  });

  /* ---- hero graph: insert the SSR markup the build will inline, then enhance ---- */
  document.querySelectorAll("[data-graph-src]").forEach(async host => {
    try {
      const svg = await (await fetch(host.dataset.graphSrc)).text();
      if (svg.trim().startsWith("<")) host.innerHTML = svg;
      const mod = await import(host.dataset.graphModule);
      if (!qs.has("static")) (mod.mountHeroGraph || mod.default)?.(host, { lang: root.lang, dir: root.dir });
    } catch (err) { host.dataset.graphMissing = "true"; }
  });
})();
