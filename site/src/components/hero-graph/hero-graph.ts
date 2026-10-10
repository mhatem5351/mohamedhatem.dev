/*
 * Hero graph runtime. Enhances the server-rendered markup from render.ts (or renders it lazily
 * when a host is empty), then runs the request-flow animation:
 *   - one deterministic timeline per loop, driven by requestAnimationFrame;
 *   - starts when the page is idle, freezes offscreen / in hidden tabs, never runs under
 *     prefers-reduced-motion (the server markup already is the still "snapshot" frame);
 *   - pause control (WCAG 2.2.2; the site-wide motion preference, shared with the living charts), pointer parallax,
 *     hover / focus highlight,
 *     roving-tabindex keyboard model and a toggletip per node.
 * Usage: import "hero-graph.js" (auto-inits every [data-hero-graph]) or call mountHeroGraph(el).
 */
import {
  CAT, ORDER, ROUTE, ROUTE_TOOLS, VIEW, catOf, pathD, seg, segLen,
  type Dir, type Id, type NodeId, type Pt,
} from "./graph-data";
import { motionPaused, onMotionChange, setMotionPaused } from "../../scripts/motion-pref";

export interface HeroGraphOptions {
  dir?: Dir;
  lang?: "en" | "ar";
  /** force the still frame (true) or motion (false); default follows prefers-reduced-motion */
  reducedMotion?: boolean;
}
export interface HeroGraphController {
  play(): void;
  pause(): void;
  destroy(): void;
}

interface Hop { a: Id; b: Id; t0: number; d: number; cmd?: NodeId }
interface Plan { hops: Hop[]; lit: [Id, number, number][]; arr: [Id, number][]; end: number }

const TAIL = 56, TAIL_H = 32, RIPPLE = 640, LEAD = 700;
const IDS: Id[] = [...ORDER, "query", "answer"];
const INST = new WeakMap<HTMLElement, HeroGraphController>();
let closeOpenTip: (() => void) | null = null;

const ease = bezier(0.65, 0, 0.35, 1);
const easeOut = (q: number): number => 1 - (1 - q) ** 3;
const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);

function bezier(x1: number, y1: number, x2: number, y2: number): (x: number) => number {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  return x => {
    let t = x;
    for (let i = 0; i < 8; i++) {
      const e = ((ax * t + bx) * t + cx) * t - x, s = (3 * ax * t + 2 * bx) * t + cx;
      if (Math.abs(e) < 1e-4 || !s) break;
      t -= e / s;
    }
    t = clamp(t, 0, 1);
    return ((ay * t + by) * t + cy) * t;
  };
}

/** Lay one loop out in time: hops (pulse travel), arrivals (ripples) and lit windows. */
function plan(route: Id[], dir: Dir, k: number): Plan {
  const hops: Hop[] = [], arr: [Id, number][] = [["query", 80 * k]], lit: [Id, number, number][] = [];
  let t = 520 * k;
  for (let i = 0; i < route.length - 1; i++) {
    const a = route[i]!, b = route[i + 1]!;
    const d = clamp(segLen(seg(a, b, dir)) * 5.6, 620, 1000) * k;
    // a hop along the rim is still a command from the orchestrator: light its spoke to the target
    const cmd = a !== "orchestrator" && b !== "orchestrator" && a !== "query" && b !== "answer" ? (b as NodeId) : undefined;
    hops.push({ a, b, t0: t, d, cmd });
    t += d;
    arr.push([b, t]);
    t += (b === "orchestrator" ? 300 : 220) * k;
  }
  const done = arr[arr.length - 1]![1], end = done + 1500 * k;
  lit.push(["query", 0, hops[0]!.t0 + 360 * k]);
  for (let i = 1; i < arr.length; i++) {
    const [id, at] = arr[i]!;
    const next = hops[i];
    if (id !== "orchestrator") lit.push([id, at, next ? next.t0 + 520 * k : end - 300 * k]);
  }
  lit.push(["orchestrator", arr.find(x => x[0] === "orchestrator")![1], done]);
  return { hops, lit, arr, end };
}

