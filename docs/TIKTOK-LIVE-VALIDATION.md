# TikTok LIVE — validación local

Fecha: 5 de octubre de 2026. Entorno: stack Docker de desarrollo `vendedoria-dev` en Windows. Las pruebas del API usan la base aislada `vendedoria_test`; no realizan cargos ni llamadas reales a TikTok. Se conservaron los cambios de conversión, diseño y demos que ya estaban en el árbol de trabajo.

## Resultados

| Comprobación | Resultado |
| --- | --- |
| Build NestJS API | PASS |
| Build Angular consola, incluido SSR/prerender | PASS |
| Build Angular tienda, incluido SSR | PASS |
| Chequeo Angular de desarrollo (`npm run lint` en web) | PASS |
| Prisma generate dentro del API Docker | PASS; cliente actualizado para conversión y LIVE |
| Prisma validate | PASS |
| Prisma migrate status, desarrollo | PASS; 7 migraciones, esquema actualizado |
| Migraciones en `vendedoria_test` | Aplicadas; suites E2E completas pasan |
| API unitarias (`jest --runInBand`) | 43 suites, 298 tests PASS |
| API E2E (`jest --config test/jest-e2e.json --runInBand`) | 15 suites, 82 tests PASS |
| Angular consola (`npm test -- --watch=false`) | 8 archivos, 31 tests PASS |
| Tienda (`node --experimental-strip-types --test test/template-demos.test.ts`) | 6 tests PASS |
| ESLint de `src/live` y `test/live-sales.e2e-spec.ts` | PASS |
| ESLint general del API, sin `--fix` | FAIL; infracciones existentes de formato y reglas tipadas fuera del módulo LIVE |
| Validador oficial de skill-creator (`quick_validate.py`) | PASS: `Skill is valid!` |
| `git diff --check` | PASS; Git solo avisó de normalización LF/CRLF |

Total: **417 tests pasan**. Los builds verifican tipos TypeScript y plantillas Angular. El lint general sigue pendiente: el chequeo encontró muchas infracciones Prettier, principalmente finales de línea, y reglas existentes como aserciones innecesarias en `conversations.service.ts`. No se ejecutó el `--fix` global para evitar reescribir trabajo ajeno. Esto no equivale a un lint completo aprobado.

Hay advertencias de presupuesto de estilos en consola (shell, catálogo y vendedor) y de bundle inicial de tienda: 403,62 kB frente a 400 kB. Los builds terminan correctamente; no se cambiaron los presupuestos para ocultar las advertencias. La suite de demos también avisa que Node infiere módulos ES al no declarar `type` en el package existente.

## Docker y Prisma

Se sincronizó el volumen de dependencias con el lock existente (`npm ci` dentro de `/app`) y se regeneró Prisma dentro del contenedor. Generar el cliente solo en Windows no actualiza el volumen de Docker. Esto resolvió los errores `recoveryDelivery`/`recoveryCart` y las dependencias de conversión ausentes del volumen.

Migraciones aplicadas tanto en desarrollo como en la base de pruebas:

- `20261005010000_conversion_engines`, que ya pertenecía al trabajo de conversión.
- `20261005020000_tiktok_live`, creada para esta funcionalidad.

Estado comprobado al finalizar:

| Servicio | Comprobación |
| --- | --- |
| API | Running, healthy |
| PostgreSQL | Running, healthy |
| Consola | Running, healthy |
| Tienda | Running, healthy |
| Redis 7.4 | Running, healthy; `redis-cli ping` → `PONG` |
| Qdrant 1.19.1 | Running; `GET http://qdrant:6333/readyz` desde API → HTTP 200 |

Redis y Qdrant se levantaron con el perfil `recommendations-vector`. Sus puertos permanecen internos. Qdrant no tiene healthcheck en el compose existente; por eso se comprobó su endpoint real de disponibilidad. Levantarlo no configura ni activa por sí mismo el índice de recomendaciones (`QDRANT_URL` y configuración de ese motor).

## Regresiones comerciales y de seguridad

La suite LIVE usa PostgreSQL real y comprueba:

