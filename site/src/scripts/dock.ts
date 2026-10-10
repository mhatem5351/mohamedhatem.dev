/**
 * The phone action dock (components/nav/ActionDock.astro; styles in components.css 21g), imported by site.ts.
 *
 * On phones (< 40rem) the dock offers CV, WhatsApp and email once the hero's own buttons ([data-dock-after]) have
 * scrolled away (pages without them: after most of the first screen). It steps away (data-away: it slides down and
 * leaves the tab order and the accessibility tree) while
 *   - the contact section or the footer is on screen (they carry the same actions),
 *   - the menu, the chat or a dialog (an enlarged figure or screen) is open,
 *   - a text field has focus (the on-screen keyboard is up, and the dock would ride on it),
 *   - the chat launcher beside it steps aside: while the page scrolls down (back 1.2 s after it stops, or on a scroll
 *     up), over one of the page's own buttons, over a form (chat.ts data-aside, site.ts data-dodge). The two are one
 *     bar at the bottom of the screen, so the dock never sits there alone next to an empty corner.
 * It sits beside the chat launcher, never over it (CSS), and announces its changes with an "mh:dock" event so the
 * launcher's greeting can step aside from it (site.ts, [data-chat-hush]).
 */
const dock = document.querySelector<HTMLElement>("[data-dock]");
if (dock) {
  const phone = matchMedia("(max-width: 39.99rem)");
  const after = document.querySelector<HTMLElement>("[data-dock-after]");
  const ends = [...document.querySelectorAll<HTMLElement>("#contact, body > footer")];
  let pastStart = false;
  let frame = 0;
  const endsInView = new Set<Element>();
  let menu = false;
  let chat = false;
  let field = false;
  let launcherAway = false;

  const isField = (el: Element | null): boolean =>
    !!el && el.matches("input:not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]), textarea, select, [contenteditable='true']");
  const dialogOpen = () => !!document.querySelector("dialog[open]");

  let shown: boolean | undefined;
  const update = () => {
    dock.hidden = !phone.matches;
    const show = phone.matches && pastStart && endsInView.size === 0 && !menu && !chat && !field && !launcherAway && !dialogOpen();
    if (show === shown) return;
    shown = show;
    dock.toggleAttribute("data-away", !show);
    document.dispatchEvent(new Event("mh:dock"));
  };
  dock.toggleAttribute("data-away", true);

  // Past the start: the hero's (or the case study's) own buttons are above the viewport (not merely below it, e.g. at
  // first paint on a short phone); measured on scroll, because a jump from the top straight past them (a menu link)
  // never makes them intersect. Pages without them: past most of the first screen.
  const check = () => {
    frame = 0;
    const next = after ? after.getBoundingClientRect().bottom <= 0 : scrollY > innerHeight * 0.6;
    if (next !== pastStart) {
      pastStart = next;
      update();
    }
  };
  addEventListener("scroll", () => void (frame ||= requestAnimationFrame(check)), { passive: true });
  check();
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) e.isIntersecting ? endsInView.add(e.target) : endsInView.delete(e.target);
      update();
    });
    for (const el of ends) io.observe(el);
  }

  document.addEventListener("mh:menu", (e) => {
    menu = !!(e as CustomEvent<{ open?: boolean }>).detail?.open;
    update();
  });
  document.addEventListener("mh:chat-state", (e) => {
    chat = !!(e as CustomEvent<{ open?: boolean }>).detail?.open;
    update();
  });
  document.addEventListener("focusin", (e) => {
    field = isField(e.target as Element);
    update();
  });
  document.addEventListener("focusout", (e) => {
    if (isField(e.target as Element) && !isField((e as FocusEvent).relatedTarget as Element | null)) {
      field = false;
      update();
    }
  });
  // Dialogs (the enlarge views of figures and screens) report open and close.
  document.addEventListener("mh:dialog", update);
  phone.addEventListener("change", update);
  // The launcher's host (the chat widget mounts it; usually before this module runs).
  const follow = (host: Element) => {
    const sync = () => {
      launcherAway = host.matches("[data-dodge],[data-aside]");
      update();
    };
    new MutationObserver(sync).observe(host, { attributes: true, attributeFilter: ["data-dodge", "data-aside"] });
    sync();
  };
  const host = document.querySelector("[data-mh-chat]");
  if (host) follow(host);
  else {
    const mo = new MutationObserver(() => {
      const h = document.querySelector("[data-mh-chat]");
      if (!h) return;
      mo.disconnect();
      follow(h);
    });
    mo.observe(document.body, { childList: true });
  }
  update();
}
