# Auditoría de UX/UI y conversión — 4 de octubre de 2026

Se mejoró el recorrido de Clásica, se unificó el pago en una sola página en ambas plantillas y se corrigieron defectos observados de Selecta y de la consola. La evidencia usa compilaciones de producción y datos sintéticos locales; no certifica todos los dispositivos físicos ni todos los estados de integraciones externas.

## Cambios del recorrido de compra

- Clásica: propuesta de valor, selección de productos, señales de confianza basadas en la configuración real, guía de compra, preguntas frecuentes y cierre hacia el catálogo. Los bloques añadidos siguen siendo editables. Los testimonios vacíos no aparecen en la tienda publicada.
- Ambas plantillas: ficha → carrito o compra directa → contacto, entrega, consentimiento y pago en una página → confirmación después del pago. El enlace del pedido conserva su uso para consultar estados y retomar pedidos existentes.
- Pago compartido: tarjeta/Yape, validación antes de reservar, importe autoritativo del servidor, reconfirmación explícita ante cambios de total y protección frente a solicitudes simultáneas. Solo se libera una reserva para modificar datos cuando se confirma su cancelación; un pago en proceso no ofrece volver a pagar.
- Textos en español y acciones concretas: Comprar ahora, Agregar al carrito, Elegir opciones, Finalizar compra, Pagar y Ver mi carrito. No se agregaron reseñas, escasez, plazos ni garantías inventadas.

## Correcciones de Selecta señaladas en las capturas

| Defecto | Corrección y evidencia |
| --- | --- |
| Aviso de envío pegado a Finalizar compra | Separación medida de 24 px en el carrito a 320, 390, 768 y 1440 px. |
| Nombre del producto pequeño | Título de tarjeta de 20 px en ambas plantillas; títulos de página con escala común de 32–44 px. El precio de tarjeta usa 20 px; el importe principal, 24 px. |
| Título y formulario desalineados o recortados | Se eliminó el padding lateral adicional de las secciones y se restauró una cuadrícula móvil que ocupa el ancho disponible. Título, secciones, campos y pago comparten el mismo borde izquierdo. |
| Se perdió la numeración | Se restituyeron 01, 02 y 03 como orientación visual dentro de una sola página; los servicios ajustan los números de las secciones aplicables. |
| Foto de la recomendación oculta en móvil | Miniatura de 64 × 64 px visible junto al nombre, precio y elección opcional. |
| Dos consentimientos dispersos | Una casilla, desmarcada inicialmente, incluye expresamente la aceptación de la tarifa cuando corresponde. Cambiar distrito, modo o tarifa requiere aceptar otra vez. Agregar la recomendación sigue siendo una elección independiente. |
| Ayuda de WhatsApp superpuesta al cierre de FAQ | Se retiró la posición sticky del bloque de introducción; el cierre ocupa una fila propia con separación y borde. |
| Filtros y selector superpuestos | Contenedor de marca flexible con separación explícita; selector y segmentos caben en el ancho disponible. |
| Cantidad y acción de compra con alturas distintas | En ficha comparten altura y alineación; los controles del carrito tienen al menos 44 px y no quedan recortados. |

Las tarjetas de Clásica alinean los precios y las acciones al pie aun con descripciones o títulos de distintas longitudes. Se respetan las familias tipográficas y la identidad propia de cada plantilla.

La ficha utiliza textos de confianza de 14 px, distribuidos en dos columnas que pueden envolver su contenido; las etiquetas compactas usan 12 px. Se repitieron 16 combinaciones de inicio, ficha, carrito y checkout de Selecta a 320, 390, 768 y 1440 px después de este ajuste final, sin desbordamiento. Sus medidas están en `readability-widths.json`.

## Selectores de toda la app

`packages/ui/src/select/` implementa el componente compartido y se aplica en las 15 vistas que contienen selectores: catálogo, ficha y checkout de la tienda; productos, pedidos, mensajes, canales, equipo, cupones, vendedor, envíos, tienda y ajustes de la consola.

En escritorio se muestra un combobox de marca con flecha separada del borde, opción seleccionada, foco, lista en la capa superior, navegación con flechas/Home/End/Enter/Escape y búsqueda por texto. En móvil, hasta 760 CSS px, se conserva el selector nativo. El formulario sigue usando el valor y los eventos del select nativo, incluidos opciones dinámicas, grupos, errores y fieldsets deshabilitados. Elegir la misma opción no borra los campos dependientes.

