# MISIÓN: EVOLUCIONAR VENDEDORIA A UN AI SALES ENGINE STATEFUL DE NIVEL PRODUCCIÓN

Actúa como **Principal AI Engineer + Staff Backend Engineer + AI Agent Architect**, especializado en:

- agentes conversacionales de ventas;
- WhatsApp Cloud API;
- LLM tool/function calling;
- context engineering;
- conversational memory;
- RAG;
- Redis;
- PostgreSQL;
- Qdrant;
- NestJS;
- sistemas multi-tenant;
- arquitecturas event-driven;
- observabilidad y evaluación de agentes de IA.

Estás trabajando directamente sobre mi proyecto existente **VendedorIA + Tienda**.

## 1. OBJETIVO

VendedorIA ya cuenta con agentes de IA que atienden y venden productos mediante WhatsApp.

Actualmente existen problemas como:

- repetición de preguntas que el cliente ya respondió;
- pérdida de contexto en conversaciones largas;
- respuestas inconsistentes;
- poco aprovechamiento del historial;
- razonamiento comercial insuficiente;
- posibilidad de afirmar información incorrecta sobre productos;
- falta de memoria operacional;
- Redis y Qdrant existen, pero todavía no forman parte real del pipeline de los agentes;
- cada agente tiene configuraciones propias de personalidad, comportamiento y datos;
- cada tenant posee su propio catálogo.

Quiero evolucionar el sistema actual hacia un:

# VendedorIA AI Sales Engine

Un motor conversacional de ventas **stateful, multi-tenant, tool-driven, context-aware y production-ready**, donde:

> El LLM comprende, razona y conversa, pero el backend controla hechos, estado, permisos, reglas comerciales y acciones.

La prioridad es aumentar drásticamente:

- precisión;
- retención de contexto;
- coherencia;
- calidad comercial;
- confiabilidad;
- capacidad de cierre;
- seguridad multi-tenant;
- trazabilidad.

No busques una falsa garantía de 100% de exactitud. Diseña mecanismos medibles para aproximarnos al máximo posible mediante grounding, tools, validaciones y evaluaciones.

---

# 2. REGLA PRINCIPAL: NO REESCRIBIR EL SISTEMA

Este es un proyecto existente y funcional.

ANTES DE MODIFICAR CÓDIGO:

1. inspecciona completamente el repositorio;
2. identifica arquitectura, módulos y convenciones existentes;
3. identifica cómo funcionan actualmente los agentes;
4. identifica cómo se reciben mensajes de WhatsApp;
5. identifica cómo se generan respuestas;
6. identifica cómo se almacenan conversaciones y mensajes;
7. identifica cómo funciona multi-tenancy;
8. identifica modelos/esquemas existentes;
9. identifica cómo están implementados PostgreSQL, Redis y Qdrant;
10. identifica proveedores/modelos LLM;
11. identifica catálogo, variantes, inventario, carrito, pedidos, pagos y envíos;
12. identifica configuraciones existentes de los agentes;
13. identifica servicios reutilizables;
14. identifica tests existentes;
15. identifica infraestructura/deployment.

NO inventes una arquitectura paralela si ya existe una abstracción equivalente.

NO dupliques servicios.

NO elimines funcionalidades existentes.

NO cambies APIs públicas innecesariamente.

NO realices una reescritura masiva.

La implementación debe ser incremental y compatible con el sistema existente.

Si los nombres o módulos descritos en este documento no coinciden con el repositorio, adapta los conceptos a la arquitectura real.

---

# 3. PRIMER ENTREGABLE: AUDITORÍA

Antes de implementar, genera un análisis técnico breve dentro del repositorio, siguiendo las convenciones documentales existentes si las hubiera.

Debe identificar:

- flujo actual WhatsApp → agente → respuesta;
- módulos involucrados;
- modelo actual de conversaciones;
- modelo actual de mensajes;
- arquitectura multi-tenant;
- integración LLM;
- integración Redis;
- integración Qdrant;
- catálogo/productos;
- stock/variantes;
- checkout/pedidos;
- pagos;
- problemas detectados;
- componentes reutilizables;
- componentes faltantes;
- migraciones necesarias;
- riesgos de regresión.

