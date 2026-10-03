# Copy audit — reference

Read when classifying hits or choosing a rewrite.

## What is not production copy

| Class | Signals | Why it fails |
| --- | --- | --- |
| Dev jargon | smoke, mock, stub, enum, DTO, adapter, endpoint, payload, dominio, roadmap, sprint, MVP | Written for the team, meaningless to merchants and buyers |
| Dev instructions | "Revisa la API", "reinicia el servidor", ".env", "Docker", "npm run", "Swagger", "consola del navegador" | Users cannot act on them; they also leak infrastructure details |
| Placeholders | lorem ipsum, foo/bar, John Doe, example.com, "Producto de prueba" | Looks unfinished |
| Local URLs | localhost, 127.0.0.1, ports | Broken links in production |
| Internal tone | "sin promesas falsas", "catálogo honesto", "waitlist interna", "fuera del smoke path" | Internal positioning notes shown to customers |
| Unfinished | "Próximamente" everywhere, "en construcción", "beta" without a real beta program | Erodes trust; use only deliberate teasers |
| English leaks | English API errors rendered as-is, English button labels, mixed "link/enlace" | Inconsistent language |

## Voice (VendedorIA)

- Spanish (Perú), tú, direct and calm. Short sentences. Verbs first on buttons ("Guardar cambios", "Conectar WhatsApp").
- Merchant console: operational and precise. Buyer store: warm, simple, no SaaS vocabulary (never "tenant", "agente", "pipeline" in the store).
- Money: "tu plan" (what the merchant pays VendedorIA) vs "pago del cliente" (what a buyer pays the store). Amounts with `S/` and two decimals.
- AI: the sales agent is "tu vendedor IA"; never imply a human answers unless an operator took over.

## Rewrite patterns

| Before (dev) | After (production) |
| --- | --- |
| No pudimos cargar el catálogo. Revisa la API e inténtalo de nuevo. | No pudimos cargar el catálogo. Revisa tu conexión e inténtalo de nuevo. |
| Pagos en modo mock | Pagos de prueba (sin cobros reales) — only if test mode can exist in production; otherwise hide the pill |
| Crear link de pago (Mercado Pago / mock) | Crear link de pago |
| Listo para el smoke: canal, catálogo, agente y cobro de prueba. | Todo listo para vender: canal, catálogo, vendedor IA y cobros. |
| Adapter Meta en roadmap. El enum ya existe en dominio. | Próximamente: atiende también tus mensajes de Instagram. |
| Únete a la waitlist interna · sin promesas falsas. | Te avisaremos cuando esté disponible. |
| Fuera del smoke path actual. | (remove the line) |
| Añade META_VERIFY_TOKEN al .env del API y reinicia. | La verificación del canal no está configurada. Contacta a soporte. (merchant-facing) — or keep technical only if the check is admin/dev-only and proven never shown to merchants |
| Simulate payment is only available in development | (English, dev-only endpoint) keep if unreachable in production; otherwise "Esta acción no está disponible." |

## Error message checklist

1. Says what happened in user terms.
2. Says what to do next (retry, edit a field, contact support).
3. No status codes, stack traces, provider names unless the user configured that provider (Mercado Pago in Cobros is fine).
4. Same message family across pages ("No pudimos …" / "No se pudo …": pick the one the surface already uses most).

## API messages that reach users

- Store: the store renders API messages for checkout/coupon conflicts (409/400). Those must be Spanish.
- Console: most pages map errors to their own Spanish copy; English `NotFoundException('Product not found')` is acceptable only when the client never displays it. Verify the mapper before translating.
- Validation errors from class-validator are English by default; the client must map them, never display raw arrays.

## Files that usually carry copy

- Console: `apps/web/src/app/features/**/*.page.{html,ts}`, `layout/console-shell.layout.*`, `core/api/*` (none should hold copy).
- Marketing/SEO: `features/marketing/**`, `app.routes.ts` titles, `src/index.html` meta.
- Store: `features/**`, `templates/**`, `layout/store-shell.layout.*`, `core/seo.service.ts`, `src/server.ts` (status pages), `templates/selecta/selecta-copy.ts` (defaults).
- API: `*.service.ts` exceptions, email templates and subjects, sales-agent fallback replies in `agent-runtime/` (buyer-facing WhatsApp text: must stay honest and never invent price, stock or shipping).
