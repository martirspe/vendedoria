# Pulido UX/UI por secciones

Referencia: documento UX/UI proporcionado por el usuario el 2026-10-08. Reutilizar tokens, Tailwind y componentes DS; auditar cada sección antes de modificarla y conservar sus contratos y permisos. Stack Docker activo.

## Corrección de Planes y densidad (2026-10-08)

Responsive medido por DOM: escritorio efectivo 1515 px, cinco columnas; móvil efectivo 398 px, una columna; clientWidth coincide con scrollWidth en ambos. Viewport restaurado al terminar. Captura visual sigue pendiente.

El usuario solicita información compacta y mejor aprovechamiento del ancho. Planes adopta ds-form-section compact, consumo sin tarjetas por dato, comparación con columnas adaptables y condiciones desplegables. Fallo reproducido por currentPlan sin prepay y corregido consultando el catálogo. Regresión observada fallando antes de la corrección; ocho pruebas de Planes y suite completa de 192 pruebas/34 archivos aprobadas, builds web/store aprobados. La evidencia nueva sustituye los bloqueos históricos de ejecución; store mantiene advertencia de presupuesto y Pedidos emite showModal ausente en JSDOM pese a pasar.

Carga con sesión y cambio mensual/anual comprobados en navegador sin crear compras. Captura visual no disponible por fallo de screenshot; no se declara aceptación visual. La siguiente pasada debe revisar densidad de las vistas anteriores antes de seguir ampliando secciones; esta corrección no implica que toda la consola esté compactada.

## Primera sección: Inicio

Implementado: cabecera compacta, siguiente paso destacado, progreso real, checklist con estados explícitos, acciones responsive, skeleton estructural y máximo de puntaje obtenido de la API. No se modificaron condiciones de preparación ni APIs.

Validación: build web en Docker aprobado; 92 tests aprobados (8 de Inicio). Navegación Inicio → Canales → Inicio comprobada. Viewport solicitado 390×844: ancho efectivo 414, client/scroll 398/398, acciones de 44 px. Viewport solicitado 1440×900: ancho efectivo 1531, client/scroll 1515/1515. Capturas visuales de ambos tamaños revisadas. La carga, error recuperable y ausencia de vendedor tienen cobertura de tests; no se simularon fallos de red en el navegador. No se certifican todos los roles o planes.

Advertencias: presupuesto de seller.page.scss excedido (13.33 kB frente a 10 kB); tests de otras secciones emiten errores de matchMedia/showModal ausentes en JSDOM aunque pasan. Cambios previos en shell, tokens, iconos y Tailwind se conservaron.

## Segunda sección: Vendedor IA

Implementado el 2026-10-08: título por sección, formularios más amplios, resumen compacto de configuración y saludo al costado en escritorio y después del formulario en móvil. El puntaje se describe como configuración, sin prometer preparación comercial por sí solo. Estado activo/pausado basado en la configuración guardada; cambios pendientes y errores del nombre explícitos. Estilos reutilizan utilities DS/Tailwind y colores semánticos; se eliminaron el anillo y los estilos decorativos sin uso. La prueba tiene contexto claro, reintento de apertura, controles bloqueados sin sesión y compositor accesible en móvil/horizontal.

Verificado: build web final sin advertencia de presupuesto de Seller; suite de 97 tests aprobada y cinco regresiones de Seller reejecutadas tras los ajustes finales. Se navegaron las seis pestañas a anchos efectivos 1531 y 414 (client/scroll 1515/1515 y 398/398). Ventana de prueba revisada en móvil y horizontal (ancho efectivo 897, client/scroll 881/881), abierta y cerrada sin enviar mensajes ni reiniciar el historial. Controles móviles medidos en 44 px. No se guardaron vendedores, reasignaron canales, publicaron FAQs ni modificaron registros; guardado completo, roles/planes y errores de red en navegador quedan fuera de la evidencia de esta pasada. El error/reintento de apertura y la validación del nombre tienen cobertura automatizada.

Siguiente sección: Mensajes.

## Tercera sección: Mensajes