Después define el plan de implementación por fases.

Una vez analizado el sistema, continúa con la implementación. No te limites a generar documentación.

---

# 4. ARQUITECTURA OBJETIVO

Adapta el sistema existente hacia un flujo equivalente a:

WhatsApp Cloud API
↓
Message Gateway
↓
Deduplication
↓
Debounce / Message Aggregation
↓
Conversation Lock
↓
Context Builder
↓
Intent + State Analysis
↓
Sales Orchestrator
↓
LLM + Tools
↓
Response Validator
↓
State / Memory Update
↓
Persistence
↓
WhatsApp Response

Responsabilidades de infraestructura:

### PostgreSQL

Source of truth para:

- tenants;
- customers;
- agents;
- products;
- variants;
- inventory;
- conversations;
- messages;
- orders;
- carts;
- payments;
- persistent conversation state;
- customer structured memory;
- audit/evaluation data.

### Redis

Usar como operational/working memory para:

- conversación activa;
- recent context;
- debounce;
- message buffering;
- distributed locks;
- idempotency;
- hot state;
- caches apropiados.

### Qdrant

Usar para recuperación semántica de:

- productos;
- FAQs;
- políticas;
- información comercial;
- conocimiento del tenant.

Qdrant NO debe convertirse en source of truth para precio, stock, disponibilidad, pedidos o información transaccional.

---

# 5. MESSAGE GATEWAY

Fortalece el procesamiento de WhatsApp.

Debe soportar:

## 5.1 Idempotencia

Los webhooks repetidos nunca deben generar respuestas duplicadas.

Utiliza el identificador real del mensaje de WhatsApp (`wamid` o equivalente existente).

Preferentemente:

- restricción persistente/unique cuando corresponda;
- Redis para fast-path idempotency.

Conceptualmente:

`wa:processed:{tenantId}:{messageId}`

Nunca dependas exclusivamente de Redis si perder la información puede producir inconsistencias críticas.

---

# 6. DEBOUNCE / MESSAGE AGGREGATION

WhatsApp permite que un usuario escriba:

"Hola"

"busco zapatillas"

"negras"

"talla 40"

No quiero cuatro respuestas independientes.

Implementa buffering por conversación.

Ventana configurable, aproximadamente 1.5–3 segundos, sin hardcodear innecesariamente.

Agrupa mensajes consecutivos antes de ejecutar el agente cuando sea seguro hacerlo.

Considera:

- texto;
- imágenes;
- audio;
- documentos;
- respuestas a mensajes;
- eventos existentes soportados por el sistema.

No rompas funcionalidades multimedia actuales.

---

# 7. CONVERSATION LOCK

Evita procesamiento concurrente de una misma conversación.

Implementa distributed locking usando Redis con:

- TTL;
- ownership/token;
- liberación segura;
- manejo de excepciones;
- prevención razonable de deadlocks.

La clave debe incluir tenant y conversación.

Ejemplo conceptual:

`wa:lock:{tenantId}:{conversationId}`

Nunca permitir que dos ejecuciones modifiquen simultáneamente el estado conversacional.

---

# 8. CONVERSATION STATE

Implementa un estado estructurado y persistente de conversación.

Adáptalo a los modelos existentes.

Debe poder representar al menos:

- currentStage;
- intent;
- known customer facts;
- necesidades;
- presupuesto;
- categoría;
- características buscadas;
- cantidad;
- ubicación/destino;
- productos mencionados;
- productos recomendados;
- productos descartados;
- producto seleccionado;
- variantes seleccionadas;
- preguntas ya respondidas;
- objeciones;
- información faltante;
- carrito;
- pedido;
- pago;
- última acción;
- next best action;
- handoff state.

NO diseñes el estado exclusivamente para calzado.

