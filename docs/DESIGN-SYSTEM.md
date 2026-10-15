# VendedorIA — Design System Matrix

Esta es la matriz de implementación de la consola. El código de `packages/design-tokens` y `packages/ui` define los valores y contratos ejecutables. `PROJECT CONSTITUTION.md` define el branding; `UX-UI-MASTER-SYSTEM.md`, sección 75, contiene el protocolo UX/UI aportado por el usuario. No leer documentos completos para un cambio puntual: consultar las filas afectadas.

## Fundamentos

| Categoría | Fuente y decisión vigente |
| --- | --- |
| Marca | `--ds-color-primary`: verde #C8F542; `--ds-color-ink`: #0B0D12. La consola usa superficies claras, información densa y acento de marca en la acción principal. |
| Superficies y contenido | `bg`, `surface`, `surface-elevated`, `text-primary`, `text-secondary`, `border`, `divider`. Las features consumen nombres semánticos. |
| Feedback | `success`, `warning`, `danger`, `info` para fondo/señal; sus variantes `*-text` para textos legibles. No usar verde de marca como texto pequeño sobre blanco. |
| Foco y disabled | `focus-ring`, `disabled`, `overlay`; foco visible en teclado. Disabled conserva contexto y bloquea la operación. |
| Tipografía | Manrope para UI; Satoshi para display. `type-caption` 12 px, `type-sm` 14 px, `type-lg` 18 px y `type-page` adaptable. Los valores viven en tokens; las tablas e importes usan números tabulares. |
| Espaciado | `space-1/2/3/4/5/6/8/10/12`: escala de 4 a 48 px. Formularios: separación habitual 16 px, grupos 12 px, etiqueta/campo 8 px. |
| Tamaños | `touch-target` 44 px en móvil/táctil; densidad de consola de escritorio definida por `console-control-height`. Los botones del CTA sticky usan la misma altura que los demás botones de consola: 32 px en escritorio con puntero fino y 44 px en móvil/táctil. `console-form-width`, `console-page-width` y anchos de navegación son tokens existentes. |
| Forma | `radius-sm/md/lg` para controles, agrupaciones y superficies. `radius-pill` solo para la barra de acción y sus botones. Bordes de `border-width`. |
| Elevación | `shadow-sm` para superficies; `shadow-dropdown` para overlays y CTA sticky. No agregar sombras por pantalla. |
| Movimiento | `motion-fast/base` y `ease-out`; respetar reduced motion. Movimiento solo para interacción, no para decoración persistente. |
| Responsive | Tailwind usa los breakpoints instalados y el breakpoint `console` existente. 40 rem para composición estrecha y 64 rem para el layout principal/lateral de Envíos. CSS de layout local permitido; nuevas escalas visuales locales no. |
| Capas | Sticky: `--ds-z-sticky`. Dropdowns/dialogs existentes usan popover/dialog del navegador y su top layer. No inventar índices por feature; la normalización de capas de estilos heredados sigue pendiente. |

## Componentes y contratos

Todos se exportan desde `@vendedoria/ui`, son standalone y OnPush. Ninguno decide permisos, precios, guardado ni navegación comercial.

