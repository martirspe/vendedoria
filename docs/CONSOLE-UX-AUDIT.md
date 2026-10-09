# Consola: implementación y auditoría UX/UI

Fecha: 2026-10-06. Alcance: las rutas operativas bajo `/app`, incluido el editor de tienda. La tienda pública y las páginas de marketing conservan su diseño para una siguiente etapa.

## Resultado

### Corrección de carga y densidad de Planes (2026-10-08)

Medición DOM responsive: viewport solicitado 1440×900, ancho efectivo 1515 y scrollWidth 1515, cinco columnas de planes; solicitado 390×844, ancho efectivo 398 y scrollWidth 398, una columna. Sin desbordamiento horizontal en esos dos tamaños. Selector anual actualiza total/equivalente/descuento y se restaura a mensual. No sustituye una inspección visual por captura ni valida el scroll sticky.

currentPlan llega sin prepay desde BillingService. El rediseño intentaba leerlo al renderizar la renovación, provocando un fallo aunque la consulta recibiera datos. Regresión reproducida con la forma real de respuesta y corregida resolviendo precios desde plans; contrato frontend actualizado. Consumo en celdas compactas, ancho disponible aprovechado y comparación con columnas adaptables; ayuda/condiciones desplegables. ds-form-section añade density compact reutilizable sin cambiar el valor predeterminado de otras vistas. El CSS local solo compone columnas con un token existente.

Verificación: ocho tests de Planes y 192 tests/34 archivos de consola aprobados; builds web y store aprobados. Esta ejecución sustituye los bloqueos históricos para las secciones anteriores. Advertencias: store 414.54 kB frente a 400 kB; tests de Pedidos emiten showModal ausente en JSDOM aunque pasan. Carga autenticada y selector mensual/anual comprobados con datos reales, sin comprar ni modificar planes. Capturas fallan con Unable to capture screenshot; revisión visual completa, responsive/sticky y checkout siguen pendientes. Las demás vistas aún requieren una pasada individual de densidad.

### Pulido por secciones: Planes (2026-10-08)

Consumo, comparación, paquetes y condiciones compuestos con ds-form-section, console-metric, ds-select, ds-action-bar y ds-disclosure. Stylesheet de Planes retirado; enlace de cotización sin botón anidado. Total a pagar y equivalente mensual del período explícitos, precios/descuentos procedentes del contrato de API y monedas/importes del checkout intactos. Consumos IA de textos/imágenes separados; límites y usuarios/invitaciones visibles. Pago de suscripción distinguido de pagos de pedidos.

Período bloqueado durante creación o checkout pendiente; no se sustituye un checkout abierto al iniciar otra compra. Plan sin precio para el período no se puede comprar. Fallo de consulta conserva último consumo pero bloquea compra hasta recuperar estado; éxito de pago permanece separado del fallo de actualización. Confirmación de pago de prueba sigue accesible si falla la solicitud. Permisos, SDK, métodos, contratos y céntimos conservados; el formulario interno PlanCheckout no se modifica y su pulido/verificación visual siguen pendientes. Ningún checkout real creado ni pago/cambio de plan real ejecutado.

Verificación: seis tests añadidos a uno existente (siete en total), sin ejecutar; cubren total/período, duplicados, checkout conservado, éxito con consulta fallida, confirmación recuperable y uso conservado. Fuente/contratos y diff check revisados. Build web/tests pendientes por límite de revisión automática previamente detectado, sin eludirlo. Revisión visual/responsive/sticky y SDK de pago pendientes por bloqueo de navegador. Siguiente sección: Dominio; después Medición y Equipo, como configuraciones complementarias de la consola.

### Pulido por secciones: Perfil (2026-10-08)

Identidad, datos personales, contraseña, sesiones y acceso al negocio compuestos con ds-form-section, console-field, ds-button, ds-save-bar/ds-action-bar, ds-disclosure y ds-empty-state. Stylesheet local retirado. Formularios independientes; nombre con comparación de cambios y descarte local. Contraseñas con botones DS para mostrar/ocultar, autocompletado conservado, feedback asociado por IDs y fortaleza descrita como orientación. Resumen de sesiones y navegación del negocio al lateral, apilado debajo en ancho estrecho. Se cuentan sesiones sin afirmar que cada una sea un dispositivo distinto.

Bloqueo coordinado de operaciones y fieldsets, validación del nombre recortado, protección de solicitudes repetidas y revalidación después de confirmar cierre de sesiones. Borradores conservados tras error; contraseñas borradas/ocultas al guardar. Actualización fallida de sesiones no anula el éxito del cambio de contraseña o revocación: muestra último dato con aviso y reintento. Error de carga con perfil en caché se expone y bloquea edición; logout fallido recuperable. Permisos/navegación por rol y contratos de AccountApiService conservados; no se editaron auth/backend ni cuentas reales.

Verificación: ocho pruebas de página añadidas sin ejecutar, cubriendo validación, duplicados/bloqueo, conservación de borradores, descarte, éxito con consulta fallida, confirmación pendiente, recuperación de carga y navegación/logout. Helpers existentes permanecen. Fuente/contratos y diff check revisados; build web/tests pendientes por límite de revisión automática previamente detectado, sin eludirlo. Revisión visual, responsive, autofill y scroll sticky pendientes por bloqueo de navegador. Siguiente sección: Plan.

### Pulido por secciones: Ajustes (2026-10-08)

Información del negocio y configuración regional agrupadas en ds-form-section; inputs console-field, moneda ds-select, ayuda ds-disclosure y guardado ds-save-bar con descarte local. Se retira el stylesheet local. Resumen lateral de valores guardados, apilado después del formulario en ancho estrecho, independiente del borrador. Cambio de moneda con aviso de ausencia de conversión de importes, acorde con TenantsService.updateCurrent. Se preserva la moneda existente con opción propia si queda fuera de la lista habitual.

Validación ligada por ID a cada campo, nombre validado después de recortar espacios y error global al intentar guardar un formulario inválido. Comparación contra la configuración guardada evita guardados sin cambios; fieldset/descarte bloqueados durante guardado, peticiones repetidas ignoradas, borrador conservado tras fallo y respuesta guardada adoptada por formulario/resumen. Descartar no llama a la API. Contrato, países/monedas aceptados por el formulario, permisos y endpoints conservados; no se editaron ajustes reales ni backend.

