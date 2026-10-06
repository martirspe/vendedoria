# Auditoría del ecosistema de plantillas

Fecha: 2026-10-05. Alcance: registro, editor, persistencia y las tres presentaciones de VendedorIA + Tienda. El repositorio estaba limpio al iniciar. El stack Docker activo incluye API, consola, tienda, PostgreSQL, Redis y Qdrant. Las 24 pruebas iniciales de contenido, preview y host pasaron en Docker.

## 1. Estado inicial y flujo comprobado en código

`ensureStorefront` crea la configuración por tenant. `PATCH /store` valida rubro y escribe `template` directamente en la tienda activa. La consola mantiene una segunda lista de nombres, rubros e imágenes. No existe instalación de ZIP, marketplace ni ejecución de código del merchant.

`GET /store/editor` entrega `TEMPLATE_SECTIONS`, opciones de estilo, contenido y URL de iframe con token HMAC. El editor tiene autosave, selección in situ, imágenes propias, IA, secciones ordenables/ocultables, ocho bloques adicionales, FAQ, undo/redo y vista móvil. `PUT /store/editor/draft` normaliza datos y guarda `templateDraft`; preview firmado usa ese JSON. Publicar copia el borrador en una transacción, guarda la versión anterior y conserva veinte snapshots. La programación revisa tiendas cada minuto. Restaurar carga contenido anterior como borrador, pero no identifica qué plantilla produjo ese snapshot.

El storefront resuelve host → tenant en `server.ts`, limita el proxy y valida preview. `storefront-public.service.ts` obtiene catálogo/configuración autoritativos y mapea contratos públicos. `app.routes.ts` carga Selecta/Impulso por `canMatch`, con fallback Clásica; cada presentación conserva las mismas URLs. CartService, APIs, pagos, SEO, consentimiento y componentes de compra son compartidos. Impulso reutiliza páginas clásicas; Selecta tiene markup propio y extiende lógica de páginas compartidas. Sus CSS se cargan solo al seleccionar ese renderer y se acotan por clase del body.

Las demos `/_templates/{slug}` usan datos locales sin cuenta de merchant, credenciales, tracking ni pedidos. Los productos de ejemplo no se importan al catálogo real. Los textos propios se guardan en `sections`, el orden por plantilla en `layouts`, FAQ y branding en campos independientes del catálogo. Ausencia significa default; cadena vacía significa ocultar. Los campos homónimos de built-ins son compartidos entre presentaciones: es una decisión de compatibilidad existente, no aislamiento total de copy por theme.

No hay motor de páginas arbitrarias, árboles anidados libres, Liquid, JS subido por terceros, custom HTML/CSS, hooks ejecutables, blogs, cuentas de compradores, marketplace o gestor de licencias. Esos elementos no deben anunciarse como capacidades implementadas.

## 2. Hallazgos y causa raíz

| Prioridad | Hallazgo | Evidencia / causa | Acción |
| --- | --- | --- | --- |
| Alta | Cambiar plantilla afecta la tienda activa antes de preview | `StorefrontService.update` escribe `template` | Preparar selección en borrador; publicar identidad y contenido juntos |
| Alta | Actualizar código cambia todas las tiendas sin release instalado | Solo `template: String`; sin versión/contrato | Fijar release y conservar registros históricos; renderers con ABI estable |
| Alta | Restauración incompleta del diseño | `StorefrontVersion` guarda solo contenido | Snapshot con plantilla y release; legado se restaura en su presentación actual |
| Alta | Guardados concurrentes pueden sobrescribir cambios | `writeDraft` usa update sin revisión | Compare-and-swap por `updatedAt` y conflicto visible |
| Media | Registro/editor/runtime se pueden desalinear | API, selector, bloques y órdenes duplicados | Registro compartido validado y prueba de cobertura de renderers |
| Media | Futura versión de contenido se convierte silenciosamente a v1 | `sanitizeContent` ignora version | Rechazar versiones futuras al escribir y antes de publicar |
| Media | Recuperación depende de contenido, no de release | Fallback por rubro, sin diagnóstico | Estado de compatibilidad y fallback de renderer con identidad conservada |
| Media | Contraste sobre color de marca se calcula por umbral inexacto | `readableTextOn` usa luminancia > 0.4 | Comparar ratios WCAG para blanco y texto oscuro |
| Media | Personalización limitada y desigual | Logo, dos colores, font/corners; Selecta ofrece menos | Tokens semánticos compartidos y configuración segura por renderer |
| Baja | Duplicación de shells y páginas de presentación | Selecta markup propio, Impulso reutiliza lógica | Conservar identidad; aislar contrato visual; no reescribir funnels |

