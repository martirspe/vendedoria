# Hoja técnica de VendedorIA

| Identificación | Especificación |
| --- | --- |
| Producto | VendedorIA |
| Tipo | Plataforma SaaS multiempresa de venta asistida por inteligencia artificial y comercio electrónico |
| Fecha de corte | 5 de octubre de 2026 |
| Versión declarada del monorepositorio | `0.1.0` |
| Revisión de código | `766aed0` |
| Idioma de las interfaces | Español |
| País y moneda predeterminados | Perú y soles peruanos (`PE`, `PEN`) |
| Organización técnica | Monorepositorio privado con npm workspaces |
| Superficies implementadas | Web comercial, consola del negocio, API, tienda pública por negocio y API de acceso de operadores de plataforma |

## 1 Naturaleza y alcance del producto

VendedorIA permite a un negocio configurar vendedores de inteligencia artificial que atienden conversaciones comerciales en WhatsApp e Instagram, consultan su catálogo y conocimiento aprobado, recomiendan productos, coordinan entrega, crean pedidos y generan enlaces de pago. El operador dispone de una bandeja para intervenir, pausar la automatización y continuar la atención.

La plataforma incorpora catálogo, variantes, inventario compartido, conjuntos de productos, servicios, productos digitales, cupones, pedidos, cobros, configuración de envíos y métricas. La tienda web es una integración activable según el plan; comparte las reglas comerciales y los datos del negocio con el vendedor conversacional.

El producto también incluye edición visual de tiendas, generación de textos e imágenes con IA, temas versionados, dominios propios, medición con Meta Pixel y Google Analytics 4, gestión de equipo, recuperación consentida de selecciones de compra, recomendaciones comerciales y un panel de ventas manuales para TikTok LIVE.

La separación entre negocios se basa en un `tenantId`. En la consola se obtiene de la sesión autenticada; en la tienda se resuelve a partir del host. El comprador compra como invitado y accede a su pedido mediante un token de capacidad.

## 2 Superficies y organización del sistema

| Superficie | Implementación | Función |
| --- | --- | --- |
| Web comercial | `apps/web` | Presentación comercial, acceso, registro y documentos legales |
| Consola | `apps/web`, rutas `/app/*` | Configuración y operación del negocio |
| API | `apps/api` | Autenticación, datos, automatización y reglas comerciales |
| Tienda pública | `apps/store` | Catálogo, carrito, checkout, pedido y contenido legal del negocio |
| Acceso de plataforma | Módulo `platform` de la API | Autenticación separada, permisos y CLI de operadores |
| Componentes compartidos | `packages/ui` | Componentes Angular del sistema de diseño |
| Identidad visual | `packages/design-tokens` | Tokens de consola y tienda |
| Contratos de tienda | `packages/contracts` | Tipos compartidos entre API y tienda |
| Temas | `packages/themes` | Manifiestos, releases, compatibilidad, presets y migraciones |

El backend se organiza por módulos NestJS con controllers, servicios y acceso a Prisma. La persistencia comercial reside en PostgreSQL. Redis acelera coordinación y caché y sirve como backend de BullMQ; Qdrant es opcional y mantiene índices reconstruibles.

## 3 Tecnologías y dependencias

Las versiones siguientes corresponden a declaraciones de dependencias y etiquetas de infraestructura del repositorio.

| Componente | Tecnología o versión declarada |
| --- | --- |
| Entorno de ejecución | Node.js `>=22` |
| Gestión del proyecto | npm workspaces |
| Backend | NestJS `^11.0.1` |
| Servidor HTTP del backend | Adaptador Fastify de NestJS |
| ORM y migraciones | Prisma `^6.13.0` |
| Base de datos Docker | PostgreSQL `16-bookworm` |
| Frontend de consola y tienda | Angular `^22.1.0` |
| SSR Angular | `@angular/ssr` `^22.1.2` |
| Servidores SSR | Express `^5.1.0` |
| Programación reactiva | RxJS `7.8.x` |
| Colas de recuperación | BullMQ `^6.3.11` |
| Cliente Redis | ioredis `^6.0.0` |
| Redis Docker | `7.4-alpine` |
| Qdrant Docker | `v1.19.1` |
| Tratamiento de imágenes | sharp `^0.35.5` |
| Almacenamiento y correo AWS | SDK de S3 y SES v2 `^3.1146.0` |
| Validación HTTP | class-validator y class-transformer |
| Autenticación | JWT, Passport y bcryptjs |
| Documentación de API | Swagger de NestJS |
| Pruebas de API | Jest `^30.0.0` y ts-jest |
| Pruebas de consola | Vitest `^4.0.8` |
| Iconografía | Registro propio de SVG derivado de Lucide |
| Infraestructura declarativa | Terraform para medios, correo, IAM y DNS |

Angular utiliza componentes standalone, signals, detección `OnPush`, carga diferida de rutas y control de flujo nativo. El código y los identificadores técnicos están en inglés; el contenido visible del producto está en español.

## 4 Negocios usuarios y sesiones

### 4.1 Alta y configuración del negocio

El registro público recibe nombre, correo, contraseña y nombre del negocio. Crea la cuenta, el tenant, la membresía de propietario y un vendedor inicial. El negocio comienza con catorce días de prueba de Crece. La configuración general admite nombre del negocio, código de país de dos caracteres y código de moneda de tres caracteres.

El registro y el inicio de sesión disponen de límites por IP. Cloudflare Turnstile valida las acciones protegidas cuando se configura su secreto. El correo de usuario es único.

### 4.2 Roles del negocio

| Rol | Responsabilidad y restricciones |
| --- | --- |
| `OWNER` | Propietario del negocio; administra configuración, equipo, integraciones, plan y operación |
| `ADMIN` | Administrador del negocio; gestiona las funciones autorizadas a responsables sin quitar ni cambiar el rol del propietario |
| `AGENT` | Asesor operativo; trabaja en conversaciones y pedidos y tiene restricciones en gestión de plan, integraciones, canales y equipo |

La autorización específica se aplica en los servicios de cada dominio. Los tokens de negocio incluyen usuario, tenant y rol de membresía.

### 4.3 Equipo e invitaciones

La gestión de equipo requiere la integración `team` activa y disponibilidad de asientos en el plan. Los miembros y las invitaciones pendientes ocupan cupo. El propietario o administrador genera una invitación a un correo y elige entre administrador y asesor.

El enlace se muestra una sola vez, es de un solo uso y vence a los siete días. La base guarda su hash. El envío del enlace se realiza por el operador; esta función no envía automáticamente un correo de invitación. Aceptarlo permite establecer nombre y contraseña y acceder al negocio.

Reinvitar al mismo correo reemplaza la invitación anterior. Se puede cancelar una invitación, cambiar el rol de un miembro o retirarlo. Se protege al propietario y se impide cambiar el propio rol o eliminarse a sí mismo. Cambiar roles revoca sesiones de renovación. Retirar a un miembro cuya única membresía era ese negocio elimina su cuenta y libera su correo.

### 4.4 Perfil y ciclo de sesión

El usuario puede editar su nombre, consultar su correo, cambiar su contraseña con la contraseña actual, consultar sesiones y revocar las de otros dispositivos. El correo del perfil es de solo lectura.

El token de acceso del negocio dura quince minutos. El refresh token es aleatorio, se almacena mediante hash, rota al renovarse y tiene una duración predeterminada de treinta días. Cerrar sesión revoca el refresh token del dispositivo. Cambiar contraseña mantiene el dispositivo actual y revoca las demás sesiones de negocio.

La estrategia JWT de negocio valida firma y expiración y obtiene el rol del propio token; no vuelve a consultar la membresía en cada petición. Un acceso ya emitido puede conservar su autorización hasta expirar después de un cambio de rol o retiro de membresía.

### 4.5 Operadores de plataforma

Los roles de plataforma son `SUPERADMIN` y `ADMIN`, independientes de las membresías de negocios. Se asignan mediante la CLI `create-admin`. La CLI permite alta, cambio de rol, restablecimiento de contraseña y revocación y protege al último superadministrador. Los cambios se registran en `PlatformAuditLog`.

La sesión de plataforma tiene token de acceso de diez minutos y renovación durante doce horas. Consulta el rol en base de datos en cada petición. Los tokens de plataforma y negocio se rechazan mutuamente en las rutas del otro ámbito.

El código define permisos de lectura de tenants y facturación, suspensión, borrado, concesión de planes, asistencia, gestión de integraciones, métricas, auditoría y operadores. El administrador de plataforma recibe un subconjunto sin dinero, operadores, credenciales globales ni borrado. La API expuesta actualmente contiene login, refresh y consulta de identidad y permisos; la definición de un permiso no implica que exista una pantalla o endpoint operativo para cada acción.

## 5 Vendedores de inteligencia artificial

### 5.1 Configuración

Se pueden crear, consultar, editar y eliminar vendedores y asignarlos a canales. El vendedor primario se identifica a partir del primero creado para el negocio.

| Grupo | Propiedades configurables |
| --- | --- |
| Identidad | Nombre del vendedor, nombre y descripción de empresa, audiencia |
| Personalidad | Preset, estilo de comunicación, estilo de venta y longitud de respuesta |
| Expresión | Uso de emojis, paleta de emojis y palabras a evitar |
| Mensajes | Saludo inicial, confirmación de compra y derivación humana |
| Reglas | Instrucciones comerciales, manejo de objeciones y técnicas de venta |
| Automatización | Activación y pausa al derivar |
| Límites comerciales | No ofrecer descuentos arbitrarios, no inventar envíos y usar hechos del catálogo |
| Prompt | Modo guiado o prompt personalizado para la personalidad |

El prompt personalizado sustituye la sección de personalidad. La política universal de veracidad y control comercial conserva prioridad.

### 5.2 Técnicas comerciales disponibles

El playbook contiene descubrimiento, presentación de beneficios, manejo de objeciones, cierre asumido, cierre por alternativa, microcompromisos, venta de mayor valor, venta cruzada, escasez real, urgencia respaldada, prueba social respaldada, reciprocidad y seguimiento de indecisos.

Las técnicas dependen de datos del catálogo, reglas y conocimiento del negocio. La escasez exige una señal real de bajo stock; los plazos, testimonios y promociones requieren respaldo. El vendedor no dispone de una herramienta para fijar descuentos libres.

### 5.3 Calidad de configuración y playground

La API calcula un indicador de calidad de configuración del vendedor, incorporando información del agente y del conocimiento. La consola dispone de un playground con sesiones, historial, envío de mensajes y reinicio. El playground utiliza estado propio y pedidos de prueba; permite inspeccionar el comportamiento y el prompt sin enviar la conversación a un comprador real.

## 6 Motor de ventas con estado persistente

### 6.1 Modos de ejecución

`SALES_ENGINE_MODE` admite `sales-engine-v2` y `legacy`. El valor predeterminado del gateway es `sales-engine-v2`. El modo anterior conserva el recorrido síncrono; el motor v2 captura textos de WhatsApp e Instagram de forma durable y procesa generación y envío de manera asíncrona.