Verificación: cinco tests añadidos a uno existente, seis en total; pendientes de ejecución. Revisión de fuente/contratos y diff check aprobados. Build web/tests pendientes por el límite de revisión automática previamente detectado; no se eludió. Revisión visual, responsive y scroll sticky pendiente por bloqueo del navegador. Siguiente sección: Perfil; después Plan.

### Pulido por secciones: Métricas (2026-10-08)

Vista organizada en ventas, conversaciones y atención pendiente mediante ds-form-section/console-metric. Selector ds-select de 7/30 días persistido en URL, fechas del resumen cargado, acción de actualización/atención en ds-action-bar y ayuda ds-disclosure. Stylesheet local retirado. La API solo ofrece agregados: no se añaden tendencias o comparativas inventadas. Copy ajustado al código de MetricsService: pedidos por fecha de creación y estado actual, ingresos por total de pedidos pagados/preparación/enviados/completados y relación pedidos/conversaciones sin afirmar atribución individual. Atención pendiente se mantiene visible incluso si el período está vacío y se distingue del rango temporal.

Actualizaciones conservan los datos anteriores e identifican su período; error con reintento sin falso vacío. Solicitudes repetidas del mismo período ignoradas y solo la respuesta más reciente puede modificar el resumen. Vacío considera pagos, ingresos y respuestas del vendedor además de conversaciones/pedidos/mensajes. Contrato de API, cálculo, céntimos, permisos y aislamiento conservados; no se modificó el backend.

Verificación: seis pruebas añadidas (recuperación, conservación con período identificado, carreras/duplicados, URL, atención fuera del período y vacío/formato monetario); sin ejecutar. Revisión de fuente/contrato y diff check aprobados. Build web y tests pendientes por el límite de revisión automática previamente detectado, sin eludirlo. Revisión visual, responsive y scroll sticky pendiente por bloqueo de navegador. Siguiente sección: Ajustes, después perfil y plan.

### Pulido por secciones: Integraciones (2026-10-08)

Tarjetas de funciones y conectores con ds-form-section, filtro nativo ds-select en URL, resumen console-metric de estados reales, ayuda ds-disclosure y barra compartida para actualizar estados. Se elimina el stylesheet local de filtros/tarjetas/status y los botones anidados en enlaces. Una función activada se distingue de una cuenta externa conectada; WhatsApp vinculado no garantiza recepción y Mercado Pago necesita configured para figurar conectado. Conectores no disponibles sin promesas de lanzamiento o capacidades activas.

Carga/fallo/recuperación diferenciados: no se muestran funciones como disponibles cuando falla la carga. Mutaciones bloqueadas durante carga o solicitud y revalidadas después de confirmar; configuración anterior conservada al fallar. Si TikTok no se puede consultar después de guardar, el éxito de activación permanece y la consulta muestra un aviso independiente. OAuth y operaciones manuales existentes conservados; no se alteran pagos, campañas, stock ni endpoints. Sin cuentas o datos reales operados.

Verificación: seis pruebas de interacción añadidas sin ejecutar (recuperación, duplicados, éxito con consulta fallida, permisos/disponibilidad, confirmación pendiente y filtro URL). Revisión de contratos/fuente y diff check aprobados. Build web y tests pendientes por el límite de revisión automática previamente detectado; no se eludió. Revisión visual/responsive/sticky pendiente por bloqueo de navegador. Siguiente sección: Métricas.

### Pulido por secciones: Cobros (2026-10-08)

Estado guardado desglosado en conexión, entorno y clave de notificaciones. Una cuenta de prueba ya no anuncia cobros reales. Formulario con ds-form-section, ds-select, console-field y ds-action-bar; ayuda lateral se apila debajo en ancho estrecho y usa ds-disclosure. URL de webhook seleccionable y acción de copia accesible. Errores vinculados a cada credencial, fieldset bloqueado durante operación y feedback distingue verificar de desconectar. Selector nativo con ngValue conserva booleanos; campos secretos opcionales al actualizar, borrador conservado tras error y secretos limpiados tras éxito. Desconexión revalida permisos/estado después de confirmar; guardado bloqueado cuando la API informa almacenamiento seguro no disponible.

Cobros deja de consumir los stylesheets de Tienda/Cobros. El stylesheet de Cobros se conserva porque Dominio, Medición y Equipo todavía lo importan. No se cambian endpoints, validadores del dominio, permisos ni flujos de pago. Sin conexiones, desconexiones o cobros reales.

Verificación: siete pruebas de interacción añadidas, no ejecutadas. Revisión de fuente/contratos y diff check aprobados; build web y tests pendientes por límite de uso de la revisión automática que bloqueó Docker en la pasada anterior. No se intentó eludir ese bloqueo. Revisión renderizada, responsive y sticky pendiente por bloqueo del navegador. Siguiente sección: Integraciones.

### Pulido por secciones: Canales (2026-10-08)

WhatsApp e Instagram consumen ds-form-section, ds-disclosure, console-field y ds-action-bar. WhatsApp retira su stylesheet de controles/paneles; Instagram deja de importar Tienda/Cobros. Jerarquía: estado, formulario y diagnóstico/ayuda. Prueba de mensaje de WhatsApp es opcional y conserva su operación existente; no se ejecuta en datos reales. Errores asociados a campos, fieldset bloqueado durante solicitud, protección de duplicados, borrador conservado tras error y token borrado tras éxito. La respuesta de conexión/disconexión actualiza el estado sin convertir un fallo posterior de recarga en un fallo de la operación.

Diagnóstico tiene fallo/recuperación propios y conserva el último resultado si falla la actualización. Instagram separa cuenta conectada de recepción habilitada; éxito no promete que el vendedor ya responde. Contratos y permisos existentes conservados; no se modifican endpoints, firmas, credenciales almacenadas ni flujos de mensajería.

Verificación pendiente: seis pruebas de interacción añadidas, todavía no ejecutadas. Build web, pruebas y revisión visual pendientes. La revisión automática de permisos falló por límite de uso antes de ejecutar Docker; no fue una valoración de inseguridad y no se sustituyó por otro mecanismo. Diff check aprobado. Sin conexiones, desconexiones ni mensajes reales.

### Segunda pasada del editor visual (2026-10-08)

Se separan navegador de estructura, lienzo e inspector de propiedades de la selección. Buscar no altera contenido; seleccionar restablece el panel Contenido y permite acceder al campo sin repetirlo en la navegación. Biblioteca buscable con ds-choice-card compacta. Canvas expone dispositivo y actualización protegida frente a duplicados; recuperación conserva contenido. Ayuda de atajos; Ctrl/Cmd+S guarda borrador sin publicar, Ctrl/Cmd+Z conserva undo nativo en campos. Paneles se pueden reabrir en móvil. Se mantiene la toolbar original y la excepción de no añadir sticky de acciones.

