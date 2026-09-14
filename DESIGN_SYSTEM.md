# Ruvora design system

Ruvora uses a warm, cinematic identity: obsidian space, ivory type, champagne metal and internally illuminated amber-glass sculptures. The public experience feels like a commissioned campaign. Authenticated surfaces keep the same materials while reducing visual intensity for work. Real imagery provides the identity; CSS composes it, and motion is an optional enhancement.

## Source of truth

- `src/app/globals.css`: shared tokens, components, desktop composition and responsive rules.
- `src/components/ui.tsx`: brand, navigation, buttons, canonical orb, status, notice, loading and footer primitives.
- `src/components/landing.tsx`: public scroll narrative and illustrative profile preview.
- `src/components/public-pages.tsx`: real public profiles, event index/detail and legal pages.
- `src/components/auth.tsx`, `workspace-ui.tsx`, `dashboard.tsx`, `campaigns.tsx`, `admin.tsx`: authenticated forms, navigation and role-specific workflows.
- `src/i18n/messages.ts`: English and French interface copy. User-authored names and descriptions remain their original content.

Read `VISUAL_ASSET_MANIFEST.md` and `docs/ARTWORK-PROVENANCE.md` before changing any canonical artwork. The generation tool did not expose a verified model-version selector; do not label the assets as a confirmed specific image-model version.

## Color and material tokens

| CSS token          | Value                   | Use                                 |
| ------------------ | ----------------------- | ----------------------------------- |
| `--bg`             | `#0b0a09`               | Obsidian canvas                     |
| `--surface`        | `#141210`               | Quiet product surfaces              |
| `--surface-raised` | `#1b1814`               | Raised cards and controls           |
| `--ivory`          | `#f4f0e8`               | Primary text                        |
| `--muted`          | `#a49e94`               | Supporting copy                     |
| `--faint`          | `#777168`               | Decorative subdued details          |
| `--amber`          | `#edbd89`               | Primary CTA, focus and warm accents |
| `--line`           | `rgba(240,220,193,.13)` | Subtle structural borders           |
| `--green`          | `#a2b998`               | Successful/validated states         |
| `--red`            | `#e6a395`               | Rejection and error states          |
| `--radius`         | `16px`                  | Shared medium curvature reference   |

Local warm gradients complement the imagery. They do not replace canonical sculpture assets. Cards usually have one subtle border and a restrained two-tone fill; full glass treatment is reserved for floating public-profile accents and navigation. Avoid cool neon, cryptocurrency coins, casino motifs, generic particle fields and unrelated stock imagery.

## Typography and readable hierarchy

The sans-serif stack is Arial/Helvetica/system sans. Georgia supplies the italic second line of the hero and selected brand detail. No external font request is required.

| Role                              | Desktop                           | Mobile / compact                                 |
| --------------------------------- | --------------------------------- | ------------------------------------------------ |
| Homepage hero                     | Approximately 68–100px responsive | 48px at small-phone width, scaling with viewport |
| Public section headings           | Approximately 43–72px             | Approximately 38–58px by composition             |
| Authenticated page title          | Approximately 36–38px             | Approximately 29–32px                            |
| Public/hero body                  | 16px                              | 16px                                             |
| Product body and primary controls | 14px                              | 14px                                             |
| Supporting metadata/disclaimers   | Target baseline 12px              | Target baseline 12px                             |
| Public-profile biography          | 15px                              | 15px                                             |
| Numeric metrics                   | Approximately 29–32px             | Approximately 27–29px                            |

The final readability acceptance rules are explicitly grouped near the end of the stylesheet. Preserve their larger supporting text when refactoring the earlier composition rules. Small decorative marks and the registered-mark symbol are not body-copy precedents. Confirm computed text sizes after changing specificity, breakpoints or localization; declarations alone do not prove rendered accessibility.

Heading letter spacing is compact, usually around -0.035em to -0.065em. Body text uses generous line height, normally 1.7–1.95. Multi-line narrative headings preserve intentional line breaks. Exact financial values use tabular numerals. Money and RU use separate lossless formatters in `src/lib/api.ts`: money always retains two cent digits; RU shows up to six micro-unit decimals without inventing a currency symbol or exchange rate.

## Composition and spacing

The desktop public wrapper has a maximum width of 1256px, with responsive outer margins. The public header is 94px on wide screens and 80px on phones. Main narrative sections use approximately 80–125px vertical space. The desktop flagship hero is approximately 865px high, growing for large screens. Content starts in the left text-safe region, while the artwork dominates the right.

The story deliberately varies structure: monumental hero, social-network strip, split Ruvora Link reveal, editorial persona columns, a wide artwork-led event moment, four economic explanations and a centered final invitation. Do not convert the entire page to repetitive interchangeable card grids.