OpenAI es opcional para el runtime conversacional. Cuando no está disponible o se agota la cuota de respuestas con IA, existen respuestas deterministas basadas en catálogo y reglas. La generación de contenido visual de tienda y los embeddings tienen requisitos propios.

### 6.2 Ingreso agrupación y exclusión

El flujo v2 verifica el webhook, resuelve canal y tenant, persiste el mensaje y deduplica mediante `Message.inboundKey`, que es único. La clave incluye tenant, canal e identificador externo. PostgreSQL conserva los mensajes pendientes mediante `enginePending`; Redis añade deduplicación rápida y un buffer de identificadores.

El gateway sondea cada 500 milisegundos, agrupa hasta veinte mensajes consecutivos y espera una ventana de silencio de dos segundos por defecto. Utiliza lease Redis y exclusión PostgreSQL. La exclusión de base de datos es obligatoria incluso con Redis disponible. La concurrencia inicial es uno y se puede configurar entre uno y ocho.

### 6.3 Estado comercial

`Conversation.salesState` y `PlaygroundSession.salesState` almacenan un JSON versionado con intención, etapa, número de turnos, requisitos, hechos confirmados, recomendaciones actuales y anteriores, selección, productos descartados, objeciones, preguntas respondidas, información faltante, líneas pendientes, pedido, pago, acción anterior, siguiente acción y motivo de derivación.

Las etapas implementadas son `NEW`, `DISCOVERY`, `QUALIFICATION`, `PRODUCT_SEARCH`, `RECOMMENDATION`, `OBJECTION_HANDLING`, `PRODUCT_SELECTED`, `CHECKOUT`, `PAYMENT_PENDING`, `WON`, `LOST` y `HUMAN_HANDOFF`.

El estado incluye un resumen estructurado de situación, decisiones, hechos, asuntos pendientes y próximo paso. Su actualización es determinista y no requiere una llamada adicional al modelo. Las conversaciones previas pueden hidratar sus hechos leyendo historial antiguo en páginas de cien mensajes, sin enviar todo el historial al modelo.

Las líneas pendientes representan la selección de compra conversacional. Un pedido activo ya vinculado se consulta cuando el cliente vuelve a solicitar pagar, para evitar crear otro pedido por la misma selección.

### 6.4 Memoria del cliente

`SalesCustomerMemory` se identifica por tenant y una clave SHA-256 derivada del canal y thread resueltos por backend. Almacena hechos explícitos, procedencia, fecha y expiración. No une identidades de canales distintos mediante inferencias.

El nombre y ciertas preferencias explícitas habituales pueden persistir como memoria del cliente. Talla, color y presupuesto de una compra permanecen en su conversación. La extracción determinista conserva expresiones reconocidas y no convierte una talla ambigua en una selección confirmada. La expiración de memoria es lógica; no implica purga automática del historial de mensajes.

### 6.5 Herramientas de lectura

| Herramienta | Información autoritativa |
| --- | --- |
| `search_products` | Búsqueda del catálogo del tenant |
| `get_product` | Ficha del producto |
| `get_product_variants` | Variantes válidas |
| `check_inventory` | Disponibilidad e inventario actuales |
| `get_price` | Precio registrado |
| `calculate_shipping` | Cotización según configuración y subtotal calculado por backend |
| `get_commercial_policy` | Políticas comerciales aprobadas |
| `get_order_status` | Estado del pedido de la misma conversación |

Los DTO de herramientas rechazan campos desconocidos, incluido `tenantId`. El tenant procede del contexto de ejecución. El function calling está acotado a lectura, hasta dos rondas de herramientas y tres llamadas de generación, con presupuesto de contexto y límites de tiempo. Los resultados se incorporan como datos.

La creación de pedidos, enlaces de pago y derivaciones se conserva en decisiones del runtime y servicios comerciales. No se ofrecen herramientas generales de SQL, escritura arbitraria, cobros de suscripción ni descuentos libres.

### 6.6 Recuperación de conocimiento

La búsqueda combina ranking léxico PostgreSQL con candidatos semánticos de Qdrant cuando están configurados Qdrant y OpenAI. El modelo de embeddings predeterminado es `text-embedding-3-small`; la colección predeterminada tiene 1536 dimensiones y distancia Cosine.

Los documentos indexados son productos y preguntas frecuentes, separados por tenant, tipo, origen, chunk, versión y actividad. Los vectores no son autoridad para precios, stock, pagos o enlaces de acceso digital. Los candidatos se hidratan en PostgreSQL y las preguntas frecuentes se vuelven a validar como aprobadas y publicadas.

`SalesSearchJob` es un outbox transaccional para indexación. Los cambios semánticos de productos, variantes y FAQs generan trabajos; los cambios exclusivamente de precio o stock no regeneran embeddings. La indexación tiene reintentos y backoff. El endpoint de backfill permite reconstrucción paginada por tenant. Ante fallos del índice o de embeddings se utiliza búsqueda PostgreSQL.

### 6.7 Validación y derivación

El validador contrasta importes, atribución de precios, disponibilidad, variantes, políticas, entrega, preguntas repetidas y afirmaciones de pago o reserva. Rehidrata el catálogo después de generar para detectar cambios de precio durante el turno. Una validación fallida produce una respuesta determinista con los datos actuales; fallos consecutivos que alcanzan el umbral configurado derivan a un humano y pausan el agente.

Las comprobaciones cubren hechos estructurados y patrones reconocidos. No constituyen una garantía de veracidad absoluta de todo texto libre generado.

### 6.8 Persistencia de turnos y envíos

`SalesEngineTurn` conserva lote, estado, respuesta y traza. El turno se registra como `STARTED` antes de una acción comercial y pasa a `READY` junto con el estado actualizado y el consumo del lote. La salida pasa por `READY`, `SENDING` y `SENT`.

Una interrupción en `STARTED` requiere revisión porque pudo crear un pedido. Un envío iniciado sin confirmación pasa a `UNKNOWN` y no se reenvía automáticamente. Las fotos se envían después de confirmar el texto; un fallo de foto no provoca el reenvío del texto.

Antes de operar comercio y antes de enviar se comprueba que la conversación no haya sido pausada. Un mensaje manual o plantilla de operador pausa al vendedor antes de la llamada externa. Reactivarlo en la bandeja conserva el contexto persistido.

## 7 Conocimiento del negocio

El módulo de conocimiento permite crear, editar, eliminar, importar mediante texto pegado y aprobar preguntas frecuentes. Cada FAQ tiene pregunta, respuesta, tags, fuente, estado de revisión, publicación y orden. Las fuentes son manual e importación pegada; los estados son borrador y aprobada.

El vendedor utiliza FAQs publicadas y aprobadas. Los journeys contienen título, etapa, guion, activación y orden. Sus etapas son descubrimiento, recomendación, cierre y soporte. Este conocimiento complementa las fichas de catálogo y las reglas de personalidad.

## 8 Canales y bandeja de conversaciones

### 8.1 WhatsApp e Instagram

La API permite conectar y desconectar canales, consultar estado, consultar diagnósticos de WhatsApp y simular entradas en el recorrido de desarrollo. Los tipos de canal persistidos son WhatsApp, Instagram y TikTok LIVE.

Los modos declarados para WhatsApp son coexistencia y número nuevo de WABA. Los estados de salud son conectado, degradado, desconectado y pendiente. Un canal se vincula a un vendedor del mismo tenant. Instagram requiere su integración activa.

Los webhooks Meta tienen verificación de suscripción por GET y recepción por POST. El raw body se conserva para comprobar firmas sobre los bytes exactos.

El ingreso comercial del gateway de WhatsApp e Instagram procesa texto. Existen envío de fotos y referencias de carrito de tienda. No existe recepción y transcripción de audio, imágenes o documentos entrantes en ese gateway.

### 8.2 Bandeja operativa

La bandeja lista conversaciones y admite búsqueda y filtros por canal, desatención y actividad comercial. Permite consultar historial, modificar estado y banderas, pausar o activar al vendedor, enviar mensajes humanos, enviar plantillas y trabajar pedidos vinculados.

Las conversaciones tienen estados abierta, pausada y cerrada. Los mensajes distinguen entrada o salida y autor comprador, vendedor IA, operador humano o sistema.

La actualización en tiempo real utiliza SSE autenticado. Los eventos de bandeja contienen identificadores de conversación; la consola obtiene los detalles mediante una petición autenticada. Los filtros de bandeja y pedidos pueden mantenerse en parámetros de URL.

## 9 Catálogo y clasificación

### 9.1 Tipos de oferta

| Tipo | Capacidades |
| --- | --- |
| Producto físico | Precio, inventario, variantes, ficha y reglas de entrega |
| Servicio | Precio, requisitos, cobertura, políticas y nota de coordinación |
| Producto digital | Precio, formato, licencia, duración de acceso, enlace e instrucciones de entrega |
| Conjunto | Composición de productos y consumo de inventario de sus componentes |

La nota de servicio registra la preferencia del comprador; no confirma una reserva de agenda. El contenido de entrega digital se conserva en el snapshot del pedido para resistir cambios posteriores del catálogo.

### 9.2 Ficha de producto

La ficha contiene handle, nombre, SKU, descripciones corta y completa, tipo, categorías, marca, línea, precio base, moneda, precio de comparación, disponibilidad, inventario, publicación en tienda, orden y SEO.

El contenido enriquecido admite especificaciones de nombre y valor, público, beneficios, uso, contenido, garantía, preguntas frecuentes, palabras de búsqueda, casos de uso, exclusiones, compatibilidad, condiciones de cambio, requisitos, cobertura y cancelación. Hay campos específicos para formato, licencia y acceso digital, así como tamaño, familia, intensidad y notas aromáticas.

Las fotos tienen URL, tipo, texto alternativo y contenido complementario. Se admiten hasta doce medios en el DTO estructurado, veinte componentes de conjunto y quinientas variantes por producto.

### 9.3 Variantes

Las variantes tienen SKU, opciones, precio, herencia de precio, disponibilidad, inventario e imagen. El formato estructurado admite hasta cinco opciones por variante y conserva compatibilidad con tres pares de opción históricos. La combinación válida determina el precio y stock que se muestran y que el checkout acepta.

Las operaciones de inventario pueden enviar el stock esperado al comenzar la edición para detectar cambios concurrentes debidos a reservas.

### 9.4 Clasificación jerárquica

`CatalogCategory` permite jerarquías por tipo de producto y definiciones de atributos en JSON. Los atributos se heredan de raíz a hoja y la clave estable permite sobrescribir una definición. La validación rechaza ciclos, padres inválidos, jerarquías excesivas, atributos ajenos, valores fuera de opciones y campos obligatorios ausentes.

Las características validadas se materializan en el contrato de hechos del producto, utilizado por tienda y vendedor. La API de catálogo expone consulta de categorías; la presencia del modelo no equivale a un administrador independiente de taxonomías.

### 9.5 Importación de paquetes

