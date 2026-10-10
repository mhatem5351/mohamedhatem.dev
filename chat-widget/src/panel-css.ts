/**
 * Panel styles (shadow DOM). Colours, fonts, radii and motion come from the site's design tokens through the
 * short aliases the loader defines on :host (see index.ts); every alias has the brand fallback, so the widget
 * also looks right on a page without design/tokens.css. Kept compact by hand: this string ships as-is.
 * Forced colors (Windows High Contrast): controls and boxes without a visible border carry a transparent one, which
 * the system paints, so they keep an edge there and look unchanged otherwise; focus rings use Highlight.
 */
export const PANEL_CSS = `
[hidden]{display:none!important}
.pn{box-sizing:border-box;position:fixed;z-index:var(--z);inset-block-end:calc(max(1rem,env(safe-area-inset-bottom)) + 4.5rem);inset-inline-end:max(1rem,env(safe-area-inset-right));width:min(25rem,calc(100vw - 2rem));height:min(42.5rem,max(18rem,calc(100dvh - var(--mh-chat-top,4.75rem) - max(1rem,env(safe-area-inset-bottom)) - 4.5rem)));display:flex;flex-direction:column;background:var(--bg);color:var(--ink);border:1px solid var(--line);border-radius:1.25rem;box-shadow:var(--sh);overflow:hidden;font:400 .9375rem/1.55 var(--font);visibility:hidden;opacity:0;transform:translateY(.75rem) scale(.98);transform-origin:bottom right;pointer-events:none;transition:opacity .18s var(--ease),transform .32s var(--ease),visibility 0s linear .32s}
:host([dir=rtl]) .pn{transform-origin:bottom left}
.pn[data-open]{visibility:visible;opacity:1;transform:none;pointer-events:auto;transition-delay:0s}
:host([data-modal]) .b{visibility:hidden}
@media (max-width:639.98px),(max-height:520px){.pn{inset:0;width:auto;height:auto;border:0;border-radius:0;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);transform:translateY(1.5rem)}}
.hd{--gx:0;display:flex;align-items:center;gap:.75rem;padding:.875rem .75rem;padding-inline-start:1rem;border-bottom:1px solid var(--line);background:radial-gradient(18rem 7rem at var(--gx) 0,var(--glow),transparent 70%),var(--bg)}
:host([dir=rtl]) .hd{--gx:100%}
.avw{position:relative;flex:none}
.av{display:grid;place-items:center;width:2.5rem;height:2.5rem;border-radius:50%;object-fit:cover;background:var(--inv);color:var(--oninv);font:600 .8125rem/1 var(--fontd);box-shadow:0 0 0 2px var(--bg),0 0 0 3.5px var(--tintl)}
.avw::after{content:"";position:absolute;inset-block-end:0;inset-inline-end:0;width:.625rem;height:.625rem;border-radius:50%;background:var(--teal);box-shadow:0 0 0 2px var(--bg)}
.hx{flex:1;min-width:0}
.ti{margin:0;font:600 1rem/1.3 var(--fontd);letter-spacing:-.01em;color:var(--ink)}
.di{margin:.125rem 0 0;font-size:.75rem;line-height:1.4;color:var(--mut)}
.pv{margin:.5rem 0 0;font-size:.75rem;line-height:1.45;color:var(--mut)}
.ib{flex:none;display:inline-grid;place-items:center;width:2.5rem;height:2.5rem;padding:0;border:1px solid transparent;border-radius:.75rem;background:none;color:var(--ink2);cursor:pointer;transition:.15s}
.ib:hover{background:var(--bg2);color:var(--ink)}
button,a,textarea,.log{-webkit-tap-highlight-color:transparent}
:focus-visible{outline:2px solid var(--focus);outline-offset:2px}
.off{margin:0;padding:.5rem 1rem;background:var(--warnt);color:var(--ink);font-size:.8125rem;border-bottom:1px solid var(--line)}
.log{flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain;padding:1.125rem 1rem;display:flex;flex-direction:column;gap:1rem;scrollbar-width:thin;scrollbar-color:var(--line2) transparent}
.log:focus-visible{outline-offset:-3px;border-radius:.5rem}
.msg{max-width:100%;min-width:0}
.u{align-self:flex-end;max-width:85%}
.ub{margin:0;padding:.625rem .875rem;border:1px solid transparent;border-radius:1.125rem;border-end-end-radius:.375rem;background:var(--tint);color:var(--ink);white-space:pre-wrap;overflow-wrap:anywhere}
.md{overflow-wrap:anywhere}
.md p{margin:0 0 .625rem}
.md>:last-child,.md li>:last-child{margin-bottom:0}
.md ul,.md ol{margin:0 0 .625rem;padding-inline-start:1.25rem}
.md li{margin:.25rem 0;padding-inline-start:.125rem}
.md li::marker{color:var(--acc)}
.md li>ul,.md li>ol{margin:.25rem 0 0}
.md strong{font-weight:600;color:var(--ink)}
.md a{color:var(--acc);text-decoration:underline;text-decoration-thickness:1px;text-underline-offset:.18em}
.md a:hover{text-decoration-thickness:2px}
.md code{font:.85em var(--mono);background:var(--bg2);padding:.1em .35em;border-radius:.375rem}
.md pre{margin:0 0 .625rem;padding:.75rem .875rem;background:var(--bg2);border:1px solid var(--line);border-radius:.75rem;overflow-x:auto;font-size:.8125rem;line-height:1.5;text-align:left}
.md pre code{background:none;padding:0;font-size:inherit}
.md hr{border:0;border-top:1px solid var(--line);margin:.75rem 0}
[lang=ar]{font-family:var(--fontar)}
.nw{white-space:nowrap}
.cursor{display:inline-block;width:.45em;height:1.05em;margin-inline-start:.15em;vertical-align:-.15em;border-radius:1px;background:var(--acc);animation:bl 1s steps(1) infinite}
@keyframes bl{50%{opacity:0}}
.th{display:flex;align-items:center;gap:.625rem;margin:0;color:var(--mut);font-size:.875rem}
.dots{display:inline-flex;gap:.25rem}
.dots i{width:.4375rem;height:.4375rem;border-radius:50%;background:var(--teal);animation:dt 1.2s ease-in-out infinite}
.dots i:nth-child(2){background:var(--saf);animation-delay:.15s}
.dots i:nth-child(3){background:var(--cor);animation-delay:.3s}
@keyframes dt{0%,80%,100%{transform:scale(.55);opacity:.45}40%{transform:none;opacity:1}}
.note{margin:.375rem 0 0;font-size:.75rem;color:var(--mut)}
.u .note{text-align:end}
.err{display:flex;flex-wrap:wrap;align-items:center;gap:.5rem .75rem;margin-top:.5rem;padding:.625rem .75rem;border:1px solid transparent;border-radius:.875rem;background:var(--dtint);color:var(--ink);font-size:.875rem}
.err p{margin:0;flex:1 1 12rem}
.rt,.cb{display:inline-flex;align-items:center;gap:.375rem;min-height:2rem;padding:0 .75rem;border:1px solid var(--line2);border-radius:999px;background:var(--bg);color:var(--ink);font:500 .8125rem/1 var(--font);cursor:pointer}
.rt:hover,.cb:hover{border-color:var(--lin)}
.rt:disabled{color:var(--mut);cursor:not-allowed}
.ic{flex:none}
.rt .ic,.cb .ic,.jump .ic{width:1rem;height:1rem}
.tl{display:flex;flex-direction:column;align-items:flex-start;gap:.5rem;margin-top:.625rem}
.card{align-self:stretch;padding:.875rem;border:1px solid var(--line);border-radius:1rem;background:var(--bg2)}
.ch{margin:0 0 .625rem;font:600 .875rem/1.3 var(--fontd);color:var(--ink)}
.acts{display:grid;grid-template-columns:repeat(auto-fit,minmax(6.25rem,1fr));gap:.5rem}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:.4375rem;min-height:2.5rem;padding:0 .625rem;white-space:nowrap;border:1px solid var(--line2);border-radius:.75rem;background:var(--bg);color:var(--ink);font-weight:500;font-size:.875rem;text-decoration:none;transition:.15s}
.btn:hover{border-color:var(--lin)}
.btn.pri{background:var(--accs);border-color:var(--accs);color:var(--onacc)}
.btn.pri:hover{background:var(--acch);border-color:var(--acch)}
.cr{display:flex;align-items:center;justify-content:space-between;gap:.5rem;margin-top:.625rem;padding-top:.625rem;border-top:1px solid var(--line);font-size:.8125rem}
.cr+.cr{margin-top:.375rem;padding-top:0;border:0}
.cr span[dir]{font-family:var(--mono);color:var(--ink2);overflow-wrap:anywhere}
.cb{min-height:1.75rem;padding:0 .625rem;font-size:.75rem}
.jump{display:inline-flex;align-items:center;gap:.375rem;min-height:2rem;padding:.25rem .875rem;border-radius:999px;background:var(--tint);border:1px solid var(--tintl);color:var(--acc);font-weight:500;font-size:.8125rem;text-decoration:none}
.jump:hover{border-color:var(--acc)}
:host([dir=rtl]) .fl{transform:scaleX(-1)}
.chips{display:flex;flex-wrap:wrap;gap:.5rem;margin-top:.125rem}
.chip{min-height:2.25rem;padding:.4375rem .875rem;border:1px solid var(--line2);border-radius:1.125rem;background:var(--bg);color:var(--ink2);font:500 .8125rem/1.35 var(--font);text-align:start;cursor:pointer;transition:.15s}
.chip:hover{border-color:var(--tintl);background:var(--tint);color:var(--acc)}
.vf{margin:0;padding:.5rem 1rem 0;font-size:.8125rem;color:var(--mut);text-align:center}
::slotted([slot=turnstile]){display:flex;justify-content:center;padding:0 .75rem}
.cp{display:flex;flex-wrap:wrap;align-items:flex-end;gap:0 .5rem;padding:.75rem;border-top:1px solid var(--line);background:var(--bg)}
.ln{flex:1 0 100%;margin:0;font-size:.8125rem;line-height:1.45}
.ln:not(:empty){margin-bottom:.5rem;padding:.5rem .75rem;border:1px solid transparent;border-radius:.75rem;background:var(--warnt)}
textarea{flex:1;min-width:0;min-height:2.75rem;max-height:9rem;margin:0;padding:.6875rem .875rem;resize:none;border:1px solid var(--lin);border-radius:.875rem;background:var(--bg);color:var(--ink);font:400 max(16px,.9375rem)/1.4 var(--font);box-sizing:border-box}
textarea::placeholder{color:var(--mut);opacity:1}
textarea:focus-visible{outline-offset:-1px;border-color:transparent}
.ct{align-self:center;padding:.125rem .375rem;border-radius:.375rem;color:var(--mut);font-size:.75rem}
.ct.over{background:var(--dtint);color:var(--ink);font-weight:600}
.go{flex:none;display:inline-grid;place-items:center;width:2.75rem;height:2.75rem;padding:0;border:1px solid transparent;border-radius:.875rem;background:var(--accs);color:var(--onacc);cursor:pointer;transition:.15s}
.go:hover{background:var(--acch)}
.go:disabled{background:var(--bg2);color:var(--mut);cursor:not-allowed}
.go.stop{background:var(--ink);color:var(--bg)}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
@media (forced-colors:active){:focus-visible{outline-color:Highlight}.cursor,.dots i{forced-color-adjust:none}}
@media (prefers-reduced-motion:reduce){.pn,.ib,.btn,.chip,.go{transition:none}.cursor,.dots i{animation:none}.pn{transform:none}}
`;