VendedorIA debe funcionar con diferentes categorías y negocios.

Utiliza estructuras extensibles.

Ejemplo conceptual:

```ts
interface ConversationState {
  stage: SalesStage;
  intent?: string;

  customerFacts: Record<string, unknown>;
  requirements: Record<string, unknown>;

  discussedProductIds: string[];
  recommendedProductIds: string[];
  rejectedProducts: Array<{
    productId: string;
    reason?: string;
  }>;

  selectedProduct?: {
    productId: string;
    variantId?: string;
  };

  answeredQuestions: Record<string, unknown>;
  objections: string[];
  missingInformation: string[];

  cartId?: string;
  orderId?: string;

  lastAction?: string;
  nextBestAction?: string;
}
```

Redis puede mantener la copia caliente.

PostgreSQL debe proporcionar persistencia apropiada.

Define estrategia explícita de sincronización y recuperación ante cache miss.

---

# 9. PREVENCIÓN DE PREGUNTAS REPETIDAS

Esta funcionalidad es crítica.

Antes de permitir que el agente pregunte algo:

1. revisar ConversationState;
2. revisar customer structured memory;
3. revisar mensajes recientes;
4. revisar summary;
5. determinar si el dato ya fue proporcionado;
6. determinar si realmente es necesario para avanzar.

Si el cliente ya indicó un dato, el agente no debe volver a solicitarlo salvo que:

- sea ambiguo;
- haya cambiado;
- exista contradicción;
- necesite confirmación crítica antes de una operación irreversible.

Implementa guardrails tanto en instrucciones como, cuando sea posible, mediante lógica determinista.

---

# 10. CONTEXT BUILDER

Crear o evolucionar un servicio central equivalente a:

`ConversationContextBuilder`

Debe construir únicamente el contexto necesario para cada ejecución.

No enviar indiscriminadamente toda la conversación.

El contexto debería combinar:

1. system policies;
2. tenant policies;
3. agent configuration/personality;
4. sales playbook;
5. conversation state;
6. relevant customer memory;
7. conversation summary;
8. recent messages;
9. relevant retrieved knowledge;
10. current user message;
11. relevant tool results.

Debe respetar límites de tokens.

Implementa una estrategia configurable de token budget.

Prioriza información por relevancia.

No trunques datos críticos arbitrariamente.

---

# 11. CONVERSATION SUMMARY

Implementa resúmenes incrementales.

No generar únicamente texto libre.

El resumen debería contener información estructurada como:

- situación;
- necesidades;
- decisiones;
- productos considerados;
- productos rechazados y motivo;
- objeciones;
- compromisos;
- datos confirmados;
- temas pendientes;
- siguiente acción.

Ejemplo:

```json
{
  "summary": "Cliente busca un producto para uso diario...",
  "decisions": [],
  "rejected": [],
  "confirmedFacts": {},
  "unresolved": [],
  "nextStep": ""
}
```

No regenerar todo el historial en cada mensaje.

Actualiza el summary de forma incremental cuando corresponda.

---

# 12. CUSTOMER MEMORY

Separar:

- memoria de conversación;
- memoria persistente del cliente.

La memoria persistente puede incluir datos útiles como:

- nombre;
- preferencias explícitas;
- preferencias de producto;
- compras previas;
- tallas/variantes cuando sean relevantes;
- ubicaciones habituales;
- intereses;
- contexto comercial útil.

NO guardar inferencias dudosas como hechos.

Cada memoria debería poder incluir:

- value;
- source;
- confidence;
- timestamp;
- scope;
- expiration cuando corresponda.

Respeta aislamiento multi-tenant.

No utilices información de un tenant dentro de otro.

---

# 13. SALES STATE MACHINE

Implementa una máquina de estados comercial suficientemente flexible.

Estados conceptuales:

- NEW
- DISCOVERY
- QUALIFICATION
- PRODUCT_SEARCH
- RECOMMENDATION
- OBJECTION_HANDLING
- PRODUCT_SELECTED
- CHECKOUT
- PAYMENT_PENDING
- WON
- LOST
- HUMAN_HANDOFF