| Categoría | Componente/patrón | Contrato y estados |
| --- | --- | --- |
| Acción | `ds-button` | `variant`: primary/secondary/ghost/danger; `type`, `disabled`, `block`, `label`; `form` opcional asocia el botón nativo a un formulario por ID cuando la acción general está fuera de él. Contenido proyectado para texto e íconos. Foco visible, disabled y hover; el consumidor aporta el estado de operación. |
| Navegación con CTA | `a[dsLink]` | Enlace nativo con `href` o RouterLink y `variant`: primary/secondary/ghost. Comparte estilos y tokens de ds-button, sin botones anidados. Conserva apertura en otra pestaña y semántica de navegación; el consumidor aporta destino y texto accesible. |
| Selección de acción | `ds-button` con `pressed` | Estado booleano opcional para aria-pressed en el botón nativo; usado por la demo comercial. No convierte el botón en un tab ni añade navegación de teclado distinta de la nativa. |
| Ícono | `ds-icon` | `name` tipado por registro, `size`; solo Lucide y marcas oficiales existentes. Íconos decorativos acompañan texto; acciones de solo ícono necesitan nombre accesible. |
| Dropdown | `ds-select` | Proyecta un `select` nativo con sus opciones/formControl. Mejora progresiva a combobox/listbox en escritorio, búsqueda por teclado, Escape, foco, selección y opciones disabled. Fallback nativo en móvil/SSR. |
| Menú/panel | `ds-menu` | `mode`: menu (predeterminado, acciones con navegación de teclado) / panel (popover no modal con role dialog para campos y controles proyectados). Panel conserva teclado nativo y Tab; Escape/cierre explícito devuelve foco, salir con Tab cierra sin capturar foco. Foco inicial, límites del viewport y top layer nativo. Usar `ds-select` dentro del panel para valores; no presentar campos como menuitems. |
| Checkbox | `ds-checkbox` y `_checkbox-control.scss` | Proyectar exactamente un input checkbox y su texto; `description` opcional; `variant`: panel (predeterminado) / inline (filas y filtros compactos, sin marco). Apariencia compartida para casillas nativas de consola, acceso y tiendas públicas: fondo ink, check o indicador parcial verde y tamaño compartido. Conserva FormControl, dirty/touched, disabled/fieldset, clic en label y el role switch de las casillas que lo usan. Filas y paneles mantienen fondo neutro al seleccionar. Foco, error y disabled explícitos; fallback nativo en forced colors. No afecta radios; colores del checkbox independientes de la paleta del comercio. |
| Elección de acción | `ds-choice-card` | Botón nativo con `title`, `description` e `icon` requeridos, `disabled` opcional, `density`: comfortable (predeterminado) / compact (bibliotecas laterales), y salida `activate`. Para elegir un flujo concreto en vacío o diálogo; no representa selección persistente ni reemplaza checkboxes. Icono neutro, flecha de avance, foco visible, teclado nativo y altura mínima táctil. Tokens de superficie/borde/texto/espaciado compartidos; se apila según el contenedor. Consumido por Descuentos y biblioteca del editor de Tienda. |
| Sección/tarjeta | `ds-form-section` | `title` requerido, `description`, `icon`, `variant`: panel/plain; `density`: comfortable (predeterminado) / compact. Compact usa space-3 en padding/cuerpo, space-2 en cabecera e icono space-8. Header + cuerpo proyectado + slot `[dsSectionActions]`. Plain permite secciones continuas en un panel, evitando tarjetas anidadas. Planes consume compact. |
| FAQ/detalle opcional | `ds-disclosure` | `title` requerido, `group` opcional para acordeón nativo; contenido proyectado. Details/summary mantiene teclado y estado expandido sin ARIA duplicado; reduced motion. No poner acciones interactivas dentro del título. |
| CTA sticky | `ds-action-bar` | `placement`: top/bottom, `label` para la región. Slot `[dsActionStatus]` para conteo/contexto; resto para acciones. Conserva handlers y submit de los botones proyectados. |
| Guardado | `ds-save-bar` | Compone action bar al pie; `pending`, `busy`, `disabled`, `label`, `pendingText` opcional para contexto, `formId` opcional para enviar un formulario desde el pie general de la vista. Submit nativo bloqueado sin cambios o durante operación; status anuncia cambios pendientes/guardando/guardado. Proyección opcional de Cancelar/Descartar con handler del consumidor. |
| Feedback | `ds-empty-state`, `feedback-*` | Error recuperable, vacío con acción real, éxito y advertencia mediante componentes/utilities existentes. No confundir fallo de carga con ausencia de datos. |
| Formularios | `console-field`, labels con utilities | Input nativo con altura, padding y radio DS; `aria-invalid` activa borde de error. Asociar label, ayuda y error con IDs. Se preservan validadores y conversiones del dominio. |
| Datos/navegación | Utilities existentes | `console-list-panel`, `console-data-row` (2 columnas móvil / 12 escritorio con asignación de campos del consumidor), `console-metric`, `console-filter-chip`, `console-list-skeleton`, navegación y sidebar. No crear versiones locales equivalentes. |
| Sidebar de consola | `console-navigation`, `console-nav-group`, `console-nav-divider`, `console-nav-label`, `console-rail-link` | Navegación global de un solo nivel: Inicio + grupos nombrados Ventas, Catálogo y tienda, Conexiones y Resultados; integraciones activas conservan su grupo. Inventario es un destino directo junto a Productos. Secciones de Vendedor IA dentro de su módulo; importación desde Productos y accesos del buscador conservados. Cabeceras visibles al expandir y `hr` decorativos entre grupos en el rail; nombres de grupo accesibles en ambas vistas. Hover neutro y un único módulo actual con fondo seleccionado; nombres de páginas internas en la cabecera. Ancho y etiquetas con `motion-fast/base` y `ease-out`, movimiento reducido mediante tokens compartidos y retorno de foco al control del sidebar. Todos los `li` del rail comparten `touch-target` y nombres accesibles. Drawer móvil con ancho contextual, targets táctiles y cierre al navegar. |
| Overlays | `dsModal`, confirmaciones existentes | Gestión nativa de apertura/cierre y foco. Mantener bloqueo durante operaciones y retorno al origen. |

