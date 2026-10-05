# AI Sales Engine

## Auditoría inicial (2026-10-05)

El webhook Meta verifica la firma y `ChannelsService` entrega mensajes de texto a `ConversationsService`. Este resuelve el canal, crea conversación/mensaje, carga las últimas 20 intervenciones, ejecuta `SalesAgentRuntimeService` y envía por `ChannelMessengerService`. Instagram comparte el mismo ingreso. WhatsApp entrante actualmente acepta texto; las fotos salientes y los carritos referenciados de la tienda sí están soportados. No existe recepción/transcripción multimedia que pueda preservarse como si ya estuviera implementada.

PostgreSQL/Prisma es la autoridad: `Conversation` pertenece al tenant y canal; `Message` es hijo de la conversación. La deduplicación anterior consulta `externalId` antes de resolver tenant y no tiene constraint, por lo que dos webhooks concurrentes pueden generar dos respuestas. No hay debounce, exclusión distribuida ni outbox del agente. Un mensaje manual pausa la IA.

El runtime consulta todo el catálogo mediante búsqueda PostgreSQL acotada (`searchCatalogIds`) y conserva precios/stock/variantes publicados en `SalesAgentToolsService`. Reutiliza `OrdersService`, los providers de pago B, `planDelivery` y FAQs aprobadas/journeys. No hay entidad de carrito conversacional; las líneas pendientes ya representan ese carrito. Se conservan el playground y las personalidades. OpenAI usa chat completions JSON; el backend determina acciones y dispone de fallback determinista. No hay tool calling del modelo, estado persistente, memoria de cliente, resumen incremental ni validación suficiente de afirmaciones.

Redis/ioredis y BullMQ existen en conversiones para recuperación y caché. Qdrant existe como índice opcional de afinidad (vectores de categorías, no embeddings semánticos); no es reutilizable como índice semántico. Se reutiliza la conexión Redis, sin duplicar clientes. Docker proporciona PostgreSQL, Redis y Qdrant opcional bajo el perfil `recommendations-vector`; CI solo compila API/web. Hay pruebas unitarias del runtime, herramientas, contexto y envío, y e2e de aislamiento/commerce. La sesión parte de cambios locales de conversión/LIVE/tienda que deben conservarse.

## Plan incremental

1. Ingreso durable, constraint por canal+wamid, debounce y exclusión Redis con respaldo PostgreSQL; outbox que evita reenvíos inciertos.
2. Estado y resumen estructurados de conversación/playground, memoria explícita con procedencia/expiración, presupuesto de contexto y prevención de preguntas repetidas.
3. Registro de herramientas de lectura tipadas y function calling acotado; acciones de compra continúan bajo control del backend y servicios existentes.
4. Índice semántico de productos/FAQs con outbox transaccional, hidratación PostgreSQL, filtro obligatorio por tenant y backfill paginado.
5. Estados comerciales, siguiente acción, referencias ordenadas, validación, handoff y trazas sin contenido de mensajes.
6. Casos de evaluación determinista, pruebas de regresión e integración. Documentar resultados reales y límites de despliegue.

## Riesgos y decisiones

- La entrega exactamente una vez por Meta no puede garantizarse tras un timeout sin clave de idempotencia del proveedor. Una salida cuyo envío empezó y no tiene resultado confirmado pasa a revisión humana; nunca se reenvía automáticamente.
- Las operaciones de compra anteriores no son idempotentes por turno: un turno interrumpido se escala en lugar de repetirse. La cola conserva mensajes y respuestas antes de invocar servicios externos.
- Redis puede caer: PostgreSQL conserva inbox, estado y exclusión. Qdrant/embeddings pueden caer: se usa búsqueda PostgreSQL.
- Las personalidades, reglas de entrega y pagos existentes siguen siendo reutilizadas. El modelo solo propone acciones de lectura; no crea pedidos ni pagos arbitrarios.
- Las validaciones deterministas cubren hechos estructurados y preguntas conocidas; la veracidad de todo texto libre requiere evaluación con modelos reales. No se promete exactitud total.
- Las migraciones son aditivas: no modifican datos históricos ni índices existentes. El backfill se ejecuta por tenant y no toca infraestructura productiva.

## Arquitectura implementada