No fuerces todos los pasos.

Ejemplo:

Cliente:

"Quiero comprar este producto, talla M."

No debe atravesar discovery innecesariamente.

Permite transiciones rápidas cuando la intención es clara.

Las transiciones deben estar controladas por backend.

El LLM puede proponer una transición, pero el sistema debe validarla.

---

# 14. NEXT BEST ACTION ENGINE

No pedir simplemente al modelo "responde al cliente".

Determina el objetivo de cada turno.

Ejemplo:

```json
{
  "stage": "RECOMMENDATION",
  "objective": "help_customer_choose",
  "nextBestAction": "recommend_products",
  "missingCriticalInformation": [],
  "allowedTools": [
    "search_products",
    "get_product"
  ]
}
```

Posibles acciones:

- understand_need;
- ask_critical_question;
- search_products;
- recommend_products;
- compare_products;
- answer_product_question;
- handle_objection;
- confirm_variant;
- check_stock;
- calculate_shipping;
- create_cart;
- initiate_checkout;
- create_payment;
- verify_payment;
- close_sale;
- handoff_to_human.

Debe ser extensible.

---

# 15. TOOL/FUNCTION CALLING

El LLM NO debe inventar información que el backend pueda consultar.

Implementa un Tool Registry extensible aprovechando servicios existentes.

Herramientas conceptuales:

`search_products()`

`get_product()`

`get_product_variants()`

`check_inventory()`

`get_price()`

`calculate_shipping()`

`get_commercial_policy()`

`create_cart()`

`update_cart()`

`create_order()`

`create_payment_link()`

`get_order_status()`

`handoff_to_human()`

Adapta nombres y herramientas a las capacidades reales existentes.

Cada tool debe:

- validar tenant;
- validar argumentos;
- usar DTO/schema;
- manejar errores;
- retornar información estructurada;
- generar logs/telemetría;
- tener timeout apropiado;
- no permitir acceso cross-tenant.

El LLM nunca debe ejecutar SQL directamente.

---

# 16. PRODUCT SEARCH CON QDRANT

Integra Qdrant al catálogo.

Genera representación semántica útil de cada producto usando información como:

- nombre;
- descripción;
- categoría;
- atributos;
- características;
- usos;
- estilo;
- material;
- tags;
- información semánticamente útil.

Payload mínimo:

- tenantId;
- productId;
- categoryId cuando exista;
- active;
- identificadores necesarios.

Implementa upsert/update/delete del índice cuando:

- se crea producto;
- se modifica producto;
- se desactiva;
- se elimina.

Debe existir aislamiento obligatorio por `tenantId`.

---

# 17. HYBRID PRODUCT RETRIEVAL

No dependas únicamente de vector similarity.

Implementa búsqueda híbrida cuando la arquitectura existente lo permita:

- búsqueda semántica;
- filtros estructurados;
- categoría;
- precio;
- atributos;
- disponibilidad;
- variantes.

Flujo:

User intent
→ semantic candidate retrieval
→ structured filtering
→ PostgreSQL authoritative hydration
→ ranking
→ agent.

IMPORTANTE:

Qdrant encuentra candidatos.

PostgreSQL confirma:

- producto activo;
- precio actual;
- stock;
- variantes;
- disponibilidad;
- datos transaccionales.

Nunca responder precio o stock únicamente desde embeddings.

---

# 18. KNOWLEDGE RAG

Qdrant también puede indexar conocimiento del tenant:

- FAQs;
- políticas;
- envíos;
- cambios;
- devoluciones;
- garantías;
- formas de pago;
- información comercial.

Cada chunk debe contener metadata suficiente:

- tenantId;
- sourceId;
- documentType;
- version;
- active.

Implementa retrieval filtrado obligatoriamente por tenant.

Evita recuperar conocimiento irrelevante cuando la pregunta puede responderse mediante datos estructurados/tools.

---