## Sticky CTA corporativo

Excepción solicitada por el usuario: el editor visual de Tienda conserva sus acciones en la cabecera original, sin ds-action-bar ni sticky añadido. Estado de autoguardado junto al título y botones de descarte/publicación en su toolbar. La configuración de Tienda concentra sus acciones en una sola barra compartida.

Referencia del usuario: estado/conteo + Cancelar/Descartar + Guardar en una cápsula ink. Verde corporativo reservado para el CTA principal. Una acción primaria por contexto; acciones secundarias mantienen el contrato del dominio.

Una sola barra flotante general por vista. Los formularios o secciones independientes conservan acciones locales sin otra cápsula flotante. Perfil muestra la barra de datos personales al pie general solo cuando hay cambios o guardado en curso; cambiar contraseña permanece dentro de su sección como acción secundaria explícita. Tienda prioriza Guardar/Descartar mientras hay cambios y muestra Publicar/Despublicar al resolverlos, en la misma barra superior. Pasos excluyentes de Canales pueden usar su propia instancia, siempre que solo una esté renderizada.

Los valores se centralizan en `--ds-action-bg/text/control-height/gap/padding/offset` y `--ds-z-sticky`. Botones con la misma altura que el resto de la consola: `console-control-height` (32 px) en escritorio con puntero fino y 44 px en móvil/táctil; separación de 8 px y padding de 4 px. La cápsula conserva ese padding alrededor de los botones, crece por contenido y se limita al ancho disponible; envuelve filas en pantallas estrechas. La forma cambia a radio-lg en móvil para evitar una cápsula excesiva de varias filas. Bottom suma el safe area del dispositivo.

Usar top cuando el contexto está antes del contenido (editores, inventario, integraciones); usar bottom en formularios con acción al final. La barra pertenece a la superficie general de la vista y debe tener suficiente altura para que sticky funcione. Puede estar dentro del formulario o asociarse a él por ID mediante `form`/`formId`, conservando submit y validación nativos. No introducir wrappers con overflow que lo anulen, ni una barra por cada sección o formulario de la misma vista. No mostrar un botón Cancelar sin comportamiento definido.

```html
<ds-action-bar label="Acciones del producto">
  <span dsActionStatus role="status">{{ pendingFields() }} datos pendientes</span>
  <ds-button type="button" variant="ghost" (click)="closeEditor()">Cancelar</ds-button>
  <ds-button type="submit" [disabled]="saving()">Guardar</ds-button>
</ds-action-bar>

<ds-save-bar [pending]="form.dirty" [busy]="saving()" label="Guardar envíos" />
```

## Composición de formularios

Preferencia de densidad: aprovechar el ancho disponible en vistas de datos y comparación, con resúmenes compactos y separadores antes que una tarjeta por cada dato. Información esencial visible; condiciones y ayuda opcionales en disclosures. La variante compact conserva los tamaños compartidos de controles y foco. Comfortable sigue disponible para formularios que necesitan más separación. La adopción compact de esta corrección se limita a Planes; las demás vistas requieren revisión individual.