La importación utiliza `catalog.json` y sus fotos referenciadas. El recorrido separa vista previa, carga de medios e importación. La planificación de la vista previa y la escritura comparten reglas.

| Límite o control | Especificación |
| --- | --- |
| Productos por paquete | Hasta 2000, sujeto al cupo del plan |
| Imágenes por paquete | Hasta 3000 |
| Texto del catálogo en DTO | Hasta 800000 caracteres |
| Identificación de fotos | Ruta y SHA-256 del archivo original |
| Actualización de precios | Opción explícita |
| Actualización de stock | Opción explícita |
| Sincronización completa | Puede retirar de publicación productos ausentes o inactivos |
| Configuración de tienda incluida | Aplicación opcional de diseño, envío e imágenes |

La reimportación reemplaza los campos aportados por el paquete y conserva los campos de detalle escritos en consola que no pertenecen a esa importación.

## 10 Inventario y reservas

El inventario se comparte entre consola, vendedor, tienda y LIVE. Admite stock controlado o ilimitado, disponibilidad de producto y variante y asignaciones de componentes de conjuntos.

Las reservas se ejecutan en transacciones y conservan las asignaciones necesarias para restituir unidades. En un pedido el estado de stock diferencia ausencia de asignación, retenido, vendido y liberado. La cancelación o expiración libera la retención según las reglas de liquidación.

El checkout web estándar conserva una reserva durante quince minutos. Un barrido del backend revisa vencimientos cada minuto. LIVE utiliza la expiración de su reserva y transfiere la asignación al pedido sin descontar stock por segunda vez.

Guardar una selección para recuperación de carrito no reserva inventario. Mostrar una recomendación o una sugerencia de vendedor tampoco constituye una reserva.

## 11 Pedidos y cumplimiento

Los pedidos pueden originarse en web, WhatsApp, Instagram, operación manual o TikTok LIVE. Tienen código breve de referencia, moneda, subtotal, descuento, envío y total, todos los importes monetarios en centavos enteros.

Los estados de pedido son borrador, pendiente de pago, pagado, en preparación, enviado, completado y cancelado. El detalle conserva cliente, documento, entrega, nota de servicio, cupón, líneas, pagos, eventos, vencimiento y datos de seguimiento.

Cada línea conserva título, handle, cantidad, precio unitario, total, asignaciones de conjunto y snapshot de cumplimiento. Las relaciones con producto o variante pueden quedar nulas tras eliminar el catálogo, manteniendo el detalle histórico.

La consola permite listar, consultar, crear pedidos, generar enlaces de pago, conciliar, previsualizar correo y actualizar estado. Marcar una entrega a domicilio como enviada exige el código de seguimiento definido por el servicio.

Los pedidos públicos tienen un token de acceso. Los identificadores por sí solos no sustituyen esa autorización. El checkout y los intentos de pago mantienen claves y hashes para repetición idempotente y detección de cambios en la solicitud.

## 12 Cobros del comprador y facturación SaaS

### 12.1 Separación de flujos

| Flujo | Pagador y beneficiario | Dominio persistido |
| --- | --- | --- |
| A | El negocio paga su plan o chats adicionales a la plataforma | `BILLING_SUBSCRIPTION` |
| B | El comprador paga un pedido del negocio | `COMMERCE_CHECKOUT` |

Los dominios, credenciales, webhooks, registros y mensajes comerciales se mantienen separados. El cobro de una venta utiliza la cuenta Mercado Pago del negocio.

### 12.2 Cuenta de cobro del negocio

Cada tenant puede conectar su cuenta Mercado Pago y consultar su estado. Se almacenan credenciales por tenant y proveedor. El access token y secreto de webhook utilizan AES-256-GCM con una clave de 32 bytes. La vista pública de configuración devuelve la public key y estados, sin devolver secretos.

La clave `PAYMENT_CREDENTIALS_KEY` acepta 64 caracteres hexadecimales o codificación base64 de 32 bytes. El formato cifrado incluye versión, IV, tag y ciphertext.

La conexión y desconexión de cuenta requiere propietario o administrador. El simulador de pagos está permitido fuera de producción. En producción no se utiliza el simulador como sustituto de una cuenta de cobro.

### 12.3 Checkout y pago

La tienda permite pago con tarjeta y Yape mediante Mercado Pago. El backend valida productos, variante, precio, moneda, stock, cupón, entrega y total. La solicitud de pago recibe un token del proveedor y los campos específicos del método. El negocio también puede generar un enlace de pago de pedido desde consola o vendedor.

Los pagos tienen estado pendiente, exitoso, fallido o cancelado y una clave de idempotencia única. El webhook de comercio se publica por tenant y verifica la firma, deduplicación y correspondencia del pago. El estado del proveedor se concilia con el pedido y las reservas.

Un pago confirmado después de liberar o cancelar la reserva se registra como `paid_late` para revisión; no recupera automáticamente stock liberado. Un reembolso o contracargo puede reflejarse como `refunded` en el estado operativo; no devuelve automáticamente inventario LIVE.

### 12.4 Recibos y notificaciones

El sistema genera correos de pedido con contenido del negocio, productos, importes y cumplimiento. El envío real utiliza Amazon SES v2 o Resend según configuración; el modo de vista previa prepara el correo sin envío real. La consola permite previsualizarlo y consultar su estado.

Las notificaciones al comprador reutilizan el messenger del canal y las rutas públicas de resultado y pedido. Los estados de correo persistidos incluyen pendiente, vista previa, enviado y fallido.

## 13 Envíos y recojo

La configuración de envíos pertenece al negocio y puede usarse por vendedor y tienda sin exigir la integración de tienda. Los datos se almacenan en la fila `Storefront`, que se crea al primer uso si es necesario.

| Parámetro | Función |
| --- | --- |
| Entrega habilitada | Permite cotización y entrega de bienes |
| Recojo habilitado | Permite retiro en la dirección configurada |
| Dirección de recojo | Dirección del negocio |
| Ubigeo de origen | Distrito INEI de despacho |
| Tarifas Olva | Cinco tramos configurables en centavos |
| Tarifas Shalom | Cinco tramos configurables en centavos |
| Umbral de envío gratuito | Importe mínimo configurado, opcional |

Los tramos de tarifas son hasta 20, 100, 400 y 900 kilómetros y un quinto tramo superior. La aplicación calcula la opción con los datos y reglas configurados. No incluye compra de guías, rastreo integrado ni cotización contractual en tiempo real contra APIs de los transportistas.

Se utiliza un catálogo de ubigeos peruanos. Los pedidos sin bienes físicos aplican las reglas de servicio o entrega digital, en lugar de exigir envío físico. El vendedor comparte el cálculo del backend y no puede inventar tarifas o cobertura.

## 14 Cupones y promociones

El módulo permite listar cupones y sus objetivos, crear, editar y eliminar. Los tipos persistidos son porcentaje, importe fijo, envío gratuito y promoción compra X y obtén Y.

Los alcances son todo el catálogo, categoría, marca, línea o productos específicos. El checkout expone una vista previa de cupón y aplica la validación comercial real al reservar el pedido.

`CouponRedemption` diferencia retención, confirmación y liberación. Las reservas de uso se coordinan con el ciclo del pedido. La cantidad de cupones activos está sujeta al plan; Inicia no incluye cupos y A medida y Lidera tienen límites nulos en el catálogo actual.

## 15 Tienda pública

### 15.1 Resolución y disponibilidad

Cada tienda se resuelve por host a un tenant, mediante subdominio o dominio propio verificado. El servidor SSR obtiene la configuración y retorna estados HTTP de indisponibilidad o inexistencia cuando corresponde. La publicación depende de estado de tienda, plan e integración activa.

Los estados persistidos son borrador, publicada y suspendida. La consola permite configurar, publicar, retirar publicación, cambiar subdominio y mostrar productos disponibles. Los cambios de slug cuentan con un modelo de redirecciones.

### 15.2 Navegación y compra

La tienda dispone de inicio, catálogo, ficha de producto, carrito, checkout, pedido y páginas legales. La ruta `/live-checkout` permite continuar una reserva LIVE sobre el checkout compartido. Las presentaciones conservan las URLs comerciales para que enlaces, sitemap y correos sigan funcionando.

El catálogo tiene búsqueda, filtros, categorías, paginación, disponibilidad y variantes. El carrito funciona en el cliente; el checkout vuelve a validar precios y stock en servidor. Las recomendaciones y los controles de consentimiento se comparten entre las presentaciones.

### 15.3 Identidad comercial y legal

La configuración admite nombre visible, lema, logo, imagen principal, colores, WhatsApp, correo, SEO, rubro y tema. La identidad legal admite negocio con RUC o vendedor individual con DNI, nombre legal, dirección, distrito, libro de reclamaciones externo, código de banco de datos y días de cambios.

La web comercial incluye términos y condiciones, planes y reembolsos, privacidad, cookies, tratamiento de datos y uso aceptable. La tienda tiene sus propias páginas legales asociadas al negocio. Estos campos y páginas no equivalen a validación registral automática de identidad ni a un sistema de emisión tributaria.

### 15.4 Renderizado y SEO

La tienda se renderiza por solicitud porque depende del host. El servidor publica `robots.txt` y `sitemap.xml`, y el core administra metadatos y datos estructurados. Las páginas de marketing y acceso de consola se prerenderizan; la consola autenticada se renderiza en cliente.

La tienda utiliza un proxy de mismo origen para lecturas con rutas permitidas y contexto de host. Las previsualizaciones utilizan un token firmado y cookie HttpOnly. El editor solo puede incrustar una preview autorizada desde el origen configurado. Las páginas con capacidades sensibles aplican las reglas de caché y referencia correspondientes.

## 16 Editor visual y generación de contenido

El editor abre la tienda en un iframe autorizado y comunica cambios mediante un puente `postMessage`. Los campos editables están registrados en un esquema de secciones; las directivas de texto, imagen y sección vinculan la preview con la configuración.

Permite modificar textos e imágenes, ajustar branding, reordenar secciones de inicio, ocultar las permitidas y añadir bloques de biblioteca. Los bloques compartidos incluyen beneficios, testimonios, WhatsApp, galería, llamada a la acción y preguntas, además de las secciones particulares de cada renderer.

El contenido de borrador se almacena separado del publicado. La API ofrece guardar borrador, publicar, descartar, programar publicación, cancelar programación, consultar versiones y restaurar una versión. Se conservan veinte snapshots por tienda, con contenido y selección de tema cuando están disponibles.

La asistencia con IA genera sugerencias de texto para campos, contenido de sección, contenido de página e imágenes para campos registrados. Utiliza contexto del negocio, rubro y catálogo y aplica cuotas mensuales independientes de las respuestas del vendedor.

Los modelos predeterminados declarados son `gpt-4o-mini` para texto y `gpt-image-1-mini` para imágenes. La generación de imágenes solicita una imagen, calidad media y salida WebP; el tamaño depende del tema y la sección. Los límites de tiempo son veinte segundos para texto, cuarenta y cinco para página y cincuenta y cinco para imagen.

## 17 Temas y releases