## 3. Matriz de decisión

| Componente | Conservar | Refactorizar / agregar | Reemplazar | Justificación |
| --- | --- | --- | --- | --- |
| Catálogo, precios, stock, carrito y pagos | Sí | Contrato de capacidades | No | Ya son core y autoritativos |
| SSR, host, preview, SEO y proxy | Sí | Resolver release efectivo | No | Ya aíslan tenants y rutas |
| Editor y bridge | Sí | API versionada, revisión de autosave, catálogo | No | Edición declarativa funcional |
| Secciones y bloques | Sí | Schema único compartido; defaults/presets | Registro duplicado | No hace falta árbol libre para resolver el caso actual |
| Presentaciones Angular | Sí | Adaptador de tokens/renderer versionado | No | Preservar UX y reutilizar comercio |
| JSON de contenido v1 | Sí | Validación de versión y migraciones explícitas | No | Mantener todas las personalizaciones actuales |
| Historial / publicación | Sí | Identidad, revisión y recuperación | No | Ampliar transacción existente |
| Catálogo de plantillas | Datos actuales | Manifest y releases inmutables | Listas manuales dispersas | Eliminar deriva API/consola/runtime |
| Demos | Sí | Importar copy/preset optativo a borrador | No | Mantener inventario de muestra fuera del negocio |

## 4. Benchmark de fuentes primarias

### WordPress

