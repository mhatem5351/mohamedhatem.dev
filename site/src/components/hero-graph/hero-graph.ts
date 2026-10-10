/*
 * Hero graph runtime. Enhances the server-rendered markup from render.ts (or renders it lazily
 * when a host is empty), then runs the request-flow animation:
 *   - one deterministic timeline, two loops long (the plain route, then the tools detour). Nothing runs per frame on
 *     the main thread: every moving part (the pulse's head and tail chords, the ripples, the lit twins of the nodes,
 *     the hot route edges, the commanded spokes) is one Web Animation of transform or opacity over the whole cycle,
 *     started once, so the compositor plays the flow (the pulse takes the colour of the node it leaves: one pulse
 *     per colour, each riding its own hops). The script only wakes once per hop, to move the coming pulse with the
 *     pointer parallax (desktop);
 *   - starts when the page is idle and runs only while 35% of the graph is on screen and the tab is visible;
 *     on touch screens it stops after 3 loops (the still frame) and plays 3 more when the graph comes back into
 *     view or is tapped; never runs under prefers-reduced-motion (the server markup already is the still frame);
 *   - pause control (WCAG 2.2.2; the site-wide motion preference, shared with the living charts), pointer parallax,
 *     hover / focus highlight,
 *     roving-tabindex keyboard model and a toggletip per node.
 * Usage: import "hero-graph.js" (auto-inits every [data-hero-graph]) or call mountHeroGraph(el).
 */