| Identidad | Nombre visible | Renderer | Releases distribuidos | Rubros |
| --- | --- | --- | --- | --- |
| `vendedoria/classic` | Clásica | `classic@1` | `1.0.0`, `1.1.0` | Todos los rubros admitidos |
| `vendedoria/selecta` | Selecta | `selecta@1` | `1.0.0`, `1.1.0` | Belleza |
| `vendedoria/stride` | Impulso | `stride@1` | `1.0.0`, `1.1.0` | Moda |

Los rubros admitidos por la plataforma son general, belleza, moda, hogar, alimentos, tecnología, salud, mascotas y otros.

Un tema v1 es un paquete declarativo incluido y revisado en el build. Define identidad, versión, renderer, contratos ABI, capacidades, rubros, secciones, ajustes, tokens, assets locales, presets y migraciones. Los renderers son implementaciones Angular compiladas de plataforma.

Los temas no ejecutan código, HTML o CSS libre aportado por el negocio y no se instalan mediante ZIP desde el panel. Una presentación con markup nuevo requiere desarrollar otro renderer. El catálogo y el lock de releases mantienen hashes SHA-256 y no permiten modificar un release sellado.

Los contratos actuales de engine, editor, storefront y content son ABI 1. La comprobación produce estados compatible, compatible con advertencias, actualización requerida o incompatible. La elección y publicación valida renderer, capacidades, ABI y rubro. La tienda fija la versión activa y conserva una elección de borrador independiente.

El core mantiene catálogo, inventario, carrito, dinero, pedidos, envío, consentimiento, recomendaciones y SEO. Los temas presentan esas capacidades. Hay migraciones aditivas de campos, presets y un modo de recuperación de composición; no se reescriben los datos del negocio como efecto de la presentación.

## 18 Recuperación de selecciones de compra

La recuperación está desactivada inicialmente por negocio. Propietario o administrador puede habilitar correo y WhatsApp y definir de uno a tres intervalos crecientes, hasta 4320 minutos. Los valores predeterminados son 15, 120 y 1440 minutos.

El comprador decide guardar su selección y consiente cada canal por separado. El formulario no envía contacto automáticamente ni preselecciona el consentimiento. Puede expandirse una vez por intención de salida o noventa segundos de inactividad.

Se conservan handles, variantes y cantidades; al recuperar se vuelven a consultar precio, publicación y stock. La recuperación puede retirar productos no disponibles o reducir cantidades. No guarda tarjeta, dirección ni códigos Yape y no retiene inventario.

Los enlaces están firmados con HMAC, vinculados al tenant y vencen a los siete días. La URL se retira del historial al utilizarla; las páginas con capacidad omiten analytics y aplican `no-referrer` y `no-store`. Un heartbeat autorizado, como máximo por minuto durante actividad reciente, actualiza la selección y posterga recordatorios.

Reservar el checkout vincula y detiene la recuperación dentro de la transacción. El worker también evita envíos si detecta un checkout posterior del contacto. Revocar recordatorios o reservar un pedido elimina inmediatamente el contacto de recuperación. El barrido elimina carritos expirados y entregas asociadas y purga comportamiento de más de siete días.

`RecoveryDelivery` es un outbox durable con clave única por carrito, revisión, paso y canal. Un barrido cada treinta segundos encola en BullMQ los trabajos pendientes. PostgreSQL reclama la entrega y bloquea el carrito para coordinación entre instancias. Se limita a tres mensajes entregados, preparados o inciertos por canal y carrito.

Los estados son `PENDING`, `SENDING`, `SENT`, `PREVIEW`, `FAILED`, `UNCERTAIN` y `CANCELLED`. Un rechazo definitivo falla; throttling confirmado puede reintentarse hasta cinco veces con backoff. Un timeout, error ambiguo o interrupción después de reclamar se marca incierto y no se reenvía automáticamente.

Correo utiliza el proveedor y remitente configurados. WhatsApp utiliza una plantilla de marketing aprobada con tres parámetros: nombre de tienda, enlace de recuperación y enlace de baja. El modo `EMAIL_MODE=preview` prepara las entregas sin contactar proveedores. Redis es necesario para el envío asíncrono; PostgreSQL conserva los pendientes ante fallos de Redis.

La consola muestra selecciones guardadas, reservas atribuidas y conteos de entregas retenidas. Esos conteos no constituyen un incremento de conversión demostrado ni atribución de ingresos cobrados.

## 19 Recomendaciones comerciales

El motor utiliza coincidencia de compras pagadas y cumplidas de los últimos noventa días, afinidad de categorías y alternativas o conjuntos reales. La presentación muestra hasta cuatro sugerencias en producto o carrito y como máximo una oferta opcional en checkout, sin preseleccionarla. Una reserva de checkout impide añadir más productos.

Sin consentimiento de personalización, el ranking utiliza producto o carrito actual y relaciones agregadas de pedidos. Con consentimiento, una sesión aleatoria se convierte en un hash HMAC por tenant y registra eventos `VIEW` y `CART`, con un máximo de trescientos por sesión. No vincula historial por correo, teléfono o IP. Retirar consentimiento elimina el comportamiento de la sesión; la preview no lo registra.

Redis conserva handles y razones durante sesenta segundos, con claves por tenant y contexto. Cada respuesta hidrata los productos actuales en PostgreSQL. Qdrant puede añadir similitud por vectores deterministas de 128 dimensiones construidos a partir de características del catálogo. Este índice es distinto del índice semántico de embeddings del vendedor.

La indexación de afinidad utiliza páginas de doscientos y se programa como máximo cada quince minutos al solicitar un ranking no cacheado del tenant. La primera petición o un fallo de Qdrant utiliza afinidad y cocompras en base de datos.

La respuesta incorpora `Server-Timing` para medición. El script de benchmark calcula p50 y p95 después de calentamiento y tiene un objetivo p95 inferior a cincuenta milisegundos. Ese objetivo no acredita una latencia garantizada para todos los entornos.

## 20 TikTok LIVE y campañas de liquidación

### 20.1 Operación implementada

La integración `tiktok_live` requiere plan compatible y tienda activa. El panel permite campañas de venta o liquidación, ofertas, sesiones, selección de producto actual, registro manual de comentarios, sugerencias de respuesta, aprobación interna y reservas confirmadas por el operador.

El operador transcribe los comentarios. La consola no lee comentarios de TikTok, no publica respuestas y no inicia una transmisión. Los registros internos se identifican con `delivered: false`. La operación manual de campaña puede funcionar sin OAuth.

### 20.2 Ofertas y reservas

Las ofertas utilizan productos físicos publicados, disponibles y en soles, con variante válida cuando corresponde. El precio LIVE no puede superar el precio vigente de catálogo. El stock asignado no puede superar la disponibilidad; una oferta puede fijar cantidad máxima por alias y duración. Las campañas iniciadas conservan sus condiciones; solo se edita el borrador.

Los DTO admiten reservas de entre sesenta y novecientos segundos, de una a veinte unidades por reserva y límites por cliente de una a veinte unidades. Las reservas tienen idempotencia, token firmado y snapshot de asignación de stock. El checkout conserva la oferta reservada y transfiere el stock al pedido sin descontarlo dos veces.

Cancelar o expirar una reserva sin pedido libera su asignación. Las reservas con pedido siguen el ciclo existente de checkout y liquidación. Los pagos tardíos requieren revisión y no restauran automáticamente una reserva liberada.

### 20.3 Adaptador oficial y capacidades

| Capacidad | Estado implementado |
| --- | --- |
| Identidad de cuenta | Login Kit con `user.info.basic`, condicionado a configuración y autorización |
| Webhooks | Revocación `authorization.removed` con firma oficial |
| Sesiones LIVE externas | No soportadas |
| Comentarios entrantes automáticos | No soportados |
| Respuestas salientes automáticas | No soportadas |
| Productos LIVE, órdenes Shop y sincronización | No implementados; requieren acceso oficial y adaptador correspondiente |
| Modo `HUMAN_APPROVAL` | Disponible para revisión interna |
| Modo `HUMAN_ONLY` | Disponible |
| Modo `AUTO` | Rechazado mientras no exista capacidad oficial de respuesta |

### 20.4 OAuth y actualización del panel

OAuth utiliza state aleatorio con hash y vencimiento de diez minutos, cookie HttpOnly, Secure y SameSite Lax, callback de un solo uso y cifrado de access y refresh tokens. Se exige redirect HTTPS exacto y un origen HTTPS único de consola. La validación de conexión refresca tokens próximos a vencer y conserva la rotación.

El webhook verifica `TikTok-Signature` mediante HMAC-SHA256 del timestamp y raw body, con tolerancia de cinco minutos, valida aplicación y cuenta y deduplica el evento de revocación.

El panel utiliza SSE autenticado, consulta eventos y stock cada dos segundos y emite identificadores de sesión. La consola recarga los detalles con JWT. Los eventos se conservan de forma durable en `LiveEvent`.

## 21 Integraciones y dependencias de activación

| Clave | Función | Primer plan de catálogo que la incluye | Dependencia |
| --- | --- | --- | --- |
| `instagram` | Canal Instagram | Inicia | Activación y conexión del canal |
| `store` | Tienda web | Crece | Publicación y configuración comercial |
| `custom_domain` | Dominio propio | Crece | Tienda activa y dominio verificado |
| `team` | Miembros e invitaciones | Crece | Cupo de usuarios |
| `tiktok_live` | Panel LIVE | Crece | Tienda activa |
| `tracking` | Meta Pixel y GA4 | Escala | Tienda activa |

La activación efectiva exige switch del tenant, inclusión en plan vigente y dependencias activas. Desactivar tienda pausa dominio, tracking y LIVE sin borrar sus switches ni configuración. Al reactivarla pueden recuperarse las funciones cuyo plan siga permitiéndolas.

Los dominios propios se configuran, verifican y eliminan mediante la API y un cliente Cloudflare for SaaS. Solo un dominio con estado `active` y la integración activa se utiliza como dominio público del negocio.

La capa de integraciones no incluye conectores generales de ERP, marketplaces o plataformas externas de ecommerce.

## 22 Planes cuotas y pagos de plataforma

### 22.1 Catálogo actual

Los precios del catálogo están expresados en soles por periodo mensual e incluyen IGV. Las cuotas de uso se computan por mes calendario; un periodo comprado equivale a treinta días.