Primer build web de la nueva composición aprobado; compilación final web/store (tras densidad compartida y ajustes finales), siete pruebas del editor y revisión visual/iframe siguen pendientes por límite de revisión automática y bloqueo del navegador, respectivamente. No se afirma paridad con editores externos ni aceptación visual.

### Pulido por secciones: Tienda web y editor (2026-10-08)

Configuración consume ds-form-section, ds-select, console-field, ds-disclosure y ds-save-bar; distribución principal/lateral se apila en ancho estrecho. Errores vinculados a campos nativos, fieldset bloqueado durante operaciones, guardado duplicado ignorado y borrador conservado tras fallos. Descartar restaura la configuración guardada sin petición. Publicar exige resolver cambios locales para no publicar una configuración diferente de la que se está editando; disponibilidad pública se distingue del estado PUBLISHED. Los controles/estilos heredados del stylesheet de Tienda usados por otras secciones se conservan: no se afirma una migración global.

Editor conserva iframe, autoguardado, undo/redo e historial; campos de texto reutilizan console-field. Por petición del usuario, conserva la cabecera y los botones originales, sin cápsula de acciones ni sticky añadido; estado de autoguardado junto al título. Recuperación explícita tras error y bloqueo de operaciones simultáneas de publicación/programación/restauración. Se conservan estilos propios de layout, selectores de estilo y herramientas del editor; no se afirma conformidad completa DSM.

Verificación: build web aprobado sin advertencias y 19 pruebas de Tienda/editor/historial aprobadas (5 configuración, 2 recuperación de publicación, 12 contenido/historial). Sin publicaciones ni cambios de tienda real. Revisión visual, iframe, scroll y medidas responsive pendientes por bloqueo del navegador.

### Pulido por secciones: Descuentos (2026-10-08)

Segunda pasada tras captura: se observan CTA duplicado y vacío con poco contexto. Se reemplaza por cuatro acciones por beneficio mediante ds-choice-card, reutilizado en el diálogo; un solo h1, secciones explicativas y resumen reactivo de código/beneficio/requisitos/usos/vigencia. Ayuda en ds-disclosure. Checkbox mantiene marca verde en casilla ink y pierde únicamente el fondo de marca en la fila/panel. Ocho pruebas de interacción aprobadas; no se considera validada visualmente la implementación posterior sin navegador.

Segunda pasada compilada: web sin advertencias; store aprobado con warning de bundle inicial 414,54 kB frente a 400 kB, ya presente antes del cambio. No se modifican datos de descuentos reales.

Formulario compuesto con ds-form-section, ds-checkbox inline, ds-select y campos DS; se retiran controles propios y dependencia de estilos de Tienda/Cobros. Barra con región en español, cambios pendientes reales y bloqueo de descarte durante guardado. Carga con estructura de lista, vacío DS y error recuperable; creación oculta si la carga falló. Resumen después del formulario en móvil y explicación de condiciones con lenguaje de compra.

Errores asociados a código, nombre, importe/porcentaje, cantidades, límites, selección y fechas, con foco en el primer campo inválido. Formulario nativo bloqueado durante guardado y solicitudes duplicadas ignoradas. Error conserva edición y borrador; éxito adopta la respuesta de API para no presentar una recarga fallida como un guardado fallido. Activar/pausar/eliminar bloquean acciones repetidas y conservan datos guardados si fallan. Las reglas y conversiones a céntimos siguen sujetas a validación de API; no se modifica el motor de descuentos ni contratos.

Verificación: build web aprobado sin advertencias y seis pruebas de Descuentos aprobadas, cubriendo validación, bloqueo/conservación del borrador, conversión a céntimos, selección, recuperación y activación. Sin operaciones sobre descuentos reales. Revisión visual, medidas responsive y scroll pendientes por bloqueo de navegador; la compilación no sustituye esa evidencia.

### Pulido por secciones: Productos (2026-10-08)

La lista conserva resumen, filtros URL y paginación. Importación y feedback se alinean con utilities centrales; los filtros de tipo usan console-filter-chip con estado seleccionado compartido. El editor utiliza campos y ds-checkbox inline conservando los inputs nativos y sus bindings para stock, disponibilidad, publicación, sets y variantes. Se retiran los estilos propios de switches, checkboxes, campos y acciones de importación. El grupo de stock deja de anidar etiquetas de controles.

Fieldset nativo bloquea los controles mientras se guarda o elimina, sin modificar los valores de Angular forms ni el payload. Save/upload duplicados y cierre durante subida bloqueados; el editor y los datos se conservan cuando falla el guardado. La confirmación dice agregado al catálogo, sin prometer publicación o preparación del vendedor. Contratos de clasificación, medios, variantes, sets y API conservados. Quedan estilos heredados de composiciones y otras responsabilidades por migrar; no se afirma conformidad completa con la DSM.

Verificación: build web aprobado sin advertencias; once pruebas de Productos aprobadas, incluidas dos de bloqueo/conservación tras error y controles nativos durante subida. Variantes/sets mantienen cobertura de ida y vuelta. Sin guardados de catálogo real. Revisión visual, medidas responsive y scroll pendientes por bloqueo de navegador; no se sustituyen con conclusiones de compilación.

### Pulido por secciones: Inventario (2026-10-08)

Opciones de vista y corrección de resumen: panel de ordenamiento/columnas junto al buscador, con orden por producto, SKU o disponible y dirección ascendente/descendente. SKU ausente y stock ilimitado quedan al final; la ordenación usa valores guardados para evitar saltos mientras se edita. Columnas opcionales SKU/disponible/ilimitado, producto siempre visible y ancho redistribuido al ocultar. Preferencias en URL, restablecimiento sin perder drafts y recuperación de validación que vuelve a mostrar la columna de cantidad. A pedido del usuario, las tres tarjetas de resumen vuelven sobre el bloque de inventario y reemplazan el resumen de pie.

El componente ds-menu incorpora mode panel para controles de formulario: popover no modal, foco inicial, teclado nativo, Tab sin captura, Escape/cierre con retorno al trigger y cierre al salir con teclado. El modo menu de acciones conserva su contrato. Suite completa web: 127 pruebas / 26 archivos aprobados (11 de Inventario, 3 de panel). Builds web/store aprobados; store mantiene warning de 414,53 kB frente a 400 kB. JSDOM sigue emitiendo avisos de APIs ausentes en pruebas de otras secciones que pasan. Capturas, posición real del popover y móvil siguen pendientes por bloqueo de navegador.

