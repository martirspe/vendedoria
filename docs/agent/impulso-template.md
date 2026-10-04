# Plantilla Impulso

Plantilla `stride` para tiendas del rubro `moda`, integrada en VendedorIA. Toma la composición editorial de la referencia: portada de gran formato, selección de cuatro productos, dos paneles de inspiración, tres categorías, campaña de producto, dos paneles de colección y cierre de compra.

## Activación

1. En **Tienda web → Rubro y plantilla**, selecciona **Moda y accesorios** y **Impulso**.
2. Guarda los cambios y abre el editor visual para ajustar logo, colores, tipografía, textos e imágenes.
3. Revisa el catálogo y las opciones de entrega/pago de tu negocio; publica desde el flujo existente cuando el contenido esté listo.

El editor conserva la posición y visibilidad de las secciones. Un texto o una imagen vacíos permanecen ocultos. Las imágenes ausentes usan la portada o fotos del catálogo cuando corresponde; no hay productos ni fotografías de ejemplo incorporados a la tienda.

## Conversión y datos

- La selección usa ocho productos destacados como máximo y muestra cuatro tarjetas. Las categorías y sus destinos proceden del catálogo del comercio.
- El protagonista prioriza calzado disponible. Una consulta adicional de ese único producto permite mostrar **Quedan N unidades en total** cuando el stock informado es un entero de uno a cinco. El mensaje distingue el total del producto de la disponibilidad de cada talla. Si falta stock conocido, se omite la cantidad.
- Los precios y descuentos utilizan el componente compartido; los pagos, variantes y reservas siguen los servicios y páginas existentes.
- Las opiniones aparecen únicamente con texto y autor aportados por el comercio. No se incluyen reseñas ni contadores ficticios.
- La franja de envío gratuito requiere entrega configurada y un umbral real. Un anuncio explícitamente vacío impide el anuncio automático.
- Cada botón tiene un destino real. Los paneles de novedades abren el catálogo ordenado por fecha; no se simula un blog o una suscripción sin servicio conectado.
- La plantilla representa una hipótesis de mejora de compra. El efecto en conversión debe medirse con las analíticas existentes y tráfico real.

## Implementación

| Archivo | Responsabilidad |
| --- | --- |
| `apps/store/src/app/templates/stride/stride.routes.ts` | Rutas de la plantilla y reutilización del flujo de compra |
| `stride-shell.*` | Navegación, búsqueda, carrito, garantías informativas y pie |
| `home.page.*` | Composición de secciones, estados y edición visual |
| `stride-copy.ts` | Textos predeterminados y prioridad del contenido del comercio |
| `stride-selection.ts` | Lectura acotada, selección del protagonista y recuperación |
| `stride.scss` | Estilos bajo `body.tpl-stride`, cargados solo en esta plantilla |
| `packages/design-tokens/stride.scss` | Paleta, escala y tokens específicos |
| `apps/api/src/storefront/store-templates.ts` | Rubro permitido, campos editables y valores de tema |

No requiere migraciones ni nuevos endpoints. Mantiene las URLs de catálogo, producto, carrito, compra, recibo y políticas, así como la resolución de tenant por host.

### Servidor de desarrollo

Al incorporar esta plantilla a un servidor que ya estaba ejecutándose, reinicia únicamente la tienda con `docker compose -f docker-compose.dev.yml restart store` (o reinicia `ng serve` si lo ejecutas directamente). Angular lee las entradas de estilos de `angular.json` al iniciar; la recarga de código no incorpora una entrada nueva de estilos globales.

Si `/stride.css` devuelve HTML, el navegador rechaza la hoja por su tipo MIME. Tras el reinicio debe responder con estado `200` y `Content-Type: text/css`. No es necesario modificar los tipos MIME ni cargar los estilos de todas las plantillas en la página.

Comprobación en el stack de desarrollo: antes del reinicio `/stride.css` devolvía HTML mientras `/selecta.css` respondía como CSS; después, ambos archivos respondieron con `200` y `text/css` desde el host `selecta.localhost:4300`.

## Evidencia de verificación — 4 de octubre de 2026

- `npm run build:api`, `npm run build:web` y `npm run build:store`: aprobados. Angular necesitó ejecución fuera del sandbox por restricciones de lectura de directorios padre. Web conserva advertencias previas de tamaño de estilos en consola, vendedor y catálogo.
- `npm run test -w @vendedoria/api -- store-templates --runInBand`: 16 pruebas aprobadas, incluida elegibilidad por rubro y conservación de contenido/layout de Impulso.
- Renderizado en navegador con API local aislada y datos/ilustraciones de prueba: inicio, catálogo, producto, carrito, compra, recibo aprobado y producto inexistente a **360, 390, 768 y 1440 px**, sin desbordamiento horizontal.
- Talla no disponible: acción de compra bloqueada. Talla disponible: agregada con variante y precio correctos al carrito; resumen coherente en la compra.
- Datos y consentimiento vacíos: errores junto a los campos, sin reserva ni cobro.
- Error de selección: aviso y reintento funcional. Catálogo vacío: estado vacío, sin protagonista ni opiniones ficticias. Stock de prueba de tres unidades: cantidad visible correctamente.
- Texto largo y campos vacíos del comercio: comprobados en los cuatro tamaños; imagen y botón borrados permanecen ocultos.

Docker no está disponible en este equipo: no se ejecutó la suite e2e con PostgreSQL. No se verificaron pagos con un proveedor real, publicación en una tienda real ni el editor autenticado contra la base de datos. Las capturas muestran fixtures locales; estos no forman parte de la plantilla publicada.