| Límite | Inicia | Crece | Escala | Lidera | A medida |
| --- | ---: | ---: | ---: | ---: | --- |
| Precio mensual | S/ 29 | S/ 79 | S/ 199 | S/ 549 | Cotización |
| Conversaciones nuevas | 50 | 400 | 1200 | 4000 | Sin límite fijo en catálogo |
| Respuestas con IA | 750 | 6000 | 18000 | 60000 | Sin límite fijo en catálogo |
| Generaciones de texto de tienda | 0 | 300 | 1000 | 3000 | Sin límite fijo en catálogo |
| Imágenes de tienda con IA | 0 | 30 | 100 | 150 | Sin límite fijo en catálogo |
| Productos | 25 | 100 | 300 | 1000 | Sin límite fijo en catálogo |
| Cupones activos | 0 | 5 | 20 | Sin límite fijo | Sin límite fijo |
| Usuarios incluido propietario | 1 | 2 | 5 | 15 | Sin límite fijo en catálogo |
| Tienda web | No | Sí | Sí | Sí | Sí |
| Instagram | Sí | Sí | Sí | Sí | Sí |
| Dominio propio | No | Sí | Sí | Sí | Sí |
| Equipo | No | Sí | Sí | Sí | Sí |
| TikTok LIVE | No | Sí | Sí | Sí | Sí |
| Meta Pixel y GA4 | No | No | Sí | Sí | Sí |
| Insignia de plataforma | Sí | No | No | No | No |

La prueba de catorce días utiliza Crece con cien conversaciones nuevas, mil quinientas respuestas con IA, cien generaciones de texto, diez imágenes, cien productos, cinco cupones y dos usuarios. No incluye tracking.

Una cuota nula en A medida significa ausencia de límite fijo en el catálogo de código; no publica un precio ni una capacidad de infraestructura ilimitada.

### 22.2 Prepago y chats adicionales

| Prepago | Meses | Descuento de catálogo |
| --- | ---: | ---: |
| Mensual | 1 | 0 % |
| Trimestral | 3 | 5 % |
| Semestral | 6 | 10 % |
| Anual | 12 | 17 % |

El total de prepago se redondea a soles enteros. La compra es un pago anticipado y no incorpora renovación automática.

| Paquete de conversaciones | Precio |
| --- | ---: |
| 100 | S/ 15 |
| 500 | S/ 65 |
| 1000 | S/ 125 |

Los paquetes añaden nuevas conversaciones del mes calendario actual y sus respuestas con IA, a razón de quince respuestas por conversación. Los límites de textos e imágenes del editor son independientes.

### 22.3 Vencimiento

Los estados son prueba, activo y vencido. Al vencer se bloquean nuevas conversaciones, respuestas con IA, altas de productos e integraciones hasta renovar. Los miembros existentes mantienen acceso. Cuando se agota solo la cuota de respuestas con IA, el vendedor puede continuar con respuestas básicas del catálogo según el flujo del runtime.

Los pagos SaaS utilizan credenciales de plataforma y webhook de facturación separado del cobro de pedidos. El catálogo publica compras online para los planes con precio definido; A medida se cotiza y concede fuera de esa compra automática.

## 23 Métricas y trazabilidad

### 23.1 Métricas comerciales

`GET /metrics/summary` acepta un periodo que el servicio acota entre uno y noventa días, con siete días por defecto. Devuelve conversaciones nuevas, mensajes entrantes, mensajes del agente, pedidos creados, pedidos pagados, ingresos en centavos, porcentaje de conversión y conversaciones abiertas marcadas como desatendidas.

Para el agregado de pedidos pagados se consideran estados pagado, en preparación, enviado y completado. La conversión se calcula como pedidos pagados divididos entre conversaciones del periodo y se redondea a una cifra decimal. No es un embudo de atribución por comprador ni excluye por sí mismo todos los canales ajenos a conversación.

### 23.2 Diagnóstico del motor

Los endpoints del motor exponen estado de conversación, últimas veinte trazas y métricas de los últimos siete días, mensajes pendientes y fallos definitivos de indexación. Las trazas incluyen correlación, tenant, conversación, agente, modelo, etapas, intención, acción siguiente, herramientas, latencia, fuentes, validación y tokens.

Las trazas diagnósticas no duplican la respuesta completa. No existe un tarifario mantenido de modelos para calcular una estimación monetaria universal de LLM.

### 23.3 Medición de tienda

La integración de tracking permite configurar Meta Pixel y Google Analytics 4. Los scripts se cargan en navegador después de aceptar cookies y solo con configuración e integración permitidas por plan. El comprador puede rechazar o reabrir su elección.

La capa de eventos registra acciones comerciales de navegación, producto, carrito, checkout y compra conforme al servicio de analytics. La preview y las páginas con capacidades sensibles evitan la medición correspondiente. El consentimiento de tracking, el de personalización y el de recordatorios son controles distintos.

## 24 Imágenes almacenamiento y correo

### 24.1 Medios de producto y tienda

| Especificación | Valor implementado |
| --- | --- |
| Formatos de entrada de carga normal | JPEG, PNG y WebP |
| Tamaño máximo de carga normal | 750000 bytes |
| Tamaño máximo de imagen generada | 8000000 bytes |
| Formato normalizado | WebP |
| Lado máximo de medio normalizado | 1600 píxeles |
| Calidad WebP | 82 |
| Límite de píxeles de entrada | 40000000 |
| Conversión para mensajería | JPEG, hasta 1200 píxeles y calidad 82 |
| Política de caché de medios | Pública, un año e inmutable |
| Nombre de archivo local | Identificador aleatorio hexadecimal de 32 caracteres y extensión permitida |

El servicio comprueba los bytes del archivo y concordancia con el tipo declarado. La normalización no amplía imágenes pequeñas. Las imágenes destinadas a mensajería se transforman para el canal.

El almacenamiento puede ser local en un volumen de uploads o S3 con CloudFront. El bucket de medios es privado y CloudFront utiliza Origin Access Control. Los objetos S3 se separan por tenant. La ruta pública local continúa sirviendo medios previos y se eliminan medios S3 no utilizados en las operaciones correspondientes de producto.

No hay servicio implementado de variantes AVIF bajo demanda.

### 24.2 Correo e infraestructura AWS

SES v2 utiliza remitente, región y configuration set configurables. Resend es un proveedor alternativo. El modo de envío distingue vista previa y envío real.

La infraestructura Terraform declara S3, CloudFront, configuración SES, IAM de mínimos privilegios y DNS asociado. El flujo contempla verificación de dominio y DKIM, SPF y DMARC. La supresión de SES depende de su configuración de cuenta. No existe procesamiento implementado de rebotes y quejas SES mediante SNS dentro de la API.

## 25 Controles técnicos de seguridad y privacidad

| Control | Implementación y alcance |
| --- | --- |
| Autenticación de negocio | JWT global; rutas anónimas declaradas explícitamente |
| Sesión de plataforma | Guardia y permisos separados; consulta de rol en DB |
| Aislamiento | Tenant tomado de JWT o host; recursos hijos consultados dentro del tenant |
| Validación HTTP | Whitelist, rechazo de propiedades no permitidas y transformación de DTO |
| Firmas de webhooks | Raw body para Meta y TikTok; verificación y deduplicación de Mercado Pago |
| Credenciales Mercado Pago y TikTok | AES-256-GCM mediante clave backend |
| Tokens de invitación y renovación | Almacenamiento mediante hash y revocación |
| Acceso anónimo a pedido | Token de capacidad vinculado al recurso |
| Preview y enlaces de recuperación | Firma y validación de alcance y expiración |
| Rate limiting | Contadores en PostgreSQL para acciones protegidas; claves HMAC por IP, bucket y ventana |
| Turnstile | Integración por acción cuando se configura secreto; rechazo de claves de prueba en producción |
| CORS | Orígenes explícitos; credenciales y cabeceras permitidas |
| Tienda SSR | CSP, política de referencia, controles de caché y autorización de frame para editor |
| Logs API | URL sin query string; redacción de autorización, cookies y Set-Cookie |
| Eventos SSE | Identificadores de recursos sin contenido comercial completo |
| Recuperación y personalización | Consentimientos separados, capacidades y purga de datos específicos |

Los límites se aplican a autenticación y acciones de checkout, recuperación y LIVE definidas por sus controllers. No hay una política global de rate limiting para todos los webhooks y endpoints de IA.

Los mensajes, teléfonos, correos y datos de comprador son información personal. El motor no debe registrarlos en sus trazas de logging. Las capacidades de pedido, recuperación y baja requieren también tratamiento apropiado en logs del proxy externo. La eliminación periódica implementada para recuperación y comportamiento no equivale a una política de purga de todo el historial comercial.

No existe MFA de operadores implementado ni una consola web completa de operaciones de plataforma. El acceso de plataforma disponible utiliza su API y CLI.

## 26 Despliegue operación y persistencia

### 26.1 Topología Docker

El stack de producción contiene PostgreSQL, Redis, servicio de migración, API, web, tienda y nginx. Qdrant está bajo el perfil opcional `recommendations-vector`.

PostgreSQL y Redis pertenecen a la red interna de datos. Redis utiliza persistencia AOF y política `noeviction`, con 128 MB configurados en el comando de imagen. Los servicios de aplicación usan healthchecks, reinicio salvo detención y protección `no-new-privileges`; API y servidores web se ejecutan con sistema de archivos de solo lectura y directorios temporales definidos.

El servicio de migración debe completar antes de iniciar API. El Dockerfile genera Prisma en el build. PostgreSQL, uploads, Redis y Qdrant tienen volúmenes persistentes.

El nginx de Docker publica un puerto en loopback del host y el nginx del servidor termina HTTPS y reenvía el tráfico. Los scripts del repositorio contemplan bootstrap, despliegue, actualización, backup y restauración. Los dominios de configuración documentados son web comercial en `marrso.com`, consola en `app.marrso.com` y tiendas en subdominios; la configuración de despliegue puede definirlos.

### 26.2 Desarrollo

| Servicio | Dirección de desarrollo documentada |
| --- | --- |
| Consola | `http://localhost:4201` |
| API | `http://localhost:3100/api/v1` |
| Swagger | `http://localhost:3100/docs` |
| Tienda | `http://{slug}.localhost:4300` |
| PostgreSQL | Puerto local `5432` |

El desarrollo principal es Docker con recarga de API, consola y tienda. Los puertos locales se publican en loopback. Las pruebas integradas utilizan la base aislada `vendedoria_test`.

### 26.3 Salud y degradación

`GET /api/v1/health` responde estado, nombre de servicio y timestamp. Es un endpoint de disponibilidad del proceso; no ejecuta una verificación profunda de todos los proveedores.

| Incidencia | Comportamiento de diseño |
| --- | --- |
| OpenAI ausente o cuota agotada del vendedor | Respuesta determinista según datos comerciales |
| Redis no disponible | Persistencia del inbox y estado en PostgreSQL; se detiene envío asíncrono de recuperación |
| Qdrant no disponible | Búsqueda o ranking en PostgreSQL |
| Envío comercial ambiguo | Estado incierto y revisión; sin reenvío automático |
| Cuenta Mercado Pago ausente en producción | No se sustituye por el simulador |
| Integración dependiente sin tienda | Pausa por dependencia preservando configuración |
| Tema incompatible | Diagnóstico, bloqueo de publicación incompatible y composición de recuperación |

## 27 Verificación automatizada disponible

