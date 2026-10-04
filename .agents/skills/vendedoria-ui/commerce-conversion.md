# Buyer commerce: conversion and consistency

Use this reference when designing or auditing VendedorIA store templates and their buying journey. It complements the UI skill; it does not authorize publishing, changing merchant data or executing live payments.

## Product outcome

Help the buyer understand the offer, choose the right option, assess the full cost and complete the purchase with confidence. Reuse Selecta's funnel principles when improving Classic, while keeping independent visual identities. Implement deliberate improvements, then measure results; do not claim a conversion lift from appearance alone.

Start with `apps/store/AGENTS.md`, the affected pages, the shared store services and `packages/design-tokens/storefront.scss`. Inspect `apps/api/src/storefront/store-templates.ts` only when changing editable defaults or section schemas. Existing merchant content, saved order, hidden sections and explicit empty values remain authoritative.

## Funnel by surface

| Surface | Buyer decision | Structure and evidence |
| --- | --- | --- |
| Home | Is this for me? | Brand context, one offer headline, short supporting text, dominant catalog CTA, real product imagery, factual purchase reassurance, categories and curated products, useful explanation, objections/FAQ, repeat catalog CTA. |
| Catalog | Which option fits? | Search, meaningful category/type filters, visible counts, useful sort, consistent product cards showing name, relevant benefit, price, availability and destination. Preserve filters in the URL when supported. |
| Product | Should I buy this? | Gallery, name, actual variant price, short benefit statement, available options, quantity, dominant purchase action, secondary cart action, delivery/payment information, relevant specifications, usage, policies and complements when real. |
| Cart | Is my selection right? | Editable quantities, easy removal, variant details, subtotal, shipping explanation, visible checkout CTA, optional complements away from the dominant action, recovery from unavailable items. |
| Checkout | Can I finish confidently? | Contact, conditional delivery, optional coupon, exact summary, consent and working payment controls on one route; visible final amount and retry feedback. No account requirement or intermediate continue/confirm step. |
| Confirmation | Did it work? | Authoritative approved/pending/rejected state, order reference, receipt access and fulfillment information appropriate to physical, service and digital items. Do not promise shipment when only payment is confirmed. |

These are decision functions, not a mandatory count of decorative sections. Omit unsupported proof rather than fabricating it. Do not repeat two equally prominent purchase actions in one decision area.

## Ethical persuasion

- Make the product benefit concrete and traceable to catalog facts. Never invent price, stock, outcomes, guarantees or shipping times.
- Reduce uncertainty at the decision point: variant, delivery cost, payment method and policy links.
- Display a discount or crossed-out price only when the reference is greater than the actual price and applies to the displayed option. Different variant prices need explicit context.
- Scarcity must derive from current stock. A deadline must reflect a real reservation/promotion; explain its consequence. Never reset a decorative timer to pressure the buyer.
- Testimonials require actual merchant-supplied content. Shipped blocks contain no sample customer quotes, fictional names or editor instructions.
- Offer at most one relevant optional complement at checkout. Never preselect it or claim free additional delivery without verified pricing. Recalculate the summary before payment.
- Paid state comes from the server/provider. Pending payments show a clear verification action and discourage another charge while verification continues.
- Assistance links appear only when a destination is configured. Avoid guarantees of human response from an AI channel.

## Production Spanish and actions

Use natural commercial Spanish for Peru and Latin America, addressing the buyer as tú. Keep identifiers and comments in English. Preserve merchant-written texts unless the task explicitly authorizes changing them.

| Intent | Default label |
| --- | --- |
| Discover | Explorar catálogo / Ver catálogo |
| Evaluate | Ver detalle / Elegir opciones |
| Immediate purchase | Comprar ahora |
| Service booking | Reservar ahora, only when the action creates a reservation |
| Add an item | Agregar al carrito |
| Open checkout from cart | Finalizar compra |
| Charge | Pagar [importe] / Pagar [importe] con Yape |
| Assisted order | Enviar pedido por WhatsApp |
| Recover | Reintentar / Modificar datos del pedido |

Avoid “checkout”, “order bump”, “stock hash”, “API”, “simulador” and development guidance in normal buyer flows. Development-only purchase environments still need a truthful notice that no money will be charged. Never hide that distinction. Errors explain what the buyer can do, next to the affected control.

## Visual system