Los block themes organizan templates, parts y patterns; `theme.json` expresa estilos/settings sobre bloques del core. La jerarquía ofrece fallback de templates. Adoptamos el registro declarativo, tokens y fallback explícito, sin introducir PHP ni una jerarquía de archivos dinámica en SSR Angular. [Estructura](https://developer.wordpress.org/themes/core-concepts/theme-structure/), [theme.json](https://developer.wordpress.org/themes/global-settings-and-styles/), [jerarquía](https://developer.wordpress.org/themes/templates/template-hierarchy/).

Los child themes preservan overrides al actualizar el padre; eso también obliga a mantener las copias. Identidad, version y requisitos están declarados en metadata; enqueue separa el registro de assets de su carga. Adoptamos overrides del merchant separados del release, carga selectiva y metadata validada. Evitamos clones de lógica comercial y herencia de código arbitrario. [Child themes](https://developer.wordpress.org/themes/advanced-topics/child-themes/), [metadata](https://developer.wordpress.org/themes/classic-themes/basics/main-stylesheet-style-css/), [assets](https://developer.wordpress.org/themes/classic-themes/basics/including-css-javascript/).

Actions ejecutan callbacks en momentos definidos y filters transforman valores; `functions.php` puede implementar lógica como un plugin, por lo que la propia guía recomienda sacar del theme las funciones que deben sobrevivir al diseño. Customizer distingue options globales de theme mods, conecta controles a settings/defaults/sanitización y ofrece refresh/postMessage. Adoptamos esa propiedad explícita y transporte validado; evitamos callbacks capaces de alterar el comercio. [Hooks y responsabilidades](https://developer.wordpress.org/themes/core-concepts/custom-functionality/), [settings y transporte](https://developer.wordpress.org/themes/classic-themes/customize-api/customizer-objects/).

### Elementor

Los widgets tienen identidad, controles/settings y renderer; documentos JSON separan estructura, versión y contenido. Los estilos globales son referencias compartidas, mientras skins cambian presentación. Adoptamos schemas de controles, datos persistidos y renderer separado; evitamos serializar componentes Angular o copiar el estado del editor. [Widgets](https://developers.elementor.com/docs/widgets/), [documentos](https://developers.elementor.com/docs/data-structure/general-structure/), [estilos](https://developers.elementor.com/docs/editor-controls/global-style/), [skins](https://developers.elementor.com/docs/hooks/widget-skins/).

Los addons verifican versiones mínimas antes de cargar. Theme conditions elige dónde presentar templates. Para VendedorIA el control equivalente debe suceder antes de activar/publicar, y las rutas comerciales permanecen propiedad del core; no necesitamos un lenguaje libre de condiciones ni un ecosistema PHP. [Compatibilidad](https://developers.elementor.com/docs/addons/compatibility/), [condiciones](https://developers.elementor.com/docs/theme-conditions/).

Dynamic tags conectan controles con contenido obtenido por proveedores registrados. Adaptamos el principio a DTO públicos y componentes tipados que reciben datos autoritativos; v1 no evalúa expresiones libres en el manifest. Templates/documentos y estilos globales reutilizan estructura visual, mientras el renderer de plataforma resuelve la presentación del runtime. [Dynamic tags](https://developers.elementor.com/docs/dynamic-tags/).

### Shopify

Layouts, templates JSON, sections, blocks y snippets separan composición y markup Liquid. Settings distinguen definición de valor guardado; schema de section describe controles y presets. Adoptamos composición tipada, presets no destructivos y settings separados del catálogo de productos. Evitamos trasladar Liquid al proyecto: nuestros renderers compilados ya resuelven presentación. [Arquitectura](https://shopify.dev/docs/storefronts/themes/architecture), [settings](https://shopify.dev/docs/storefronts/themes/architecture/settings), [section schema](https://shopify.dev/docs/storefronts/themes/architecture/sections/section-schema).

Las actualizaciones se incorporan como drafts y trasladan personalizaciones del editor; cambios manuales de código requieren atención. App blocks permiten extensiones en slots expresamente soportados. Adoptamos actualizar como borrador, release notes y extensibilidad declarada; evitamos JS remoto y promesas de migración automática de código de terceros. [Actualizaciones](https://help.shopify.com/en/manual/online-store/themes/managing-themes/updating-themes), [app blocks](https://shopify.dev/docs/storefronts/themes/architecture/blocks/app-blocks).

### WooCommerce

Los templates de producto/carrito/pago pueden extenderse mediante hooks u overrides. Una copia puede conservar personalización y quedarse obsoleta frente al core; se declara soporte y se detecta su versión. Adoptamos capabilities y verificación de contrato visual. Preferimos componentes comerciales compartidos antes que duplicar checkout; no habilitamos hooks que alteren stock, impuestos o pagos desde el theme. [Templates, hooks, soporte y versiones](https://developer.woocommerce.com/docs/theming/theme-development/template-structure/).

Estas son adaptaciones al código existente, no una afirmación de equivalencia funcional con esas plataformas.

## 5. Arquitectura elegida y migración

Core: datos, seguridad, rutas comerciales, checkout, SEO, validación, catálogo de capacidades y renderer ABI. Editor: controles, composición, bridge API, borrador y publicación. Theme: manifest declarativo, renderer soportado, tokens, presets, assets locales y changelog. Merchant: catálogo, identidad, contenido, overrides y datos comerciales que sobreviven al cambio de theme.

Identidad estable = namespace + slug (`vendedoria/stride`); nombre público sigue siendo Impulso. Release SemVer es distinto de content schema v1 y editor/API ABI v1. No se inventan min/max de toda la app cuando el contrato de presentación es la dependencia real. La compatibilidad enumera manifest, ABI, capacidades, renderer, secciones, tokens, assets y ruta de migración. Versiones anteriores permanecen registradas. Los cambios visuales incompatibles exigen otro renderer ABI conservando el anterior.

Migración aditiva: fijar tiendas existentes a 1.0.0; conservar JSON, productos, pedidos, páginas legales, branding, fechas y drafts. Incorporar identidad/release al nuevo historial. Las versiones históricas sin identidad se identifican como legado; no se les inventa una plantilla original. Nuevas selecciones/actualizaciones pasan a draft. Publicar usa una transacción con revisión de fila; restaurar vuelve a draft para revisión.

Los paquetes de terceros son declarativos y se revisan durante integración, sin instalación de código a través del panel. Un preset sobre renderer existente debe funcionar sin tocar comercio/editor. Un renderer visual nuevo sí requiere implementación y revisión de plataforma, con pruebas de ABI; ocultar este requisito sería una promesa falsa de sandboxing.

## 6. Validación y límites

Automatizable: schema cerrado, SemVer, identidad única, ABIs, capabilities, secciones/props, defaults, tokens, URL/asset allowlist, migraciones, cobertura de rutas, límites de layout, publicación/rollback y aislamiento. A11y/performance requieren además render real, teclado, contraste, tamaño de imágenes y mediciones; un manifest por sí solo no demuestra WCAG o Core Web Vitals.

No se implementan wishlist, reviews verificadas, subscriptions, blog, multicurrency, cuentas, upsells arbitrarios ni marketplace solo para rellenar capabilities. Reseñas insertadas son contenido real del merchant, no opiniones generadas. Servicios/digital y recomendaciones deben presentar datos del core; urgencia/escasez solo desde stock/reserva real. El informe final distingue pruebas ejecutadas, inspección de código y pendientes operativos.