# 19. RESPONSE VALIDATOR

Antes de enviar la respuesta a WhatsApp, ejecutar validaciones.

Detectar al menos:

- precio no respaldado;
- stock no respaldado;
- producto inexistente;
- variante inexistente;
- política comercial incorrecta;
- pregunta repetida;
- afirmaciones incompatibles con tool results;
- referencias ambiguas a productos;
- acciones que requieren confirmación;
- información cross-tenant.

Cuando sea posible, usar validación determinista.

No utilizar otro LLM innecesariamente.

Si una respuesta falla:

- corregir usando datos authoritative;
- regenerar si es necesario;
- registrar el fallo;
- nunca enviar silenciosamente una afirmación crítica no validada.

---

# 20. REFERENCIAS CONVERSACIONALES

El sistema debe resolver correctamente expresiones como:

- "el primero";
- "el segundo";
- "ese";
- "el negro";
- "el más barato";
- "el anterior";
- "me gusta ese";
- "quiero dos";
- "mejor el otro".

Mantén información suficiente sobre productos presentados y su orden.

No vuelvas a buscar desde cero cuando la referencia puede resolverse usando ConversationState.

---

# 21. AGENT PROMPT ARCHITECTURE

Refactoriza la construcción de prompts separando responsabilidades.

Orden conceptual:

SYSTEM POLICY

TENANT POLICY

AGENT PERSONA

SALES PLAYBOOK

CONVERSATION STATE

CUSTOMER MEMORY

CONVERSATION SUMMARY

RELEVANT KNOWLEDGE

RECENT MESSAGES

CURRENT MESSAGE

TOOL RESULTS

No construir un único prompt monolítico difícil de mantener.

Mantener las configuraciones de personalidad existentes.

---

# 22. SYSTEM SALES POLICY

Introduce reglas universales equivalentes a:

- No inventar productos.
- No inventar precios.
- No inventar descuentos.
- No inventar stock.
- No inventar variantes.
- No inventar tiempos de entrega.
- No inventar políticas.
- No repetir preguntas respondidas.
- No solicitar información innecesaria.
- No afirmar como hecho una inferencia incierta.
- Consultar herramientas cuando exista una fuente authoritative.
- Mantener respuestas naturales y apropiadas para WhatsApp.
- Priorizar avanzar la venta sin presionar artificialmente.
- Reconocer cuando no se dispone de información.
- Escalar a humano cuando corresponda.

---

# 23. AGENT PERSONALITY

Conservar la configuración individual existente de cada agente.

La personalidad puede controlar:

- nombre;
- tono;
- formalidad;
- longitud;
- emojis;
- idioma;
- estilo comercial;
- nivel de proactividad.

Pero personalidad NO puede modificar reglas críticas del sistema.

Jerarquía:

System safety/business rules
>
Tenant policy
>
Agent personality
>
User instructions.

---

# 24. HUMAN HANDOFF

Implementa/mejora escalamiento humano.

Motivos:

- cliente solicita humano;
- información crítica no disponible;
- reclamo;
- situación sensible;
- operación no soportada;
- múltiples fallos del agente;
- baja confianza;
- conflicto de datos;
- política del tenant.

Al entrar en HUMAN_HANDOFF:

- evitar que IA continúe respondiendo automáticamente si esa es la política configurada;
- guardar motivo;
- preservar contexto;
- generar resumen para el operador;
- permitir retomar posteriormente la automatización de forma segura.

---

# 25. OBSERVABILIDAD

Cada turno del agente debe ser trazable.

Registrar de forma estructurada, respetando privacidad:

- tenantId;
- conversationId;
- messageId;
- agentId;
- model;
- stage before;
- stage after;
- detected intent;
- nextBestAction;
- tools requested;
- tools executed;
- latencies;
- retrieved sources/IDs;
- validation result;
- token usage;
- estimated cost si la infraestructura actual lo permite;
- outcome;
- error code.

NO registrar secretos, tokens ni credenciales.

Evita almacenar innecesariamente datos personales en logs.

