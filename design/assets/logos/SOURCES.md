# Company logos: sources

Where every company logo on mohamedhatem.dev comes from, and exactly what was done to it. Retrieved 2026-10-10.
Rule (DESIGN.md 9): official artwork only, never redrawn. Tidying (tight viewBox, removing ids, editor data and
width/height, cropping transparent margins) is allowed; any other change is listed below.

Files in `brand/src/` are the official files as downloaded and sanitised (no scripts, event handlers, external
references or embedded images). `design/scripts/brand/brand-logos.mjs` builds the "Shipped at" row (`brand/`,
`brand/brand.json`) and the symbol tiles (`tiles/`) from them. Contrast figures are against the page background:
light `#FBF8F3`, dark `#0C151D` (the default theme).

## "Shipped at" row (home page)

| Company | Light page | Dark page (default) | Source |
| --- | --- | --- | --- |
| Globant | `globant.svg`: black wordmark, `#BFD732` chevron | `globant-dark.svg`: the same vector with only the wordmark set to white, as on Globant's own reversed logo (published only as small rasters: [footer PNG](https://statics.globant.com/production/public/2020-04/globant-light-bg-color%402x%20%282%29.png), [white PNG](https://stayrelevant.globant.com/wp-content/uploads/2022/03/globant_logo_white.png)); wordmark 18.9:1, chevron 11.4:1 | [logo-globant.svg](https://stayrelevant.globant.com/wp-content/uploads/2022/03/logo-globant.svg), the header logo of Globant's [stayrelevant.globant.com](https://stayrelevant.globant.com/en/) (globant.com refuses automated requests; investors.globant.com serves the same artwork) |
| Wakeb Data | `wakeb.svg`: Wakeb's full-colour logo (navy `#11044C`, purple `#90218A`, cyan `#29ABE2`) | `wakeb-dark.svg`: Wakeb's official reversed logo (white and cyan), 7.0:1 at its lowest | Light: Wakeb's own [full-colour SVG](https://web.archive.org/web/20200125235712id_/http://wakeb.tech:80/assets/images/1577272275wakeb-logo.svg) as served on [wakeb.tech](https://web.archive.org/web/20200125235712/http://wakeb.tech/) (archived; today's site is dark and publishes only the reversed logo). Dark: [wakeb_logo.svg](https://wakeb.tech/backend/icons/wakeb_logo.svg) from [wakeb.tech](https://wakeb.tech/). The two are slightly different drawings (aspect 4.42 and 3.92), sized by height. |
| ArabsStock | `arabsstock.svg`: mint `#07EA8D` "ARABS", navy "STOCK" | `arabsstock-dark.svg`: ArabsStock's official reversed logo (its site footer), 11.5:1 at its lowest | [logo_en.svg](https://arabsstock.com/assets/images/logo/logo_en.svg) and [white_logo_en.svg](https://arabsstock.com/assets/images/logo/white_logo_en.svg), [arabsstock.com](https://arabsstock.com/en). A no-op clip path was removed. |
| Empoweromics | `empoweromics.png` (one file for both pages: blue 5.8:1 / 3.0:1, green 2.4:1 / 7.2:1) | same | No official vector exists, and the official lockup is only a 45 px raster ([logo_transparent.png](https://web.archive.org/web/20220508162444id_/https://empoweromics.com/logo_transparent.png), archived). The row rebuilds that lockup from Empoweromics' two official high-resolution parts, [homelogo.png](https://empoweromics.com/go/assets/homelogo.png) (symbol, 216 x 225) and [logo_text.png](https://empoweromics.com/go/assets/logo_text.png) (wordmark, 660 x 142), at the sizes and positions the lockup gives them. Pixels unchanged. |
| Tabaqat | `tabaqat.png`: the official bilingual logo | `tabaqat-dark.png`: no reversed variant exists, so only the parts under 3:1 on the dark page (the black Arabic wordmark and rules, `#085868` and `#880808` letters) are rendered `#ECF1F4`; the teal, orange and red accents keep their colours | [footerLogo.png](https://tabaqat.net/static/footerLogo.png) (1204 x 540 after cropping its transparent margin), [tabaqat.net](https://tabaqat.net/). Identity: tabaqat.net describes a spatial-data and GIS company in Riyadh and links to [linkedin.com/company/tabaqat-inc](https://www.linkedin.com/company/tabaqat-inc/); tabaqat.com is unrelated. |
| MDP (Misria Digital Payments) | `mdp.svg`: the official blue `#004ED8` symbol, 6.4:1 | `mdp-dark.svg`: the official all-white symbol (the blue is only 2.7:1 on the dark page), 18.4:1 | The header SVG of [modupay.com](https://www.modupay.com:8443/home) ([chunk-C3GRW7RH.js](https://www.modupay.com:8443/chunk-C3GRW7RH.js)), which holds the lockup in full colour, reversed and all white. MDP has since become Modupay (mdp-eg.com redirects to modupay.com); its symbol is the same as the MDP logo on LinkedIn. The site shows the symbol with the initials "MDP" (the name the site and CV use), not the "modupay" wordmark. |

Accent colours below 3:1 on the light page are left as they are (they are the brands' colours, and each logo's dark
parts carry it): Globant's chevron 1.5:1, ArabsStock's "ARABS" 1.5:1, Wakeb's cyan 2.5:1, Empoweromics' green 2.4:1,
Tabaqat's light teal and orange 2.1 to 2.8:1. On the dark page, the default, every part is 3.0:1 or more.

## Symbol tiles (work cards, experience trace)

Built by `brand-logos.mjs` on a white tile in the design's tile shape (22 % radius, inner hairline), 96 and 160 px:

| Tile | Artwork | Source |
| --- | --- | --- |
| `wakeb` | The W symbol of Wakeb's full-colour logo (the Arabic and Latin wordmark groups removed; path data untouched). Wakeb's own favicon is this mark alone. | The Wakeb SVG above |
| `empoweromics` | The house symbol | [homelogo.png](https://empoweromics.com/go/assets/homelogo.png) |
| `tabaqat` | Tabaqat's app icon (its map mark) | [apple-touch-icon.png](https://tabaqat.net/static/apple-touch-icon.png) |
| `logic-controls` | The Logic Controls mark (the client's own artwork, light-background version) | `src/assets/brand/mark.svg` in [logic-controls-website](https://github.com/mhatem5351/logic-controls-website), the site of [logic-controls.com](https://logic-controls.com) |

The other tiles (Globant, ArabsStock, MDP, AestheticsPro, the universities, AWS) are the official LinkedIn logos
from `_inputs/logos/`, built by `design/scripts/brand/logos.mjs`; MTC and Umm Al-Qura use monograms (see
`_inputs/SOURCES.md`).