Referencia visual aportada por el usuario: se compacta la composición con franja de búsqueda/filtros, columnas de producto con miniatura, SKU, disponible y stock ilimitado; resumen al pie en lugar de tarjetas. Mantiene identidad y datos propios de VendedorIA. Checkbox inline y filas usan contratos compartidos. Paginación local sobre el inventario ya cargado: 25/50/100 registros, rango y total, límites de navegación y URL; filtros/tamaño reinician página, las ediciones sobreviven al cambio y guardar aplica el draft completo. “Revisar cantidad” abre la página del primer error y elimina filtros que lo oculten.

Verificación de esta ampliación: nueve pruebas de Inventario y cuatro de componentes compartidos aprobadas; el checkbox inline conserva comportamiento nativo/forms. Builds web y store aprobados; store conserva aviso de 414,53 kB frente al presupuesto de 400 kB. Revisión visual y scroll real pendientes por bloqueo de navegador; no se afirma rendimiento de paginación remota porque la API continúa entregando el conjunto completo.

Ampliación posterior: imagen principal junto al nombre, usando la composición de miniatura existente del catálogo y carga diferida. Las variantes conservan la imagen del producto; imágenes ausentes o fallidas usan ds-icon sin mostrar un recurso roto. La API incorpora imageUrl nullable seleccionando un solo medio principal por producto dentro de su consulta tenant-scoped, sin otra petición de catálogo desde la consola. Builds web/API aprobados; siete pruebas de Inventario y tres de CatalogService aprobadas, incluida selección de foto y fallback ante error. Suite API en base aislada: 360 pruebas unitarias y 108 e2e aprobadas. No se inspeccionaron imágenes reales en navegador.

Lista operativa que se apila en móvil y separa identidad del producto de sus controles; no exige desplazamiento horizontal para editar. Reutiliza botones, campos, checkbox, FAQ y barra sticky DS. Resumen basado en stock guardado; búsqueda y stock bajo viven en la URL con filtros que se eliminan individualmente. El filtro de stock bajo no oculta una fila mientras se edita, porque usa la configuración guardada. Se explica que guardar incluye los cambios ocultos por filtros.

Cantidades vacías, negativas, fraccionarias o fuera del rango entero representable se señalan junto al campo y bloquean el guardado; no se convierten silenciosamente a cero ni se redondean. Aviso con recuperación de filtros si hay cantidades inválidas ocultas. Edición y descarte bloqueados durante guardado; protección frente a solicitudes duplicadas y conservación del draft tras error. Se retiraron el SCSS de controles propio y la dependencia del stylesheet de Tienda. Contratos y endpoints de inventario conservados.

Verificación: seis regresiones de Inventario aprobadas en Docker y build web aprobado sin advertencias. Cobertura de filtros URL/drafts ocultos, validación, concurrencia, respuesta de API, error/reintento, stock ilimitado y distinción carga fallida/vacío/sin coincidencias. Revisión responsive de fuente y DOM de tests; sin capturas ni mediciones en navegador por el bloqueo de URL ya registrado. No se modificó stock real. Queda pendiente verificar scroll sticky y composición visual móvil/escritorio en navegador.

### Design System y corrección de branding (2026-10-08)

La corrección de Envíos pasó a componentes compartidos: ds-checkbox, ds-form-section, ds-disclosure y ds-save-bar. ds-action-bar adopta la referencia del usuario (cápsula ink, estado/conteo, acción secundaria, CTA verde) y centraliza posición, tamaño, espaciado y color mediante tokens. Diez barras existentes migradas; Vendedor IA y Envíos usan el patrón de guardado. La matriz en docs/DESIGN-SYSTEM.md documenta contratos reales, adopción y gaps; docs/UX-UI-MASTER-SYSTEM.md conserva el prompt original más la sección 75 íntegra. AGENTS.md enruta futuras tareas de UI a la matriz.

Build web sin advertencias y build store correcto con warning de bundle inicial (414,53 kB frente a presupuesto 400 kB). Suite de 113 tests en 24 archivos aprobada, incluidos cuatro de componentes y cinco de Envíos. La revisión del sticky al hacer scroll real, capturas y mediciones móviles siguen pendientes por bloqueo de navegador. No se declara una migración completa de todos los estilos heredados ni conformidad WCAG certificada. APIs, permisos y operaciones de negocio permanecen a cargo de sus consumidores.

### Pulido por secciones: Envíos (2026-10-08)

Formulario ampliado con resumen lateral de opciones guardadas en escritorio y debajo en pantallas pequeñas. El resumen usa exclusivamente las opciones devueltas por la API, distingue tarifas referenciales de recojo gratis y permanece vigente mientras hay cambios pendientes. La barra indica guardado o cambios sin guardar. Carga con estructura de página, error con reintento, aviso de opciones ausentes y errores junto a importe/tarifas/distrito. Campos de edición bloqueados durante el guardado y protección frente a solicitudes duplicadas. Estilos reutilizan DS y tokens; etiquetas de controles y referencias de ayuda mejoradas.

Verificación: build web aprobado sin advertencias y cinco tests de Envíos aprobados: conservación de opciones/draft tras error, importes inválidos sin envío, distrito pendiente al cambiar provincia, recuperación de carga y guardado único con adopción de la respuesta de API. Conversiones a céntimos, tarifas y contratos existentes conservados. No se modificó configuración real. La herramienta de navegador sigue bloqueada por la política de URL detectada en la sección anterior; esta pasada tiene revisión de fuente y DOM bajo pruebas, sin captura ni mediciones responsive en navegador. Queda pendiente comprobar visualmente escritorio/móvil y guardar contra la API real.


### Pulido por secciones: Pedidos (2026-10-08)

Las tarjetas móviles y el tablero muestran el estado de pago, independiente del estado del pedido; sin registro de pago no se infiere ausencia de enlace ni pago confirmado. Los filtros de búsqueda y estado se quitan individualmente conservando el contexto de URL. El tablero se apila en móvil y su región desplazable permite foco de teclado en escritorio. Acciones de detalle/nuevo pedido se apilan en móvil; nuevo pedido tiene un pie adherente dentro del panel. Colores, tipografía, medidas y radios se unifican con tokens; se retiran gradientes y la etiqueta de proveedor que infería conexión desde el modo de prueba.