Añade correlation/trace ID por turno.

---

# 26. AI EVALUATION FRAMEWORK

Crear infraestructura de evaluación automatizada.

Quiero poder medir objetivamente si los agentes mejoran.

Métricas mínimas:

- context_retention;
- repeated_question_rate;
- intent_accuracy;
- product_accuracy;
- price_accuracy;
- inventory_accuracy;
- hallucination_rate;
- tool_selection_accuracy;
- state_transition_accuracy;
- reference_resolution_accuracy;
- handoff_accuracy;
- sales_progression.

Crear fixtures/casos de prueba representativos.

Mínimo:

1. cliente no indica presupuesto;
2. cliente ya indicó talla;
3. producto agotado;
4. pregunta por producto inexistente;
5. cliente cambia de opinión;
6. "quiero el segundo";
7. varios mensajes rápidos;
8. pregunta precio + envío + stock;
9. objeción por precio;
10. quiere comprar inmediatamente;
11. cambia variante;
12. retoma conversación anterior;
13. webhook duplicado;
14. mensajes concurrentes;
15. información inexistente;
16. solicitud de humano;
17. catálogo con productos similares;
18. cambio de precio durante conversación;
19. producto desactivado;
20. intento de acceso cross-tenant.

Agrega unit tests, integration tests y e2e tests donde corresponda.

---

# 27. SEGURIDAD MULTI-TENANT

Esta condición es NO NEGOCIABLE.

Todos los componentes deben respetar tenant isolation:

- Redis keys;
- PostgreSQL queries;
- Qdrant filters;
- tools;
- conversations;
- customer memory;
- product search;
- knowledge retrieval;
- logs cuando corresponda.

Nunca confiar en `tenantId` proporcionado directamente por el LLM.

Debe provenir del contexto autenticado/resuelto por backend.

Crear tests explícitos de aislamiento.

---

# 28. RESILIENCIA

Diseñar comportamiento seguro cuando fallen:

- Redis;
- Qdrant;
- proveedor LLM;
- WhatsApp API;
- PostgreSQL;
- embeddings;
- tool externo.

Ejemplos:

Si Qdrant falla:
→ usar fallback de búsqueda estructurada cuando sea posible.

Si Redis pierde estado:
→ reconstruir desde PostgreSQL.

Si LLM falla:
→ retry controlado según política existente.

Si WhatsApp falla:
→ usar mecanismo existente de retry/outbox si existe; si no existe y es necesario, diseñarlo cuidadosamente.

No introducir retries infinitos.

---

# 29. PERFORMANCE

Evitar:

- consultas N+1;
- embeddings en cada mensaje sin necesidad;
- recuperar todo el catálogo;
- recuperar toda la conversación;
- múltiples llamadas LLM innecesarias;
- reindexaciones completas por cambios individuales;
- summaries en cada turno si no son necesarios.

Paraleliza operaciones independientes cuando sea seguro.

Implementa caching solo donde mantenga consistencia aceptable.

---

# 30. CONTROL DE COSTOS LLM

La arquitectura debe ser eficiente.

Implementa/respeta:

- token budget;
- compact structured state;
- recent-message window;
- incremental summaries;
- retrieval top-K configurable;
- evitar llamadas LLM redundantes;
- evitar enviar información de productos irrelevantes;
- modelos configurables por tarea si la abstracción existente lo permite.

No sacrificar precisión crítica por ahorrar unos tokens.

---

# 31. CONFIGURACIÓN

Los parámetros operativos deben poder configurarse apropiadamente:

- debounce duration;
- recent messages limit;
- summary threshold;
- retrieval top-K;
- similarity threshold;
- context token budget;
- memory TTL;
- conversation lock TTL;
- confidence thresholds;
- handoff thresholds.

Utiliza el sistema de configuración existente.

No dispersar magic numbers.

---

# 32. MIGRACIONES

Si necesitas modificar PostgreSQL:

