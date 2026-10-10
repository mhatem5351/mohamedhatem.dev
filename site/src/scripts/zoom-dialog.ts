/**
 * The case study's enlarge view (components/case/ZoomDialog.astro): one modal <dialog> for product screens and
 * architecture figures.
 *
 * - Screens (`a[data-zoom]`, ScreenGallery.astro): the link opens the image file without JS or with a modifier key;
 *   here it opens the dialog. Phones show the screen at its natural size (a 2x capture at half its pixels), to pan and
 *   pinch-zoom; wider screens as large as the window allows, never beyond the capture's own pixels (case.css).
 * - Figures (`button[data-zoom-figure]`, FigurePanel.astro): the figure's <template> holds its wide drawing (own ids, so
 *   cloning it never duplicates the page's). Phones: full screen, the drawing at its design size, panned in both
 *   directions; wider screens: as wide as the window allows.
 * - Closing: Escape, the close button, a click on the backdrop, and on touch screens the Back gesture (opening adds a
 *   history entry; closing any other way takes it back, so history never grows). Focus returns to the opener.
 * - While open, "mh:dialog" tells the living charts to rest (motion.ts) and the dock to step away (dock.ts); the chat
 *   launcher hides via <html data-screen-open> (case.css).
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

  function open(content: Node, caption: string, kind: "screen" | "figure", from: HTMLElement): void {
    opener = from;
    dialog!.dataset.kind = kind;
    body.replaceChildren(content);
    cap.textContent = caption;
    dialog!.showModal();
    root.toggleAttribute("data-screen-open", true);
    announce(true);
    // The drawing's start (diagrams read left to right on every page), centred vertically when it is taller.
    body.scrollTo(0, kind === "figure" ? Math.max(0, (body.scrollHeight - body.clientHeight) / 2) : 0);
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
      open(img, a.dataset.caption ?? "", "screen", a);
      return;
    }
    const b = t.closest<HTMLButtonElement>("button[data-zoom-figure]");
    const tpl = b?.closest("figure")?.querySelector<HTMLTemplateElement>("template[data-zoom-src]");
    if (b && tpl) {
      const frag = tpl.content.cloneNode(true) as DocumentFragment;
      // Phones: the drawing at its design size (1 user unit = 1 px), to pan; CSSOM, so the CSP allows it.
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
  addEventListener("popstate", () => {
    if (!dialog.open || !pushed) return;
    pushed = false;
    dialog.close();
  });
  dialog.addEventListener("close", () => {
    root.removeAttribute("data-screen-open");
    body.replaceChildren();
    announce(false);
    if (pushed) {
      pushed = false;
      if ((history.state as { mhZoom?: boolean } | null)?.mhZoom) history.back();
    }
    opener?.focus();
    opener = null;
  });
}