| Área | Comandos o mecanismo |
| --- | --- |
| Cliente ORM | `npm run prisma:generate` |
| Compilación API | `npm run build:api` |
| Compilación consola | `npm run build:web` |
| Compilación tienda | `npm run build:store` |
| Compilación completa | `npm run build` |
| Unitarias y e2e API | `npm run test:docker` en base aislada |
| Pruebas de consola | `npm run test -w @vendedoria/web` |
| Validación de temas | `npm run theme:check` |
| Pruebas de manifiestos | `npm run theme:test` |
| Contrato de runtime de tienda | `npm run theme:test:store` |
| Evaluación del vendedor | `npm run eval:sales -w @vendedoria/api` con API compilada |
| Medición de recomendaciones | `scripts/benchmark-recommendations.mjs` |

CI genera Prisma, compila las tres aplicaciones, construye y valida el catálogo de temas y ejecuta pruebas de temas, runtime de tienda y consola. La suite API de base aislada pertenece al flujo Docker local.

El dataset del vendedor contiene veinte escenarios, con diecisiete de runtime determinista y tres de gateway e2e. Su reporte usa fixtures y no es un benchmark de calidad de un modelo real. La guía del motor registra una verificación del 5 de octubre de 2026 con 46 suites unitarias y 328 pruebas, 16 suites e2e y 94 pruebas, builds de las tres aplicaciones y evaluación de escenarios. Ese registro corresponde a la ejecución documentada en la guía, no a una nueva ejecución realizada al redactar esta hoja.

## 28 Capacidades que no forman parte de la implementación actual

| Área | Ausencia o límite actual |
| --- | --- |
| Multimedia entrante | Sin transcripción de audio ni interpretación de fotos o documentos en el gateway comercial |
| TikTok LIVE | Sin lectura automática de comentarios, publicación de respuestas o inicio de transmisión |
| TikTok Shop | Sin sincronización de productos u órdenes Shop |
| Campañas generales | No existe módulo de marketing masivo; las campañas implementadas son LIVE |
| Coach del comerciante | No existe runtime independiente de coaching |
| Operaciones de plataforma | Sin consola web completa ni MFA; API de identidad y CLI disponibles |
| Integraciones de terceros | Sin conectores generales de ERP, POS u otras plataformas ecommerce |
| Transportistas | Sin compra de guía ni tracking directo mediante APIs de courier |
| Servicios | Nota de coordinación, sin agenda ni reserva horaria confirmada |
| Compradores | Compra como invitado, sin cuentas o área privada de cliente |
| Temas | Paquetes declarativos; sin código arbitrario ni instalador ZIP en panel |
| Tienda | Sin capacidades actuales de wishlist, reseñas verificadas, suscripción de comprador, blog, multimoneda o multiidioma |
| Fiscal | Sin emisión de comprobantes tributarios o validación registral automática |
| Mensajería durable | Sin garantía de entrega exactamente una vez ante resultado externo incierto |
| Webhooks de pagos | Procesamiento síncrono; sin cola y dead letter queue general implementadas |
| Correo SES | Sin procesamiento SNS de rebotes o quejas en API |
| Medios | Sin variantes AVIF bajo demanda |
| Retención | Sin purga física automática de todo historial de conversaciones |
| Rendimiento | Objetivos y scripts de medición; sin SLA de latencia demostrado por el código |

## 29 Referencias técnicas del producto

| Dominio | Fuente ejecutable principal |
| --- | --- |
| Aplicaciones y comandos | `package.json`, `apps/*/package.json` |
| Módulos de API | `apps/api/src/app.module.ts` |
| Inicialización y contrato HTTP | `apps/api/src/main.ts`, controllers y DTO de cada módulo |
| Usuarios | `apps/api/src/auth`, `account`, `team`, `platform`, `tenants` |
| Vendedor | `apps/api/src/agents`, `agent-runtime` |
| Ingreso durable | `apps/api/src/conversations/sales-gateway.service.ts` |
| Estado y memoria | `apps/api/src/agent-runtime/sales-state.ts`, `sales-memory.service.ts` |
| Herramientas y búsqueda | `sales-tool-registry.service.ts`, `sales-search.service.ts`, `sales-agent-tools.service.ts` |
| Catálogo e importación | `apps/api/src/catalog` |
| Inventario y liquidación | `apps/api/src/orders/stock.ts`, `settlement.ts` |
| Checkout y recibos | `apps/api/src/checkout` |
| Pagos | `apps/api/src/payments` |
| Planes | `apps/api/src/billing/plan-catalog.ts` |
| Integraciones | `apps/api/src/integrations/integration-state.ts` y servicios asociados |
| Tienda y editor | `apps/api/src/storefront`, `apps/store/src/app/core`, `apps/web/src/app/features/store` |
| Temas | `packages/themes/catalog.json`, schemas, runtime y lock de releases |
| Recuperación y recomendaciones | `apps/api/src/conversion` |
| LIVE | `apps/api/src/live` |
| Persistencia | `apps/api/prisma/schema.prisma` y migraciones |
| Configuración | `apps/api/src/config/env.validation.ts` y plantillas de entorno de ejemplo |
| Infraestructura | `docker-compose*.yml`, `Dockerfile`, `docker/nginx`, `infra/terraform` |
| Verificación | `.github/workflows/ci.yml`, specs, tests e2e y `docs/agent/evals` |


## 30 Modelo de datos

La base utiliza PostgreSQL y Prisma. Los modelos siguientes corresponden al esquema actual. Se enumeran nombres técnicos de campos, sin datos de usuarios ni valores de configuración.

| Entidad | Campos persistidos |
| --- | --- |
| `User` | `id`, `email`, `createdAt`, `updatedAt` |
| `Tenant` | `id`, `slug`, `country`, `currency`, `planTier`, `planTrial`, `planExpiresAt`, `createdAt`, `updatedAt` |
| `ConversionSettings` | `tenantId`, `recoveryEnabled`, `emailEnabled`, `whatsappEnabled`, `whatsappLanguage`, `delaysMinutes`, `updatedAt` |
| `RecoveryCart` | `id`, `revision`, `lastActivityAt`, `createdAt` |
| `RecoveryDelivery` | `id`, `status`, `attempts` |
| `StoreBehaviorEvent` | `id`, `createdAt` |
| `ChatPack` | `id`, `paymentId`, `createdAt` |
| `AiUsageMonth` | `replies`, `editorTexts`, `editorImages`, `updatedAt` |
| `TenantIntegration` | `id`, `enabled`, `createdAt`, `updatedAt` |
| `MemberInvite` | `id`, `role`, `tokenHash`, `createdAt` |
| `StoreSlugRedirect` | `slug`, `createdAt` |
| `MerchantPaymentAccount` | `id`, `provider`, `liveMode`, `createdAt`, `updatedAt` |
| `Coupon` | `id`, `minSubtotalCents`, `minItems`, `scope`, `targets`, `applyToSets`, `firstOrderOnly`, `isActive`, `createdAt`, `updatedAt` |
| `CouponRedemption` | `id`, `orderId`, `status`, `createdAt`, `updatedAt` |
| `Storefront` | `id`, `tenantId`, `status`, `brandColor`, `accentColor`, `createdAt`, `updatedAt`, `sellerType`, `exchangeDays`, `deliveryEnabled`, `pickupEnabled`, `industry`, `template`, `themeVersion`, `customDomain` |
| `StorefrontVersion` | `id`, `replacedAt` |
| `Membership` | `id`, `role`, `createdAt`, `updatedAt` |
| `RefreshToken` | `id`, `tokenHash`, `platform`, `createdAt` |
| `PlatformAuditLog` | `id`, `createdAt` |
| `SalesAgent` | `id`, `responseLength`, `useEmojis`, `pauseOnHandoff`, `neverOfferDiscount`, `neverInventShipping`, `catalogOnlyFacts`, `salesTechniques`, `promptMode`, `isActive`, `createdAt`, `updatedAt` |
| `KnowledgeFaq` | `id`, `tags`, `source`, `reviewStatus`, `isPublished`, `sortOrder`, `createdAt`, `updatedAt` |
| `JourneyTemplate` | `id`, `stage`, `isActive`, `sortOrder`, `createdAt`, `updatedAt` |
| `Channel` | `id`, `healthStatus`, `createdAt`, `updatedAt` |
| `Product` | `id`, `categories`, `currency`, `kind`, `isAvailable`, `stockUnlimited`, `isPublishedOnStore`, `sortOrder`, `createdAt`, `updatedAt` |
| `ProductVariant` | `id`, `isAvailable`, `priceInherited` |
| `CatalogCategory` | `id`, `kind` |
| `ProductMedia` | `id`, `kind`, `sortOrder`, `createdAt` |
| `ProductComponent` | `id`, `quantity` |
| `Conversation` | `id`, `status`, `agentEnabled`, `markedAsSale`, `markedUnattended`, `salesState`, `createdAt`, `updatedAt` |
| `Message` | `id`, `inboundKey`, `enginePending`, `createdAt` |
| `SalesEngineTurn` | `id`, `status`, `createdAt`, `updatedAt` |
| `SalesCustomerMemory` | `updatedAt` |
| `SalesSearchJob` | `id`, `revision`, `attempts`, `availableAt`, `updatedAt` |
| `PlaygroundSession` | `id`, `title`, `salesState`, `createdAt`, `updatedAt` |
| `PlaygroundMessage` | `id`, `createdAt` |
| `Order` | `id`, `status`, `channel`, `currency`, `subtotalCents`, `discountCents`, `shippingCents`, `totalCents`, `checkoutKey`, `publicToken`, `stockState`, `paymentKey`, `emailStatus`, `createdAt`, `updatedAt` |
| `PaymentEvent` | `id`, `createdAt` |
| `WebhookEvent` | `key`, `createdAt`, `processedAt` |
| `OrderItem` | `id`, `quantity` |
| `Payment` | `id`, `provider`, `status`, `currency`, `idempotencyKey`, `createdAt`, `updatedAt` |
| `RateLimitHit` | `key`, `count` |
| `LiveIntegration` | `tenantId`, `healthStatus`, `scopes`, `capabilities`, `oauthStateHash`, `responseMode`, `reservationSeconds`, `maxReservationsPerSession`, `updatedAt` |
| `LiveCampaign` | `id`, `channel`, `status`, `mode`, `reservationSeconds`, `createdAt`, `updatedAt` |
| `LiveOffer` | `id`, `claimedQty`, `maxPerCustomer`, `durationSeconds`, `sortOrder`, `enabled` |
| `LiveSession` | `id`, `status`, `startedAt` |
| `LiveReservation` | `id`, `status`, `orderId`, `createdAt` |
| `LiveEvent` | `id`, `createdAt` |

Las relaciones entre entidades, claves compuestas, índices y reglas de borrado están declaradas en `apps/api/prisma/schema.prisma`. Los pedidos conservan snapshots de líneas y cumplimiento; el motor conserva estado y outboxes; los modelos de recuperación y LIVE comparten el tenant y el comercio existente.

### 30.1 Enumeraciones del esquema