La lista cede más espacio al chat y distingue IA activa de atención manual. Los filtros se pueden limpiar conservando la conversación abierta; carga y ausencia de coincidencias tienen estados propios. Las respuestas manuales se atribuyen al equipo y el compositor explica cuándo se pausa la IA. El envío vacío se bloquea. La ventana cerrada de 24 horas muestra opciones de plantilla desplegables y omite el envío libre; las consultas de la IA usan etiquetas comprensibles. Tokens semánticos y utilities DS reemplazan estilos duplicados.

Verificación: build web final aprobado sin advertencia de presupuesto de Mensajes y 101 tests en 22 archivos, incluidos 10 de Mensajes. Se comprobaron selección, volver a lista, búsqueda sin coincidencias, limpiar filtros y abrir/cerrar plantillas, sin enviar mensajes ni modificar conversaciones o pedidos. DOM y medidas a anchos efectivos 1531 y 414: client/scroll 1515/1515 y 414/414, sin desbordamiento horizontal. Controles móviles de 44 px; compositor dentro del viewport vertical. En horizontal (897 de ancho), client/scroll 881/881; historial limitado a 144 px con desplazamiento propio y acceso al compositor mediante desplazamiento de página. La captura falló en la vista actualizada: esta evidencia usa DOM, estilos computados e interacciones; no se declara una auditoría visual completa. No se verificaron envíos reales, creación de pedidos, todos los roles ni errores de red en navegador. Persisten avisos de APIs DOM ausentes en pruebas de otras secciones.

Siguiente sección: Pedidos.

## Cuarta sección: Pedidos

Las tarjetas móviles y el tablero muestran el estado de pago, independiente del estado del pedido; sin registro de pago no se infiere ausencia de enlace ni pago confirmado. Los filtros de búsqueda y estado se quitan individualmente conservando el contexto de URL. El tablero se apila en móvil y su región desplazable permite foco de teclado en escritorio. Acciones de detalle/nuevo pedido se apilan en móvil; nuevo pedido tiene un pie adherente dentro del panel. Colores, tipografía, medidas y radios se unifican con tokens; se retiran gradientes y la etiqueta de proveedor que infería conexión desde el modo de prueba.

Verificación: build web aprobado sin advertencias; 13 tests de Pedidos aprobados, incluidos tres casos de filtros individuales, paridad de estados de pago y etiqueta de proveedor. Se conservan contratos de API, importes y acciones de cobro/transición. Persisten avisos de showModal ausente en JSDOM en los casos previos de diálogo. El navegador rechazó el acceso por su política de URL: no se realizaron capturas, mediciones responsive ni operaciones reales en esta pasada. Los ajustes responsive tienen revisión de fuente; queda pendiente comprobar visualmente lista, tablero y diálogos en escritorio y móvil.

Siguiente sección: Envíos. Verificación visual de Pedidos pendiente por bloqueo de navegador.

## Quinta sección: Envíos

Formulario ampliado con resumen lateral de opciones guardadas en escritorio y debajo en pantallas pequeñas. El resumen usa exclusivamente las opciones devueltas por la API, distingue tarifas referenciales de recojo gratis y permanece vigente mientras hay cambios pendientes. La barra indica guardado o cambios sin guardar. Carga con estructura de página, error con reintento, aviso de opciones ausentes y errores junto a importe/tarifas/distrito. Campos de edición bloqueados durante el guardado y protección frente a solicitudes duplicadas. Estilos reutilizan DS y tokens; etiquetas de controles y referencias de ayuda mejoradas.

Verificación: build web aprobado sin advertencias y cinco tests de Envíos aprobados: conservación de opciones/draft tras error, importes inválidos sin envío, distrito pendiente al cambiar provincia, recuperación de carga y guardado único con adopción de la respuesta de API. Conversiones a céntimos, tarifas y contratos existentes conservados. No se modificó configuración real. La herramienta de navegador sigue bloqueada por la política de URL detectada en la sección anterior; esta pasada tiene revisión de fuente y DOM bajo pruebas, sin captura ni mediciones responsive en navegador. Queda pendiente comprobar visualmente escritorio/móvil y guardar contra la API real.

