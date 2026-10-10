/**
 * Living charts (DESIGN.md 7.2 and 10.4): the architecture diagrams, the experience trace and the skills matrix move
 * in the hero graph's language, and only while someone can see them.
 *
 *   [data-motion="<class>"]   a looping host. The runtime adds <class> (default "dg-play") while the host is on
 *                             screen, the tab is visible, motion is allowed and the visitor hasn't paused, and the
 *                             animations run only then. The first time a host plays, its data-vars (motion values the
 *                             hash-only CSP keeps out of style attributes, see src/lib/diagrams.ts) are applied through
 *                             the CSSOM, and its diagrams get their comets (below).
 *
 * Diagrams (svg.dg, design grammar in diagram.css): one request per loop travels the main path as a comet (head,
 * halo and two trailing dots, in the colour of the node it reaches), each node lights up as it lands (.dg-hl, CSS),
 * slow packets drift along the async (dashed) edges and the orchestrator's ring breathes. Every moving part animates
 * transform or opacity only, which browsers run on the compositor: measured in Chromium, nothing is left on the main
 * thread per frame (the design's dash pulses, stroke-dashoffset, needed a style recalc on every frame). Comet paths are
 * sampled once from the drawing's own pulse tracks (.dg-p) with the hero graph's easing.
 *   [data-motion-once]        a one-time entrance (bars growing in, dots popping in): "is-in" is added the first time
 *                             the host is well on screen. Hosts that are already on screen when the page loads, or
 *                             under reduced motion, are never held back: they simply show.
 *   [data-motion-toggle]      pause / play buttons (components/ui/MotionToggle.astro). Every one of them, and the hero
 *                             graph's, toggles the one site-wide preference (motion-pref.ts, WCAG 2.2.2).
 *
 * prefers-reduced-motion: nothing plays and the buttons hide (CSS); the charts are the static drawings.
 * A modal over the page (the case study's enlarge view, "mh:dialog") rests every chart until it closes.
 */
import { motionPaused, onMotionChange, setMotionPaused } from "./motion-pref";

const reduce = matchMedia("(prefers-reduced-motion: reduce)");
let paused = motionPaused();
let hidden = document.visibilityState === "hidden";
/** A modal dialog covers the page (zoom-dialog.ts announces it): nothing behind it moves. */
let covered = false;
const inView = new Map<HTMLElement, boolean>();
const playing = new WeakSet<HTMLElement>();
const primed = new WeakSet<HTMLElement>();
const comets = new WeakMap<SVGSVGElement, Animation[]>();
const SVG_NS = "http://www.w3.org/2000/svg";

/** cubic-bezier(.65, 0, .35, 1), the hero graph's hop easing (--ease-in-out). */
function easeInOut(x: number): number {
  const cx = 1.95, bx = -2.85, ax = 1.9, cy = 0, by = 3, ay = -2;
  let t = x;
  for (let i = 0; i < 8; i++) {
    const e = ((ax * t + bx) * t + cx) * t - x, d = (3 * ax * t + 2 * bx) * t + cx;
    if (Math.abs(e) < 1e-4 || !d) break;
    t -= e / d;
  }
  t = Math.min(1, Math.max(0, t));
  return ((ay * t + by) * t + cy) * t;
}

/**
 * Keyframes that carry an element along `path` between loop offsets a → b (eased), fading in and out like the hero
 * graph's comet, invisible for the rest of the loop. `peak` scales the opacity (trailing dots).
 */
function along(path: SVGPathElement, a: number, b: number, ease: (u: number) => number, peak = 1): Keyframe[] {
  const L = path.getTotalLength();
  const at = (u: number) => {
    const p = path.getPointAtLength(ease(u) * L);
    return `translate(${Math.round(p.x * 10) / 10}px, ${Math.round(p.y * 10) / 10}px)`;
  };
  const K = Math.max(8, Math.min(24, Math.round(L / 14)));
  const kf: Keyframe[] = [{ offset: 0, transform: at(0), opacity: 0 }];
  for (let k = 0; k <= K; k++) {
    const u = k / K;
    kf.push({ offset: a + (b - a) * u, transform: at(u), opacity: peak * Math.min(1, u / 0.12, (1 - u) / 0.1) });
  }
  kf.push({ offset: 1, transform: at(1), opacity: 0 });
  return kf;
}

function circle(cls: string, r: number): SVGCircleElement {
  const c = document.createElementNS(SVG_NS, "circle");
  c.setAttribute("class", cls);
  c.setAttribute("r", String(r));
  return c;
}

