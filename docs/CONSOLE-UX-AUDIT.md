# Consola: implementación y auditoría UX/UI

Fecha: 2026-10-06. Alcance: las rutas operativas bajo `/app`, incluido el editor de tienda. La tienda pública y las páginas de marketing conservan su diseño para una siguiente etapa.

## Resultado

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
| Navegación | En móvil se convierte en un diálogo con scroll; escritorio conserva sidebar independiente. Una plantilla compartida evita divergencias. La navegación global usa 200 px y separa grupos cada 8 px; los contextos de Tienda y Ajustes usan 224 px para etiquetas largas. Ajustes contiene solo administración del negocio y equipo; Envíos, Cobros, Canales e Integraciones se mantienen como destinos operativos directos. El acceso a plan permanece junto a la cuenta en el sidebar y en la cabecera. La ubicación actual, los enlaces activos y las secciones de vendedor se resuelven también con query y fragmentos. |
| Acciones principales | Productos, Descuentos, Inventario, Ajustes, Envíos, Dominio, Medición y Cobros ubican las acciones de guardado en una barra persistente, con estado y acción de descarte cuando corresponde. Así, guardar sigue al alcance durante formularios largos sin duplicar la misma acción dentro de la vista. |
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