| Enumeración | Valores |
| --- | --- |
| `PlanTier` | `START`, `GROW`, `SCALE`, `LEAD`, `ENTERPRISE` |
| `MembershipRole` | `OWNER`, `ADMIN`, `AGENT` |
| `PlatformRole` | `SUPERADMIN`, `ADMIN` |
| `ChannelType` | `WHATSAPP`, `INSTAGRAM`, `TIKTOK_LIVE` |
| `ChannelConnectionMode` | `COEXISTENCE`, `NEW_WABA_NUMBER` |
| `ChannelHealthStatus` | `CONNECTED`, `DEGRADED`, `DISCONNECTED`, `PENDING` |
| `ConversationStatus` | `OPEN`, `PAUSED`, `CLOSED` |
| `MessageDirection` | `INBOUND`, `OUTBOUND` |
| `MessageAuthorType` | `BUYER`, `SALES_AGENT`, `HUMAN_OPERATOR`, `SYSTEM` |
| `OrderStatus` | `DRAFT`, `PENDING_PAYMENT`, `PAID`, `FULFILLING`, `SHIPPED`, `COMPLETED`, `CANCELLED` |
| `PaymentFlow` | `BILLING_SUBSCRIPTION`, `COMMERCE_CHECKOUT` |
| `PaymentStatus` | `PENDING`, `SUCCEEDED`, `FAILED`, `CANCELLED` |
| `KnowledgeReviewStatus` | `DRAFT`, `APPROVED` |
| `KnowledgeSource` | `MANUAL`, `PASTE_IMPORT` |
| `StorefrontStatus` | `DRAFT`, `PUBLISHED`, `SUSPENDED` |
| `SellerType` | `BUSINESS`, `INDIVIDUAL` |
| `ProductKind` | `PRODUCT`, `SERVICE`, `DIGITAL` |
| `OrderChannel` | `WEB`, `WHATSAPP`, `INSTAGRAM`, `MANUAL`, `TIKTOK_LIVE` |
| `CouponKind` | `PERCENT`, `FIXED`, `FREE_SHIPPING`, `BUY_X_GET_Y` |
| `CouponScope` | `ALL`, `CATEGORY`, `BRAND`, `LINE`, `PRODUCTS` |
| `CouponRedemptionStatus` | `HELD`, `CONFIRMED`, `RELEASED` |
| `JourneyStage` | `DISCOVER`, `RECOMMEND`, `CLOSE`, `SUPPORT` |

## 31 Inventario de endpoints implementados

Todas las rutas de esta sección llevan el prefijo `/api/v1`. `SSE GET` identifica una conexión Server Sent Events. El método y la ruta no sustituyen las condiciones de autenticación, rol, firma, token de capacidad, host, integración o plan indicadas en las secciones de cada dominio. Swagger se publica en `/docs`. Los endpoints con simulación pertenecen al recorrido de prueba y están sujetos a los controles de entorno del servicio.


### 31.1 account

Fuente: `apps/api/src/account/account.controller.ts`.

| Método | Ruta |
| --- | --- |
| GET | `/api/v1/account/me` |
| PATCH | `/api/v1/account/me` |
| POST | `/api/v1/account/password` |
| POST | `/api/v1/account/sessions/revoke-others` |

### 31.2 agent-engine

Fuente: `apps/api/src/agent-runtime/sales-engine.controller.ts`.

| Método | Ruta |
| --- | --- |
| POST | `/api/v1/agent-engine/backfill` |
| GET | `/api/v1/agent-engine/conversations/:conversationId` |
| GET | `/api/v1/agent-engine/metrics` |

### 31.3 agents

Fuente: `apps/api/src/agents/agents.controller.ts`.

| Método | Ruta |
| --- | --- |
| GET | `/api/v1/agents` |
| POST | `/api/v1/agents` |
| GET | `/api/v1/agents/primary` |
| PATCH | `/api/v1/agents/primary` |
| GET | `/api/v1/agents/playground/session` |
| POST | `/api/v1/agents/playground/sessions` |
| GET | `/api/v1/agents/playground/sessions/:sessionId` |
| POST | `/api/v1/agents/playground/sessions/:sessionId/reset` |
| POST | `/api/v1/agents/playground/sessions/:sessionId/messages` |
| GET | `/api/v1/agents/:id` |
| PATCH | `/api/v1/agents/:id` |
| DELETE | `/api/v1/agents/:id` |
| PUT | `/api/v1/agents/:id/channels` |
| GET | `/api/v1/agents/:id/prompt` |

### 31.4 auth

Fuente: `apps/api/src/auth/auth.controller.ts`.

| Método | Ruta |
| --- | --- |
| POST | `/api/v1/auth/register` |
| POST | `/api/v1/auth/login` |
| POST | `/api/v1/auth/refresh` |
| POST | `/api/v1/auth/logout` |

### 31.5 webhooks/billing

Fuente: `apps/api/src/billing/billing-webhook.controller.ts`.

| Método | Ruta |
| --- | --- |
| POST | `/api/v1/webhooks/billing/mercadopago` |

### 31.6 billing

Fuente: `apps/api/src/billing/billing.controller.ts`.

| Método | Ruta |
| --- | --- |
| GET | `/api/v1/billing/plans` |
| GET | `/api/v1/billing/usage` |
| POST | `/api/v1/billing/checkout` |
| POST | `/api/v1/billing/payments/:paymentId/pay` |
| GET | `/api/v1/billing/payments/:paymentId` |
| POST | `/api/v1/billing/payments/:paymentId/simulate` |

### 31.7 catalog

Fuente: `apps/api/src/catalog/catalog.controller.ts`.

| Método | Ruta |
| --- | --- |
| GET | `/api/v1/catalog/products` |
| GET | `/api/v1/catalog/categories` |
| POST | `/api/v1/catalog/products` |
| GET | `/api/v1/catalog/products/:productId` |
| PATCH | `/api/v1/catalog/products/:productId` |
| DELETE | `/api/v1/catalog/products/:productId` |
| GET | `/api/v1/catalog/inventory` |
| PATCH | `/api/v1/catalog/inventory` |
| POST | `/api/v1/catalog/media` |
| POST | `/api/v1/catalog/import/preview` |
| POST | `/api/v1/catalog/import/media` |
| POST | `/api/v1/catalog/import` |

### 31.8 media

Fuente: `apps/api/src/catalog/catalog.controller.ts`.

| Método | Ruta |
| --- | --- |
| GET | `/api/v1/media/:file` |

### 31.9 channels

Fuente: `apps/api/src/channels/channels.controller.ts`.

| Método | Ruta |
| --- | --- |
| GET | `/api/v1/channels` |
| POST | `/api/v1/channels/whatsapp/connect` |
| GET | `/api/v1/channels/whatsapp/diagnostics` |
| GET | `/api/v1/channels/instagram` |
| POST | `/api/v1/channels/instagram/connect` |
| POST | `/api/v1/channels/:channelId/disconnect` |
| POST | `/api/v1/channels/whatsapp/simulate-inbound` |
| GET | `/api/v1/webhooks/meta/whatsapp` |
| POST | `/api/v1/webhooks/meta/whatsapp` |
| GET | `/api/v1/webhooks/meta/instagram` |
| POST | `/api/v1/webhooks/meta/instagram` |

### 31.10 storefront/:slug

Fuente: `apps/api/src/checkout/checkout.controller.ts`.

| Método | Ruta |
| --- | --- |
| GET | `/api/v1/storefront/:slug/ubigeos` |
| GET | `/api/v1/storefront/:slug/shipping-quote` |
| POST | `/api/v1/storefront/:slug/coupons/preview` |
| POST | `/api/v1/storefront/:slug/checkout` |
| POST | `/api/v1/storefront/:slug/live-reservation` |
| GET | `/api/v1/storefront/:slug/orders/:id` |
| POST | `/api/v1/storefront/:slug/orders/:id/pay` |
| POST | `/api/v1/storefront/:slug/orders/:id/cancel` |
| POST | `/api/v1/storefront/:slug/orders/:id/simulate` |

### 31.11 webhooks/mercadopago

Fuente: `apps/api/src/checkout/mercadopago-webhook.controller.ts`.

| Método | Ruta |
| --- | --- |
| POST | `/api/v1/webhooks/mercadopago/:tenantId` |

### 31.12 conversations

Fuente: `apps/api/src/conversations/conversations.controller.ts`.

| Método | Ruta |
| --- | --- |
| SSE GET | `/api/v1/conversations/stream` |
| GET | `/api/v1/conversations/templates` |
| GET | `/api/v1/conversations` |
| GET | `/api/v1/conversations/:conversationId` |
| PATCH | `/api/v1/conversations/:conversationId` |
| POST | `/api/v1/conversations/:conversationId/messages` |
| POST | `/api/v1/conversations/:conversationId/templates` |

### 31.13 storefront/:slug

Fuente: `apps/api/src/conversion/conversion.controller.ts`.

| Método | Ruta |
| --- | --- |
| GET | `/api/v1/storefront/:slug/recovery/options` |
| POST | `/api/v1/storefront/:slug/recovery` |
| POST | `/api/v1/storefront/:slug/recovery/restore` |
| POST | `/api/v1/storefront/:slug/recovery/activity` |
| POST | `/api/v1/storefront/:slug/recovery/revoke` |
| GET | `/api/v1/storefront/:slug/recommendations` |
| POST | `/api/v1/storefront/:slug/behavior` |
| POST | `/api/v1/storefront/:slug/behavior/forget` |

### 31.14 conversion

Fuente: `apps/api/src/conversion/conversion.controller.ts`.

| Método | Ruta |
| --- | --- |
| GET | `/api/v1/conversion/summary` |
| GET | `/api/v1/conversion/settings` |
| PUT | `/api/v1/conversion/settings` |

### 31.15 coupons

Fuente: `apps/api/src/coupons/coupons.controller.ts`.

| Método | Ruta |
| --- | --- |
| GET | `/api/v1/coupons` |
| GET | `/api/v1/coupons/targets` |
| POST | `/api/v1/coupons` |
| PATCH | `/api/v1/coupons/:id` |
| DELETE | `/api/v1/coupons/:id` |

### 31.16 health

Fuente: `apps/api/src/health/health.controller.ts`.

| Método | Ruta |
| --- | --- |
| GET | `/api/v1/health` |

### 31.17 integrations

Fuente: `apps/api/src/integrations/integrations.controller.ts`.

| Método | Ruta |
| --- | --- |
| GET | `/api/v1/integrations` |
| GET | `/api/v1/integrations/custom-domain` |
| PUT | `/api/v1/integrations/custom-domain` |
| POST | `/api/v1/integrations/custom-domain/verify` |
| DELETE | `/api/v1/integrations/custom-domain` |
| GET | `/api/v1/integrations/tracking` |
| PUT | `/api/v1/integrations/tracking` |
| POST | `/api/v1/integrations/:key/enable` |
| POST | `/api/v1/integrations/:key/disable` |

### 31.18 knowledge

Fuente: `apps/api/src/knowledge/knowledge.controller.ts`.

