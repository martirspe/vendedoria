# Auditoría e implementación de catálogo y compra

Fecha: 5 de octubre de 2026. Cambios locales, sin despliegue ni modificación de bases de datos.

Se implementaron correcciones de sets y carrito, variantes extensibles, clasificación por categoría y edición progresiva. La migración está preparada. La aceptación con PostgreSQL y el diagnóstico de las tiendas afectadas en producción siguen pendientes: este entorno no dispone de Docker ni de acceso a esos registros o logs. Los resultados locales no constituyen una aprobación de despliegue.

## Hallazgos y causas

| Área | Evidencia en código | Corrección o conclusión |
| --- | --- | --- |
| Tienda que deja de responder | La publicación y el acceso público son estados distintos. `resolvePlanState` marca el plan vencido cuando `planExpiresAt <= now`; la integración deja de estar activa aunque `Storefront.status` continúe en `PUBLISHED`. | Centralización de disponibilidad y motivo en la respuesta de configuración. Se conserva la pausa intencional y la configuración; la renovación recupera el acceso cuando la integración sigue habilitada. No se puede atribuir un incidente de producción concreto sin sus registros. |
| Comprar ahora | Clásica agregaba la selección al carrito y compraba la bolsa completa; Selecta ya usaba una selección directa. | Ambas usan una compra independiente por producto, variante y cantidad; un aviso explica que el carrito se conserva. |
| Carrito eliminado después del pago | El recibo pagado ejecutaba `cart.clear()` sin conocer el origen del pedido. | Solo se descuentan las cantidades capturadas al reservar un pedido del carrito; compras directas, LIVE y recibos ajenos no consumen la bolsa. La liquidación se registra una sola vez. |
| Reintentos de checkout | Una clave de navegador compartida podía reutilizarse entre selecciones e intenciones distintas. | Claves por tienda, intención y selección normalizada, conservadas durante la reserva para reintentar y liberadas al cancelar o confirmar. |
| Piezas del set | DB almacena `componentId` y el formulario lo traduce correctamente. El valor nativo de un `select` podía aplicarse antes de renderizar sus opciones. | Value accessor de Angular con `ngModel` independiente del formulario. El test reproduce guardar, abrir, cambiar, guardar y abrir de nuevo con selección real en DOM. |
| Variantes limitadas | Tres pares fijos en DB, dos expuestos en consola y ausencia de generación y edición completa. | Opciones JSON, generador, hasta cinco atributos, SKU, stock, precio, foto y disponibilidad por combinación. |
| Stock inconsistente | La reserva omitía todo control si el producto tenía stock ilimitado, incluso cuando una variante tenía un contador propio. | El stock explícito de variante tiene precedencia; la reserva conserva el decremento condicional atómico. |
| Ediciones antiguas | Guardar nuevamente una ficha podía sobrescribir stock reservado; reemplazar variantes podía interferir con otras ediciones. | Versión de producto, comparación condicional del stock esperado, locks transaccionales y rechazo de IDs ajenos o retirados. Las variantes reservadas no se eliminan. |
| Características mezcladas | Etiquetas libres y campos generales no representan una clasificación con atributos propios. | Clasificación opcional y separada de las colecciones existentes; esquema heredado y validación backend. Campos históricos de fragancias se limitan a ese contexto o a registros antiguos. |

### Disponibilidad de las tiendas

La condición pública es publicación válida más integración activa. La integración depende de su interruptor, de las prestaciones del plan y de sus dependencias. Un dominio personalizado también requiere verificación y una integración habilitada para ese dominio.

Las escrituras normales de configuración, importación y envíos no despublican la tienda. Publicar establece `PUBLISHED`; retirar publicación establece `DRAFT`. La revisión de estos módulos no encontró una tarea periódica que cambie una tienda publicada a borrador. El barrido del editor aplica diseños programados, no el estado de publicación. El token de vista previa dura una hora y su vencimiento solo afecta esa vista. El acceso público consulta la elegibilidad en PostgreSQL; Redis no es su fuente de estado.

`storefront-availability.ts` concentra la decisión de publicación, pausa y suspensión para los accesos públicos y el diagnóstico de configuración. Reutiliza `integration-state.ts` y `plan-catalog.ts`: no crea una segunda política de facturación. Los tests cubren el instante exacto de vencimiento con timestamps equivalentes UTC/Lima y la renovación posterior.

Para resolver el incidente reportado falta comparar, en el momento del fallo, `Storefront.status`, `Tenant.planTier`, `planTrial`, `planExpiresAt`, el interruptor de integración y, cuando corresponda, el estado del dominio. La siguiente consulta evita identidad del comprador, mensajes y credenciales; el parámetro es un ID de negocio autorizado:

```sql
SELECT t.id, t."planTier", t."planTrial", t."planExpiresAt",
       s.status, s."publishedAt", s."customDomainStatus", i.enabled,
       CURRENT_TIMESTAMP AS observed_at
FROM "Tenant" t
LEFT JOIN "Storefront" s ON s."tenantId" = t.id
LEFT JOIN "TenantIntegration" i ON i."tenantId" = t.id AND i.key = 'store'
WHERE t.id = $1;
```

Un plan vigente con integración habilitada y tienda publicada requiere investigar además resolución del host, certificado, infraestructura y respuesta HTTP. No se eliminó la política de vencimiento para ocultar este síntoma.

## Decisiones de arquitectura

### Compra y persistencia

Agregar al carrito suma a la bolsa persistente. Comprar ahora reserva únicamente la selección visible. Esta distinción coincide con las dos acciones que ya presenta el producto y con el diseño directo existente en Selecta. Se comunica antes de pagar.

El carrito es anónimo, por tienda y origen del navegador; no existe aquí un carrito de cuenta sincronizado entre dispositivos. Sigue usando `localStorage`; las demos usan `sessionStorage`. El formato anterior de array se lee y convierte al nuevo sobre `{ lines, settledOrders }` al guardar. Los snapshots de pedidos ordinarios se guardan en la sesión de navegador; los recibos descuentan únicamente las cantidades compradas y conservan productos ajenos o cantidades añadidas después.

Los eventos de almacenamiento sincronizan otras pestañas; un evento local sincroniza instancias de servicio en la misma pestaña. Web Locks serializa lectura y escritura por tienda cuando está disponible. Sin esa API se conserva el mecanismo de lectura reciente, pero no se garantiza atomicidad de escrituras simultáneas entre pestañas. El backend sigue siendo la autoridad de precio, inventario y pedido.

Clásica utiliza un `CartService` del checkout para selecciones transitorias. Selecta mantiene su selección directa separada. Los pedidos LIVE conservan sus reservas existentes y tampoco reemplazan la bolsa del comprador. Los pagos SaaS y pagos de compradores permanecen separados.

### Variantes

La unidad vendible sigue siendo `ProductVariant.id`. Sus opciones son pares nombre/valor; la combinación canónica normaliza espacios, Unicode y mayúsculas, ordena los atributos y almacena un hash SHA-256. El índice único por producto impide combinaciones duplicadas y evita claves de índice excesivamente largas. Se rechazan atributos repetidos, combinaciones incompletas, distintos ejes dentro del mismo producto y SKU repetidos dentro de la ficha.

El generador admite entre uno y cinco atributos, hasta 50 valores por atributo y 500 combinaciones totales. Calcula el tamaño antes del producto cartesiano y conserva IDs y ediciones de las combinaciones que permanecen. Las nuevas empiezan con stock cero; los SKU pueden ser manuales o generados con el SKU base como prefijo. Las filas se muestran en páginas de 25. Si se cambian los ejes, guardar exige regenerar para evitar perder cambios silenciosamente. Las nuevas filas se insertan en un lote; las existentes se actualizan conservando su identidad.

Cada combinación tiene SKU, precio, imagen, stock y disponibilidad. `priceInherited` materializa el precio base para que órdenes, filtros y agentes existentes continúen leyendo `priceCents`. Los cambios de precio base y las importaciones actualizan las variantes que heredan. Un stock `null` hereda el comportamiento del producto; un número, incluido cero, es inventario propio. Las imágenes de combinación tienen precedencia sobre la imagen general y se muestran al seleccionar la variante en Selecta. Se eligió imagen por combinación y fallback al producto; una asociación compartida de imágenes por valor de color queda como ampliación futura.

Los lectores de pedidos, agentes, búsqueda, filtros y tienda comprenden los cinco ejes. Las tres parejas antiguas se conservan y siguen leyéndose cuando `options` es nulo. Los tres primeros ejes se escriben también en esas columnas para compatibilidad. Una combinación retirada que todavía está reservada por un pedido pendiente produce conflicto; se puede desactivar mientras se espera su liberación.