```html
<ds-form-section title="Entrega" description="Cómo recibe el cliente su pedido." icon="truck">
  <ds-checkbox description="Tarifas referenciales por distrito">
    <input type="checkbox" formControlName="deliveryEnabled" />
    Envío a domicilio
  </ds-checkbox>
  <label>Dirección<input class="tw:console-field" formControlName="address" /></label>
</ds-form-section>
<ds-disclosure title="¿Cuándo se aplica el envío gratis?" group="delivery-faq">
  Se calcula sobre el total después de descuentos.
</ds-disclosure>
```

## Tailwind y gobernanza

Marketing consume los tokens `--ds-marketing-*` de ancho, tipografía, ritmo de secciones, líneas y superficies. Los CTA usan a[dsLink]; las acciones de la demo usan ds-button. Las variables de fondo/borde/texto secundarios y `--ds-button-padding-inline` permiten composición sobre la superficie oscura. Las preguntas reutilizan ds-disclosure con los tokens de contenido de marketing. La navegación móvil usa details/summary nativos, conserva la activación del enlace antes del cierre y devuelve el foco al summary con Escape.

Landing comercial: builds web y store aprobados; suite web de 207 pruebas/39 archivos. Demo, navegación móvil y metadatos con pruebas de regresión. Navegador: registro y condiciones accesibles desde sus CTA, demo y FAQ operables con teclado, canonical/schema únicos tras hidratación, fuentes e imágenes cargadas y sin desbordes en los anchos de contenido observados (324, 398, 801, 1345 y 1686 px). Capturas de la nueva landing indisponibles en el navegador integrado; aceptación visual y auditoría completa de accesibilidad pendientes. Store conserva advertencia de presupuesto inicial (415,16 kB frente a 400 kB).

Tailwind 4 se integra mediante `apps/web/src/tailwind.css`, prefijo `tw:` y `@theme inline` conectado a los tokens. Mantener clases estáticas y semánticas; CSS compartido cuando proyección, estados nativos o interacción lo requieren. CSS de feature se limita a composición propia del dominio.

Antes de crear: buscar → reutilizar → componer → extender → definir contrato en esta matriz → implementar en packages → validar → consumir. No crear nuevas familias de controles ni duplicar el sistema en marketing/tienda. La tienda conserva sus tokens `--store-*`; cambios en packages requieren compilar web y store.

La matriz representa lo implementado y los gaps reales, no un catálogo ficticio: aún existen estilos heredados de features por migrar. No se declara conformidad WCAG completa sin auditoría visual, contraste y tecnología asistiva.

## Adopción y evidencia

Checkboxes: superficie única en el SCSS compartido, consumida por ds-checkbox y los estilos globales web/store; sin cambios en bindings ni handlers de formularios. Siete pruebas de controles, cuatro de tienda y cinco de runtime de temas aprobadas; builds web/store aprobados. Navegador: casilla seleccionada ink `rgb(11, 13, 18)` e indicador verde `rgb(200, 245, 66)` en Vendedor IA, ds-checkbox y filtros de Selecta; registro consume la misma apariencia sin aceptar sus condiciones. En móvil, casilla de 20 px dentro de etiqueta táctil de 44 px, sin desbordes. Fallback de contraste del sistema revisado en fuente. Store conserva advertencia de presupuesto inicial (417,17 kB frente a 400 kB).

Sidebar de un solo nivel: nueve pruebas de navegación aprobadas y build web aprobado. Revisión en consola local: 14 iconos sobre el mismo eje horizontal (diferencia 0 px), cuatro separadores en el rail, sin desbordes ni listas anidadas. Inventario abre directamente; importación desde Productos y seis secciones internas de Vendedor IA operativas con módulo activo y nombre de página correctos. Drawer móvil a 390 px: targets de 44 px, sin desbordes y cierre al elegir Inventario. Movimiento reducido usa los tokens existentes; no se declara auditoría WCAG completa.

Revisión final de teclado: Enter expande/contrae y conserva el foco; Tab alcanza el buscador; Escape devuelve el foco al cerrar búsqueda. Menú de cuenta operable con flechas y Escape. En móvil, Tab/Shift+Tab circulan dentro del drawer y cerrar navegación o búsqueda devuelve foco a Abrir navegación. Sin cambios de comportamiento adicionales. Captura final indisponible en el navegador integrado; validación por imagen pendiente.