import {
  CAT, ORDER, ROUTE, ROUTE_TOOLS, VIEW, catOf, pathD, seg, segLen,
  type Cat, type Dir, type Id, type NodeId, type Pt, type Seg,
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

/** ripple length, lead-in before the first loop, loops per run on touch screens, share of the graph that must show,
    how long before a hop its (still invisible) pulse is placed for the parallax */
const RIPPLE = 640, LEAD = 700, LOOPS = 3, SHOWN = 0.35, DRESS = 120;
const IDS: Id[] = [...ORDER, "query", "answer"];
const INST = new WeakMap<HTMLElement, HeroGraphController>();
let closeOpenTip: (() => void) | null = null;

const ease = bezier(0.65, 0, 0.35, 1);
const easeOut = (q: number): number => 1 - (1 - q) ** 3;
const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
const r2 = (v: number): number => Math.round(v * 100) / 100;

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

/** A quadratic segment by arc length, computed (getPointAtLength would force style and layout). */
function track(s: Seg): { L: number; at: (d: number) => Pt } {
  const N = 48, x: number[] = [], y: number[] = [], acc: number[] = [0];
  for (let i = 0; i <= N; i++) {
    const t = i / N, u = 1 - t;
    x.push(u * u * s.p0.x + 2 * u * t * s.c.x + t * t * s.p1.x);
    y.push(u * u * s.p0.y + 2 * u * t * s.c.y + t * t * s.p1.y);
    if (i) acc.push(acc[i - 1]! + Math.hypot(x[i]! - x[i - 1]!, y[i]! - y[i - 1]!));
  }
  const L = acc[N]!;
  return {
    L,
    at(d) {
      d = clamp(d, 0, L);
      let i = 1;
      while (i < N && acc[i]! < d) i++;
      const f = (d - acc[i - 1]!) / (acc[i]! - acc[i - 1]! || 1);
      return { x: x[i - 1]! + (x[i]! - x[i - 1]!) * f, y: y[i - 1]! + (y[i]! - y[i - 1]!) * f };
    },
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
  const coarse = matchMedia("(pointer: coarse)");

  let paused = false, live = false, isRun = false, running = false, inView = true, visible = true, destroyed = false;
  /** touch screens: loops played since the graph last came into view (or was tapped); spent = stopped after LOOPS */
  let done = 0, spent = false;
  let reduced = opts.reducedMotion ?? (host.dataset.motion === "reduce" || mq.matches);
  // the site-wide motion preference: this button and the living charts' pause buttons share it
  paused = motionPaused();
  let cancelIdle = (): void => {};
  let teardown = (): void => {};
  let sync = (): void => {};

  const setPaused = (v: boolean): void => setMotionPaused(v);
  onMotionChange(v => {
    paused = v;
    // playing again asks for motion: a touch screen that had stopped after its loops plays a new run
    if (!v) { spent = false; done = 0; }
    sync();
  }, ac.signal);
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
    const satLayers = host.querySelectorAll<SVGGElement>(".hg-sl"), orcLayer = q<SVGGElement>(".hg-ol");
    const edges = host.querySelectorAll<SVGPathElement>(".hg-e,.hg-rt,.hg-rh,.hg-cmd");
    const spokes = host.querySelectorAll<SVGPathElement>(".hg-spokes path");
    const el = {} as Record<Id, SVGGElement>;
    for (const id of IDS) el[id] = q<SVGGElement>(`[data-id="${id}"]`);
    const cls = svg.classList;
    const setA = (n: Element, a: string, v: number | string): void => n.setAttribute(a, typeof v === "number" ? String(r2(v)) : v);

    // ---------------------------------------------------------------- timeline
    const css = getComputedStyle(svg);
    const tok = css.getPropertyValue("--duration-graph-loop").trim();
    const loopMs = (/ms$/.test(tok) ? parseFloat(tok) : parseFloat(tok) * 1000) || 9000;
    const k = loopMs / plan(ROUTE, dir, 1).end;
    const plans = [plan(ROUTE, dir, k), plan(ROUTE_TOOLS, dir, k)];
    /** the script wakes just before each hop (to place its pulse for the parallax) and at the end of a loop */
    const evs = plans.map(P => [...P.hops.map(h => h.t0 - DRESS), P.end]);
    /** the two loops (plain, then with the tools detour) make one cycle; LOOP0[n] = where loop n's time starts in it */
    const CYCLE = plans[0]!.end + plans[1]!.end, LOOP0 = [0, plans[0]!.end];
    const easeTok = css.getPropertyValue("--hg-ease").trim();
    const EASE = easeTok && CSS.supports("transition-timing-function", easeTok) ? easeTok : "cubic-bezier(.2,0,0,1)";
    /** t = time in the current loop (ms; negative during the lead-in); base = the clock when this loop's t was 0 */
    let t = -LEAD, loop = 0, base = 0, timer = 0, raf = 0, last = 0;
    let cur: Hop | undefined, tracks: Animation[] = [];
    const clock = (): number => performance.now();
    const cycleTime = (): number => LOOP0[loop & 1]! + t;

    /** Opacity keyframes over the cycle: 0, rising to `peak` over `up` ms at each window's start, back to 0 over `down`
        ms after its end (the eased cross-fades the lit states used to be CSS transitions of). */
    function fades(wins: [number, number][], up: number, down: number, peak: number): Keyframe[] {
      wins.sort((a, b) => a[0] - b[0]);
      const kf: Keyframe[] = [{ offset: 0, opacity: 0 }];
      let at = 0;
      const key = (ms: number, opacity: number, eased?: boolean): void => {
        at = clamp(ms, at, CYCLE);
        kf.push(eased ? { offset: at / CYCLE, opacity, easing: EASE } : { offset: at / CYCLE, opacity });
      };
      wins.forEach(([a, b], i) => {
        key(a, 0, true);
        key(Math.min(a + up, b), peak);
        key(b, peak, true);
        key(Math.min(b + down, wins[i + 1]?.[0] ?? CYCLE), 0);
      });
      key(CYCLE, 0);
      return kf;
    }

    /** Opacity keyframes over the cycle: 1, and 0 while the lit twin is fully in (from `up` ms into a window to its end). */
    function under(wins: [number, number][], up: number): Keyframe[] {
      const kf: Keyframe[] = [{ offset: 0, opacity: 1 }];
      for (const [a, b] of wins) {
        if (a + up >= b) continue;
        for (const [ms, opacity] of [[a + up, 1], [a + up, 0], [b, 0], [b, 1]] as const) kf.push({ offset: ms / CYCLE, opacity });
      }
      kf.push({ offset: 1, opacity: 1 });
      return kf;
    }

    /** A ripple at each arrival: it grows from the node's rim (scale about the node's centre) and fades. */
    function ripples(times: number[], g: number): Keyframe[] {
      const rest = (ms: number): Keyframe => ({ offset: ms / CYCLE, opacity: 0, transform: "scale(1)" });
      const kf: Keyframe[] = [rest(0)];
      let at = 0;
      for (const ta of times.sort((a, b) => a - b)) {
        if (ta < at) continue;
        kf.push(rest(ta));
        for (let i = 0; i <= 8; i++) {
          const v = i / 8;
          at = Math.min(ta + v * RIPPLE, CYCLE);
          kf.push({ offset: at / CYCLE, opacity: r2(0.6 * (1 - v) ** 1.6), transform: `scale(${r2(1 + g * easeOut(v))})` });
        }
        kf.push(rest(at));
      }
      kf.push(rest(CYCLE));
      return kf;
    }

    /** What changes over a cycle: each part's keyframes, built once. */
    const inCycle = <T>(f: (P: Plan, at: number) => T[]): T[] => plans.flatMap((P, i) => f(P, LOOP0[i]!));
    const parts: [Element, Keyframe[]][] = [];
    for (const id of IDS) {
      const wins = inCycle((P, at) => P.lit.filter(w => w[0] === id).map(w => [at + w[1], at + w[2]] as [number, number]));
      // lit: the lit twins fade in over the plain ones; the aura glows. A plain label steps out while its lit twin
      // fully covers it (two copies of a text would thicken its anti-aliasing)
      el[id].querySelectorAll(".hg-on").forEach(n => parts.push([n, fades(wins, 380, 380, 1)]));
      el[id].querySelectorAll(".hg-lp > .hg-off").forEach(n => parts.push([n, under(wins, 380)]));
      const aura = el[id].querySelector(".hg-aura");
      if (aura) parts.push([aura, fades(wins, 380, 380, 0.1)]);
      const g = id === "orchestrator" ? 0.5 : id === "query" || id === "answer" ? 1.7 : 0.8;
      parts.push([el[id].querySelector(".hg-ripple")!, ripples(inCycle((P, at) => P.arr.filter(a => a[0] === id).map(a => at + a[1])), g)]);
    }
    // the coloured route edge under the pulse brightens while the pulse travels it
    host.querySelectorAll<SVGPathElement>(".hg-rh").forEach(p => parts.push([p, fades(inCycle((P, at) =>
      P.hops.filter(h => h.a === p.dataset.a && h.b === p.dataset.b).map(h => [at + h.t0, at + h.t0 + h.d] as [number, number])), 200, 640, 1)]));
    // a hop along the rim is a command from the orchestrator: its spoke to the target takes the accent
    host.querySelectorAll<SVGPathElement>(".hg-cmd").forEach(p => {
      const wins = inCycle((P, at) => P.hops.filter(h => h.cmd === p.dataset.b).map(h => [at + h.t0, at + h.t0 + h.d] as [number, number]));
      if (wins.length) parts.push([p, fades(wins, 240, 240, 1)]);
    });

    // the pulse, one per colour (a hop's pulse has the colour of the node it leaves; the server renders one, the others
    // are its clones): for each, one track over the cycle for its fade, its head and each tail chord, drawn on the
    // still geometry (the parallax moves a whole pulse, see place())
    const pulses = new Map<Cat, SVGGElement>();
    for (const P of plans) for (const h of P.hops) {
      const c = catOf(h.a);
      if (pulses.has(c)) continue;
      const g = pulses.size ? (comet.cloneNode(true) as SVGGElement) : comet;
      if (g !== comet) {
        // a clone's gradients need their own ids
        g.querySelectorAll("linearGradient").forEach(lg => {
          const id = lg.id, nid = `${id}-${c}`;
          lg.id = nid;
          g.querySelectorAll(`[stroke="url(#${id})"]`).forEach(n => n.setAttribute("stroke", `url(#${nid})`));
        });
        [...pulses.values()].pop()!.after(g);
      }
      setA(g, "class", "hg-comet hg-c-" + c);
      pulses.set(c, g);
    }
    for (const [c, g] of pulses) {
      // the tail's chords: f = how far behind the head the chord's front runs, l = its length
      const chords = [...g.querySelectorAll<SVGPathElement>(".hg-th,.hg-tl")].map(n => ({ n, f: +n.dataset.f!, l: +n.dataset.l! }));
      const fade: Keyframe[] = [{ offset: 0, opacity: 0 }];
      const moves: Keyframe[][] = [[], ...chords.map(() => [])];
      for (const h of inCycle((P, at) => P.hops.filter(x => catOf(x.a) === c).map(x => ({ ...x, t0: at + x.t0 })))) {
        const tr = track(seg(h.a, h.b, dir)), L = tr.L, K = clamp(Math.round(L / 8), 12, 40);
        const s0 = tr.at(0), s1 = tr.at(1), a0 = (Math.atan2(s1.y - s0.y, s1.x - s0.x) * 180) / Math.PI;
        const ang = chords.map(() => a0);
        for (let i = 0; i <= K; i++) {
          const offset = (h.t0 + (h.d * i) / K) / CYCLE, s = ease(i / K) * L, p = tr.at(s);
          moves[0]!.push({ offset, transform: `translate(${r2(p.x)}px,${r2(p.y)}px)` });
          // each chord runs from the point `f` behind the head back to `f + l`, clipped at the hop's start (the tail
          // grows out of the node the pulse leaves)
          chords.forEach((ch, j) => {
            const F = tr.at(s - ch.f), B = tr.at(s - ch.f - ch.l), dx = F.x - B.x, dy = F.y - B.y, len = Math.hypot(dx, dy);
            let a = len > 0.01 ? (Math.atan2(dy, dx) * 180) / Math.PI : ang[j]!;
            a += Math.round((ang[j]! - a) / 360) * 360; // the short way round from the previous keyframe
            ang[j] = a;
            moves[j + 1]!.push({ offset, transform: `translate(${r2(F.x)}px,${r2(F.y)}px) rotate(${r2(a)}deg) scale(${r2(len / ch.l)},1)` });
          });
        }
        // in over the first 12% of the hop, out over the last 8%
        for (const [u, opacity] of [[0, 0], [0.12, 1], [0.92, 1], [1, 0]] as const) fade.push({ offset: (h.t0 + u * h.d) / CYCLE, opacity });
      }
      fade.push({ offset: 1, opacity: 0 });
      parts.push([g, fade]);
      [g.querySelector(".hg-hd")!, ...chords.map(ch => ch.n)].forEach((n, j) => {
        const m = moves[j]!;
        parts.push([n, [{ ...m[0]!, offset: 0 }, ...m, { ...m[m.length - 1]!, offset: 1 }]]);
      });
    }

    // ---------------------------------------------------------------- parallax state
    let px = 0, py = 0, tx = 0, ty = 0, upp = 1;
    let sat: Pt = { x: 0, y: 0 }, orc: Pt = { x: 0, y: 0 };
    const off = (id: Id): Pt => (id === "orchestrator" ? orc : sat);


    /** A pulse rides with the parallax: by its edge's offset (on a spoke, the mean of the two ends' offsets). */
    const placed = new Map<SVGGElement, string>();
    function place(hop: Hop): void {
      const a = off(hop.a), b = off(hop.b), g = pulses.get(catOf(hop.a))!;
      const v = `translate(${r2((a.x + b.x) / 2)} ${r2((a.y + b.y) / 2)})`;
      if (placed.get(g) !== v) { placed.set(g, v); setA(g, "transform", v); }
    }

    /** Place the pulse of the hop that is about to start (or running). */
    function apply(): void {
      const hop = plans[loop & 1]!.hops.find(h => t >= h.t0 - DRESS && t < h.t0 + h.d);
      if (!hop || hop === cur) return;
      cur = hop;
      place(hop);
    }

    /** One wake-up: advance the clock, dress the pulse, sleep until the next hop. */
    function step(): void {
      timer = 0;
      if (!running) return;
      t = clock() - base;
      let P = plans[loop & 1]!;
      while (t >= P.end) {
        t -= P.end; base += P.end; loop++;
        // touch screens: after LOOPS loops, settle on the still frame (a tap or the next visit plays more)
        if (++done >= LOOPS && coarse.matches) { spent = true; sync(); return; }
        P = plans[loop & 1]!;
      }
      apply();
      const next = evs[loop & 1]!.find(e => e > t) ?? P.end;
      timer = window.setTimeout(step, Math.max(1, next - t));
    }

    /** Run from time t: every part's track (started on the first run) on one clock. */
    function resume(): void {
      base = clock() - t;
      if (!tracks.length) tracks = parts.map(([n, kf]) => n.animate(kf, { duration: CYCLE, iterations: Infinity }));
      for (const a of tracks) { a.currentTime = cycleTime(); a.play(); }
      step();
    }

    /** Freeze the clock: every part holds its frame. */
    function halt(): void {
      if (timer) clearTimeout(timer);
      timer = 0;
      for (const a of tracks) a.pause();
    }

    /** Back to the still frame: every part lets go (the CSS cross-fades to the lit frame). */
    function reset(): void {
      halt();
      for (const a of tracks) a.cancel();
      tracks = [];
      cur = undefined;
    }

    function applyPar(): void {
      const ts = `translate(${r2(sat.x)} ${r2(sat.y)})`;
      satLayers.forEach(g => setA(g, "transform", ts));
      setA(orcLayer, "transform", `translate(${r2(orc.x)} ${r2(orc.y)})`);
      spokes.forEach(p => setA(p, "d", pathD(seg(p.dataset.a as Id, p.dataset.b as Id, dir, off))));
      if (cur) place(cur);
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

    // frames only for the parallax (a mouse over the graph); the flow itself needs none
    function tick(now: number): void {
      raf = 0;
      const dt = last ? Math.min(now - last, 48) : 16.7;
      last = now;
      if (parMoving()) stepPar(dt);
      if (parMoving()) raf = requestAnimationFrame(tick);
      else last = 0;
    }
    const kick = (): void => { if (!raf) raf = requestAnimationFrame(tick); };

    sync = (): void => {
      const motion = live && !reduced, run = motion && !paused && !spent;
      cls.toggle("is-live", motion);
      if (run !== isRun) {
        isRun = run;
        running = false;
        cls.toggle("is-run", run);
        reset();
        t = -LEAD; loop = 0; done = 0;
      }
      if (!run) { tx = ty = 0; if (px || py) kick(); } // no parallax while paused or reduced
      const go = run && inView && visible;
      if (go !== running) {
        running = go;
        if (go) resume();
        else { t = clock() - base; halt(); }
      }
      cls.toggle("is-frozen", !running);
      btn.hidden = !motion;
      btn.setAttribute("aria-pressed", String(paused));
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
    // touch screens: a tap on a graph that stopped after its loops plays it again (the tap still opens a toggletip)
    host.addEventListener("click", e => {
      if (spent && !btn.contains(e.target as Node)) { spent = false; done = 0; sync(); }
    }, on);
    // run only while a meaningful part shows (a sliver at the bottom of a phone screen doesn't count); coming back into
    // view starts a new run of loops on touch screens
    const io = new IntersectionObserver(es => {
      const e = es[es.length - 1]!, was = inView;
      inView = e.isIntersecting && e.intersectionRatio >= SHOWN - 0.01;
      if (inView && !was) { spent = false; done = 0; }
      sync();
    }, { threshold: [0, SHOWN] });
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
      running = false;
      reset();
      sat = orc = { x: 0, y: 0 };
      applyPar();
      for (const g of pulses.values()) if (g !== comet) g.remove();
      setA(comet, "class", "hg-comet hg-c-teal");
      comet.removeAttribute("transform");
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