- Dos compradores concurrentes disputan una última unidad: exactamente uno reserva, sin stock negativo.
- Reintentos de reserva y checkout no crean otra retención ni otro pedido; el precio LIVE se conserva sin descontar inventario por segunda vez.
- Eventos de pago concurrentes del flujo de comercio convierten la reserva y registran la venta una sola vez.
- Vencimientos/cancelaciones concurrentes devuelven unidades una sola vez.
- Aislamiento entre tenants, permisos de configuración, desactivación y rechazo de `AUTO` sin capability de salida.
- Mensajes manuales duplicados no multiplican métricas; `HUMAN_ONLY` no sugiere respuestas.
- Revisión humana consulta precio/stock actuales y la bandeja no permite reactivar envíos automáticos para LIVE.
- OAuth exige vínculo de navegador; el estado es de un solo uso, también ante intercambio fallido.
- La rotación del refresh token persiste incluso si falla la posterior verificación de identidad.
- El webhook verifica firma de los bytes exactos, rechaza firmas inválidas, deduplica eventos y no revoca una conexión nueva por una notificación antigua.

Las pruebas unitarias cubren intenciones, tokens/firmas, configuración y el uso seguro del vendedor IA existente: el modelo solo selecciona una aclaración permitida, no inventa información comercial ni ejecuta herramientas de compra. Las pruebas de consola incluyen el parser SSE.

## Verificación visual

Se creó un tenant y usuario ficticios exclusivos de esta revisión local. Desde la UI se creó/inició una liquidación, se registró «quiero 2», se reservaron dos unidades y se abrió el checkout compartido. El checkout mostró S/119 por unidad y total S/238, con recojo gratuito. No se confirmó un pago real desde el navegador.

Se comprobó el panel en viewport de escritorio 1440 × 1000 y móvil 390 × 844. El ancho del documento coincide con su contenido visible: 1425/1425 y 375/375 respectivamente, sin desbordamiento horizontal. Las diferencias de 15 px corresponden a la barra de desplazamiento. La reserva expiró después y el panel mostró las unidades liberadas.

Evidencia de esta ejecución, guardada fuera del repositorio:

- [Panel de escritorio](<C:/Users/Martín Rojas/.codex/visualizations/2026/10/05/01a10cbc-ad0e-7901-a2b3-fa7d9100d8e1/tiktok-live-panel.jpg>).
- [Panel móvil](<C:/Users/Martín Rojas/.codex/visualizations/2026/10/05/01a10cbc-ad0e-7901-a2b3-fa7d9100d8e1/tiktok-live-mobile.jpg>).
- [Checkout con precio reservado](<C:/Users/Martín Rojas/.codex/visualizations/2026/10/05/01a10cbc-ad0e-7901-a2b3-fa7d9100d8e1/tiktok-live-checkout.jpg>).

Al terminar se eliminaron únicamente el tenant, usuario y registros ficticios creados para esta revisión. Los tabs temporales se cerraron y el viewport se restauró.

## Skill y pendientes externos

Skill personal instalada: `C:/Users/Martín Rojas/.codex/skills/vendedoria-tiktok-live/SKILL.md`; copia versionable: `docs/skills/vendedoria-tiktok-live/SKILL.md`. Se invoca como `$vendedoria-tiktok-live` e incluye rutas, invariantes y comandos de verificación del flujo implementado.

Para conectar una cuenta real faltan la aplicación/credenciales oficiales (`TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`, `TIKTOK_REDIRECT_URI`), HTTPS, registro del callback/webhook y autorización real de `user.info.basic`. Las pruebas OAuth usan un proveedor simulado; no demuestran aprobación de una cuenta ni aceptación de un callback público por TikTok.

No están implementados comentarios/respuestas automáticos ni control de transmisión mediante TikTok. Las capabilities de TikTok Shop requieren acceso oficial y un adapter adicional. La implementación comercial disponible es explícitamente manual; el sistema nunca presenta una sugerencia aprobada como enviada a TikTok. Ver [guía operativa y arquitectura](TIKTOK-LIVE.md) para endpoints, variables, comandos y límites completos.