La mejora tiene fallback nativo en navegadores que no soportan la API de popover. La lista utiliza esa API para evitar recortes por contenedores con overflow. [Documentación de Mozilla](https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement/showPopover).

## Cobertura responsive

Se registraron `innerWidth`, ancho del documento y ancho desplazable; no se tomó el tamaño de una captura como sustituto de la medida real.

| Superficie | Cobertura renderizada |
| --- | --- |
| App pública y consola | 28 rutas a 320, 768 y 1440 px: 84 combinaciones. Se corrigió el campo de archivo oculto que desbordaba Importar catálogo y se repitieron sus tres anchos. |
| Clásica y Selecta | Inicio, catálogo, ficha, carrito cargado, checkout cargado y centro legal a 320, 390, 768 y 1440 px: 48 combinaciones finales sin desbordamiento horizontal. |
| Checkout cargado de Clásica | 320, 360, 390, 768, 1024, 1440 y 1920 px, sin desplazamiento horizontal del documento. |
| Checkout de Selecta | Comprobaciones adicionales a 320, 360, 1024 y 1920 px y horizontal de 844 × 390; borde de lectura común y foto de recomendación visible. |
| Consola móvil | Submenú del vendedor accesible, controles del editor visibles, búsqueda de inventario que cabe, objetivos táctiles de cantidad de 44 px y tablas con región desplazable accesible por teclado. |

Rutas de app revisadas: `/`, `/legal`, `/terminos-y-condiciones`, `/auth/login`, `/auth/register`, `/app/get-started`, `/app/products`, `/app/products/import`, `/app/inventory`, `/app/coupons`, `/app/shipping`, `/app/messages`, `/app/orders`, `/app/metrics`, `/app/plans`, `/app/settings`, `/app/profile`, `/app/team`, `/app/store`, `/app/store/editor`, `/app/seller/profile`, `/app/channels`, `/app/payments`, `/app/integrations`, `/app/domain`, `/app/instagram`, `/app/tracking` y `/app/help`.

La consola se verificó con fixtures de catálogo, inventario, envíos, métricas y editor; otras pantallas mostraron sus formularios o estados vacíos/de error. Esto comprueba sus estructuras renderizadas, pero no sustituye revisar conversaciones extensas, permisos múltiples, todos los diálogos y cada estado cargado con datos reales.

## Verificación funcional y técnica

- Compilaciones de producción de tienda y consola correctas. La consola conserva advertencias de presupuesto de estilos en productos (13.62 kB), vendedor (13.86 kB) y shell (10.23 kB); ninguna impidió compilar.
- Contrato de plantillas: 15 pruebas de `store-templates.spec.ts` correctas. La API también compiló durante esta intervención.
- Escáner de copy de tienda: 80 archivos revisados sin coincidencias. En consola se corrigieron el término interno «tenant» en Ajustes y las etiquetas que prometían disponibilidad futura; las coincidencias de dominio/configuración del vendedor requieren interpretación por ser funciones del producto.
- Navegación por teclado: departamento → provincia → distrito actualiza opciones y formulario; seleccionar de nuevo el departamento vigente mantiene provincia/distrito. Selector de moneda de consola actualiza su formulario.
- Consentimiento: cambiar entrega elimina la aceptación anterior; solo se envía la aceptación de tarifa con consentimiento explícito válido.
- Compra local de Selecta con recomendación: S/ 129 + S/ 10, recojo gratuito, total S/ 139, confirmación con los dos productos y pago aprobado.
- Cambio de precio local: total S/ 144 → S/ 149. No se continuó al pago automáticamente; se mostró el nuevo desglose, se deshabilitaron los campos nativos y personalizados y se pidió reconfirmar. Modificar datos canceló la reserva y volvió a habilitarlos.
- También se verificaron compra y cupón en Clásica, validación con recuperación de foco y estado de pago pendiente en fixtures locales durante la intervención.
- `git diff --check` correcto. Metadata y referencias de la skill de UI validadas.

Los fixtures no usan cuentas reales, proveedor de pagos ni registros del negocio. No se efectuaron cargos ni se debilitaron controles de producción. La prueba integral con Mercado Pago/Yape real o sandbox, Turnstile configurado, base aislada Docker y Safari/Firefox/dispositivos físicos queda fuera de la evidencia disponible. Docker no estaba disponible en este entorno.

