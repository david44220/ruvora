# Ruvora visual asset manifest

The three selected raster originals define one canonical Ruvora energy-orb family: interlocking champagne-metal ribbons, ribbed smoked amber glass and a layered copper-lit core on obsidian. Reuse these assets and their delivery variants. Do not substitute procedural balls, unrelated AI imagery or generic stock art.

## Provenance

Generation tool: built-in `image_gen__imagegen`. The tool exposed no model selector, so a specific model version, including “GPT Image 2.5”, is **not verified and is not claimed**.

The flagship was generated first. The standalone orb and event composition used the flagship PNG as the reference image. All three generated originals were visually inspected. Full exact prompts and generation provenance are preserved in [docs/ARTWORK-PROVENANCE.md](docs/ARTWORK-PROVENANCE.md).

Canonical PNG masters are committed under `assets/masters`, outside public delivery and app source. The ignored `artwork-output` folder retains the initial working copies but is not the repository source of truth. The PNGs are exact copies of the generated originals. WebP encoding and explicit delivery crops use sharp; no shapes, lighting, colors, or object designs were artistically edited.

## Canonical assets

| Name          | Status and purpose                                                                                | Master                               | Full delivery file                        | Dimensions  | Encoded bytes |
| ------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------ | ----------------------------------------- | ----------- | ------------: |
| Flagship      | Canonical campaign composition; desktop homepage hero, storytelling/CTA and share source          | `assets/masters/ruvora-flagship.png` | `public/assets/hero/ruvora-flagship.webp` | 1672 × 941  |        185802 |
| Signature orb | Canonical standalone object; mobile hero, profiles, role dashboards and shared components         | `assets/masters/ruvora-orb.png`      | `public/assets/orbs/ruvora-orb.webp`      | 1254 × 1254 |        302368 |
| Event         | Canonical family composition on an ascending metallic ribbon; event landing/details and discovery | `assets/masters/ruvora-event.png`    | `public/assets/events/ruvora-event.webp`  | 1672 × 941  |        165532 |
| Home share    | Delivery derivative of flagship; homepage Open Graph/social preview                               | Same flagship master                 | `public/assets/share/ruvora-home.webp`    | 1200 × 630  |        107816 |

The same standalone orb supplies creator-economy, Ruvora Link, advertising, participation and dashboard atmospheric needs. These are deliberate reuse contexts, not claims that extra unrelated artworks were generated. Actual placement and browser acceptance are recorded in the final release report.

## Responsive variants

| Family   | File suffix                 | Dimensions | Encoded bytes |
| -------- | --------------------------- | ---------- | ------------: |
| Flagship | `ruvora-flagship-840.webp`  | 840 × 473  |         57416 |
| Flagship | `ruvora-flagship-1280.webp` | 1280 × 720 |        117592 |
| Orb      | `ruvora-orb-640.webp`       | 640 × 640  |         96738 |
| Orb      | `ruvora-orb-960.webp`       | 960 × 960  |        194996 |
| Event    | `ruvora-event-840.webp`     | 840 × 473  |         54008 |
| Event    | `ruvora-event-1280.webp`    | 1280 × 720 |        107420 |

Variants live beside their full delivery files. Use a matching `sizes`/`srcSet` or framework image optimization setup so mobile devices do not fetch unnecessary full-size imagery. These are genuine source dimensions, not 4K output claims; avoid magnifying a small derivative for a large display.

## Composition and crops

- Flagship: large sculpture occupies the right half. Text-safe space is strongest in the upper-left and left-middle. The lower-left satellite begins around 30% of image width, so avoid overlaying body copy there. Use the standalone orb for a tall mobile composition instead of aggressively cropping the flagship.
- Orb: square, fully framed, centered with near-black margin. Preserve the full silhouette where possible. It has an opaque near-black background, **not transparency**.
- Event: primary sculpture occupies center/right, with ascending movement. Text-safe space is strongest at top-left. The ribbon extends into the lower-left; keep long rules outside the artwork.
- Share card: a centered cover crop of the flagship to 1200×630. No text was added; canonical/share metadata supplies titles and descriptions.
- Give informative imagery a meaningful localized description; use empty alt for purely decorative instances. Keep text contrast independent from animated glows.

## Optimization and reproduction

Run `node scripts/optimize-assets.mjs` after installing dependencies. It reads only `assets/masters`, generates full-size quality-92 WebP files, downsizes the responsive variants without upscaling, and makes the explicit 1200×630 cover crop. It reports dimensions and file sizes. The app build consumes the committed delivery files and does not require regeneration.

Encoding strips incidental metadata from delivery files, so this manifest and prompt document preserve provenance. The original masters retain the generated file contents.

Metadata/dimensions were checked after encoding. Local image-view tools encountered the same Windows sandbox helper failure during the encoding pass; final encoded composition and responsive usage must be inspected through the application's browser acceptance pass rather than claimed from metadata alone.