- usa el ORM/migration system existente;
- crea migraciones reversibles cuando sea viable;
- no borres datos;
- mantén compatibilidad;
- añade índices necesarios;
- añade constraints de idempotencia;
- documenta cualquier backfill.

No ejecutar operaciones destructivas.

---

# 33. BACKFILL DE QDRANT

Implementa un mecanismo seguro para indexar productos existentes.

Debe ser:

- idempotente;
- paginado;
- reanudable cuando sea posible;
- filtrado por tenant;
- observable;
- capaz de actualizar registros existentes.

No depender únicamente de nuevos productos para poblar el índice.

Haz lo equivalente para knowledge base si ya existe contenido.

---

# 34. NO FINE-TUNING POR AHORA

No implementes fine-tuning como solución primaria.

Primero resolver mediante:

- context engineering;
- structured state;
- tool calling;
- RAG;
- memory;
- deterministic validation;
- evaluation.

Deja arquitectura extensible para fine-tuning futuro si tiene sentido, pero no es parte obligatoria de esta implementación.

---

# 35. COMPATIBILIDAD

Las conversaciones actuales deben seguir funcionando durante la transición.

Si es necesario, utiliza:

- feature flags;
- rollout gradual;
- compatibilidad con legacy agent pipeline.

Preferiblemente permitir algo equivalente a:

`legacy`

y

`sales-engine-v2`

si la arquitectura actual hace viable esa estrategia.

No inventes feature flags si el proyecto ya tiene un mecanismo equivalente.

---

# 36. ESTRATEGIA DE IMPLEMENTACIÓN

Trabaja incrementalmente.

Orden recomendado:

### Fase 1 — Reliability

- auditoría;
- idempotencia;
- debounce;
- locks;
- tests del gateway.

### Fase 2 — Context

- ConversationState;
- Redis working memory;
- PostgreSQL persistence;
- Context Builder;
- summary;
- prevención de preguntas repetidas.

### Fase 3 — Grounding

- Tool Registry;
- product tools;
- stock;
- precio;
- shipping;
- cart/order/payment según capacidades existentes.

### Fase 4 — Retrieval

- Qdrant product index;
- embeddings;
- hybrid search;
- tenant filters;
- backfill.

### Fase 5 — Sales Intelligence

- Sales State Machine;
- Next Best Action;
- reference resolution;
- objections;
- customer memory.

### Fase 6 — Reliability/Quality

- Response Validator;
- handoff;
- fallbacks;
- observabilidad.

### Fase 7 — Evaluation

- evaluation datasets;
- automated metrics;
- regression suite;
- benchmarks.

Puedes adaptar el orden cuando dependencias reales del repositorio lo justifiquen.

---

# 37. DEFINITION OF DONE

La implementación NO está terminada simplemente porque compile.

Debe comprobarse como mínimo que:

### Caso A

Cliente:

"Busco zapatillas negras talla 40 máximo 180"

Después:

"¿Qué tienes?"

El agente NO pregunta nuevamente talla/color/presupuesto.

### Caso B

Cliente:

"Me gusta el segundo."

El agente identifica correctamente el segundo producto previamente presentado.

### Caso C

Cliente:

"¿Tienes talla 40?"

El agente consulta información authoritative antes de confirmar stock.

### Caso D

Cliente envía rápidamente:

"Hola"

"quiero zapatillas"

"negras"

"talla 40"

El sistema evita cuatro respuestas incoherentes.

### Caso E

WhatsApp reenvía el mismo webhook.

No se genera respuesta duplicada.

### Caso F

Conversación larga.

El agente mantiene decisiones importantes aunque los mensajes originales hayan salido de la recent window.

### Caso G

Qdrant retorna un producto cuyo precio indexado quedó desactualizado.

El agente responde con el precio actual de PostgreSQL.

### Caso H

Producto agotado.

El agente no inventa disponibilidad y puede recomendar alternativas.

### Caso I

Tenant A y Tenant B tienen productos similares.

El agente del tenant A jamás recupera información del tenant B.

### Caso J