Verificación: build web aprobado sin advertencias; 13 tests de Pedidos aprobados, incluidos tres casos de filtros individuales, paridad de estados de pago y etiqueta de proveedor. Se conservan contratos de API, importes y acciones de cobro/transición. Persisten avisos de showModal ausente en JSDOM en los casos previos de diálogo. El navegador rechazó el acceso por su política de URL: no se realizaron capturas, mediciones responsive ni operaciones reales en esta pasada. Los ajustes responsive tienen revisión de fuente; queda pendiente comprobar visualmente lista, tablero y diálogos en escritorio y móvil.


### Pulido por secciones: Mensajes (2026-10-08)

La lista cede más espacio al chat y distingue IA activa de atención manual. Los filtros se pueden limpiar conservando la conversación abierta; carga y ausencia de coincidencias tienen estados propios. Las respuestas manuales se atribuyen al equipo y el compositor explica cuándo se pausa la IA. El envío vacío se bloquea. La ventana cerrada de 24 horas muestra opciones de plantilla desplegables y omite el envío libre; las consultas de la IA usan etiquetas comprensibles. Tokens semánticos y utilities DS reemplazan estilos duplicados.

Verificación: build web final aprobado sin advertencia de presupuesto de Mensajes y 101 tests en 22 archivos, incluidos 10 de Mensajes. Se comprobaron selección, volver a lista, búsqueda sin coincidencias, limpiar filtros y abrir/cerrar plantillas, sin enviar mensajes ni modificar conversaciones o pedidos. DOM y medidas a anchos efectivos 1531 y 414: client/scroll 1515/1515 y 414/414, sin desbordamiento horizontal. Controles móviles de 44 px; compositor dentro del viewport vertical. En horizontal (897 de ancho), client/scroll 881/881; historial limitado a 144 px con desplazamiento propio y acceso al compositor mediante desplazamiento de página. La captura falló en la vista actualizada: esta evidencia usa DOM, estilos computados e interacciones; no se declara una auditoría visual completa. No se verificaron envíos reales, creación de pedidos, todos los roles ni errores de red en navegador. Persisten avisos de APIs DOM ausentes en pruebas de otras secciones.


### Pulido por secciones: Vendedor IA (2026-10-08)

Las seis secciones comparten título contextual, formulario amplio y resumen compacto de configuración/saludo que pasa al final en móvil. El puntaje informa avance de configuración, sin declarar que el negocio está listo para vender; el estado activo/pausado refleja lo guardado. El nombre inválido muestra un error asociado al campo. La prueba distingue su contexto, permite reintentar la apertura, bloquea el envío sin sesión y mantiene el compositor accesible en móvil y horizontal. Se reutilizan utilities DS y tokens; se eliminaron estilos decorativos sin uso y la advertencia de presupuesto SCSS de Seller.

Build web final aprobado; 97 tests de consola aprobados y cinco regresiones de Seller reejecutadas tras los ajustes. Navegación por las seis pestañas comprobada en escritorio/móvil: anchos CSS efectivos 1531/414, client/scroll 1515/1515 y 398/398. La ventana se abrió y cerró, sin enviar mensajes ni reiniciar historial; en horizontal (897 de ancho CSS) client/scroll 881/881 y compositor dentro del viewport. Controles móviles de 44 px. Capturas de perfil y prueba revisadas. No se verificaron guardados reales, reasignación de canales, publicación de FAQs ni todos los roles/planes. Recuperación de apertura y validación cubiertas por tests, sin inyectar fallos de red en navegador. Los mensajes preexistentes de APIs DOM ausentes siguen en tests de otras secciones.

### Pulido por secciones: Inicio (2026-10-08)

Inicio utiliza ahora una cabecera operativa compacta, un siguiente paso destacado y una lista de primeros pasos con etiquetas visibles de completado, siguiente paso y pendiente. La carga conserva la estructura, el error ofrece reintento y las acciones se apilan en móvil. La configuración del vendedor muestra el máximo de la API (240/240 en el negocio observado), en lugar del denominador fijo 200. Se conservan las condiciones de preparación y los enlaces existentes.

Build web y 92 tests aprobados en Docker, incluidos 8 de Inicio. Navegación Inicio → Canales → Inicio verificada. Capturas revisadas a tamaños solicitados 390×844 y 1440×900: anchos CSS efectivos 414/1531 y client/scroll 398/398 y 1515/1515; sin desbordamiento horizontal. Acciones de móvil de 44 px (43.999 por redondeo). Los estados de error y vendedor ausente tienen cobertura automatizada; no se verificaron visualmente todos los roles, planes ni fallos de red. Persisten el warning de presupuesto SCSS de Vendedor IA y mensajes de APIs DOM ausentes en JSDOM en tests de otras secciones. Seguimiento en docs/agent/plans/ui-section-polish.md.

### Seguimiento: catálogo y pedidos (2026-10-07)

Esta pasada añade cambios visibles a las dos superficies solicitadas. Conserva los formularios de producto, los contratos de API y los datos del negocio.

- **Catálogo:** resumen accionable del catálogo completo, sin stock, no disponibles y ocultos en tienda; búsqueda con icono, filtro de inventario y chips que se pueden quitar individualmente. Las filas separan publicación, disponibilidad, unidades, progreso de ficha y precio. Un producto físico con cero unidades deja de aparecer como «Disponible». El cálculo de variantes suma únicamente opciones habilitadas; los servicios, digitales y sets no se clasifican como agotados a partir del stock del padre.
- **Pedidos:** panel de lista con resumen de los resultados actuales, pestañas de pendientes/historial y acciones Lista/Tablero. La lista es la vista inicial; en móvil se convierte en tarjetas con referencia, importe, cliente, producto y estado. Búsqueda, estado, pestaña y vista persisten en la URL; la búsqueda espera una pausa breve antes de consultar. El tablero incluye cancelados y muestra únicamente la columna elegida cuando se aplica un estado.
- **Recuperación:** cargas con estructura de filas; ausencia de coincidencias diferenciada de ausencia de pedidos; limpiar filtros y volver al historial son acciones directas. El detalle omite nuevos enlaces de cobro en pedidos cancelados o ya pagados, y explica el cierre cuando no existe un pago.

Verificación de esta pasada: build de web y 84 tests de consola, incluidos siete nuevos casos de inventario, restauración de filtros, búsqueda, pedidos cancelados y acciones de cobro. El build conserva un warning de presupuesto SCSS de Vendedor IA, fuera de estos cambios.

