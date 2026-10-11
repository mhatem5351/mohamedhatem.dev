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
 *   cloning it never duplicates the page's). The dialog fills the window. Phones: 1.35x the design size, panned both
 *   ways (case.css). From 48rem (audit R7-CASE-03) the drawing opens fitted to the window, both ways, wherever that
 *   still shows it at its design size or more; otherwise at 1.25-1.5x (labels at 15 px or more) to pan, opening on the
 *   orchestrator, the drawing's heart (C-42). The bar's "Show the full diagram" toggle switches between the whole
 *   drawing and the readable zoom, so a laptop reader can see the whole system once, then zoom in.
 * - Panning: scroll, the trackpad, the keyboard (the body is focusable) and, with a mouse, dragging (grab to pan).
 *   "Drag to pan" shows whenever the content is larger than the window (data-pans), for screens and figures alike.
 * - Closing: Escape, the close button, a click on the backdrop, and on touch screens the Back gesture (opening adds a
 *   history entry; closing any other way takes it back, so history never grows). Focus returns to the opener.
 * - Focus on open: a keyboard open lands on the close button (its ring shows where focus is); a pointer or tap open
 *   puts focus on the dialog itself, so no ring is drawn round the first button the reader never asked for (WebKit
 *   draws one on every tap open; audit R7-CASE-04). Tab then reaches the controls.
 * - While open, the page behind doesn't scroll (<html data-screen-open>, case.css; audit C-24). Where scrollbars take
 *   space (Windows, Linux), the page keeps its width: the scrollbar's width goes onto <body> as padding on its side,
 *   so nothing shifts and no strip of the window is left uncovered. "mh:dialog" tells the living charts to rest
 *   (motion.ts) and the dock to step away (dock.ts), and the chat launcher hides.
 */
