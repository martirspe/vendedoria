# Catálogo para recomendar y vender

Implementación y verificación local: 4 de octubre de 2026.

## Fichas que dan base a la recomendación

El catálogo comparte identidad, precio, categorías, variantes y contenido entre artículos físicos, digitales y servicios. La consola diferencia los tres tipos y muestra requisitos y un indicador de información según el tipo. El indicador mide presencia de datos; no certifica su exactitud.

Para cada ficha conviene registrar: descripción breve y completa, destinatario, necesidades y ocasiones de uso, características con valores y unidades, contenido incluido, beneficios, cuidados, exclusiones, compatibilidad, preguntas frecuentes, garantía y condiciones de cambios. Las palabras clave sirven para incorporar nombres y sinónimos que usa el comprador. Los datos se muestran en ambas plantillas de tienda y alimentan al agente; las palabras clave y el enlace de entrega digital no se publican en la ficha.

Los atributos siguen siendo pares nombre/valor. No existe todavía un esquema por categoría con validación de unidades y filtros numéricos de compatibilidad. Completar las fichas con información del negocio sigue siendo necesario: el sistema no debe rellenar hechos ausentes con suposiciones.

## Recuperación con miles de productos

1. La consulta se procesa en PostgreSQL dentro del negocio correspondiente. El índice GIN pondera nombre y palabras clave, marca, línea, categorías, descripciones y detalles; normaliza tildes y usa búsqueda española con raíces y prefijos. No hace llamadas a un modelo para buscar.
2. La búsqueda trae hasta 12 candidatos. Además se recuperan hasta 40 referencias explícitas o productos del contexto de la conversación. Se consultan precios, disponibilidad y existencias actuales; no se mantiene una caché de esos valores. Los sets usan el stock de sus piezas y las variantes su disponibilidad efectiva.
3. El modelo recibe hasta 3 fichas, con un máximo de 16.000 caracteres de JSON de catálogo. Se seleccionan los bloques más relacionados con la pregunta y se conservan requisitos, exclusiones, compatibilidad y condiciones. Si una ficha no cabe completa se marca la omisión; si ni sus condiciones caben se excluye. El modelo debe pedir o confirmar datos decisivos ausentes.
4. El historial enviado se limita a 12 mensajes completos y 8.000 caracteres. El límite existente de salida sigue en 600 tokens. El prompt conserva otros bloques —reglas, consulta, FAQs y guiones— por lo que estos límites de caracteres no equivalen a un límite exacto del total de tokens.
5. El resumen del catálogo cuenta productos y categorías mediante agregación en la base. El catálogo completo no se copia al prompt. La traza registra tamaño del contexto y tokens de entrada, salida y caché cuando el proveedor informa esos valores, sin añadir conversaciones ni datos personales al registro.

La tienda consulta el catálogo completo por páginas de 24 artículos, con un máximo de 48 por petición, búsqueda y filtros. Selecta carga una colección inicial de 48 y resuelve las fichas por handle, incluso fuera de esa colección. Las consultas adicionales del carrito se limitan a 40 handles y cuatro solicitudes simultáneas. Las rutas conservan los controles de negocio, publicación y vista previa, y no devuelven el enlace de entrega digital.

El índice se actualiza con las escrituras normales de PostgreSQL: no hay un segundo catálogo ni una tarea de embeddings que se pueda desincronizar. La migración `20261004164910_catalog_retrieval` es necesaria antes de ejecutar el código nuevo.

## Digitales y servicios

Un digital requiere enlace HTTPS de entrega para estar disponible, y no tiene stock físico ni envío. La ficha admite formato/plataforma, licencia, duración del acceso y requisitos. Al crear un pedido se guarda en cada línea una copia del tipo, enlace e instrucciones ofrecidos. Solo se entrega el acceso al confirmar el pago. Editar o eliminar el artículo después no cambia el enlace de ese pedido. La migración recupera la configuración actual para pedidos anteriores que todavía conservan su producto; no puede reconstruir enlaces históricos ya perdidos.

Es entrega mediante enlace externo. No incluye archivos protegidos alojados por VendedorIA, enlaces firmados individuales, límites de descargas, licencias por comprador, suscripciones ni cuentas de alumnos. La duración/licencia declarada en la ficha debe ser aplicada por el proveedor del contenido: el texto no crea esos controles automáticamente. El destinatario puede compartir un enlace externo si su proveedor no limita el acceso.

Los servicios pertenecen al catálogo común, con formularios, filtros y textos propios. La duración, modalidad, cobertura, requisitos y cancelación ayudan al comprador y al agente. El checkout recopila una preferencia de fecha y hora para coordinar. No confirma disponibilidad de agenda: aún no existen cupos, calendarios, profesionales ni reservas de horario. Los botones solicitan el servicio y el flujo explica la coordinación.

## Evidencia y límites

- API, consola y tienda compilaron en Docker. La consola conserva advertencias de presupuesto de CSS en páginas existentes.
- Pasaron 34 suites / 239 pruebas unitarias de API, 13 suites / 67 pruebas de integración y 7 archivos / 29 pruebas de consola.
- La prueba aislada inserta 10.000 artículos y otro negocio con un artículo homónimo. Encuentra el artículo número 10.000 por palabra clave, respeta el presupuesto y el aislamiento, obtiene el conteo total, verifica el índice y actualiza la búsqueda al editar datos. También comprueba búsqueda con tildes, paginación, lectura fuera de la colección inicial y ausencia de enlaces privados en la respuesta pública.
- PostgreSQL informó 2,913 ms de ejecución en la última búsqueda selectiva local con `EXPLAIN (ANALYZE, BUFFERS)`. No incluye red, carga de relaciones, ejecución del agente ni respuesta del modelo; no es una prueba de concurrencia ni un SLA.
- Las pruebas de compra digital conservan el acceso tras editar/eliminar el producto y rechazan la entrega antes del pago.
- Revisión visual con datos ficticios: formulario de digitales, filtro público, ficha fuera de la colección inicial y ajuste de ancho móvil del formulario.

La búsqueda actual es léxica: reconoce raíces, prefijos y sinónimos registrados, pero no comprende cualquier intención, errata o equivalencia conceptual. Para búsquedas conceptuales puede añadirse una segunda recuperación semántica sobre candidatos, con evaluación y presupuesto propios; no está implementada. El ahorro monetario exacto depende del modelo y del contenido: no se midió con llamadas pagadas.

La cantidad de fichas y el contexto del modelo quedan acotados; las relaciones de una ficha —en especial sus variantes— y las importaciones grandes aún requieren dimensionamiento. La consola administrativa conserva su listado actual, sin una nueva paginación en este cambio. Para dimensionar infraestructura faltan pruebas de concurrencia con consultas amplias, p95/p99, memoria y conexiones del pool. No se instaló infraestructura adicional ni se desplegó a producción.
