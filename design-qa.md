**Findings**
- No remaining P0/P1/P2 findings.

**Open Questions**
- The mobile AI floating button slightly overlaps the transition between the hero and product series. This is a P3 polish item because it does not block navigation, text readability, or conversion controls.

**Implementation Checklist**
- Product poster hero is visible on desktop and mobile.
- Desktop first viewport now exposes product series cards immediately after the hero.
- Mobile 390px viewport keeps the hero readable, shows the next section, and keeps visible tap targets at practical sizes.
- Company information and journey modules are present on the Company page.
- WordPress `front-page.php` has the same visual rebuild and theme-safe asset URLs.

**Follow-up Polish**
- Consider shrinking or offsetting the mobile AI floating button when it crosses a section boundary.
- Replace remaining mixed product photography with fully matched product cutouts when final brand-approved product renders are available.

**QA Evidence**
- Source visual truth path: `/Users/x/.codex/generated_images/019f2e9a-f6b7-72e0-97ea-eeb76d1a64c1/call_HVUc4VLjwySBhoi7MUtRflZm.png`
- Implementation screenshot path: `/Users/x/Documents/Codex/2026-07-04/https-china-litian-pages-dev/outputs/litian-product-redesign-desktop-2026-07-22.png`
- Mobile screenshot path: `/Users/x/Documents/Codex/2026-07-04/https-china-litian-pages-dev/outputs/litian-product-redesign-mobile-390-2026-07-22.png`
- Optimized desktop screenshot path: `/Users/x/Documents/Codex/2026-07-04/https-china-litian-pages-dev/outputs/litian-product-redesign-desktop-optimized-2026-07-23.png`
- Optimized mobile screenshot path: `/Users/x/Documents/Codex/2026-07-04/https-china-litian-pages-dev/outputs/litian-product-redesign-mobile-optimized-390-2026-07-23.png`
- Full-view comparison evidence: `/Users/x/Documents/Codex/2026-07-04/https-china-litian-pages-dev/outputs/litian-product-redesign-qa-comparison-2026-07-22.png`
- Focused region comparison evidence: desktop hero plus product-series transition and mobile first viewport; focused screenshots above were sufficient because this rebuild is a single-page visual refactor rather than a multi-state app flow.

**Viewport And Dimensions**
- Source visual pixels: 1487 x 1058.
- Desktop implementation: 1280 x 720 CSS viewport, screenshot 1280 x 720, density normalization 1:1.
- Mobile implementation: 390 x 844 CSS viewport, screenshot 390 x 844, density normalization 1:1.
- State: home page, English language, cookie bar dismissed, local preview at `http://127.0.0.1:4189/`.

**Required Fidelity Surfaces**
- Fonts and typography: preserved the existing Litian serif display and sans UI pairing; reduced desktop hero and series heading scale so the first viewport is product-led instead of oversized.
- Spacing and layout rhythm: fixed the hero background layer containment and reduced the desktop series transition so product cards enter the first viewport.
- Colors and visual tokens: kept the navy, white, and terracotta brand system; CTAs and proof surfaces retain the existing contrast model.
- Image quality and asset fidelity: used a generated product-series hero bitmap sized for the slot; no CSS/SVG substitute was used for the visible product hero.
- Copy and content: product series, company information, and company journey copy are localized through the existing i18n map.

**Comparison History**
- Pass 1 finding: P2 desktop hero consumed the first viewport and product cards did not materially appear. Fix: compressed hero height and typography, removed duplicate hero microproof on desktop, and made the product grid immediate below the poster.
- Pass 1 finding: P2 hero image layer visually carried beyond the hero section. Fix: added `position: relative`, `isolation: isolate`, and product-section stacking containment.
- Pass 2 evidence: desktop metrics show `firstCard.y = 552` in a 720px viewport; mobile metrics show no horizontal overflow, no visible tap target below 40px, and 4 single-column product cards.
- Pass 3 optimization: generated desktop WebP and mobile WebP hero assets. Browser evidence shows desktop loads `litian-product-series-hero-20260722.webp`, mobile loads `litian-product-series-hero-20260722-mobile.webp`, mobile has no horizontal overflow, no visible tap target below 40px, and no console errors.
- Pass 3 mobile polish: moved the AI floating button to the mobile hero's upper-right area. Browser evidence shows AI button at 54 x 54 and `overlapsSeriesHeading = false`.

final result: passed