const dialog = document.querySelector<HTMLDialogElement>("[data-zoom-dialog]");
if (dialog && typeof dialog.showModal === "function") {
  const root = document.documentElement;
  const cap = dialog.querySelector<HTMLElement>("[data-zoom-cap]")!;
  const body = dialog.querySelector<HTMLElement>("[data-zoom-body]")!;
  const fitBtn = dialog.querySelector<HTMLButtonElement>("[data-zoom-fit]");
  const narrow = matchMedia("(max-width: 47.99rem)");
  const touch = matchMedia("(pointer: coarse)");
  let opener: HTMLElement | null = null;
  let pushed = false;
  let clearTimer = 0;

  const announce = (open: boolean) => document.dispatchEvent(new CustomEvent("mh:dialog", { detail: { open } }));

  /** Locks the page behind without a layout shift or an uncovered scrollbar gutter (C-24). */
  function lock(): void {
    const sbw = innerWidth - root.clientWidth;
    if (sbw > 0) {
      // The scrollbar's side: Chromium keeps it on the right in RTL; a browser that puts it on the left shifts the body.
      root.toggleAttribute("data-lock-left", document.body.getBoundingClientRect().left >= sbw - 0.5);
      root.style.setProperty("--lock-pad", `${sbw}px`);
    }
    root.toggleAttribute("data-screen-open", true);
  }
  function unlock(): void {
    root.removeAttribute("data-screen-open");
    root.removeAttribute("data-lock-left");
    root.style.removeProperty("--lock-pad");
  }

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

  // ---- figures from 48rem: the whole drawing, or the readable zoom
  /** The two sizes of the open figure (scale = rendered px per design unit), null when there is no choice. */
  let sizes: { fit: number; zoom: number } | null = null;
  let fitted = false;
  const PAD = 32; // the svg's 1rem padding, both sides
  function figureSvg(): SVGSVGElement | null {
    return dialog!.dataset.kind === "figure" ? body.querySelector<SVGSVGElement>(":scope > svg") : null;
  }
  function measureFigure(): void {
    const svg = figureSvg();
    const vb = svg?.viewBox.baseVal;
    sizes = null;
    if (!svg || !vb?.width || !vb.height || narrow.matches) return;
    // Measured as it shows with nothing to pan (no "Drag to pan" line under it).
    dialog!.removeAttribute("data-pans");
    // The body's box (with no scrollbar: a fitted drawing has none).
    const box = body.getBoundingClientRect();
    const fit = Math.min((box.width - PAD) / vb.width, (box.height - PAD) / vb.height, 1.5);
    const zoom = Math.min(Math.max(1.25, (box.width - PAD) / vb.width), 1.5);
    sizes = { fit, zoom };
  }
  function setFitted(on: boolean, recentre = true): void {
    const svg = figureSvg();
    const vb = svg?.viewBox.baseVal;
    if (!svg || !vb || !sizes) {
      svg?.style.removeProperty("--zoom-at");
      if (fitBtn) fitBtn.hidden = true;
      return;
    }
    fitted = on;
    dialog!.removeAttribute("data-pans");
    svg.style.setProperty("--zoom-at", `${Math.round((on ? sizes.fit : sizes.zoom) * vb.width + PAD)}px`);
    // A choice only when the zoom shows the drawing noticeably larger than the fit.
    const choice = sizes.zoom - sizes.fit > 0.05;
    // A toggle with one name ("Show the full diagram"): pressed while the whole drawing shows.
    if (fitBtn) {
      fitBtn.hidden = !choice;
      fitBtn.setAttribute("aria-pressed", String(on));
    }
    updatePans();
    if (recentre) {
      if (!on && dialog!.hasAttribute("data-pans")) centreOn(body.querySelector(".dg-orch") ?? body.querySelector(".dg-co"));
      else body.scrollTo(0, 0);
    }
  }
  function updatePans(): void {
    const pans = body.scrollWidth > body.clientWidth + 1 || body.scrollHeight > body.clientHeight + 1;
    dialog!.toggleAttribute("data-pans", pans);
  }

  function open(content: Node, caption: string, kind: "screen" | "figure", from: HTMLElement, viaKeyboard: boolean, frame?: string): void {
    clearTimeout(clearTimer);
    opener = from;
    dialog!.dataset.kind = kind;
    if (frame) dialog!.dataset.frame = frame;
    else delete dialog!.dataset.frame;
    body.replaceChildren(content);
    cap.textContent = caption;
    lock();
    dialog!.showModal();
    announce(true);
    if (kind === "figure" && !narrow.matches) {
      measureFigure();
      // Fitted when the whole drawing shows at its design size or more; else the readable zoom, to pan.
      setFitted(!!sizes && sizes.fit >= 1, true);
    } else {
      if (fitBtn) fitBtn.hidden = true;
      updatePans();
      // A figure on a phone opens on its orchestrator (or its first callout); a screen at its top.
      if (kind === "figure" && dialog!.hasAttribute("data-pans")) centreOn(body.querySelector(".dg-orch") ?? body.querySelector(".dg-co"));
      else body.scrollTo(0, 0);
    }
    if (viaKeyboard) dialog!.querySelector<HTMLElement>("[data-zoom-close]")?.focus();
    else (dialog!.focus as (o?: FocusOptions & { focusVisible?: boolean }) => void)({ preventScroll: true, focusVisible: false });
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
    // A click from Enter or Space has no pointer position (detail 0).
    const viaKeyboard = e.detail === 0;
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
      open(img, a.dataset.caption ?? "", "screen", a, viaKeyboard, a.dataset.frame);
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
      open(frag, b.dataset.caption ?? "", "figure", b, viaKeyboard);
    }
  });

  fitBtn?.addEventListener("click", () => setFitted(!fitted));
  // The window changes while it is open (rotation, a resize): the two sizes follow, the reader's choice stays.
  addEventListener("resize", () => {
    if (!dialog.open || dialog.dataset.kind !== "figure") return;
    if (narrow.matches) {
      figureSvg()?.style.removeProperty("--zoom-at");
      if (fitBtn) fitBtn.hidden = true;
      return updatePans();
    }
    measureFigure();
    setFitted(fitted, false);
  });

  // ---- grab to pan with a mouse (touch pans natively; the hint promises dragging)
  let drag: { id: number; x: number; y: number; left: number; top: number; moved: boolean } | null = null;
  body.addEventListener("pointerdown", (e) => {
    if (e.pointerType !== "mouse" || e.button !== 0 || !dialog.hasAttribute("data-pans")) return;
    e.preventDefault(); // no text selection in the drawing, no native image drag
    body.focus({ preventScroll: true });
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, left: body.scrollLeft, top: body.scrollTop, moved: false };
    body.setPointerCapture(e.pointerId);
    body.toggleAttribute("data-dragging", true);
  });
  body.addEventListener("pointermove", (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
    body.scrollLeft = drag.left - dx;
    body.scrollTop = drag.top - dy;
  });
  const endDrag = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.id) return;
    const moved = drag.moved;
    drag = null;
    body.removeAttribute("data-dragging");
    // A drag that ends over the backdrop is not a click on it.
    if (moved) dialog.addEventListener("click", (c) => c.stopImmediatePropagation(), { capture: true, once: true });
  };
  body.addEventListener("pointerup", endDrag);
  body.addEventListener("pointercancel", endDrag);
  body.addEventListener("lostpointercapture", (e) => endDrag(e));

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
    unlock();
    dialog.removeAttribute("data-pans");
    drag = null;
    body.removeAttribute("data-dragging");
    // The content goes once the closing fade is over (case.css), so the dialog never fades out empty.
    clearTimer = window.setTimeout(() => dialog.open || body.replaceChildren(), 400);
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