La investigación usó documentación primaria: Mercado Libre describe atributos permitidos por categoría, combinación única, SKU/stock/precio/fotos y preservación de IDs al actualizar; esos conceptos se adaptaron al modelo existente. [Documentación oficial de variaciones](https://global-selling.mercadolibre.com/devsite/manage-questions-answers-global-selling/variations-global-selling). Shopify también representa una variante mediante opciones seleccionadas y su identidad, inventario, precio e imagen; las compras recurrentes tienen un contrato separado. [ProductVariant en Shopify](https://shopify.dev/docs/api/storefront/latest/objects/productvariant).

### Clasificación y atributos

Se conserva `ProductKind` con producto físico, servicio y digital porque define entrega e inventario. Una suscripción del comprador necesitaría pagos recurrentes, cancelación y entrega propia; no se añadió una etiqueta que la confundiera con el plan SaaS.

`CatalogCategory` es una jerarquía compartida, ligada a un tipo de producto. Cada nodo declara atributos JSON por clave estable, nombre, grupo, obligatoriedad, uso en variantes, valores permitidos y longitud. La resolución raíz→hoja permite redefinir una clave sin duplicarla y rechaza ciclos, padres ausentes, tipos incompatibles y profundidad excesiva. Los valores viven en `Product.attributeValues` y la API verifica que pertenecen al esquema seleccionado. Un atributo obligatorio definidor de variante puede completarse mediante las opciones de las combinaciones.

La clasificación es opcional para mantener productos existentes. `Product.categories` continúa representando colecciones comerciales libres y no se migra automáticamente a una taxonomía. Se incluyeron Moda→Calzado→Zapatillas y Belleza→Cuidado facial→Cremas, además de Electrónica, Hogar, Fragancias, Servicios y Contenido digital. Los hechos validados se materializan en el contrato existente `details.attributes` para que tienda e IA los reciban sin duplicaciones ni datos retirados de otra categoría.

Agregar una categoría o atributo es un cambio de datos; no requiere nuevas columnas. No se implementó un gestor administrativo de esa taxonomía compartida. Las nuevas clases de entrega siguen necesitando comportamiento y contrato explícitos. Los nombres de atributos usados en variantes se persisten: renombrarlos exige una actualización controlada de los productos vinculados, además de la definición.

## Cambios principales y contratos

| Superficie | Archivos/componentes |
| --- | --- |
| DB | `apps/api/prisma/schema.prisma`, migración `20261005050000_catalog_classification_variants` |
| Catálogo API | `catalog.service.ts`, DTO create/update, `variant-options.ts`, `catalog-classification.ts`, controller y actualización de precios en importador |
| Inventario y consumidores | `orders/stock.ts`, `checkout.service.ts`, `storefront-mapper.ts`, `catalog-filters.ts`, lectores de `agent-runtime/sales-*` |
| Disponibilidad | `storefront-availability.ts`, servicios storefront público/configuración, página Tienda web |
| Consola | `products.page.*`, `variant-combinations.ts`, `catalog-api.service.ts` |
| Tiendas | `cart.service.ts`, `checkout-context.ts`, producto/checkout/recibo Clásica y Selecta |
| Contratos y ejecución | `packages/contracts/index.d.ts`, `scripts/docker.mjs`, `CHANGELOG.md` |

Nuevo `GET /api/v1/catalog/categories`, autenticado, devuelve ruta e atributos heredados. Crear y editar productos aceptan `categoryId`, `attributeValues`, `variants[].options` y `priceInherited`; editar acepta `expectedUpdatedAt` y `variants[].expectedStockQty`. Los controles de versión son opcionales para clientes existentes y la consola nueva los envía. El stock esperado se compara dentro de la actualización transaccional, no solo al cargar el formulario.

La configuración de tienda agrega `availability` con `public`, `previewAllowed` y motivo. El contrato público de producto y variante expone `stockLeft` opcional. Los endpoints existentes conservan URLs y las escrituras toman `tenantId` del usuario autenticado. Los IDs de variantes se verifican contra el producto previamente localizado por tenant; las piezas de sets se buscan dentro del mismo negocio. Las definiciones de categorías son compartidas y no aceptan un tenant arbitrario del cliente.

## UX de publicación

El editor tiene cuatro etapas: tipo/información y clasificación, características/sets/variantes, fotos, precio/publicación y revisión. Muestra atributos del esquema elegido y los datos propios del tipo. Mantiene los estados de carga, reintento de clasificación, validación y error de API. Las piezas incompletas o duplicadas se rechazan en lugar de descartarse silenciosamente. Una pieza histórica fuera de las opciones actuales conserva una referencia visible para que se corrija.

El formulario reutiliza componentes y tokens del diseño existente. La configuración de tienda muestra que una publicación se conserva durante una pausa de integración/plan y restringe acciones según disponibilidad. Los dos checkouts muestran: «Comprarás únicamente esta selección. Tu carrito se conserva para otra compra».

## Migración y compatibilidad

La migración es aditiva: crea la taxonomía y añade campos opcionales de clasificación/opciones, índice por tenant/categoría, clave única de combinación y bandera de herencia de precio. No renumera variantes, no modifica recetas de sets y no clasifica automáticamente productos antiguos. Los duplicados históricos con clave nula siguen legibles; una edición completa exige corregirlos.

Antes del despliegue, probar la migración en una copia de staging y ejecutar los e2e de la base aislada. El esquema debe desplegarse antes de la API nueva, junto con la regeneración de Prisma; después, consola y tienda. No aplicar una reversión destructiva de columnas. Una API anterior puede leer las tres parejas de compatibilidad, pero no entiende los ejes cuarto y quinto ni sus validaciones: después de crear esos datos no debe considerarse una reversión funcional completa.

## Pruebas y evidencia

| Verificación | Resultado local |
| --- | --- |
| Prisma generate y validate | Correctos. Migración SQL preparada, sin aplicar. |
| API unitarias | 51 suites, 348 pruebas aprobadas. |
| Consola y carrito Angular | 12 archivos, 45 pruebas aprobadas. |
| Builds API, web y store | Correctos. Advertencias de presupuestos CSS en web y tamaño inicial en store; no se alteraron los presupuestos. |
| E2E PostgreSQL nuevos | Dos casos escritos y compilados; ejecución omitida por falta del entorno aislado. No se cuentan como aprobados. |
| Navegador Clásica | Agregar producto, comprar ahora, aviso de compra directa y regreso al carrito con cantidad preservada. Vista móvil de 390 px sin desbordamiento horizontal. |
| Navegador Selecta | Bolsa con perfume y compra directa de otro producto: resumen contiene solo la selección; regreso conserva perfume. Vistas de 390 y 1440 px sin desbordamiento horizontal. |
| Revisión de diff | `git diff --check` sin errores de whitespace. |

Las verificaciones de navegador utilizaron demos locales sin cobros. El test de sets utiliza el componente Angular y su selector real en DOM con API simulada; no sustituye la persistencia PostgreSQL. No se verificó visualmente la consola con una sesión autenticada ni todas las anchuras del catálogo real.

Pruebas agregadas: opciones canónicas/compatibilidad, herencia y validación de categorías, materialización de hechos, IDs y duplicados, versión antigua, stock concurrente, eliminación reservada, lote de 500 variantes, stock propio sobre producto ilimitado, frontera de expiración, mapper público, generador cartesiano, conservación de ediciones, límites, ciclo de sets y cambios de ejes. Las pruebas de carrito cubren compra directa/cancelación/recibo ajeno, tiendas distintas, datos antiguos/corruptos, recarga, cantidades añadidas posteriormente, liquidación repetida, claves de reintento y mutaciones compartidas con Web Locks.

`npm run test:docker` ahora activa los nuevos e2e únicamente en la base `vendedoria_test`. Cubren sets guardados/editados/releídos, aislamiento y rollback, cinco ejes, IDs/precio/foto y dos reservas competidoras sobre una sola unidad. Esa ejecución todavía es necesaria.

## Riesgos y trabajo pendiente

1. Confirmar la causa de las tiendas afectadas usando sus estados y tiempos reales. No hay evidencia local suficiente para declarar resuelto ese incidente de producción.
2. Aplicar y validar la migración en staging; ejecutar `npm run test:docker`, cancelación/expiración/liberación y pagos de sandbox con variantes y sets. Los mocks no prueban locks, FKs ni rendimiento real del motor SQL.
3. Completar revisión visual del editor autenticado a 360, 768 y desktop, y un producto con 500 variantes. Medir consultas de filtros y edición masiva sobre datos representativos.
4. El carrito anónimo permanece por navegador/origen; alternar subdominio y dominio propio no comparte `localStorage`. Los snapshots son de sesión y la lista de pedidos ya liquidados crece con las compras. Diseñar retención o persistencia servidor si el uso lo exige, conservando idempotencia.
5. Sin Web Locks, escrituras simultáneas del carrito pueden competir. La compra sigue validada por API; verificar navegadores soportados antes del rollout.
6. Los controles de versión son opcionales para compatibilidad. Clientes antiguos que manden inventario absoluto no ofrecen la protección completa de la consola nueva. Migrar esos consumidores y considerar exigir versión en un futuro contrato.
7. Completar gestor de taxonomía con permisos de plataforma y validación de definiciones antes de permitir edición no técnica. La clasificación actual admite texto/listas controladas, no unidades numéricas tipadas ni variantes con metadatos arbitrarios.
8. Diseñar imágenes compartidas por valor y suscripciones recurrentes solo cuando existan requisitos de negocio y contratos de entrega/pago. No forman parte de esta implementación.

El cambio queda disponible para revisión y validación de integración. No se ha publicado ni desplegado en producción.
