/**
 * The visitor's motion preference, one for the whole site: the hero graph's pause button and every living chart's
 * pause button (src/scripts/motion.ts) read and write the same value, so pausing anywhere pauses everything, on
 * every page, until the visitor plays it again (WCAG 2.2.2). The storage key predates the living charts (it was the
 * hero graph's own), so a visitor who paused the hero before keeps everything paused.
 */
const KEY = "hero-graph:paused";
const EVENT = "mh:motion";

export function motionPaused(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function setMotionPaused(paused: boolean): void {
  try {
    localStorage.setItem(KEY, paused ? "1" : "0");
  } catch {
    /* storage blocked: the choice lasts for this page */
  }
  dispatchEvent(new CustomEvent<boolean>(EVENT, { detail: paused }));
}

/** Calls `cb` when the preference changes on this page or in another tab. */
export function onMotionChange(cb: (paused: boolean) => void, signal?: AbortSignal): void {
  addEventListener(EVENT, (e) => cb((e as CustomEvent<boolean>).detail), { signal });
  addEventListener("storage", (e) => e.key === KEY && cb(motionPaused()), { signal });
}