Meta → firma existente → resolución del canal/tenant → constraint `Message.inboundKey` → inbox PostgreSQL (`enginePending`) + buffer Redis → ventana de silencio → lease Redis + advisory lock PostgreSQL → contexto/memoria → runtime existente + herramientas → validación → estado/outbox durable → envío Meta → confirmación/handoff.

`SalesGatewayService` sondea cada 500 ms. Agrupa hasta 20 mensajes consecutivos, sin bloquear el webhook durante generación. El siguiente lote permanece en la base para el próximo turno. Un turno se persiste `STARTED` antes de cualquier acción comercial y pasa a `READY` junto con estado y consumo del lote, con compare-and-set. Antes de llamar comercio y antes de enviar se comprueba que el operador no pausó la conversación. El lease PostgreSQL es obligatorio incluso cuando Redis funciona: protege expiraciones, pérdida del caché y múltiples instancias. Las operaciones del runtime tienen límites de tiempo; el lock PostgreSQL tiene un máximo de 120 segundos.

Las salidas recorren `READY → SENDING → SENT`. Una interrupción `STARTED` requiere revisión porque un pedido pudo haberse creado; `SENDING` sin confirmación pasa a `UNKNOWN`. No se repite la acción ni el envío. Las fotos se envían después de confirmar el texto; el texto no se reenvía por un fallo posterior de una imagen. Un manual/plantilla pausa la IA antes del I/O externo. Reactivar desde Inbox reanuda con el contexto persistido.

## Datos y memoria

- `Conversation.salesState` y `PlaygroundSession.salesState`: JSON versionado, requisitos, hechos con fuente/confianza/fecha, selección, orden de recomendaciones y grupo anterior, descartes, objeciones, preguntas respondidas, líneas pendientes, pedido/pago, siguiente acción y resumen estructurado.
- `SalesCustomerMemory`: PK `(tenantId, customerKey)`, hechos explícitos, expiración e índice por tenant/expiración. La clave es SHA-256 del canal/thread resuelto por backend. No une clientes de canales distintos por inferencia. Nombre y preferencias habituales explícitas pueden persistir; talla/color/presupuesto de una compra permanecen en esa conversación.
- `SalesEngineTurn`: IDs de mensajes del lote, estado del procesamiento, respuesta y traza, índices por tenant/conversación/fecha y estado/fecha.
- `SalesSearchJob`: outbox transaccional por `(tenantId, documentType, sourceId)`, revisión y reintentos. Triggers de producto, variantes y FAQ cubren importaciones y borrados. Cambios solo de precio/stock no regeneran embeddings.
- `Message.inboundKey`: único y nullable para mantener compatibilidad con historial; nuevos IDs incluyen tenant/canal/wamid. `enginePending` tiene índice para el worker. El fast-path Redis se escribe después del commit; la restricción DB funciona aunque desaparezca.

Migraciones: `20261005030000_ai_sales_engine` y `20261005040000_sales_search_semantic_changes`, ambas aditivas. Las conversaciones previas hidratan sus hechos una sola vez leyendo mensajes antiguos en páginas de 100; nunca se envía todo ese historial al modelo. No hay backfill destructivo ni una entidad de carrito paralela: se reutilizan líneas pendientes y pedidos existentes. Un pedido activo ya vinculado se consulta en lugar de crear otro cuando el cliente vuelve a pedir pagar.

El resumen se actualiza cada `SALES_SUMMARY_THRESHOLD` turnos y al crear pedido/escalar. No consume otra llamada LLM. La extracción determinista conserva únicamente expresiones explícitas reconocidas y sus fuentes; talla ambigua no se convierte en selección. El modelo también conserva el contexto reciente y la necesidad expresada. La extracción no pretende cubrir todos los giros lingüísticos.

## Redis

| Clave | TTL | Responsabilidad |
| --- | --- | --- |
| `wa:processed:{tenantId}:{channelId}:{wamid}` | 24 horas | Fast-path de deduplicación después de persistir el ingreso |
| `wa:buffer:{tenantId}:{conversationId}` | 120 segundos | IDs del lote activo; DB conserva el inbox |
| `wa:lock:{tenantId}:{conversationId}` | 30 segundos por defecto | Token de propiedad, renovación cada TTL/3 y liberación Lua condicionada al token |
| `wa:state:{tenantId}:{conversationId}` | 1800 segundos por defecto | Copia caliente; se valida contra el estado PostgreSQL y se reconstruye al perderse |
| `wa:embedding:{tenantId}:{hash(model/query)}` | 300 segundos | Vector de búsqueda repetida; no guarda el texto en la clave |

