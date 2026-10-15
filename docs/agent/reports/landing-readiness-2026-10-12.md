# Landing comercial — 12 de octubre de 2026

Veredicto: GO con condiciones para la landing. Implementación y compilación de producción verificadas. La aceptación visual final y el smoke posterior al despliegue quedan pendientes. Esta evaluación comprende la landing y sus componentes compartidos; no certifica la preparación de los servicios del sistema completo.

## Entrega

- Hero con identidad de VendedorIA, una propuesta breve y un CTA de prueba de 14 días.
- Ejemplo interactivo: recomendación, pago confirmado y atención humana. Productos e importes identificados como ilustrativos; sin botones que simulen cobros reales.
- Presentación de la tienda con una plantilla existente, beneficios, pasos de configuración, integraciones, cuatro planes, FAQ y cierre comercial.
- Enlaces nativos con estilos compartidos (`a[dsLink]`), botones de demo con `aria-pressed`, FAQ con `ds-disclosure`, menú móvil nativo y retorno de foco con Escape.
- Tokens de marketing centralizados y estilos de botones compartidos. Sin nuevas dependencias.
- Metadata prerenderizada: título, descripción, canonical, Open Graph, Twitter y SoftwareApplication con las mismas ofertas mostradas en los planes. Hidratación sin duplicados y limpieza al navegar a condiciones.
- Robots y sitemap para `https://marrso.com`, el origen comercial documentado en `docs/DEPLOY.md`. Las rutas de autenticación, consola, invitaciones, pagos y API se excluyen del rastreo.

## Textos comerciales

| Texto anterior | Cambio y motivo |
| --- | --- |
| Cuota fija de 1 000 respuestas gratis de WhatsApp | Tarifas de Meta según proveedor, sin publicar una cuota externa desactualizada. |
| Elegir un plan con un enlace que siempre abre registro | Crear mi cuenta; todos los registros comienzan con la prueba de Crece. |
| Una persona nunca vuelve a contar como chat | Una conversación nueva por cliente y canal; los mensajes posteriores no vuelven a contar. |
| Promesa absoluta de que la IA nunca inventa | Consulta del catálogo y prueba de respuestas antes de activarlo. |
| Métodos de pago y cobros sin condiciones | Cuenta de Mercado Pago, métodos disponibles y tarifas del proveedor. |
| Prueba sin detalle suficiente | 14 días, hasta 100 chats, 100 textos y 10 imágenes con IA; sin tarjeta ni cobro automático. |

Scanner de marketing: cuatro coincidencias high, todas por «dominio». Se mantienen porque describen una dirección web personalizada y su compra; no son referencias al dominio interno del código. Cero coincidencias high sin justificación. Revisión manual de hero, planes, FAQ, enlaces, condiciones y metadata realizada.

## Verificación

| Comprobación | Resultado |
| --- | --- |
| `npm run build:web` | Aprobado; 13 rutas prerenderizadas y sin advertencias de presupuesto de la landing. |
| `npm run build:store` | Aprobado; advertencia de presupuesto inicial: 415,16 kB, límite de aviso 400 kB. |
| `npm run test -w @vendedoria/web -- --watch=false` | 207 pruebas aprobadas, 39 archivos. |
| Regresiones específicas | Demo, canonical/schema durante hidratación, enlaces nativos, navegación móvil y Escape. |
| Navegador integrado | CTA abre el registro; condiciones abren su ruta; demo y FAQ funcionan con teclado. No se creó una cuenta. |
| Responsive por DOM | Sin desbordes en los anchos de contenido observados: 324, 398, 801, 1345 y 1686 px; también se verificaron anchos menores durante el ajuste. |
| Recursos | Fuentes cargadas; imagen de producto de 320 px y vista de plantilla de 720 px cargadas. |
| SEO prerender y navegador | Un canonical, un schema; precios 29/79/199/549 en PEN; cero botones anidados en enlaces; dos fuentes precargadas. |
| Integridad de diff | `git diff --check` aprobado para los archivos afectados. |

Las capturas de la nueva landing fallaron con «Unable to capture screenshot» en el navegador integrado, aun cuando la página y las interacciones eran accesibles. No se declara aceptación visual ni conformidad WCAG completa a partir del DOM o de la compilación. No se midieron Lighthouse ni Core Web Vitals.

## Antes de comercializar en producción

1. Completar la revisión visual de escritorio y móvil en un navegador visible.
2. Desplegar la compilación y comprobar recursos, canonical, robots y sitemap en el dominio real. Si cambia el origen comercial, actualizar `marketing-seo.ts`, robots y sitemap juntos.
3. Comprobar registro y activación con los servicios reales. Las cuentas de Meta, permisos, Mercado Pago y configuración de infraestructura requieren su propia validación de operación.

El trabajo previo de WhatsApp y demás archivos ajenos a la landing se conservó. No se realizaron despliegues, publicaciones ni commits.

## Recursos originales

Generados con la herramienta integrada de ImageGen; originales conservados en el directorio de imágenes de Codex. Conversión/optimización con Sharp instalado en el repositorio.

| Archivo de entrega | Uso | Tamaño |
| --- | --- | --- |
| `apps/web/public/marketing/urban-sneaker.webp` | Producto ilustrativo de la demo | 320 × 320, 4 642 bytes |
| `apps/web/public/marketing/social-card.png` | Vista previa para compartir la landing | 1200 × 630, 196 587 bytes |

Prompt final del producto:

> Use-case: product-mockup. Create one premium editorial ecommerce product photograph for a sample sales conversation on the VendedorIA SaaS landing page. Subject: a single elegant, unbranded low-top white leather sneaker with warm light-grey suede panels and an off-white rubber sole, minimalist original design, no brand symbols, no text, no watermark. Three-quarter side view, toe towards left, entire shoe visible. Photoreal leather and suede textures. Background: a seamless pale cool grey studio surface, soft natural shadow, large diffuse lighting, clean luxury retail art direction. Square composition, centered with generous negative space around the sneaker. This will appear as a small product thumbnail; make the silhouette clear and uncluttered. Output one image.

Prompt final de la imagen social:

> Use-case: ads-marketing. Create a polished wide landscape Open Graph social preview card for VendedorIA, a Peruvian AI sales SaaS. Aspect ratio 1200:630, with every text element comfortably inside safe margins so it can be resized to 1200x630. Pure typographic editorial design, no photography, no people, no brand logo icons, no watermark. Background very dark navy #0B0D12. Accent bright lime #C8F542. Off-white text. High-quality modern sans-serif typography close to Satoshi/Manrope, with precise readable Spanish text. Top left small wordmark exactly 'VendedorIA', with only 'IA' in lime. Main headline on left, large bold and three lines, exactly: 'Tu próximo' / 'vendedor' / 'es IA.' Make 'es IA.' lime. Below headline smaller copy exactly 'Del hola al pago.' At lower left small text exactly 'WhatsApp · Instagram · Tienda web'. Right side a simple elegant flat dark chat panel with just two chat bubbles, exact text 'Hola, ¿tienes mi talla?' and 'Sí. Te ayudo con tu pedido.' Small lime check circle below, with exact text 'Conversaciones que venden'. Maintain generous breathing room, crisp flat graphic design, subtle dark borders, no gradients or glows. No other text. This is a static share graphic, not a screenshot or functional interface.