- Use the shared `--store-type-*`, `--store-leading-*`, `--store-section-space`, `--store-reading-width` tokens. Templates keep their font families, brand colors and image treatment. Extend tokens when needed; do not scatter arbitrary values through pages.
- Hero is the strongest title; page title is next; section headings, product names, prices, body and captions have stable roles across home, catalog, product, cart, checkout, order and legal navigation.
- Default body and input text is 1rem. Helper text is at least the caption token. Keep legal navigation and consent readable; do not shrink them to make checkout look short.
- Constrain prose width and use comfortable body line height. Prices use tabular numerals; avoid splitting currency and amount.
- Use one consistent spacing rhythm: larger separation between decision areas, medium gaps between related groups, smaller label/control/error gaps. Long names, multi-line buttons and merchant copy must fit without truncating essential information.
- Product photography remains legible and undistorted. Contain pack shots; crop atmospheric images only where the subject remains clear. Reserve image dimensions and prioritize only above-the-fold assets.
- Desktop checkout places the summary beside the form. On mobile, place a concise summary before the form, or a keyboard-accessible expandable summary that exposes the total without hiding consent or payment. Avoid an oversized sticky summary.
- All purchase controls meet `--ds-touch-target`, with visible focus and real button/link semantics. Use toggle groups with `aria-pressed` unless implementing complete tab keyboard behavior.
- Respect reduced motion. Floating help and mobile purchase bars must not obscure payment, error messages, policy links or safe areas.

## Checkout implementation boundaries

Both templates use `components/checkout-payment.component.*`, which reuses the order payment engine. Existing `/pedido/:id` capability-token links remain valid for receipts and resumed payments.

Show working card/Yape choices on the checkout itself. The final payment action validates contact, delivery and consent, reserves on the server, compares the displayed amount with the authoritative order total and then submits payment. If the total changes, show the new breakdown and require another explicit payment action. Never charge a changed amount silently.

Retain the same checkout key while retrying a reservation. Keep payment tokenization in the provider SDK, order capability validation and server idempotency. Do not persist card data or Yape approval codes. Prevent overlapping submission, cancel provider UI on navigation, and ignore obsolete async results.

After a reservation, prevent editing data that would disagree with the reserved order. An explicit modify action may cancel an unpaid reservation, confirm cancellation, release the key and unlock the form. A processing/review payment must not be cancelled or restarted through this action. Clear the cart only after approval; the receipt is the post-purchase destination, never an additional checkout step.

Physical orders require configured delivery and any required rate acknowledgement. Service/digital-only orders skip shipping. Mixed orders collect delivery only for physical lines. Service preferences are not confirmed appointments; digital access remains unavailable until payment is approved.

## Acceptance evidence

Preserve useful visual section numbering in Selecta's single-page checkout; numbering is orientation, not a multi-page stepper. Align the page title, section headings, field labels and payment content to one reading edge. Keep recommendation photos visible on mobile. Group legal and applicable shipping-rate acknowledgement into one explicit, unchecked consent when their acceptance shares the same purchase action; reset it if the delivery district/mode/rate changes. Never acknowledge a rate silently.

Use the shared `ds-select` enhancement for single-select fields across console and store. Desktop uses the branded keyboard-accessible combobox/listbox; mobile (up to 760 CSS px) uses the native selector. Keep the native Angular value accessor, disabled fieldsets, dynamic options, accessible names/errors and native fallback for unsupported browsers. Verify arrows have breathing room, dependent selectors update, keyboard navigation selects correctly and popovers do not clip or close from internal scrolling.

Inspect computed styles and screenshots after changes: CSS cascade layers, sticky positioning and breakpoint display changes can defeat token overrides. Check adjacent control heights and the gap immediately before the final purchase action. Do not remove established visual features merely to standardize templates.

For each template, verify the home, catalog, product, cart, checkout, receipt and unavailable states at 360/390, 768 and 1440 CSS pixels. Include long names and multi-line editable text. Check no horizontal overflow, readable hierarchy, consistent grouping, operable focus and unblocked mobile actions. Record actual observed pages and widths; a build is not visual evidence.

Exercise the narrowest relevant scenarios:

- Buy an available product with/without variants; verify selection and quantity reach checkout.
- Empty/unavailable selection, delivery absent, pickup and courier delivery, failed district/rate load and recovery.
- Physical, service, digital and mixed selections; no shipping charged where nothing ships.
- Valid/invalid coupon, optional complement, changed server amount and explicit reconfirmation.
- Missing contact, consent and acknowledgement: inline errors and focus recovery; no charge.
- Double click, rejected payment retry, pending/review state, expired reservation, SDK failure/retry and navigation cleanup.
- Approved payment: receipt and cart clearing; existing order links still work.

Use controlled local fixtures or the isolated test environment for destructive/payment scenarios. Never weaken CSP, preview/host validation or production guards to facilitate verification. Build affected apps and run relevant existing tests. Report any live-provider or infrastructure verification still unavailable.

Use the existing consent-aware checkout/purchase analytics for measurement. Proposed funnel improvements are hypotheses; compare completion rate and abandonment by device/template after adequate traffic, without inventing numbers or collecting new PII.