Se comparte `ConversionInfrastructureModule` con conversiones, sin crear un segundo cliente Redis. No se cachea precio, stock ni pagos. La concurrencia del gateway arranca en 1 para no agotar el pool Prisma con locks largos. Al aumentarla, reservar conexiones para locks, worker de índice, consultas, transacciones y tráfico API; una referencia conservadora es al menos `2 × concurrencia + 3` conexiones por instancia.

## Recuperación semántica

Colección `sales_semantic_{modelo_normalizado}_v1`, por defecto `sales_semantic_text_embedding_3_small_v1`; 1536 dimensiones y Cosine. Modelo de embeddings independiente del modelo de respuesta. Cada punto/chunk contiene tenant, sourceId, documentType (`product`/`faq`), chunkIndex, version y active; productos añaden productId/categorías. Precio, stock, enlaces de acceso digital y pagos no se indexan.

La consulta siempre filtra tenant + tipo + activo, comprueba el tenant del payload y solo devuelve IDs. Catálogo combina ranking léxico PostgreSQL y candidatos Qdrant, luego hidrata productos/variantes reales, aplica presupuesto/requisitos y disponibilidad. FAQs recuperadas se revalidan como aprobadas/publicadas en PostgreSQL. Ediciones, desactivaciones y borrados actualizan el índice mediante outbox; un fallo usa búsqueda estructurada. Indexación: páginas acotadas, hasta cinco intentos con backoff; los fallos definitivos aparecen en métricas y se reencolan mediante backfill del tenant.

## Herramientas y control comercial

Function calling de lectura: `search_products`, `get_product`, `get_product_variants`, `check_inventory`, `get_price`, `calculate_shipping`, `get_commercial_policy`, `get_order_status`. DTOs rechazan campos desconocidos (incluido tenantId); el tenant solo llega del contexto backend. Estado de pedido exige además la misma conversación. Envío exige un subtotal calculado por backend. Hay hasta dos rondas de herramientas y tres llamadas de generación, con timeout y presupuesto total de contexto. Resultados de herramientas son datos, no instrucciones.

Crear pedido/link y escalar siguen bajo decisiones deterministas del runtime y los servicios existentes. No se publican herramientas arbitrarias de escritura, SQL, descuentos ni cobros SaaS. Playground usa pedidos de prueba y estado separado. La personalidad se conserva debajo de la política universal; el contexto combina política, persona, estado/memoria/resumen, conocimiento, mensajes recientes, mensaje actual y resultados de herramientas. Se descartan turnos completos si exceden presupuesto; los datos críticos no se cortan por la mitad.

La validación rechaza importes sin respaldo, atribución de precio a otro producto, stock/variantes no respaldados, políticas/entregas inventadas, preguntas ya respondidas y afirmaciones de pago/reserva sin evidencia. Se rehidrata catálogo después de generar para detectar cambios de precio durante el turno. Un fallo produce respuesta determinista con datos actuales; fallos consecutivos alcanzando el umbral generan handoff y pausa. No se afirma que toda alucinación en texto libre pueda detectarse con reglas.

## Operación

Configuración validada y documentada en ambas plantillas `.env`: `SALES_ENGINE_MODE`, `SALES_DEBOUNCE_MS`, `SALES_RECENT_MESSAGES_LIMIT`, `SALES_SUMMARY_THRESHOLD`, `SALES_CONTEXT_TOKEN_BUDGET`, `SALES_MEMORY_TTL_SECONDS`, `SALES_CUSTOMER_MEMORY_TTL_DAYS`, `SALES_LOCK_TTL_MS`, `SALES_TOOL_TIMEOUT_MS`, `SALES_RETRIEVAL_TOP_K`, `SALES_SIMILARITY_THRESHOLD`, `SALES_EMBEDDING_MODEL`, `SALES_HANDOFF_FAILURE_THRESHOLD`, `SALES_GATEWAY_CONCURRENCY`. Se mantienen `OPENAI_MODEL`, `OPENAI_API_KEY`, `REDIS_URL` y `QDRANT_URL` existentes. La confianza de hechos deterministas es 1; no se añade un umbral probabilístico sin un extractor probabilístico.

