/**
 * Reveal on scroll (components.css 20): [data-reveal] cards fade up the first time they come on screen.
 * The hidden state fails open (audit R7-RES-01): it applies only once this module has armed it (`reveal-armed` on
 * <html>); until then, and if the module never runs (a chunk that fails to load, an error earlier in site.ts), the CSS
 * shows every card after a short grace time. This module is the first thing site.ts imports, so nothing else in it can
 * keep the work hidden. Printing shows every card (the print rules, and `beforeprint` here for the ones not yet in).
 */
const root = document.documentElement;
const reveal = document.querySelectorAll<HTMLElement>("[data-reveal]");
if (reveal.length) {
  const show = (el: Element) => el.classList.add("is-in");
  if (matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) reveal.forEach(show);
  else {
    root.classList.add("reveal-armed");
    const io = new IntersectionObserver(
      (entries) => {
        for (const en of entries)
          if (en.isIntersecting) {
            show(en.target);
            io.unobserve(en.target);
          }
      },
      { rootMargin: "0px 0px -8% 0px" },
    );
    for (const el of reveal) io.observe(el);
    addEventListener("beforeprint", () => reveal.forEach(show));
  }
}