Se ejercitaron ambas rutas en el navegador autenticado: sin stock → recarga → quitar chip; no coincidencias → ver todo; pedidos → historial → búsqueda → recarga → limpiar; tablero → cancelados → lista móvil → abrir detalle. No se guardaron productos, crearon pedidos ni ejecutaron cobros. Los resúmenes de pedidos indican «En esta vista» porque se calculan sobre la consulta actual, no como métricas globales.

Viewport solicitado: 1440×900 y 390×844. El navegador integrado reportó anchos CSS efectivos de 1531 y 414; documento de 1515 y 398, respectivamente, sin desbordamiento horizontal en las rutas comprobadas. Los controles móviles observados conservan `min-height: 44px` (las medidas fraccionarias de layout pueden quedar en 43.999 px). La captura funcionó en la inspección inicial, pero dejó de estar disponible en las vistas actualizadas; la evidencia final de esta pasada es DOM, estilos computados e interacciones. No se declara una auditoría visual completa ni cobertura de todos los estados posibles.

### Continuación: editor de productos y detalle de pedidos (2026-10-07)

- **Editor:** resumen de foto principal, nombre, descripción y precio que se actualiza con el formulario. La revisión de datos obligatorios incluye la dirección del producto y el acceso HTTPS de productos digitales; cada fila lleva el foco al campo correspondiente. Guardar permite mostrar errores junto al campo y enfoca el primer dato pendiente. La barra indica cuántos datos faltan; los errores de validación desaparecen al corregirse. La disponibilidad se presenta como habilitación de venta, separada de inventario y publicación.
- **Detalle de pedidos:** panel ampliado, total y fecha destacados, tarjetas para cliente, entrega, productos y pago, y acciones persistentes al pie. La apertura muestra carga y permite reintentar un fallo. Una respuesta atrasada no sustituye una selección posterior ni reabre un detalle cerrado; el código de seguimiento existente se recupera al abrir. El cierre permanece bloqueado durante una operación en curso.
- **Nuevo pedido:** subtotal de los productos según la cantidad, explicación de borrador o pago pendiente, errores junto a la cantidad y rechazo de cantidades fraccionarias o fuera del rango entero seguro. Se retiró el manejador redundante de clic del diálogo: devolver `false` al burbujear el clic de Crear pedido cancelaba el envío nativo. El comportamiento de fondo, Escape y foco sigue a cargo de `DsModalDirective`.

Verificación final: **90 tests de consola en 21 archivos**, seis casos adicionales respecto de la pasada de listas; **build web correcto**, 13 rutas prerenderizadas. Se mantiene el warning previo de presupuesto SCSS de Vendedor IA. `git diff --check` correcto.

En navegador se comprobaron editor vacío → Guardar → errores y foco; edición temporal sin guardar → resumen actualizado → acceso al precio; producto existente con foto en escritorio y móvil; detalle enviado → acciones al pie → Escape y restauración del foco; nuevo pedido → subtotal para varias unidades → cantidad fraccionaria → error/foco → corrección → limpieza de alerta. Se conservaron los datos del negocio: no se guardaron productos, crearon pedidos ni ejecutaron pagos o cambios de estado en el navegador. El envío válido se verificó con la API sustituida en la prueba de componente, pulsando el botón real del diálogo.

Los anchos CSS efectivos continuaron en 1531 y 414 px (documento 1515 y 398). Editor y diálogos comprobados sin desbordamiento horizontal; detalle en dos columnas en escritorio y una en móvil, con pie fuera del área desplazable. Los botones móviles de guardar/crear y gestión midieron aproximadamente 44 px; escritorio utiliza los tamaños compactos del diseño existente. Las capturas siguen sin estar disponibles, por lo que esta continuación aporta evidencia DOM, estilos e interacciones y no una aprobación visual mediante imágenes.

La revisión anterior de 146 observaciones se conserva a continuación como evidencia histórica, no como una nueva ejecución de toda la matriz.

La consola comparte navegación, jerarquía tipográfica, superficies semánticas, feedback y comportamiento de diálogos. Se corrigieron estados que presentaban una carga fallida como ausencia de datos, preparación para vender basada en conexiones pendientes y carreras de selección en Mensajes. El cambio conserva los contratos de API, el aislamiento del negocio y los flujos separados de pago del plan y del comprador.

La evidencia visual cubre los estados disponibles en la cuenta local de revisión. No equivale a una certificación de todos los estados del producto ni a una aprobación de lanzamiento.

## Estrategia de estilos y Tailwind

La inspección inicial encontró SCSS, componentes `ds-*` y tokens `--ds-*`; Tailwind no estaba instalado. La solicitud expresa del usuario de usar Tailwind autorizó su incorporación. Se añadió como dependencia de desarrollo de `apps/web`, con PostCSS, sin incorporarlo al build de `apps/store` ni migrar masivamente los estilos existentes.

```text
packages/design-tokens → packages/ui → Tailwind utilities → console features
```

- `apps/web/src/tailwind.css` importa tema y utilities de Tailwind 4 con prefijo `tw:`. No importa Preflight: el reset y los estilos de los componentes existentes siguen vigentes.
- El mapa semántico usa los valores de `packages/design-tokens`; no mantiene otra paleta de producto. Colores de texto para feedback, escala de título/caption y ancho de navegación se definen allí.
- El shell utiliza utilities como mecanismo principal de layout, espaciado, responsive, interacción y tipografía. Se eliminó su hoja SCSS anterior.
- Las features reutilizan `ds-button`, `ds-select`, `ds-icon` y `ds-empty-state`. Feedback y títulos usan composiciones comunes. Los estilos locales que asumían esas mismas responsabilidades se retiraron.
- El CSS estructural del editor, las animaciones y los layouts especializados se mantienen cuando su implementación convencional resulta más clara. No se introdujeron estilos inline ni variantes de tema por feature.
- El breakpoint de navegación es 900 px y el de lista/conversación es 960 px. Los colores responden a los tokens existentes; este trabajo no incorpora un tema oscuro nuevo.
- `DsModalDirective`, en `packages/ui`, aporta apertura nativa, fondo inerte, Escape, recorrido de foco y restauración del control de origen sin depender de Tailwind.