Endpoints autenticados, tenant derivado del JWT:

- `POST /api/v1/agent-engine/backfill`: `{"documentType":"product"}` o `faq`; devuelve queued/nextCursor. Repetir con `after: nextCursor` hasta null. Es idempotente y reanudable. Rehacer las páginas reconstruye documentos existentes sin borrar colecciones de otros tenants.
- `GET /api/v1/agent-engine/conversations/:id`: estado y últimas 20 trazas, sin respuesta completa duplicada en diagnósticos.
- `GET /api/v1/agent-engine/metrics`: resultados de los últimos siete días, mensajes pendientes y fallos definitivos del índice.

Las trazas incluyen correlation ID, tenant/conversación/agente, modelo, etapa anterior/posterior, intención, siguiente acción, herramientas/resultado, latencia, fuentes recuperadas, validación y tokens. Los logs no incluyen contenido de chats, teléfonos, nombres ni credenciales. La estimación monetaria de LLM no se añade porque no existe un tarifario de modelos mantenido en este repositorio.

Pruebas dentro del stack:

```bash
docker compose -f docker-compose.dev.yml exec -T api npx prisma generate
docker compose -f docker-compose.dev.yml exec -T api npm run build
docker compose -f docker-compose.dev.yml exec -T api npx jest agent-runtime --runInBand
npm run test:docker
docker compose -f docker-compose.dev.yml exec -T api npm run eval:sales
```

`eval:sales` requiere API compilada. El dataset versionado `docs/agent/evals/sales-engine.json` contiene 20 escenarios: 17 se ejecutan en el runtime determinista offline y 3 se verifican en gateway e2e con servicios reales. `sales-evaluation.ts` puntúa las doce métricas solicitadas, conserva denominadores y devuelve null si no hay anotaciones/oportunidades. El reporte guardado en `docs/agent/evals/sales-engine-report.json` es una regresión con fixtures, no un benchmark de un modelo real ni una garantía de calidad en clientes reales. Pruebas de tool calling usan respuestas LLM de prueba; Qdrant usa el servicio real con embeddings sintéticos para aislar ranking/tenancy/hidratación sin costo externo.

## Antes de despliegue

Verificación ejecutada el 5 de octubre de 2026, directamente en los contenedores del proyecto: Prisma generate, build API, 46 suites unitarias (328 pruebas), 16 suites e2e (94 pruebas) sobre `vendedoria_test`, builds de consola y tienda y evaluación offline de 20 escenarios (17 runtime + 3 gateway e2e). Todas terminaron correctamente. ESLint de los archivos nuevos de producción pasó. Las dos migraciones se aplicaron tanto a la base aislada como al stack de desarrollo; `/api/v1/health` respondió HTTP 200 después de aplicarlas. Consola y tienda conservan advertencias de presupuestos de bundles/estilos; los builds concluyeron. La skill reutilizable y su copia instalada pasaron el validador oficial de `skill-creator`.

Aplicar las dos migraciones mediante el servicio migrate, configurar Redis/Qdrant y modelos, ejecutar backfill de productos y FAQs por tenant y observar el inbox/outbox/métricas. Qdrant permanece bajo el perfil Docker existente `recommendations-vector`; habilitarlo y definir su URL si se desea retrieval semántico. `legacy` permite volver al pipeline anterior; los lotes v2 ya capturados siguen drenándose de forma segura. No se hizo push ni despliegue productivo.

Quedan para validación operativa: benchmark anotado con el proveedor/modelo real, capacidad del pool/colas bajo carga representativa, retención/purga física según política del negocio y conciliación humana de envíos inciertos. La recepción de audio/imágenes/documentos entrantes sigue fuera de la capacidad preexistente del gateway; no se inventa una transcripción ni se modifica el envío de fotos. El motor respeta la expiración lógica de memoria de cliente, pero no elimina automáticamente mensajes comerciales históricos.

Referencias de protocolo: [Qdrant Query API](https://api.qdrant.tech/api-reference/search/query-points/), [filtros Qdrant](https://qdrant.tech/documentation/search/filtering/), [OpenAI function calling](https://platform.openai.com/docs/guides/function-calling).