Desktop product navigation uses a fixed left sidebar, with a separate top bar and a restrained content area. The four Money/RU/XP/Event Points metrics remain separate. At narrower widths they become two columns; tables scroll within their own container. The sidebar becomes an explicitly toggled panel below the mobile top bar.

## Canonical imagery

| Asset             | Actual source                                         | Placement                                                             |
| ----------------- | ----------------------------------------------------- | --------------------------------------------------------------------- |
| Flagship          | `public/assets/hero/ruvora-flagship.webp`, 1672 × 941 | Desktop homepage hero                                                 |
| Signature orb     | `public/assets/orbs/ruvora-orb.webp`, 1254 × 1254     | Mobile hero, profile identity, auth, creator and dashboard atmosphere |
| Event composition | `public/assets/events/ruvora-event.webp`, 1672 × 941  | Event story, discovery cards and event detail                         |
| Home social share | `public/assets/share/ruvora-home.webp`, 1200 × 630    | Open Graph/social preview                                             |

The square orb is opaque with near-black margins. `mix-blend-mode: screen` integrates its background into dark surfaces; it is not a transparent PNG. It depicts champagne-metal ribbons, ribbed smoked amber glass and a copper-lit core. Do not replace it with a procedural sphere. Source masters and optimized responsive variants are listed in the asset manifest.

The desktop hero uses full-cover imagery plus a restrained left/bottom contrast gradient. The mobile hero switches to the standalone square orb, displayed at approximately 640px inside an intentionally clipped hero composition. Expanded mobile text requires a taller hero; do not place unreadable microcopy over the luminous core to shorten the page. Public-profile covers and dashboard atmosphere reuse the same family at smaller scales. Event rules and long tables stay outside the event artwork.

Use Next Image sizing appropriately and retain image aspect ratios. Source dimensions are finite; no 4K sharpness or measured performance score is implied. Empty alt text is appropriate for decorative instances; any informational image requires meaningful localized alternative text.

## Components and interaction

Primary buttons have warm amber fill and dark text; secondary buttons have restrained dark fill with a warm border. Dangerous review actions use a separate warm red-brown treatment. Primary touch controls aim for at least 44px height. On small phones the header CTA wraps into two readable lines while preserving language and menu controls.

Public profiles use a vertically centered identity card, canonical cover artwork, clearly disclosed audience provenance, generous link buttons, event discovery, referral CTA and share control. The tilted homepage card is explicitly labelled illustrative. Real production/profile data is not invented to fill the design.

Statuses use text as well as color and a small dot. Error/success notices carry appropriate alert/status semantics. Loading states are visible and text-labelled. Empty states explain absence instead of implying fictional activity. Development economic data remains visibly marked on authenticated surfaces and seeded public records.

## Accessibility and motion

Keep semantic page landmarks, a skip link, visible keyboard focus, labelled form inputs, native select/checkbox controls, clear errors and locale-aware copy. Metadata still needs readable contrast. Low-opacity text is decorative only; do not use it for information a participant needs to make an economic decision.

Hover translation and image zoom are restrained. Loading spinners are functional. There is no requirement for animation to make the composition look complete. `prefers-reduced-motion` disables smooth scrolling and reduces transitions/animations; static artwork remains fully visible.

The source contains responsive tiers around 1600, 1200, 1100, 1024, 900, 760 and 400px. Test both EN and FR, whose label lengths differ. Validate at least 360px, 390px, tablet, laptop and wide desktop. Check the page viewport and nested tables independently for overflow.

## Verification status and continued work

During this implementation, the economic/design agent inspected a captured mobile homepage screenshot and identified undersized metadata. The subsequent readability pass increases the text/control sizes documented above while retaining the artwork. The initially supplied profile screenshot displayed a not-found state; it was not evidence of a successful profile layout. Live browser acceptance and final screenshots are owned by the main QA pass and reported in `RELEASE_REPORT.md`; this document does not claim those checks were executed by its author.

Before final visual sign-off, inspect the actual homepage, profile, user, creator, advertiser, event and admin routes on mobile and desktop. Verify loaded data, typography, clipping, long French labels, keyboard operation, reduced motion and browser console/server errors. Do not invent WCAG conformance or performance measurements. The current stylesheet has explicit acceptance overrides after initial layout definitions; a future refactor should consolidate them with visual regression coverage rather than dropping the refinements.
Subsequent local Playwright DOM checks found and fixed one decorative pseudo-element whose negative horizontal inset expanded the document. After its correction, document and body widths exactly matched 360, 430 and 1024px. A seeded-user sidebar check at 390px confirmed the closed panel was fully offscreen (right edge -12.75px) after desktop-to-mobile resizing and after an open/close cycle, while document width stayed 390px. Computed-text auditing found no under-12px ordinary text in the mobile homepage/profile; it caught a more-specific 7px dashboard eyebrow selector, now explicitly overridden to 12px. These targeted checks supplement, rather than replace, the main acceptance report.