| Método | Ruta |
| --- | --- |
| GET | `/api/v1/knowledge/faqs` |
| POST | `/api/v1/knowledge/faqs` |
| POST | `/api/v1/knowledge/faqs/import-paste` |
| PATCH | `/api/v1/knowledge/faqs/:faqId` |
| POST | `/api/v1/knowledge/faqs/:faqId/approve` |
| DELETE | `/api/v1/knowledge/faqs/:faqId` |
| GET | `/api/v1/knowledge/journeys` |
| POST | `/api/v1/knowledge/journeys` |
| PATCH | `/api/v1/knowledge/journeys/:journeyId` |
| DELETE | `/api/v1/knowledge/journeys/:journeyId` |

### 31.19 integrations/tiktok-live

Fuente: `apps/api/src/live/live.controller.ts`.

| Método | Ruta |
| --- | --- |
| GET | `/api/v1/integrations/tiktok-live` |
| PUT | `/api/v1/integrations/tiktok-live` |
| POST | `/api/v1/integrations/tiktok-live/connect` |
| POST | `/api/v1/integrations/tiktok-live/verify` |
| DELETE | `/api/v1/integrations/tiktok-live/connection` |
| GET | `/api/v1/integrations/tiktok-live/oauth/callback` |

### 31.20 live

Fuente: `apps/api/src/live/live.controller.ts`.

| Método | Ruta |
| --- | --- |
| GET | `/api/v1/live/campaigns` |
| POST | `/api/v1/live/campaigns` |
| PUT | `/api/v1/live/campaigns/:id` |
| POST | `/api/v1/live/campaigns/:id/start` |
| GET | `/api/v1/live/sessions/:id` |
| SSE GET | `/api/v1/live/sessions/:id/stream` |
| PATCH | `/api/v1/live/sessions/:id/current-product` |
| POST | `/api/v1/live/sessions/:id/end` |
| POST | `/api/v1/live/sessions/:id/messages` |
| POST | `/api/v1/live/sessions/:id/reservations` |
| POST | `/api/v1/live/messages/:id/approve` |
| DELETE | `/api/v1/live/reservations/:id` |

### 31.21 webhooks/tiktok

Fuente: `apps/api/src/live/live.controller.ts`.

| Método | Ruta |
| --- | --- |
| POST | `/api/v1/webhooks/tiktok` |

### 31.22 metrics

Fuente: `apps/api/src/metrics/metrics.controller.ts`.

| Método | Ruta |
| --- | --- |
| GET | `/api/v1/metrics/summary` |

### 31.23 orders

Fuente: `apps/api/src/orders/orders.controller.ts`.

| Método | Ruta |
| --- | --- |
| GET | `/api/v1/orders` |
| GET | `/api/v1/orders/:orderId` |
| POST | `/api/v1/orders` |
| POST | `/api/v1/orders/:orderId/payment-link` |
| POST | `/api/v1/orders/:orderId/reconcile` |
| GET | `/api/v1/orders/:orderId/email-preview` |
| PATCH | `/api/v1/orders/:orderId/status` |

### 31.24 payments

Fuente: `apps/api/src/payments/payments.controller.ts`.

| Método | Ruta |
| --- | --- |
| GET | `/api/v1/payments/provider` |
| GET | `/api/v1/payments/account` |
| PUT | `/api/v1/payments/account` |
| DELETE | `/api/v1/payments/account` |
| GET | `/api/v1/payments/mock-checkout/:paymentId` |
| POST | `/api/v1/payments/:paymentId/simulate` |

### 31.25 platform/auth

Fuente: `apps/api/src/platform/platform.controller.ts`.

| Método | Ruta |
| --- | --- |
| POST | `/api/v1/platform/auth/login` |
| POST | `/api/v1/platform/auth/refresh` |

### 31.26 platform

Fuente: `apps/api/src/platform/platform.controller.ts`.

| Método | Ruta |
| --- | --- |
| GET | `/api/v1/platform/me` |

### 31.27 shipping

Fuente: `apps/api/src/shipping/shipping.controller.ts`.

| Método | Ruta |
| --- | --- |
| GET | `/api/v1/shipping` |
| GET | `/api/v1/shipping/ubigeos` |
| PATCH | `/api/v1/shipping` |

### 31.28 storefront

Fuente: `apps/api/src/storefront/storefront-public.controller.ts`.

| Método | Ruta |
| --- | --- |
| GET | `/api/v1/storefront/resolve` |
| GET | `/api/v1/storefront/:slug` |
| GET | `/api/v1/storefront/:slug/products` |
| GET | `/api/v1/storefront/:slug/catalog` |
| GET | `/api/v1/storefront/:slug/catalog/:handle` |
| GET | `/api/v1/storefront/:slug/products/:handle` |
| GET | `/api/v1/storefront/:slug/sitemap` |

### 31.29 store

Fuente: `apps/api/src/storefront/storefront.controller.ts`.

| Método | Ruta |
| --- | --- |
| GET | `/api/v1/store/editor` |
| PUT | `/api/v1/store/editor/draft` |
| GET | `/api/v1/store/themes` |
| POST | `/api/v1/store/themes/draft` |
| POST | `/api/v1/store/editor/publish` |
| POST | `/api/v1/store/editor/discard` |
| PUT | `/api/v1/store/editor/schedule` |
| DELETE | `/api/v1/store/editor/schedule` |
| GET | `/api/v1/store/editor/versions` |
| POST | `/api/v1/store/editor/versions/:id/restore` |
| POST | `/api/v1/store/editor/ai/text` |
| POST | `/api/v1/store/editor/ai/section` |
| POST | `/api/v1/store/editor/ai/page` |
| POST | `/api/v1/store/editor/ai/image` |
| GET | `/api/v1/store` |
| PATCH | `/api/v1/store` |
| PATCH | `/api/v1/store/subdomain` |
| POST | `/api/v1/store/publish` |
| POST | `/api/v1/store/unpublish` |
| POST | `/api/v1/store/products/show-available` |
| POST | `/api/v1/store/preview-link` |

### 31.30 team

Fuente: `apps/api/src/team/team.controller.ts`.

| Método | Ruta |
| --- | --- |
| GET | `/api/v1/team` |
| POST | `/api/v1/team/invites` |
| DELETE | `/api/v1/team/invites/:id` |
| PATCH | `/api/v1/team/members/:id` |
| DELETE | `/api/v1/team/members/:id` |
| GET | `/api/v1/team/invites/accept/:token` |
| POST | `/api/v1/team/invites/accept/:token` |

### 31.31 tenants

Fuente: `apps/api/src/tenants/tenants.controller.ts`.

| Método | Ruta |
| --- | --- |
| GET | `/api/v1/tenants/me` |
| PATCH | `/api/v1/tenants/me` |

### 31.32 turnstile

Fuente: `apps/api/src/turnstile/turnstile.controller.ts`.

| Método | Ruta |
| --- | --- |
| GET | `/api/v1/turnstile/config` |

## 32 Parámetros técnicos de configuración

Se indican exclusivamente los nombres y funciones de configuración; los secretos son valores de backend. Las condiciones de validez se aplican en `env.validation.ts` y en el servicio que consume cada parámetro. Los dominios y endpoints públicos se ajustan al entorno de despliegue.

| Grupo | Parámetros |
| --- | --- |
| Proceso y datos | `NODE_ENV`, `PORT`, `DATABASE_URL`, `CORS_ORIGIN` |
| Sesiones de negocio | `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `JWT_REFRESH_EXPIRES_DAYS` |
| Meta | `META_VERIFY_TOKEN`, `META_APP_SECRET`, `INSTAGRAM_APP_SECRET` |
| OpenAI | `OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENAI_IMAGE_MODEL` |
| Motor de ventas | `SALES_ENGINE_MODE`, `SALES_DEBOUNCE_MS`, `SALES_RECENT_MESSAGES_LIMIT`, `SALES_SUMMARY_THRESHOLD`, `SALES_CONTEXT_TOKEN_BUDGET`, `SALES_MEMORY_TTL_SECONDS`, `SALES_CUSTOMER_MEMORY_TTL_DAYS`, `SALES_LOCK_TTL_MS`, `SALES_TOOL_TIMEOUT_MS`, `SALES_RETRIEVAL_TOP_K`, `SALES_SIMILARITY_THRESHOLD`, `SALES_EMBEDDING_MODEL`, `SALES_HANDOFF_FAILURE_THRESHOLD`, `SALES_GATEWAY_CONCURRENCY` |
| Coordinación y búsqueda | `REDIS_URL`, `QDRANT_URL`, `QDRANT_API_KEY` |
| Cobros y cifrado | `PAYMENT_CREDENTIALS_KEY`, `PLATFORM_MERCADOPAGO_ACCESS_TOKEN`, `PLATFORM_MERCADOPAGO_PUBLIC_KEY`, `PLATFORM_MERCADOPAGO_WEBHOOK_SECRET` |
| TikTok OAuth | `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`, `TIKTOK_REDIRECT_URI` |
| Dominios propios | `CLOUDFLARE_SAAS_ZONE_ID`, `CLOUDFLARE_SAAS_API_TOKEN`, `CUSTOM_DOMAIN_CNAME_TARGET` |
| URLs y SSR | `PUBLIC_API_BASE_URL`, `STOREFRONT_URL_TEMPLATE`, `STORE_API_URL`, `STORE_ALLOWED_HOSTS`, `STORE_EDITOR_ORIGIN` |
| Correo | `EMAIL_MODE`, `EMAIL_PROVIDER`, `EMAIL_FROM`, `RESEND_API_KEY`, `SES_REGION`, `SES_CONFIGURATION_SET`, `RECOVERY_EMAIL_FROM` |
| Medios | `MEDIA_STORAGE`, `MEDIA_S3_BUCKET`, `MEDIA_CDN_URL`, `UPLOADS_DIR`, `AWS_REGION` |
| Antibot | `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` |

### 32.1 Rango validado de parámetros del motor

| Parámetro | Valores admitidos |
| --- | --- |
| `SALES_ENGINE_MODE` | legacy o sales-engine-v2 |
| `SALES_DEBOUNCE_MS` | 0 a 10000 ms |
| `SALES_RECENT_MESSAGES_LIMIT` | 10 a 80 mensajes |
| `SALES_SUMMARY_THRESHOLD` | 1 a 100 turnos |
| `SALES_CONTEXT_TOKEN_BUDGET` | 4000 a 64000 tokens de presupuesto |
| `SALES_MEMORY_TTL_SECONDS` | 60 a 86400 segundos |
| `SALES_CUSTOMER_MEMORY_TTL_DAYS` | 1 a 365 días |
| `SALES_LOCK_TTL_MS` | 10000 a 90000 ms |
| `SALES_TOOL_TIMEOUT_MS` | 1000 a 15000 ms |
| `SALES_RETRIEVAL_TOP_K` | 1 a 40 resultados |
| `SALES_SIMILARITY_THRESHOLD` | 0 a 1 |
| `SALES_EMBEDDING_MODEL` | text-embedding-3-small o text-embedding-3-large |
| `SALES_HANDOFF_FAILURE_THRESHOLD` | 1 a 10 fallos |
| `SALES_GATEWAY_CONCURRENCY` | 1 a 8 conversaciones |