/** Builds (once) the comets and packets of a diagram; returns their animations, idle. */
function build(svg: SVGSVGElement): Animation[] {
  const anims: Animation[] = [];
  {
    const hop = (parseFloat(getComputedStyle(svg).getPropertyValue("--dg-hop")) || 0.72) * 1000;
    const loop = hop / 0.12;
    const tracks = [...svg.querySelectorAll<SVGPathElement>("path.dg-p:not(.dg-ph)")];
    const layer = document.createElementNS(SVG_NS, "g");
    layer.setAttribute("class", "dg-fx");
    layer.setAttribute("aria-hidden", "true");
    const anchor = tracks.at(-1) ?? svg.querySelector(".dg-n");
    if (anchor) anchor.after(layer);
    else svg.append(layer);
    for (const track of tracks) {
      const i = Number(track.style.getPropertyValue("--i")) || 0;
      const tone = [...track.classList].filter((c) => c.startsWith("dg-c-")).join(" ");
      const a = (i * hop) / loop, b = ((i + 1) * hop) / loop;
      const head = document.createElementNS(SVG_NS, "g");
      head.setAttribute("class", `dg-cm ${tone}`);
      head.append(circle("dg-cm-h", 6.5), circle("dg-cm-c", 3));
      const t1 = circle(`dg-cm dg-cm-t ${tone}`, 2.2), t2 = circle(`dg-cm dg-cm-t ${tone}`, 1.6);
      layer.append(t2, t1, head);
      anims.push(head.animate(along(track, a, b, easeInOut), { duration: loop, iterations: Infinity }));
      // the tail: the same path a beat later, fainter
      const lag = (ms: number) => ms / loop;
      anims.push(t1.animate(along(track, a + lag(55), b + lag(55), easeInOut, 0.55), { duration: loop, iterations: Infinity }));
      anims.push(t2.animate(along(track, a + lag(110), b + lag(110), easeInOut, 0.28), { duration: loop, iterations: Infinity }));
    }
    // Background work (batch, monitoring) on the dashed edges: a slow packet now and then, out of step with requests.
    [...svg.querySelectorAll<SVGPathElement>("path.dg-e.dg-a")]
      .filter((p) => !p.closest(".dg-legend"))
      .forEach((p, j) => {
        const travel = Math.max(1600, (p.getTotalLength() / 48) * 1000);
        const cycle = travel + 1400 + (j % 3) * 700;
        const dot = circle("dg-bgp", 2.25);
        layer.append(dot);
        anims.push(dot.animate(along(p, 0, travel / cycle, (u) => u, 0.85), { duration: cycle, iterations: Infinity, delay: 400 + j * 650 }));
      });
  }
  for (const a of anims) a.cancel();
  return anims;
}

/** Applies data-vars="--a:1;--b:2px" as custom properties (CSSOM is allowed by the CSP; style="" is not). */
function prime(host: HTMLElement): void {
  if (primed.has(host)) return;
  primed.add(host);
  // The site draws the pulses as comets (below); the drawings' own dash pulses stay hidden.
  for (const svg of host.querySelectorAll("svg.dg")) svg.classList.add("dg-comets");
  for (const el of host.querySelectorAll<HTMLElement | SVGElement>("[data-vars]")) {
    for (const decl of (el.dataset.vars ?? "").split(";")) {
      const i = decl.indexOf(":");
      if (i > 0) el.style.setProperty(decl.slice(0, i).trim(), decl.slice(i + 1).trim());
    }
  }
}

/**
 * Starts the comets of the diagrams that are rendered (a figure carries a wide and a compact drawing, one of them
 * display:none: animations on an element that isn't rendered can't run on the compositor, so they stay idle), and
 * puts the host's comets (script) and landings (CSS) on one clock.
 */
function playComets(host: HTMLElement): void {
  let started = false;
  for (const svg of host.querySelectorAll<SVGSVGElement>("svg.dg")) {
    const shown = svg.getClientRects().length > 0;
    let list = comets.get(svg);
    if (shown && !list) comets.set(svg, (list = build(svg)));
    for (const a of list ?? []) {
      if (!shown) a.cancel();
      else if (a.playState !== "running") {
        a.play();
        started = true;
      }
    }
  }
  if (!started) return;
  const t0 = document.timeline.currentTime;
  for (const a of host.getAnimations({ subtree: true })) a.startTime = t0;
}

function sync(host: HTMLElement): void {
  const run = !reduce.matches && !paused && !hidden && !covered && inView.get(host) === true;
  if (run === playing.has(host)) return;
  if (!run) {
    playing.delete(host);
    host.classList.remove(host.dataset.motion || "dg-play");
    for (const svg of host.querySelectorAll<SVGSVGElement>("svg.dg")) for (const a of comets.get(svg) ?? []) a.cancel();
    return;
  }
  playing.add(host);
  prime(host);
  host.classList.add(host.dataset.motion || "dg-play");
  playComets(host);
}

// A figure swaps its wide and compact drawings at a container width: follow the one that shows.
let resizeTimer: number | undefined;
addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => {
    for (const host of inView.keys()) if (playing.has(host)) playComets(host);
  }, 200);
});

function syncAll(): void {
  for (const host of inView.keys()) sync(host);
  for (const b of document.querySelectorAll<HTMLButtonElement>("[data-motion-toggle]")) b.setAttribute("aria-pressed", String(paused));
}

const loops = document.querySelectorAll<HTMLElement>("[data-motion]");
const once = document.querySelectorAll<HTMLElement>("[data-motion-once]");

if ("IntersectionObserver" in window) {
  if (loops.length) {
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        inView.set(e.target as HTMLElement, e.isIntersecting);
        sync(e.target as HTMLElement);
      }
    });
    for (const host of loops) {
      inView.set(host, false);
      io.observe(host);
    }
  }
  if (once.length) {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          (e.target as HTMLElement).classList.add("is-in");
          io.unobserve(e.target);
        }
      },
      { threshold: 0.15 },
    );
    for (const host of once) {
      const r = host.getBoundingClientRect();
      // Arm (hold back) only what is still below the fold and only when motion is welcome; the rest just shows.
      if (reduce.matches || paused || r.top < innerHeight) continue;
      host.dataset.armed = "";
      io.observe(host);
    }
  }
}

document.addEventListener("click", (e) => {
  if ((e.target as Element | null)?.closest("[data-motion-toggle]")) setMotionPaused(!paused);
});
document.addEventListener("visibilitychange", () => {
  hidden = document.visibilityState === "hidden";
  syncAll();
});
document.addEventListener("mh:dialog", (e) => {
  covered = !!(e as CustomEvent<{ open?: boolean }>).detail?.open;
  syncAll();
});
reduce.addEventListener("change", syncAll);
onMotionChange((v) => {
  paused = v;
  // Pausing also lets anything still held back for its entrance show at once.
  if (v) for (const host of once) host.classList.add("is-in");
  syncAll();
});
syncAll();