Siguiente sección: Productos e Inventario. Revisión visual de Pedidos/Envíos pendiente.

## Siguiente recorrido

### Decimosexta sección: Planes

Implementado el 2026-10-08: consumo/comparación/paquetes/condiciones con DS, sin stylesheet local; período y total/equivalente claros. Checkout existente conservado, duplicados bloqueados, confirmación recuperable y éxito del pago separado de consulta fallida. Sin cambio de precios, céntimos, SDK, permisos o API y sin compras reales.

Seis tests añadidos a uno existente (siete en total); ejecución/build web pendientes por límite del revisor automático. Fuente/contratos/diff check revisados. Revisión visual/sticky/SDK pendientes por bloqueo de navegador; PlanCheckout interno aún conserva sus estilos y se audita aparte. Siguiente sección: Dominio, después Medición y Equipo. Antes de ampliar a marketing/autenticación/tienda pública, completar las configuraciones complementarias de la consola y sus verificaciones pendientes.

### Decimoquinta sección: Perfil

Implementado el 2026-10-08: identidad/datos/contraseña/sesiones/acceso con DS, sin stylesheet local. Descarte del nombre, validación asociada y bloqueo coordinado de solicitudes. Borradores conservados al fallar y secretos limpiados tras éxito; consulta de sesiones fallida expone aviso/reintento sin invalidar el guardado. Permisos, autenticación y APIs conservados; ninguna cuenta real operada.

Ocho tests añadidos sin ejecutar; build web pendiente por límite del revisor automático. Fuente/contratos/diff check revisados. Renderizado/responsive/autofill/sticky pendientes por bloqueo de navegador. Siguiente sección: Plan. Se mantienen las verificaciones pendientes anteriores.

### Decimocuarta sección: Ajustes

Implementado el 2026-10-08: información/región agrupadas con DS, resumen guardado, barra corporativa con descarte local y errores por campo. Sin stylesheet local. Bloqueo durante guardado, comparación real de cambios, nombre recortado validado y borrador conservado tras fallo. Moneda existente fuera de lista mantenida; sin convertir importes ni cambiar API/permisos.

Cinco tests añadidos a uno existente (seis en total); build web/ejecución pendientes por límite del revisor automático. Fuente/diff check revisados, revisión visual pendiente por bloqueo de navegador. Siguiente sección: Perfil, después Plan. Los checks pendientes de las secciones anteriores se mantienen.

### Decimotercera sección: Métricas

Implementado el 2026-10-08: ventas/conversaciones/atención con secciones, tarjetas, filtro URL y acciones DS; sin stylesheet local. Datos retenidos al actualizar/fallar, período mostrado explícito, solicitudes repetidas ignoradas y respuestas antiguas descartadas. Definiciones verificadas contra MetricsService; atención independiente del período. Sin tendencias inventadas ni cambios de backend.

Seis tests añadidos sin ejecución y build web pendiente por límite del revisor automático. Fuente/diff check revisados. Revisión renderizada pendiente por bloqueo del navegador. Siguiente sección: Ajustes, después perfil y plan. Se mantienen los checks pendientes de las secciones anteriores.

### Duodécima sección: Integraciones

Implementado el 2026-10-08: tarjetas, selector de categoría URL, resumen de estados, ayuda y acciones DS, sin stylesheet local. Error de carga recuperable; funciones y conexiones externas diferenciadas. Guardado protegido de duplicados/revalidado tras confirmación y actualización de TikTok separada del éxito. Sin cuentas reales operadas.

Seis tests añadidos, pendientes de ejecución y build web por límite del revisor automático; fuente y diff check revisados. Revisión visual pendiente por bloqueo de navegador. Siguiente sección: Métricas, después Ajustes/perfil/plan. Las verificaciones pendientes de las secciones anteriores se mantienen.

### Undécima sección: Cobros

