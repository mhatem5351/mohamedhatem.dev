// Geometry of the "MH" monogram: an M-H ligature on three vertical stems (|\/| + -|) where the
// M's right stem IS the H's left stem, plus one teal node (the orchestrator) sitting in the M's
// vertex, on the same horizon as the H crossbar. Pure maths, no dependencies.
//
// All shapes are emitted as ONE filled path (nonzero, consistent winding) so the union has no
// anti-aliasing seams, plus the node circle. Coordinates are y-down.

const R = n => Math.round(n * 1000) / 1000;

/** intersection of the line through p (direction d) with the circle (c, r); returns the t values */
function lineCircle(p, d, c, r) {
  const fx = p[0] - c[0], fy = p[1] - c[1];
  const A = d[0] * d[0] + d[1] * d[1], B = 2 * (fx * d[0] + fy * d[1]), C = fx * fx + fy * fy - r * r;
  const disc = B * B - 4 * A * C;
  if (disc < 0) return [];
  const s = Math.sqrt(disc);
  return [(-B - s) / (2 * A), (-B + s) / (2 * A)];
}

/** find the outer-vertex depth that puts the diagonals' meeting point (and so the node) at y = yc */
function solveVyO(p, yc) {
  const vx = (p.a1 + p.a2 + p.w) / 2;
  const meet = vyO => {
    const m = (vyO - p.T) / (vx - p.a1), hw = p.t * Math.sqrt(1 + m * m) / m;
    return (vyO + p.T + (vx - p.a1 - hw) * m) / 2;
  };
  let lo = p.T + 0.5, hi = p.B * 2;
  for (let i = 0; i < 80; i++) { const mid = (lo + hi) / 2; if (meet(mid) < yc) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}

/**
 * p = {
 *   a1, a2, a3   left edges of the three stems
 *   w            stem width
 *   T, B         top and bottom (cap height = B - T)
 *   cy, ch       crossbar centre and height
 *   t            diagonal stroke thickness (perpendicular)
 *   vyO          y of the V's outer (lower) vertex, or
 *   yc           y where the diagonals' centre lines meet (vyO is solved for it)
 *   node: { cx?, cy?, r, gap, cut }  cy defaults to where the diagonals' centre lines meet;
 *                gap > 0 trims the diagonals: cut "arc" follows a circle of radius r + gap,
 *                cut "perp" ends them square, perpendicular to the stroke
 *   cy           crossbar centre (defaults to the node's centre: one shared horizon)
 *   flatV        optional: cut the V's outer vertex flat at this y (> notch)
 * }
 */
export function mh(p) {
  if (p.vyO == null && p.yc != null) p = { ...p, vyO: solveVyO(p, p.yc) };
  const { a1, a2, a3, w, T, B, ch, t } = p;
  const vx = (a1 + a2 + w) / 2;
  const vyO = p.vyO;
  const m = (vyO - T) / (vx - a1);                    // slope of the diagonals (dy/dx)
  const hw = t * Math.sqrt(1 + m * m) / m;            // horizontal width of a diagonal band
  const vyI = T + (vx - a1 - hw) * m;                 // the notch (inner vertex)
  const yJ = T + w * m;                               // outer diagonal edge leaves the stem here
  if (vyI <= T + 0.01) throw new Error("diagonals too thick for this width: no notch");
  const yc = (vyO + vyI) / 2;                          // where the diagonals' centre lines meet
  const node = p.node ? { cx: p.node.cx ?? vx, cy: p.node.cy ?? yc, r: p.node.r, gap: p.node.gap || 0, cut: p.node.cut || "arc" } : null;
  const cy = p.cy ?? (node ? node.cy : (T + B) / 2);   // crossbar centre defaults to the node's horizon

  const sub = [];
  const poly = pts => "M" + pts.map(([x, y]) => `${R(x)} ${R(y)}`).join("L") + "Z";

  if (node && node.gap > 0 && node.cut === "perp") {
    // diagonals end in a square cut, perpendicular to the stroke, (r + gap) short of the node centre,
    // the way graph edges stop short of a node's rim
    const L = Math.hypot(vx - a1, vyO - T), u = [(vx - a1) / L, (vyO - T) / L];
    const n = [u[1], -u[0]];                            // normal pointing up-right (towards the upper edge)
    const dc = node.r + node.gap, h = t / 2;
    // centre line of the left band passes through (a1 + hw/2, T) with direction u
    const k = ((node.cy - T) - 0) / u[1];               // param where the centre line reaches the node's y
    const cl = [a1 + hw / 2 + u[0] * k, T + u[1] * k];  // ~ (node.cx, node.cy) when node.cy = yc
    const C = [cl[0] - u[0] * dc, cl[1] - u[1] * dc];
    const Up = [C[0] + n[0] * h, C[1] + n[1] * h], Lp = [C[0] - n[0] * h, C[1] - n[1] * h];
    const mx = x => 2 * vx - x;
    sub.push(poly([[a1, B], [a1, T], [a1 + hw, T], Up, Lp, [a1 + w, yJ], [a1 + w, B]]));
    sub.push(poly([[mx(a1), B], [mx(a1 + w), B], [mx(a1 + w), yJ], [mx(Lp[0]), Lp[1]], [mx(Up[0]), Up[1]], [mx(a1 + hw), T], [mx(a1), T]]));
  } else if (node && node.gap > 0) {
    // trimmed diagonals: each half ends on the circle (node.r + gap)
    const rr = node.r + node.gap, c = [node.cx, node.cy];
    const dir = [vx - a1, vyO - T];                   // left band direction (down-right)
    // left band: lower edge through (a1,T), upper edge through (a1+hw,T)
    const tl = lineCircle([a1, T], dir, c, rr)[0];
    const tu = lineCircle([a1 + hw, T], dir, c, rr)[0];
    const Lp = [a1 + dir[0] * tl, T + dir[1] * tl];          // where the lower edge meets the circle
    const Up = [a1 + hw + dir[0] * tu, T + dir[1] * tu];     // where the upper edge meets the circle
    const arc = (from, to, sweep) => `A${R(rr)} ${R(rr)} 0 0 ${sweep} ${R(to[0])} ${R(to[1])}`;
    // stem 1 + left diagonal (clockwise in screen space)
    sub.push(`M${R(a1)} ${R(B)}L${R(a1)} ${R(T)}L${R(a1 + hw)} ${R(T)}L${R(Up[0])} ${R(Up[1])}` +
      arc(Up, Lp, 0) + `L${R(a1 + w)} ${R(yJ)}L${R(a1 + w)} ${R(B)}Z`);
    // mirrored: right diagonal + stem 2
    const mx = x => 2 * vx - x;
    sub.push(`M${R(mx(a1))} ${R(B)}L${R(mx(a1 + w))} ${R(B)}L${R(mx(a1 + w))} ${R(yJ)}L${R(mx(Lp[0]))} ${R(Lp[1])}` +
      arc(null, [mx(Up[0]), Up[1]], 0) + `L${R(mx(a1 + hw))} ${R(T)}L${R(mx(a1))} ${R(T)}Z`);
  } else {
    let pts = [[a1, B], [a1, T], [a1 + hw, T], [vx, vyI], [a2 + w - hw, T], [a2 + w, T], [a2 + w, B], [a2, B], [a2, yJ]];
    // with a node sitting on the vertex, cut the V's point flat at the node centre so it can never
    // peek out below the node at any size or rasterisation
    const flatV = p.flatV ?? (node ? node.cy : null);
    if (flatV != null && flatV < vyO && flatV > vyI) {
      const dx = (vyO - flatV) / m;
      pts.push([vx + dx, flatV], [vx - dx, flatV]);
    } else pts.push([vx, vyO]);
    pts.push([a1 + w, yJ], [a1 + w, B]);
    sub.push(poly(pts));
  }
  // H: crossbar (overlaps the stems slightly so the union is seamless) + stem 3, same winding
  sub.push(poly([[a2 + w * 0.5, cy - ch / 2], [a3 + w * 0.5, cy - ch / 2], [a3 + w * 0.5, cy + ch / 2], [a2 + w * 0.5, cy + ch / 2]]));
  sub.push(poly([[a3, T], [a3 + w, T], [a3 + w, B], [a3, B]]));
  return {
    d: sub.join(""), node,
    bounds: { x0: a1, y0: T, x1: a3 + w, y1: B },
    meta: { vx, vyO: R(vyO), vyI: R(vyI), yc: R(yc), hw: R(hw), slopeDeg: R(Math.atan(m) * 180 / Math.PI) },
  };
}

// ---------------------------------------------------------------- the shipped configurations (32-unit grid)
// master (any size >= 24 px): stems 3.2 / cap 24 = 0.133, about the stem weight of Space Grotesk 600
// at the lockup's cap height, so mark and name read as one family.
export const MASTER = { a1: 2, a2: 15.6, a3: 26.8, w: 3.2, T: 4, B: 28, ch: 3.0, t: 3.0, yc: 16, node: { r: 3.25 } };
// favicon (16 and 32 px): heavier optical size, every edge on even units of the 32 grid, so the
// stems, cap height, baseline and crossbar fall on whole pixels at 16 px AND 32 px
export const FAVICON = { a1: 2, a2: 16, a3: 26, w: 4, T: 4, B: 28, ch: 4, t: 4.0, yc: 16, node: { r: 3.8 } };