export function mountHeroGraph(host: HTMLElement, opts: HeroGraphOptions = {}): HeroGraphController {
  const existing = INST.get(host);
  if (existing) return existing;

  const ac = new AbortController(), on = { signal: ac.signal };
  const attr = (n: string): string => host.closest(`[${n}]`)?.getAttribute(n) || document.documentElement.getAttribute(n) || "";
  const mq = matchMedia("(prefers-reduced-motion: reduce)");
  const fine = matchMedia("(hover: hover) and (pointer: fine)");

  let paused = false, live = false, isRun = false, running = false, inView = true, visible = true, destroyed = false;
  let reduced = opts.reducedMotion ?? (host.dataset.motion === "reduce" || mq.matches);
  // the site-wide motion preference: this button and the living charts' pause buttons share it
  paused = motionPaused();
  let cancelIdle = (): void => {};
  let teardown = (): void => {};
  let sync = (): void => {};

  const setPaused = (v: boolean): void => setMotionPaused(v);
  onMotionChange(v => { paused = v; sync(); }, ac.signal);
  const ctl: HeroGraphController = {
    play: () => setPaused(false),
    pause: () => setPaused(true),
    destroy() {
      destroyed = true;
      cancelIdle();
      ac.abort();
      teardown();
      INST.delete(host);
    },
  };
  INST.set(host, ctl);
  host.classList.add("hg");

  if (host.querySelector(".hg-svg")) init();
  else {
    const dir: Dir = opts.dir || (attr("dir") === "rtl" ? "rtl" : "ltr");
    const lang = opts.lang || (/^ar/.test(attr("lang")) ? "ar" : "en");
    import("./render").then(m => {
      if (destroyed) return;
      host.insertAdjacentHTML("beforeend", m.renderHeroGraphSVG({ dir, lang }));
      init();
    });
  }
  return ctl;

  function init(): void {
    const svg = host.querySelector(".hg-svg") as SVGSVGElement;
    // the markup knows its own direction; geometry must match it
    const dir: Dir = svg.dataset.dir === "rtl" ? "rtl" : "ltr";
    // JS-only parts: pause control (before the graph in tab order), toggletip, live region
    if (!host.querySelector(".hg-btn")) {
      svg.insertAdjacentHTML("beforebegin",
        `<button class="hg-btn" type="button" aria-pressed="false" hidden><svg viewBox="0 0 16 16" aria-hidden="true">` +
        `<path class="hg-i-pause" d="M5.75 4.25v7.5M10.25 4.25v7.5"/><path class="hg-i-play" d="M5.6 3.9v8.2L12.2 8z"/></svg></button>`);
      svg.insertAdjacentHTML("afterend",
        `<div class="hg-tip" aria-hidden="true" hidden><p class="hg-tip-h"><span class="hg-tip-t"></span><span class="hg-tip-id"></span></p>` +
        `<p class="hg-tip-p"></p><span class="hg-tip-caret"></span></div><div class="hg-sr" aria-live="polite" aria-atomic="true"></div>`);
    }
    const q = <T extends Element>(s: string): T => host.querySelector(s) as T;
    const btn = q<HTMLButtonElement>(".hg-btn");
    btn.setAttribute("aria-label", svg.dataset.pause || "Pause animation");
    btn.dataset.pause = svg.dataset.pause || "Pause animation";
    btn.dataset.play = svg.dataset.play || "Play animation";
    const tip = q<HTMLElement>(".hg-tip");
    const tipT = q<HTMLElement>(".hg-tip-t"), tipId = q<HTMLElement>(".hg-tip-id"), tipP = q<HTMLElement>(".hg-tip-p");
    const live$ = q<HTMLElement>(".hg-sr[aria-live]");
    const comet = q<SVGGElement>(".hg-comet");
    const tail = q<SVGPathElement>(".hg-tail"), tailH = q<SVGPathElement>(".hg-tail-h");
    const head = q<SVGCircleElement>(".hg-head"), headH = q<SVGCircleElement>(".hg-head-h");
    const grad = comet.querySelector("linearGradient") as SVGLinearGradientElement;
    const satLayers = host.querySelectorAll<SVGGElement>(".hg-sl"), orcLayer = q<SVGGElement>(".hg-ol");
    const edges = host.querySelectorAll<SVGPathElement>(".hg-e,.hg-rt");
    const routes = [...host.querySelectorAll<SVGPathElement>(".hg-rt")];
    const spokes = host.querySelectorAll<SVGPathElement>(".hg-spokes path");
    const el = {} as Record<Id, SVGGElement>, ripple = {} as Record<Id, SVGCircleElement>, r0 = {} as Record<Id, number>;
    for (const id of IDS) {
      el[id] = q<SVGGElement>(`[data-id="${id}"]`);
      ripple[id] = el[id].querySelector(".hg-ripple") as SVGCircleElement;
      r0[id] = +ripple[id].getAttribute("r")!;
    }
    const cls = svg.classList;

    // ---------------------------------------------------------------- timeline
    const tok = getComputedStyle(svg).getPropertyValue("--duration-graph-loop").trim();
    const loopMs = (/ms$/.test(tok) ? parseFloat(tok) : parseFloat(tok) * 1000) || 9000;
    const k = loopMs / plan(ROUTE, dir, 1).end;
    const plans = [plan(ROUTE, dir, k), plan(ROUTE_TOOLS, dir, k)];
    let t = -LEAD, loop = 0, raf = 0, last = 0;
    let cur: Hop | undefined, L = 0, dirty = true, cmdNow: NodeId | undefined;
    const litNow = {} as Record<Id, boolean>, rip = {} as Record<Id, boolean>;

    // ---------------------------------------------------------------- parallax state
    let px = 0, py = 0, tx = 0, ty = 0, upp = 1;
    let sat: Pt = { x: 0, y: 0 }, orc: Pt = { x: 0, y: 0 };
    const off = (id: Id): Pt => (id === "orchestrator" ? orc : sat);

    const setA = (n: Element, a: string, v: number | string): void => n.setAttribute(a, typeof v === "number" ? String(Math.round(v * 100) / 100) : v);

    function frame(): void {
      const P = plans[loop & 1]!;
      let hop: Hop | undefined;
      for (const h of P.hops) if (t >= h.t0 && t < h.t0 + h.d) { hop = h; break; }
      if (hop !== cur || dirty) {
        cur = hop;
        dirty = false;
        if (hop) {
          const d = pathD(seg(hop.a, hop.b, dir, off));
          setA(tail, "d", d);
          setA(tailH, "d", d);
          L = tail.getTotalLength();
          setA(tail, "stroke-dasharray", `${TAIL} ${L + TAIL}`);
          setA(tailH, "stroke-dasharray", `${TAIL_H} ${L + TAIL_H}`);
          setA(comet, "class", "hg-comet hg-c-" + catOf(hop.a));
        }
        // the coloured route edge under the pulse brightens while the pulse travels it
        for (const p of routes) p.classList.toggle("is-hot", !!hop && p.dataset.a === hop.a && p.dataset.b === hop.b);
      }
      if (hop) {
        const u = (t - hop.t0) / hop.d, s = ease(u) * L;
        const h = tail.getPointAtLength(s), b = tail.getPointAtLength(Math.max(0, s - TAIL));
        setA(head, "cx", h.x); setA(head, "cy", h.y);
        setA(headH, "cx", h.x); setA(headH, "cy", h.y);
        setA(grad, "x1", b.x); setA(grad, "y1", b.y); setA(grad, "x2", h.x); setA(grad, "y2", h.y);
        setA(tail, "stroke-dashoffset", TAIL - s);
        setA(tailH, "stroke-dashoffset", TAIL_H - s);
        comet.style.opacity = String(Math.min(1, u / 0.12, (1 - u) / 0.08));
      } else comet.style.opacity = "0";

      for (const id of IDS) {
        const lit = P.lit.some(w => w[0] === id && t >= w[1] && t < w[2]);
        if (lit !== !!litNow[id]) { litNow[id] = lit; el[id].classList.toggle("is-lit", lit); }
      }
      const qs = {} as Record<Id, number>;
      for (const [id, ta] of P.arr) if (t >= ta && t < ta + RIPPLE) qs[id] = (t - ta) / RIPPLE;
      for (const id of IDS) {
        const v = qs[id];
        if (v !== undefined) {
          const g = id === "orchestrator" ? 0.5 : id === "query" || id === "answer" ? 1.7 : 0.8;
          setA(ripple[id], "r", r0[id] * (1 + g * easeOut(v)));
          ripple[id].style.opacity = String(0.6 * (1 - v) ** 1.6);
          rip[id] = true;
        } else if (rip[id]) { rip[id] = false; ripple[id].style.opacity = "0"; }
      }
      const cmd = hop && hop.cmd;
      if (cmd !== cmdNow) {
        cmdNow = cmd;
        spokes.forEach(p => p.classList.toggle("is-cmd", !!cmd && p.dataset.b === cmd && p.classList.contains("hg-e")));
      }
    }

    function reset(): void {
      comet.style.opacity = "0";
      for (const p of routes) p.classList.remove("is-hot");
      cur = undefined; cmdNow = undefined; dirty = true;
      for (const id of IDS) {
        el[id].classList.remove("is-lit"); litNow[id] = false;
        ripple[id].style.opacity = "0"; rip[id] = false;
      }
      spokes.forEach(p => p.classList.remove("is-cmd"));
    }

    function applyPar(): void {
      const ts = `translate(${Math.round(sat.x * 100) / 100} ${Math.round(sat.y * 100) / 100})`;
      satLayers.forEach(g => setA(g, "transform", ts));
      setA(orcLayer, "transform", `translate(${Math.round(orc.x * 100) / 100} ${Math.round(orc.y * 100) / 100})`);
      spokes.forEach(p => setA(p, "d", pathD(seg(p.dataset.a as Id, p.dataset.b as Id, dir, off))));
      dirty = true;
    }

    function stepPar(dt: number): void {
      const a = 1 - Math.exp(-dt / 130);
      px += (tx - px) * a; py += (ty - py) * a;
      if (Math.abs(tx - px) + Math.abs(ty - py) < 0.002) { px = tx; py = ty; }
      sat = { x: -px * 6 * upp, y: -py * 6 * upp };
      orc = { x: -px * 2 * upp, y: -py * 2 * upp };
      applyPar();
    }

    const parMoving = (): boolean => px !== tx || py !== ty;

    function tick(now: number): void {
      raf = 0;
      const dt = last ? Math.min(now - last, 48) : 16.7;
      last = now;
      if (parMoving()) stepPar(dt);
      if (running) {
        t += dt;
        const P = plans[loop & 1]!;
        if (t >= P.end) { t -= P.end; loop++; }
        frame();
      }
      if (running || parMoving()) raf = requestAnimationFrame(tick);
      else last = 0;
    }
    const kick = (): void => { if (!raf) raf = requestAnimationFrame(tick); };

    sync = (): void => {
      const motion = live && !reduced, run = motion && !paused;
      cls.toggle("is-live", motion);
      if (run !== isRun) {
        isRun = run;
        cls.toggle("is-run", run);
        reset();
        t = -LEAD; loop = 0;
      }
      if (!run) { tx = ty = 0; if (px || py) kick(); } // no parallax while paused or reduced
      running = run && inView && visible;
      cls.toggle("is-frozen", !running);
      btn.hidden = !motion;
      btn.setAttribute("aria-pressed", String(paused));
      if (running) kick();
    };

    // ---------------------------------------------------------------- highlight + toggletip
    let hover: NodeId | null = null, focusId: NodeId | null = null, openId: NodeId | null = null, activeId: NodeId | null = null;
    let spaceOn: NodeId | null = null;
    const nodeOf = (t: EventTarget | null): SVGGElement | null =>
      t instanceof Element ? (t.closest(".hg-node") as SVGGElement | null) : null;

    function setActive(): void {
      const id = hover || focusId || openId;
      if (id === activeId) return;
      activeId = id;
      cls.toggle("is-dim", !!id);
      if (!id) return;
      svg.style.setProperty("--hg-hl", getComputedStyle(el[id]).getPropertyValue("--hg-f"));
      const near = new Set<string>([id]);
      edges.forEach(e => {
        const hit = e.dataset.a === id || e.dataset.b === id;
        e.classList.toggle("is-near", hit);
        if (hit) { near.add(e.dataset.a!); near.add(e.dataset.b!); }
      });
      for (const n of IDS) el[n].classList.toggle("is-near", near.has(n));
    }

    function announce(msg: string): void {
      live$.textContent = "";
      setTimeout(() => { if (openId) live$.textContent = msg; }, 60);
    }

    function closeTip(): void {
      if (!openId) return;
      el[openId].setAttribute("aria-expanded", "false");
      tip.classList.remove("is-on");
      tip.hidden = true;
      live$.textContent = "";
      openId = null;
      if (closeOpenTip === closeTip) closeOpenTip = null;
      setActive();
    }

    function placeTip(n: SVGGElement): void {
      const H = host.getBoundingClientRect(), R = (n.querySelector(".hg-disc") as SVGCircleElement).getBoundingClientRect();
      const w = tip.offsetWidth, h = tip.offsetHeight, m = 4, g = 10;
      const cx = R.left + R.width / 2 - H.left, top = R.top - H.top, bot = R.bottom - H.top;
      const roomUp = top - g - m, roomDown = H.height - bot - g - m;
      // above by default; flip below near the top edge (or when there is clearly more room below)
      const below = roomUp < h && roomDown > roomUp;
      const y = clamp(below ? bot + g : top - g - h, m, Math.max(m, H.height - h - m));
      const x = clamp(cx - w / 2, m, Math.max(m, H.width - w - m));
      tip.classList.toggle("is-below", below);
      tip.style.left = x + "px";
      tip.style.top = y + "px";
      tip.style.setProperty("--hg-cx", clamp(cx - x, 16, w - 16) + "px");
    }

    function openTip(id: NodeId): void {
      if (closeOpenTip) closeOpenTip();
      const n = el[id];
      const title = n.dataset.title || id, text = svg.getElementById(n.getAttribute("aria-describedby") || "")?.textContent || "";
      tipT.textContent = title;
      tipId.textContent = title !== n.dataset.label ? n.dataset.label || "" : "";
      tipP.textContent = text;
      tip.className = "hg-tip hg-c-" + CAT[id];
      tip.hidden = false;
      placeTip(n);
      requestAnimationFrame(() => tip.classList.add("is-on"));
      n.setAttribute("aria-expanded", "true");
      openId = id;
      closeOpenTip = closeTip;
      announce(`${title}: ${text}`);
      setActive();
    }

    const toggle = (id: NodeId): void => (openId === id ? closeTip() : openTip(id));

    function rove(n: SVGGElement): void {
      for (const id of ORDER) el[id].setAttribute("tabindex", el[id] === n ? "0" : "-1");
    }

    svg.addEventListener("click", e => { const n = nodeOf(e.target); if (n) toggle(n.dataset.id as NodeId); }, on);
    svg.addEventListener("pointerover", e => {
      if (e.pointerType === "touch") return;
      const n = nodeOf(e.target), id = n ? (n.dataset.id as NodeId) : null;
      if (id !== hover) { hover = id; setActive(); }
    }, on);
    svg.addEventListener("pointerleave", () => { hover = null; setActive(); }, on);
    svg.addEventListener("focusin", e => {
      const n = nodeOf(e.target);
      if (!n) return;
      rove(n);
      let fv = true;
      try { fv = n.matches(":focus-visible"); } catch { /* old engines */ }
      focusId = fv ? (n.dataset.id as NodeId) : null;
      setActive();
    }, on);
    svg.addEventListener("focusout", () => { focusId = null; setActive(); }, on);
    svg.addEventListener("keydown", e => {
      const n = nodeOf(e.target);
      if (!n) return;
      const id = n.dataset.id as NodeId, i = ORDER.indexOf(id), rtl = dir === "rtl";
      let j: number;
      switch (e.key) {
        case "ArrowRight": j = i + (rtl ? -1 : 1); break;
        case "ArrowLeft": j = i + (rtl ? 1 : -1); break;
        case "ArrowDown": j = i + 1; break;
        case "ArrowUp": j = i - 1; break;
        case "Home": j = 0; break;
        case "End": j = ORDER.length - 1; break;
        case "Enter": e.preventDefault(); toggle(id); return;
        case " ": e.preventDefault(); spaceOn = id; return;
        default: return;
      }
      e.preventDefault();
      if (openId) closeTip();
      el[ORDER[(j + ORDER.length) % ORDER.length]!].focus();
    }, on);
    svg.addEventListener("keyup", e => {
      if (e.key === " " && spaceOn) { const n = nodeOf(e.target); if (n && n.dataset.id === spaceOn) toggle(spaceOn); spaceOn = null; }
    }, on);
    document.addEventListener("keydown", e => { if (e.key === "Escape" && openId) closeTip(); }, on);
    document.addEventListener("pointerdown", e => {
      if (openId && !tip.contains(e.target as Node) && !nodeOf(e.target)) closeTip();
    }, on);
    addEventListener("resize", closeTip, on);

    // ---------------------------------------------------------------- parallax input
    host.addEventListener("pointermove", e => {
      if (e.pointerType !== "mouse" || !fine.matches || reduced || paused) return;
      const r = host.getBoundingClientRect();
      tx = clamp(((e.clientX - r.left) / r.width) * 2 - 1, -1, 1);
      ty = clamp(((e.clientY - r.top) / r.height) * 2 - 1, -1, 1);
      upp = VIEW.w / r.width;
      kick();
    }, on);
    host.addEventListener("pointerleave", () => { tx = ty = 0; kick(); }, on);

    // ---------------------------------------------------------------- lifecycle
    btn.addEventListener("click", () => setPaused(!paused), on);
    const io = new IntersectionObserver(es => { inView = es[es.length - 1]!.isIntersecting; sync(); });
    io.observe(host);
    document.addEventListener("visibilitychange", () => { visible = document.visibilityState !== "hidden"; sync(); }, on);
    if (opts.reducedMotion === undefined && host.dataset.motion !== "reduce") {
      mq.addEventListener("change", () => {
        reduced = mq.matches;
        if (reduced) { tx = ty = px = py = 0; sat = orc = { x: 0, y: 0 }; applyPar(); }
        sync();
      }, on);
    }

    teardown = (): void => {
      io.disconnect();
      if (raf) cancelAnimationFrame(raf);
      closeTip();
      reset();
      sat = orc = { x: 0, y: 0 };
      applyPar();
      cls.remove("is-live", "is-run", "is-frozen", "is-dim");
      btn.hidden = true;
    };

    // start once the page is idle, so the graph never competes with LCP
    const go = (): void => { live = true; sync(); };
    if ("requestIdleCallback" in window) {
      const h = requestIdleCallback(go, { timeout: 2000 });
      cancelIdle = () => cancelIdleCallback(h);
    } else {
      const h = setTimeout(go, 900);
      cancelIdle = () => clearTimeout(h);
    }
    sync();
  }
}

/** Mount every [data-hero-graph] on the page (skips data-hero-graph="manual"). Safe to call again. */
export function initHeroGraphs(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>("[data-hero-graph]").forEach(n => {
    if (n.dataset.heroGraph !== "manual") mountHeroGraph(n);
  });
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => initHeroGraphs(), { once: true });
  else initHeroGraphs();
}

export default mountHeroGraph;