Implementado el 2026-10-08: estado guardado de conexión/entorno/notificaciones, formulario DS con selector booleano, errores asociados, ayuda lateral adaptable y disclosures. Sin importación de estilos de Tienda/Cobros; se conserva el stylesheet heredado para sus otros consumidores. Operaciones bloqueadas durante solicitud, borrador conservado al fallar, secretos limpiados al guardar y revalidación después de confirmar desconexión. Estado de prueba sin promesa de pagos reales. Contratos y permisos conservados.

Siete tests añadidos sin ejecución; build web pendiente por límite de revisión automática detectado al autorizar Docker. Fuente y diff check revisados. Validación visual pendiente por bloqueo de navegador; sin operar cuentas reales.

Siguiente sección: Integraciones. Canales/editor/Cobros requieren completar sus verificaciones pendientes cuando se restablezcan las herramientas.

### Décima sección: Canales (WhatsApp e Instagram)

Implementado el 2026-10-08: estado/formulario/diagnóstico y ayuda DS, validación junto al campo, controles bloqueados durante conexión, solicitudes repetidas ignoradas, datos conservados tras error y token limpiado tras éxito. WhatsApp sin stylesheet local e Instagram sin importar Tienda/Cobros. Diagnóstico recuperable y conexión distinguida de recepción. Permisos y contratos existentes conservados; sin operar cuentas ni mensajes reales.

Seis pruebas añadidas, no ejecutadas; build web pendiente. Diff check aprobado. La revisión automática no pudo autorizar Docker por límite de uso; no se bypassa. Revisión visual pendiente por bloqueo del navegador.

Siguiente sección: Cobros, seguida de Integraciones. Antes de dar por verificadas estas secciones, ejecutar los checks pendientes cuando se restablezca la revisión.

### Novena sección: Tienda web y editor

Segunda pasada del editor: estructura/lienzo/inspector separados, búsqueda de secciones y biblioteca, selección contextual, Ctrl/Cmd+S y actualización de preview sin perder contenido. Mantiene la barra original. Primer build de composición aprobado; siete pruebas añadidas y build final web/store pendientes por límite del revisor. No se confunde esta evidencia con las 19 pruebas de la pasada anterior.

Pulido el 2026-10-08: secciones/campos/checklist DS, contenido y lateral adaptable, guardado corporativo con descarte local y errores junto al campo. Operaciones protegidas, borrador conservado tras error y publicación bloqueada con configuración pendiente. Estado distingue publicación de disponibilidad. Editor consume campos DS preservando iframe, autoguardado e historial; guardas contra operaciones simultáneas. Por petición del usuario, mantiene su cabecera y acciones originales, sin cápsula ni sticky añadido. Los estilos heredados que aún consumen otras páginas se conservan.

Verificación: build web sin advertencias y 19 pruebas de Tienda/editor/historial aprobadas. No se publicó ni cambió la tienda real. Revisión renderizada, iframe y scroll pendientes por bloqueo de navegador.

Siguiente sección: Canales (WhatsApp e Instagram), seguida de Cobros e Integraciones.

### Octava sección: Descuentos

Segunda pasada a partir de captura del usuario: vacío con cuatro acciones reales por beneficio, sin CTA duplicado; tarjetas compartidas en vacío y selector. Un encabezado por vista, grupos con contexto, resumen reactivo de condiciones y ayuda desplegable. Checkbox conserva casilla ink y marca verde; se elimina exclusivamente el tinte de fondo de fila/panel. Ocho pruebas aprobadas. La captura permite evaluar el estado anterior; revisión renderizada posterior pendiente por bloqueo de navegador.

Pulido el 2026-10-08: componentes DS para secciones/controles/estados, eliminación de dependencia visual de Tienda/Cobros, cambios pendientes y resumen de borrador con ubicación móvil al final. Validación de campos/selección/fechas, guardado único y bloqueo de controles/descarte, conservación tras error y actualización desde respuesta de API. Acciones de lista protegidas frente a duplicados. No se modifican motor ni contratos de descuentos.

Verificación: build web sin advertencias y seis pruebas de Descuentos aprobadas. Sin operaciones sobre descuentos reales.

