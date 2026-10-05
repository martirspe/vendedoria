# Template demonstration assets

The console cards are captures of the actual storefront demos, not generated interface mockups. Original template typography, colors and layouts come from the real components. All demo data is bundled separately from tenant catalog data. Prices and products are examples; applying a template never imports them.

Media lives in `apps/store/public/template-demos/media/`; card captures live in `apps/web/public/template-previews/`.

Beauty photos reuse the existing Selecta seed assets from `apps/api/seed-data/selecta/images/set-icono-yanbal/` and `set-osadia-infinita-yanbal/`. They depict their original products and are used only in the demonstration.

Fashion photos were generated with the built-in image tool and re-encoded to WebP without visual edits. Prompts:

- `fashion-hero.webp`: “Use case: photorealistic-natural. Asset type: fashion ecommerce template demonstration hero photograph, landscape 1536x1024. A stylish adult Latin American woman walking casually in a sunlit modern concrete courtyard, wearing an ivory cotton overshirt, dark straight trousers and clean white low-top sneakers, holding a natural canvas tote bag. Full figure visible, subject on right half with architectural negative space left. Premium editorial photography with honest natural textures and subtle film grain, softly directional afternoon light. No brands, logos, text, lettering or watermark. This is a real-looking original photo, not a website mockup.”
- `sneakers.webp`: “Use case: product-mockup. Asset type: square ecommerce product photograph. One pair of unbranded minimalist white low-top canvas sneakers with beige rubber soles, three-quarter side view on warm light grey studio background. Both shoes fully in frame with generous breathing room. Real fabric weave, subtle natural shadows, premium crisp product photography. No logos, text, letters, watermark, decorative graphics or UI.”
- `tote.webp`: “Use case: product-mockup. Asset type: square ecommerce product photograph. One unbranded natural beige cotton canvas tote bag with two handles, standing upright, slight three-quarter view on warm light grey studio background. Entire bag fully in frame, clearly visible sewn fabric weave and realistic folds, subtle natural shadow, premium clean product photography. No logos, text, letters, watermark, decorative graphics or UI.”

Refresh card captures after material template changes: run the built store, open `/_templates/classic/`, `/_templates/selecta/`, and `/_templates/stride/` at 1440 × 1000, save their browser screenshots, then encode each complete screenshot as WebP. Preserve the surrounding page context and do not repaint the interface.