## Evidencia y criterio reutilizable

Los registros y capturas locales están en `.tmp/ux-evidence/`: `web-widths.json`, `store-widths.json`, `cart-widths.json`, `selecta-dropdown-desktop.jpg`, `selecta-checkout-mobile.jpg`, `selecta-product-mobile.jpg`, `selecta-catalog-mobile.jpg` y `selecta-cart-mobile.jpg`. Contienen datos de prueba y no forman parte del producto publicado.

La skill `.agents/skills/vendedoria-ui/` incorpora `commerce-conversion.md` y `responsive-audit.md`: embudo completo, persuasión verificable, copy de producción, jerarquía, checkout de una página, selectores, consentimiento y matriz de aceptación. Las mejoras de conversión son hipótesis de diseño; su impacto necesita medirse con tráfico suficiente.

## Refinamiento visual de Selecta — 4 de octubre de 2026

Esta revisión responde a las capturas de filtros, checkout, separación de la colección y cierre del catálogo. Las reglas de estos layouts se concentran en `_selecta-layout.scss`, aplicado después del CSS original; se retiraron los overrides anteriores del cierre y del selector de marca. No se modificaron contratos, precios ni el procesamiento del pago.

- La colección ya no suma padding y margen: la separación efectiva desde la franja de confianza es de 48–80 px, según viewport. «Ver más productos» queda a 32 px del grid.
- Buscar, presentación y marca comparten una fila desde 901 px. En tablet se agrupan debajo de la búsqueda; en móvil aprovechan una fila cuando caben y se apilan en anchos estrechos. Los controles miden 52 px, conservando las opciones y los selectores nativos en móvil.
- La jerarquía utiliza los tokens compartidos: cuerpo 16 px, captions y filtros 14 px, h3 de producto 20 px, h4 y títulos de formulario 18 px, títulos de sección 26–34 px y de página 32–44 px. La portada mantiene su escala de 40–68 px. El resumen de compra usa h3 de 16 px por su función compacta. Se corrigieron tamaños aislados de FAQ, categorías y descripciones.
- El cierre tiene tarjeta rosada con acento de marca, etiqueta, título, explicación y CTA. Texto oscuro sobre el fondo claro y texto del CTA ajustado al color de marca; se comprobaron las marcas predeterminada y clara.
- Título y formulario de checkout comparten el borde izquierdo; la nota de compra como invitado se alinea con la columna del resumen en escritorio. Se mantienen 01, 02 y 03 y el checkout de una página.
- El footer muestra el logo durante checkout y en las demás vistas. También se verificó el monograma. Los logos anchos reducen su tamaño en el encabezado sin desplazar la navegación. WhatsApp flotante y «Volver arriba» se ocultan mientras el footer está visible y vuelven al regresar al catálogo, evitando tapar enlaces legales.

Se registraron **47 combinaciones finales sin desbordamiento horizontal** en `.tmp/ux-evidence/selecta-refinement-widths.json`: inicio en 12 anchos (320, 390, 520, 560, 600, 601, 768, 900, 901, 1024, 1440 y 1920); catálogo, ficha de nombre largo, carrito vacío, centro legal y checkout cargado en cuatro anchos cada uno; cinco anchos adicionales de checkout; carrito cargado en cuatro anchos; monograma y marca clara en tres anchos cada uno. El logo configurado cargó correctamente en todas las rutas comprobadas. Se verificó después la ocultación y recuperación de controles flotantes con el build final.

Búsqueda de «jabón» y filtro Botánica mostraron seis resultados cada uno; Sets mostró el estado vacío; limpiar filtros recuperó la colección; «Ver más productos» aumentó de 18 a 24 tarjetas; «Ver catálogo» volvió a la colección. Los datos e imágenes de esta revisión son fixtures sintéticos locales.

Las compilaciones completas de tienda y consola pasaron. Al inicio, archivos incompletos de Stride impidieron compilar la tienda y se validó Selecta en una copia aislada; una vez disponible ese trabajo paralelo, se repitió correctamente el build completo, incluyendo Stride. La consola conserva las advertencias de estilos ya documentadas. Esta revisión no certifica dispositivos físicos ni nuevos pagos con proveedor.

Capturas: `selecta-filters-refined-desktop.jpg`, `selecta-closing-refined-desktop.jpg` y `selecta-closing-refined-mobile.jpg`, dentro de `.tmp/ux-evidence/`.