Siguiente sección: Tienda y editor. Revisión visual de Descuentos pendiente por bloqueo de navegador.

### Séptima sección: Productos

Pulido el 2026-10-08: filtros de tipo, acciones/importación y feedback compuestos con utilities centrales; campos y checkboxes DS en editor. Conservados resumen, clasificación, variantes, sets, medios y contratos API. Fieldset nativo durante guardado/eliminación y bloqueo de guardar/cerrar durante subida. Confirmación de creación precisa. Estilos locales de controles reemplazados retirados; composiciones heredadas siguen sujetas a revisión.

Siguiente sección: Descuentos. Revisión visual de Productos pendiente por bloqueo de navegador.

Verificación de Productos: build web sin advertencias y once tests del catálogo aprobados, incluidos errores/bloqueo y subida. Sin operaciones sobre datos reales; validación visual pendiente.

### Sexta sección: Inventario

Implementado el 2026-10-08 usando vendedoria-ui: lista adaptable, resumen de datos guardados, filtros URL que se quitan individualmente, búsqueda y controles DS, FAQ de sets y CTA sticky corporativo. Validación de cantidades sin redondeo ni conversión silenciosa; aviso de cambios/errores ocultos por filtros. Guardado único, controles bloqueados mientras se envía y conservación de drafts tras errores. Eliminado el stylesheet local y la dependencia de estilos de Tienda.

Verificación: build web sin advertencias y seis tests específicos aprobados en Docker. Sin operaciones sobre inventario real. Renderizado, contraste y scroll sticky siguen pendientes por el bloqueo de navegador previamente registrado.

Siguiente sección: Productos (lista y editor), continuando la etapa Productos e Inventario. Después: Descuentos.

Opciones del buscador: panel reutilizable de orden y columnas, preferencias en URL, cantidades guardadas para ordenar y restauración de errores ocultos. Tarjetas de resumen restauradas sobre la lista por instrucción del usuario. 127 tests web / 26 archivos aprobados; builds web/store correctos (warning de store persiste). Revisión visual del popover pendiente. La siguiente sección continúa siendo Productos.

Referencia visual y paginación: Inventario compacto con columnas alineadas, búsqueda/filtros en una franja y resumen discreto. Filas y checkbox inline compartidos; páginas locales de 25/50/100 con URL, rango y límites. Ediciones conservadas entre páginas, recuperación de errores ocultos y reinicio al filtrar. Nueve tests de Inventario y cuatro de componentes aprobados; builds web/store correctos (store mantiene warning de 414,53 kB). La API sigue devolviendo el conjunto completo; validación visual pendiente.

Ampliación solicitada: miniatura principal por producto en Inventario, compartida entre sus variantes. Consulta de medios limitada a una imagen, ordenada como el catálogo y excluyendo medios relacionados; fallback de ícono para imagen ausente o fallida. Siete pruebas de Inventario y tres de CatalogService aprobadas; builds web/API aprobados. La revisión visual sigue pendiente.

Pendiente de auditar e implementar sección por sección: Cobros/Integraciones, Métricas y Ajustes/perfil/plan. Canales y segunda pasada del editor tienen verificación final pendiente. Después, abordar marketing/autenticación y tienda pública como superficies independientes. Este listado es un orden de trabajo, no una declaración de cobertura ni de problemas encontrados.

Eliminar este plan al terminar el recorrido completo. Registrar evidencia de cada sección en docs/CONSOLE-UX-AUDIT.md.

## Sistema compartido y branding de Envíos

El usuario amplió el alcance al Design System. Implementación y matriz en docs/DESIGN-SYSTEM.md; instrucciones consolidadas en docs/UX-UI-MASTER-SYSTEM.md §75. Envíos y Vendedor IA usan el guardado compartido; diez barras de acciones migradas. Web/store compilados; 113 tests aprobados. Warning de tamaño inicial de store y revisión visual/sticky pendientes. Las siguientes secciones deben consumir la DSM antes de añadir o extender componentes.
