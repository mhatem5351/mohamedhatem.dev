/**
 * The design's icon set (design/assets/icons/sprite.svg: 24 grid, 1.75 stroke, currentColor), parsed once at build
 * time so each page inlines only the icons it uses (no 22 KB sprite per page, no external <use> requests).
 */
import sprite from "~/assets/icons/sprite.svg?raw";

export interface IconDef {
  viewBox: string;
  body: string;
}

const SYMBOL = /<symbol id="i-([a-z0-9-]+)"([^>]*)>([\s\S]*?)<\/symbol>/g;

export const ICONS: ReadonlyMap<string, IconDef> = new Map(
  [...sprite.matchAll(SYMBOL)].map(([, name, attrs, body]) => [
    name!,
    { viewBox: /viewBox="([^"]+)"/.exec(attrs!)?.[1] ?? "0 0 24 24", body: body!.trim() },
  ]),
);

/** Icon names that point in the reading direction and are mirrored in RTL (DESIGN.md §8). */
export const DIRECTIONAL = new Set(["arrow-right", "arrow-left", "chevron-left", "chevron-right", "arrow-up-right", "send", "external-link"]);

export function icon(name: string): IconDef {
  const def = ICONS.get(name);
  if (!def) throw new Error(`Unknown icon "${name}" (see design/assets/icons)`);
  return def;
}