Planes compone consumo/comparación/paquetes/condiciones con ds-form-section compact, ds-select, ds-action-bar, ds-disclosure y ds-empty-state. El único CSS local define columnas adaptables con un token existente. Precios del plan actual resueltos desde el catálogo, porque currentPlan no incluye prepay. Ocho pruebas de Planes aprobadas; suite completa: 192 pruebas/34 archivos, builds web y store aprobados. Store conserva advertencia de presupuesto inicial y Pedidos emite showModal ausente en JSDOM aunque sus pruebas pasan. Esta evidencia sustituye los bloqueos de ejecución anteriores. PlanCheckout conserva su implementación y requiere su propia revisión.

Perfil compone identidad/formularios/sesiones con ds-form-section, console-field, ds-button, ds-save-bar, ds-disclosure y ds-empty-state, sin stylesheet local. Una sola barra al pie general para datos personales pendientes, asociada al formulario por ID; contraseña mantiene una acción secundaria dentro de su sección y su formulario independiente. Tienda usa una sola barra superior para Guardar/Descartar o Publicar/Despublicar según haya cambios. Veintiuna pruebas de Perfil, Tienda y componentes compartidos aprobadas; builds web y store aprobados. Navegador: barra única al editar/descartar, formularios asociados correctamente, sin desbordes a 390 px; botones normales y del CTA de 32 px en escritorio (cápsula de 40 px) y 44 px en móvil. Captura de Perfil revisada con una sola barra compacta. Store conserva la advertencia previa de presupuesto inicial (415,16 kB frente a 400 kB).

Ajustes consume ds-form-section, ds-select, console-field, ds-disclosure y ds-save-bar, sin stylesheet local. Resumen de configuración guardada y comparación de valores para cambios pendientes; descarte local, fieldset bloqueado al guardar y moneda guardada fuera de lista preservada. Cinco pruebas añadidas a la existente (seis en total); ejecución/build web pendientes por límite del revisor automático y revisión visual pendiente por bloqueo del navegador.

Métricas compone ds-form-section, console-metric, ds-select, ds-action-bar, ds-disclosure y ds-empty-state. Sin stylesheet de feature; selector 7/30 días en URL. Datos conservados durante actualización/fallo con período mostrado identificado; atención pendiente separada del rango. Seis pruebas añadidas, ejecución/build web pendientes por límite del revisor automático y revisión visual pendiente por bloqueo de navegador.

Integraciones reutiliza ds-form-section, ds-select, ds-disclosure, ds-empty-state, ds-action-bar y console-metric. Retira su stylesheet de filtros/tarjetas/status y compone con utilities centrales. Categoría en query params; funciones habilitadas separadas de conexiones externas. Seis tests añadidos, build web y ejecución pendientes por el límite del revisor automático; revisión visual pendiente por bloqueo de navegador.

Cobros compone estado, formulario y ayuda con ds-form-section, ds-select, console-field, ds-disclosure y ds-action-bar; no importa estilos de Tienda ni su stylesheet heredado. Estado de cuenta guardada separado del entorno seleccionado en el borrador. Siete pruebas añadidas y build web pendientes por bloqueo de revisión automática; sin aceptación visual mientras el navegador siga bloqueado. El stylesheet heredado de Cobros se conserva para Dominio, Medición y Equipo.

Barra compartida aplicada a Producto, Inventario, Descuentos, WhatsApp, Instagram, Cobros, Dominio, Medición, Ajustes y Tienda; Vendedor IA y Envíos usan `ds-save-bar`. Envíos compone checkbox, sección, disclosure y campos DS. Se conservan handlers, tipos de botón, permisos y operaciones de cada consumidor.

Tests de componentes verifican contrato con Angular forms, label, disabled, mixed, submit y busy; tests de Envíos verifican recuperación y guardado. Navegador bloqueado por política de URL en esta sesión: quedan pendientes capturas, medidas de sticky en scroll real, contraste visual y revisión móvil de esta migración. El resto de estilos heredados se migra por sección contra esta matriz.
