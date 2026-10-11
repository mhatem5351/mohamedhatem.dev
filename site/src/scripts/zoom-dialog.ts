/**
 * The case study's enlarge view (components/case/ZoomDialog.astro): one modal <dialog> for product screens and
 * architecture figures.
 *
 * - Screens (`a[data-zoom]`, ScreenGallery.astro): the link opens the image file without JS or with a modifier key;
 *   here it opens the dialog. Phones: full screen; a desktop capture at its natural size (a 2x capture at half its
 *   pixels), to pan and pinch-zoom, a phone or dialog capture fitted to the width. Wider screens: as large as the
 *   window allows, never beyond the capture's own pixels (case.css). The frame type (desktop, phone, panel) rides on
 *   the dialog as data-frame, so phone and dialog captures sit on a stage with their own rounded corners.
 * - Figures (`button[data-zoom-figure]`, FigurePanel.astro): the figure's <template> holds its wide drawing (own ids, so
 *   cloning it never duplicates the page's). The dialog fills the window; the drawing is 1.25-1.5x its design size, so
 *   its smallest labels read at 15 px or more, and pans both ways where the window is narrower than that (audit C-05).
 *   It opens centred on the orchestrator, the drawing's heart, not on its first column (C-42).
 * - "Drag to pan" shows whenever the content is larger than the window (data-pans), for screens and figures alike.
 * - Closing: Escape, the close button, a click on the backdrop, and on touch screens the Back gesture (opening adds a
 *   history entry; closing any other way takes it back, so history never grows). Focus returns to the opener.
 * - While open, the page behind doesn't scroll (<html data-screen-open>, case.css; audit C-24), "mh:dialog" tells the
 *   living charts to rest (motion.ts) and the dock to step away (dock.ts), and the chat launcher hides.
 */
const dialog = document.querySelector<HTMLDialogElement>("[data-zoom-dialog]");
if (dialog && typeof dialog.showModal === "function") {
  const root = document.documentElement;
  const cap = dialog.querySelector<HTMLElement>("[data-zoom-cap]")!;
  const body = dialog.querySelector<HTMLElement>("[data-zoom-body]")!;
  const narrow = matchMedia("(max-width: 47.99rem)");
  const touch = matchMedia("(pointer: coarse)");
  let opener: HTMLElement | null = null;
  let pushed = false;

  const announce = (open: boolean) => document.dispatchEvent(new CustomEvent("mh:dialog", { detail: { open } }));

  /** Centres `el` (inside the scrolling body) in the body's window; the start of the content when there is none. */
  function centreOn(el: Element | null): void {
    if (!el) return body.scrollTo(0, 0);
    const b = body.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    body.scrollTo({
      left: body.scrollLeft + r.left - b.left - (body.clientWidth - r.width) / 2,
      top: body.scrollTop + r.top - b.top - (body.clientHeight - r.height) / 2,
    });
  }

  function open(content: Node, caption: string, kind: "screen" | "figure", from: HTMLElement, frame?: string): void {
    opener = from;
    dialog!.dataset.kind = kind;
    if (frame) dialog!.dataset.frame = frame;
    else delete dialog!.dataset.frame;
    body.replaceChildren(content);
    cap.textContent = caption;
    root.toggleAttribute("data-screen-open", true);
    dialog!.showModal();
    announce(true);
    // Wider screens: fit the figure when the window shows it at 1.1x or more, else draw it at 1.25x to pan (case.css).
    const svg = kind === "figure" ? body.querySelector("svg") : null;
    const w = svg?.viewBox.baseVal?.width;
    if (svg && w && !narrow.matches && (body.clientWidth - 32) / w >= 1.1) svg.style.setProperty("--zoom-min", "0px");
    const pans = body.scrollWidth > body.clientWidth + 1 || body.scrollHeight > body.clientHeight + 1;
    dialog!.toggleAttribute("data-pans", pans);
    // A figure opens on its orchestrator (or its first callout), the drawing's centre of gravity; a screen at its top.
    if (kind === "figure" && pans) centreOn(body.querySelector(".dg-orch") ?? body.querySelector(".dg-co"));
    else body.scrollTo(0, 0);
    dialog!.querySelector<HTMLElement>("[data-zoom-close]")?.focus();
    // On touch screens Back closes it: an entry of our own, same URL, taken back if it closes another way. (Not with
    // a mouse, where there is no Back gesture and a navigation right after closing would race the history step.)
    if (touch.matches) {
      try {
        history.pushState({ ...(history.state ?? {}), mhZoom: true }, "");
        pushed = true;
      } catch {
        pushed = false;
      }
    }
  }

  document.addEventListener("click", (e) => {
    const t = e.target as Element;
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = t.closest<HTMLAnchorElement>("a[data-zoom]");
    if (a) {
      e.preventDefault();
      const img = document.createElement("img");
      img.className = "zoom__img";
      img.decoding = "async";
      const d = narrow.matches ? Number(a.dataset.density) || 1 : 1;
      img.width = Math.round(Number(a.dataset.w) / d);
      img.height = Math.round(Number(a.dataset.h) / d);
      img.alt = a.dataset.alt ?? "";
      img.src = a.href;
      open(img, a.dataset.caption ?? "", "screen", a, a.dataset.frame);
      return;
    }
    const b = t.closest<HTMLButtonElement>("button[data-zoom-figure]");
    const tpl = b?.closest("figure")?.querySelector<HTMLTemplateElement>("template[data-zoom-src]");
    if (b && tpl) {
      const frag = tpl.content.cloneNode(true) as DocumentFragment;
      // The drawing's design width (1 user unit = 1 px at 1x), which case.css scales; CSSOM, so the CSP allows it.
      const svg = frag.querySelector("svg");
      const w = svg?.viewBox.baseVal?.width;
      if (svg && w) svg.style.setProperty("--zoom-w", `${Math.round(w)}px`);
      open(frag, b.dataset.caption ?? "", "figure", b);
    }
  });

  dialog.querySelector("[data-zoom-close]")?.addEventListener("click", () => dialog.close());
  // A click on the backdrop (the dialog box itself, outside its content) closes it.
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) dialog.close();
  });
  const ours = () => !!(history.state as { mhZoom?: boolean } | null)?.mhZoom;
  // Back: only when it took our entry (a step back to an entry another layer added on top of ours leaves it open).
  addEventListener("popstate", () => {
    if (!dialog.open || !pushed || ours()) return;
    pushed = false;
    dialog.close();
  });
  // "mh:dialog" (closed) goes out once the history is settled: after the Back that takes our entry, if any. The chat
  // opened over this dialog (site.ts) waits for it, so the phone sheet's own entry lands after that step.
  dialog.addEventListener("close", () => {
    root.removeAttribute("data-screen-open");
    dialog.removeAttribute("data-pans");
    body.replaceChildren();
    // The page didn't scroll while the dialog was open, so the opener is where the reader left it.
    opener?.focus({ preventScroll: true });
    opener?.scrollIntoView({ block: "nearest" });
    opener = null;
    if (pushed && ours()) {
      pushed = false;
      addEventListener("popstate", () => announce(false), { once: true });
      history.back();
    } else {
      pushed = false;
      announce(false);
    }
  });
}