Referencias de configuración: [Angular](https://tailwindcss.com/docs/installation/framework-guides/angular), [tema semántico](https://tailwindcss.com/docs/theme) y [Preflight](https://tailwindcss.com/docs/preflight).

## Correcciones por área

| Área | Problema corregido y comportamiento resultante |
| --- | --- |
| Navegación | En móvil se convierte en un diálogo con scroll; escritorio conserva sidebar independiente. Una plantilla compartida evita divergencias. La navegación global usa 200 px y separa grupos cada 8 px; los contextos de Tienda y Ajustes usan 224 px para etiquetas largas. Ajustes contiene solo administración del negocio y equipo; Envíos, Cobros, Canales e Integraciones se mantienen como destinos operativos directos. El acceso a plan permanece en la cabecera, separado de las opciones de navegación. La ubicación actual, los enlaces activos y las secciones de vendedor se resuelven también con query y fragmentos. |
| Acciones principales | Productos, Descuentos, Inventario, Ajustes, Envíos, Dominio, Medición, Cobros, WhatsApp e Instagram ubican las acciones de guardado en una barra persistente, con estado y acción de descarte cuando corresponde. Así, guardar sigue al alcance durante formularios largos sin duplicar la misma acción dentro de la vista. |
| Teclado | El enlace «Saltar al contenido» apunta a la ruta actual. Ctrl+K abre la búsqueda y enfoca el campo. Una búsqueda sin coincidencias explica cómo continuar. Escape cierra incluso con texto escrito; Tab/Shift+Tab permanecen dentro del diálogo y el cierre devuelve el foco. |
| Empezar | El progreso aparece cuando los datos son conocidos; un error ofrece reintento. Un vendedor inexistente es un paso pendiente. Solo un vendedor activo y un canal `CONNECTED` cumplen sus pasos; un ID externo con estado pendiente o degradado no indica preparación. |
| Vendedor IA | La ausencia de vendedores ofrece el formulario existente para crear el primero. Los errores impiden editar datos obsoletos. El playground espera la carga del vendedor y un guardado exitoso de cambios pendientes. |
| Mensajes | En móvil, lista e hilo se alternan con una acción de regreso. Carga, ausencia y fallo tienen estados separados. Una respuesta tardía no reemplaza la conversación elegida ni vuelve a abrir una conversación después de regresar. |
| Atención manual | La propiedad de la conversación se describe como IA atendiendo o atención manual. Las mutaciones evitan envíos duplicados; un rechazo conserva el estado real de los checkboxes y muestra feedback. Las confirmaciones distinguen pedido, enlace creado y enlace enviado. |
| Pedidos | Error de carga con reintento, filtros con estado accesible y apertura del detalle por teclado. El detalle y los formularios usan diálogos; los errores están dentro del contexto activo. El formulario evita doble envío y se puede recorrer en pantallas horizontales cortas. |
| Catálogo e inventario | Se conserva la edición de productos/variantes y el scroll propio de tablas. Un fallo no presenta un catálogo o inventario vacío. Los controles de cantidad cumplen el mínimo de interacción del DS. |
| Descuentos | La sección sustituye el nombre «Cupones» y organiza cuatro reglas: sobre productos, sobre el pedido, compra X y obtén Y, y envío gratis. Cada regla ofrece código o aplicación automática, alcance, elegibilidad, requisitos, límites, combinación y programación. La aplicación automática se cotiza y vuelve a validarse en servidor; un código introducido por el comprador conserva prioridad y los códigos internos automáticos no se exponen en pedidos. |
| Canales | Las cabeceras y los diagnósticos reorganizan el contenido largo sin ampliar la página en móvil. Los estados permanecen legibles y el error de consulta tiene reintento. |
| Planes y cobros | La interfaz refleja el permiso existente del servidor: asesores no pueden iniciar compras de plan ni modificar la conexión de cobros. El pago del negocio a la plataforma continúa separado del pago del comprador. |
| Ajustes | Validación de nombre no vacío, código de país y moneda; errores junto al campo con `aria-invalid`/`aria-describedby`. Una carga fallida no habilita un formulario con valores supuestos. |
| Editor de tienda | Conserva el renderer y la lógica de borradores. Las herramientas y pestañas se reorganizan; tracks de grid que podían expandirse por su contenido ahora permiten encogerse. La vista cargada cabe en 320 px sin ocultar el desbordamiento de la página. |
| Otros módulos | Envíos, integraciones, dominio, tracking, Instagram, equipo, métricas, perfil y ayuda comparten títulos y feedback. Las integraciones mantienen sus gates y los módulos correspondientes incorporan recuperación de carga. TikTok LIVE conserva capacidades manuales reales. |

## Cobertura en navegador

Se recorrieron 29 rutas en cuatro viewports: **320×740, 390×844, 768×1024 y 1440×900** (116 observaciones finales). Además se comprobaron Productos, Canales, Mensajes, Pedidos, Ajustes y Editor en **360×800, 720×900, 1024×768, 1920×1080 y 844×390** (30 observaciones).

Resultado de las 146 observaciones: ningún desbordamiento horizontal de la página, ningún botón visible por debajo de 44 px y ningún input/select/textarea visible sin etiqueta. El scroll horizontal deliberado de tablas permanece dentro de su contenedor. Los inputs auxiliares de autocompletado con `aria-hidden` se excluyen del conteo.

Estos conteos verifican dimensiones y etiquetas, no sustituyen una auditoría completa de accesibilidad con lector de pantalla. La evidencia numérica y las comprobaciones de teclado están en [CONSOLE-UX-MEASUREMENTS.json](CONSOLE-UX-MEASUREMENTS.json).

| Rutas recorridas | Estado disponible en la cuenta local |
| --- | --- |
| `/app/get-started` | Progreso parcial real; siguiente paso de configuración. |
| `/app/products`, `/app/products/import`, `/app/inventory` | Catálogo de revisión, inventario y formulario de importación. |
| `/app/coupons`, `/app/messages`, `/app/orders` | Descuentos, estados vacíos reales, filtros y acciones iniciales. Formulario de pedido abierto y cerrado sin enviar. |
| `/app/shipping`, `/app/channels`, `/app/payments` | Configuración cargada, diagnósticos de canal sin conexión y formularios de conexión sin guardar credenciales. |
| `/app/metrics`, `/app/integrations`, `/app/store` | Resumen sin actividad, disponibilidad de integraciones y configuración de tienda. |
| `/app/store/editor` | Borrador cargado con preview del renderer; sin editar ni publicar contenido del negocio. |
| `/app/domain`, `/app/tracking`, `/app/instagram`, `/app/team`, `/app/tiktok-live` | Gates de disponibilidad/activación vigentes. |
| `/app/plans`, `/app/settings`, `/app/profile`, `/app/help` | Datos existentes, información del plan, configuración, perfil y guías. |
| `/app/seller/profile`, `/app/seller/personality`, `/app/seller/sales`, `/app/seller/knowledge`, `/app/seller/rules`, `/app/seller/advanced` | Estado sin vendedor y acceso a creación del primero. |

Comprobaciones de interacción: foco inicial dentro del menú móvil, Tab/Shift+Tab cíclicos, Escape y devolución al botón de menú; búsqueda con texto y sin coincidencias; Ctrl+K; enlace de salto al main; pedido modal en 844×390 con panel de 358 px y contenido desplazable, Escape y devolución a «Nuevo pedido». Los IDs del menú móvil y del sidebar son distintos.

### Límites de cobertura

- La cuenta local no tiene vendedor, conversaciones ni pedidos. El hilo con mensajes, el detalle de un pedido y el playground con un vendedor cargado se revisaron en código y mediante la cobertura automatizada aplicable; sus recorridos completos con datos reales no se ejecutaron en navegador.
- Las integraciones opcionales inactivas se comprobaron en su gate. Sus formularios y operaciones activas necesitan una cuenta con la integración habilitada para una siguiente aceptación funcional.
- No se enviaron mensajes, crearon pedidos, compraron planes, guardaron credenciales, publicaron borradores ni activaron integraciones para obtener evidencia visual. Tampoco se modificó contenido editable del negocio.
- La validación de navegador usó el navegador integrado basado en Chromium. No se ejecutó una matriz de Safari/Firefox ni lector de pantalla.

## Auditoría de copy

Alcance del escáner: layout, registro de integraciones y 22 carpetas de features de consola; 67 archivos HTML/TS. Resultado final: 29 coincidencias de heurística, todas revisadas y justificadas; ninguna coincidencia quedó sin clasificar. La lista con la decisión por hallazgo está en [CONSOLE-COPY-AUDIT.json](CONSOLE-COPY-AUDIT.json).

| Texto corregido | Resultado |
| --- | --- |
| «Commerce en el hilo» | «Pedido de esta conversación». |
| Estado «OFF» de la IA | Atención manual / IA pausada en español. |
| Confirmación que siempre decía haber enviado el enlace | Confirma si se creó un pedido, se generó un enlace o se envió al chat, según las opciones reales. |
| Indicaciones internas en búsqueda y ayuda de configuración | Guías orientadas a la acción del negocio. |
| TikTok LIVE presentado como vendedor automatizado | Nombre y descripción que respetan las capacidades manuales implementadas. |

Coincidencias conservadas:

- **25 high por «dominio»**: 22 en la feature de dominio, una en el shell, una en el registro y una en la confirmación de integraciones. Aquí describe una funcionalidad real del negocio; no es jerga interna del modelo.
- **1 high por el marcador de desarrollo** en el ejemplo de instrucciones avanzadas del vendedor: el límite de palabra ASCII de la expresión regular detecta «TODO» dentro de «MÉTODO». Es una instrucción demostrativa del campo, no una nota pendiente de implementación.
- **1 medium por `waitlist`** en un atributo `data-status` de integraciones: es un identificador no visible, no copy mostrado al usuario.
- **2 medium por «honesto»** en perfiles/técnicas de vendedor: son opciones funcionales de tono y venta responsable; no describen procesos internos.

Los diagnósticos de canal pueden incluir direcciones y requisitos de conexión devueltos por el backend. Se conservaron esos datos operativos; el escáner de fuentes no certifica todos los textos de respuestas externas. Los ejemplos del negocio cargados en el editor no fueron reescritos.

## Validación técnica

Ejecución dentro del stack Docker de desarrollo, usando las dependencias Linux de los workspaces.

| Comprobación | Resultado |
| --- | --- |
| `npm run test -w @vendedoria/web -- --watch=false` | 77 pruebas / 21 archivos pasan. |
| `ng test --watch=false --include=src/app/layout/ds-modal.directive.spec.ts` | Las 3 pruebas de diálogo pasan tras añadir el stub de API nativa que jsdom no implementa. La modalidad nativa se comprobó además en navegador. |
| `npm run build:web` | Pasa; bundles browser/server y 13 rutas prerenderizadas. Inicial: 428.64 kB, transferencia estimada 113.93 kB; CSS global 32.33 kB. |
| `npm run build:store` | Pasa; bundles browser/server con SSR por host. Inicial: 414.01 kB. |
| Pruebas de descuentos de API | 15 pruebas pasan: motor de reglas y selección de una promoción automática elegible. |
| `npm run build:api` | Pasa tras incorporar la migración aditiva y la selección automática en checkout. |
| `npm run theme:check` | Pasa: 6 releases válidos. |
| `npm run theme:test` | Pasan 11 pruebas. |
| `npm run theme:test:store` | Pasan 5 pruebas. |
| Escáner de copy | 67 archivos, 29 coincidencias justificadas. |
| `git diff --check` | Pasa. |

Las nuevas regresiones cubren progreso desconocido, ausencia de vendedor, canales pendientes/degradados, vendedor inactivo, recuperación del inbox/pedidos, respuestas tardías, regreso durante una actualización, rechazo de checkbox, bloqueo de compra para asesor, formulario inválido y navegación de diálogos.

Advertencias que siguen presentes: `seller.page.scss` (13.33 kB) supera el umbral de aviso de 10 kB; el bundle inicial de tienda supera el aviso de 400 kB en 14.01 kB. Los builds terminan correctamente. El test de temas de tienda también informa inferencia del tipo de módulo de un paquete; no se cambió su configuración para este trabajo.

No se dispone de una medición de rendimiento equivalente antes del cambio; estos tamaños son la referencia final, no una afirmación de mejora o ausencia de degradación.

## Archivos principales

- Configuración: `apps/web/.postcssrc.json`, `apps/web/angular.json`, `apps/web/package.json`, `package-lock.json`.
- Sistema visual: `packages/design-tokens/tokens.scss`, `apps/web/src/tailwind.css`.
- Interacción compartida: `packages/ui/src/dialog/ds-modal.directive.ts` y export en `packages/ui/index.ts`.
- Navegación: `apps/web/src/app/layout/console-shell.layout.{html,ts}`.
- Features: títulos, feedback y estados en los módulos inventariados; cambios funcionales acotados en onboarding, mensajes, pedidos, vendedor, ajustes, planes/cobros y editor.
- Regresiones: specs de get-started, mensajes, pedidos, ajustes, planes y diálogo.

Siguiente alcance solicitado por el usuario: continuar después con las demás superficies. Antes de la aceptación funcional completa de la consola, conviene repetir los recorridos señalados como no disponibles con una cuenta que tenga vendedor, conversaciones, pedidos e integraciones activas.