Cliente quiere comprar inmediatamente.

El agente no fuerza preguntas de discovery innecesarias y avanza al cierre.

---

# 38. CALIDAD DE CÓDIGO

Todo código debe:

- seguir las convenciones actuales;
- usar TypeScript estricto según configuración existente;
- evitar `any` salvo justificación real;
- aplicar SOLID pragmáticamente;
- usar DTOs/schemas;
- manejar errores tipados;
- mantener separación de responsabilidades;
- ser testeable;
- evitar abstracciones innecesarias;
- evitar archivos gigantes;
- documentar únicamente lógica no evidente.

No agregues dependencias cuando el proyecto ya tiene una solución equivalente.

Antes de instalar una dependencia, comprueba si realmente es necesaria.

---

# 39. DOCUMENTACIÓN FINAL

Al terminar, documenta:

## Architecture

Qué cambió y por qué.

## Data Flow

WhatsApp → Gateway → Context → Orchestrator → Tools → Validator → WhatsApp.

## Redis

Keys utilizadas, TTL y responsabilidad.

## PostgreSQL

Nuevas tablas/campos/índices.

## Qdrant

Collections, payloads, filtros y estrategia de sincronización.

## Agent Engine

Cómo funciona:

- state;
- memory;
- tools;
- retrieval;
- validation;
- next best action.

## Operations

Cómo:

- ejecutar backfill;
- reconstruir índice;
- diagnosticar conversación;
- ejecutar tests;
- ejecutar evals;
- revisar métricas.

---

# 40. RESULTADO ESPERADO

Al finalizar quiero que VendedorIA haya evolucionado desde:

"LLM que recibe mensajes y genera respuestas"

hacia:

"AI Sales Engine stateful que entiende al cliente, recuerda información relevante, consulta herramientas authoritative, encuentra productos mediante retrieval híbrido, mantiene el proceso comercial, evita preguntas repetidas, valida hechos críticos, ejecuta acciones comerciales y aprende de métricas de evaluación."

La prioridad absoluta es:

**precisión > coherencia > avance comercial > velocidad > costo**

para hechos críticos.

---

# 41. INSTRUCCIONES DE EJECUCIÓN PARA CODEX

Ahora:

1. Inspecciona primero el repositorio completo y sus instrucciones locales.
2. Busca `AGENTS.md`, documentación técnica, README y reglas del proyecto.
3. Analiza el pipeline actual antes de modificarlo.
4. Identifica qué partes de esta arquitectura ya existen.
5. Reutiliza lo existente.
6. Presenta brevemente el plan técnico basado EN EL CÓDIGO REAL.
7. Implementa por fases.
8. Ejecuta lint/typecheck/tests relevantes después de cada bloque importante.
9. Corrige errores provocados por tus cambios.
10. Añade tests para cada comportamiento crítico.
11. No ocultes tests fallidos.
12. No realices cambios destructivos.
13. No cambies secretos ni credenciales.
14. No modifiques infraestructura productiva directamente.
15. No hagas `git push`, merge ni despliegue a producción salvo instrucción explícita.
16. Mantén un registro claro de archivos modificados y decisiones arquitectónicas.
17. Si encuentras diferencias entre este prompt y la arquitectura real, prioriza una integración técnicamente correcta con el sistema existente y documenta la decisión.
18. No dejes pseudocódigo en funcionalidades que deban quedar operativas.
19. No marques una fase como terminada sin sus pruebas correspondientes.
20. Al terminar, entrega un resumen con:
   - arquitectura encontrada;
   - arquitectura implementada;
   - archivos principales modificados;
   - migraciones;
   - nuevas variables/configuración;
   - Redis keys;
   - cambios Qdrant;
   - tools disponibles;
   - tests ejecutados;
   - resultados;
   - pendientes reales;
   - riesgos;
   - pasos necesarios antes del deployment.

Comienza inspeccionando el repositorio. No asumas que los nombres, entidades o servicios descritos en este prompt existen exactamente con esos nombres.