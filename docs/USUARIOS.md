# Alta de usuarios y accesos

VendedorIA tiene dos mundos de usuarios que nunca se mezclan:

- **Usuarios de un negocio**: entran a la consola (`app.marrso.com`) y solo ven los datos de su negocio.
- **Operadores de la plataforma**: el equipo de VendedorIA. Tienen una sesión aparte para la futura consola de operaciones y no usan los roles de los negocios.

Los compradores de las tiendas no tienen cuenta: compran como invitados.

| Usuario | Rol | Cómo se da de alta | Qué puede hacer |
| --- | --- | --- | --- |
| Dueño del negocio | `OWNER` | Registro público en la consola | Todo en su negocio: plan, integraciones, equipo, catálogo, ventas |
| Administrador del negocio | `ADMIN` (membresía) | Invitación del dueño o de otro administrador | Igual que el dueño, salvo que no puede quitar ni cambiar al dueño |
| Asesor | `AGENT` | Invitación | El día a día (chats y pedidos); no gestiona plan, integraciones, canales ni equipo |
| Superadmin de plataforma | `SUPERADMIN` | CLI en el servidor | Todo en la plataforma, incluida la gestión de operadores |
| Admin de plataforma | `ADMIN` (plataforma) | CLI en el servidor | Operación global sin dinero, operadores, credenciales ni borrado |

El `ADMIN` de un negocio y el `ADMIN` de plataforma son roles distintos: el primero vive en `Membership.role` y el segundo en `User.platformRole`. Ser administrador de un negocio no da ningún acceso a la plataforma.

## 1. Negocios: registro público

La persona entra a `/auth/register` en la consola y completa nombre, correo, contraseña (mínimo 8 caracteres) y nombre del negocio.

- En una sola operación se crean la cuenta, el negocio, su membresía como `OWNER` y un vendedor IA inicial; luego queda con la sesión iniciada.
- El negocio empieza con 14 días de prueba del plan Crece.
- Protecciones: Cloudflare Turnstile (acción `register`) y límite de 5 intentos por minuto por IP. Un correo solo puede tener una cuenta.
- API: `POST /api/v1/auth/register`. Inicio de sesión: `/auth/login` (`POST /api/v1/auth/login`).

## 2. Equipo de un negocio: invitaciones

Disponible desde el plan Crece, con la integración **Equipo** activada en Integraciones. Solo el dueño y los administradores pueden invitar.

1. En **Equipo** (`/app/team`) se ingresa el correo y el rol: administrador o asesor.
2. La consola muestra **una sola vez** un enlace de invitación para copiar y compartir (no se envía por correo). Es de un solo uso y vale 7 días; en la base solo se guarda su hash.
3. La persona abre el enlace (`/invite/:token`), escribe su nombre y una contraseña, y entra directamente al negocio.

Reglas:

- Los miembros más las invitaciones pendientes cuentan contra los usuarios del plan.
- El correo invitado no puede tener ya una cuenta en VendedorIA.
- Invitar de nuevo al mismo correo reemplaza la invitación anterior sin ocupar otro cupo.
- Una invitación pendiente se puede cancelar; el enlace deja de funcionar.
- Al cambiar el rol de un miembro se cierran sus sesiones.
- Al quitar a un miembro cuya única membresía era ese negocio, se elimina su cuenta y el correo queda libre para otra invitación.
- El rol del dueño no se puede cambiar ni quitar, y nadie puede cambiar su propio rol ni quitarse a sí mismo.

API: `GET /api/v1/team`, `POST /api/v1/team/invites`, `DELETE /api/v1/team/invites/:id`, `PATCH|DELETE /api/v1/team/members/:id`. Aceptación pública (con límite por IP y Turnstile): `GET|POST /api/v1/team/invites/accept/:token`.

## 3. Operadores de la plataforma: CLI

El rol de plataforma solo se da con el script `create-admin`, ejecutado en el servidor. El registro público, las invitaciones de equipo y la API no pueden asignarlo.

### Primer superadmin

Después del primer deploy, crea al menos un SUPERADMIN (lo ideal son dos personas distintas, para no depender de una sola):

```bash
docker compose exec api npm run create-admin
```

En desarrollo:

```bash
docker compose -f docker-compose.dev.yml exec api npm run create-admin
```

El modo interactivo pide correo, rol, nombre y contraseña (oculta, con confirmación).

### Otros comandos

```bash
docker compose exec api npm run create-admin -- --role=ADMIN --email=ops@marrso.com --name="Ops"
docker compose exec api npm run create-admin -- --role=SUPERADMIN --email=ops@marrso.com   # cambiar rol
docker compose exec api npm run create-admin -- --email=ops@marrso.com --role=ADMIN --reset-password
docker compose exec api npm run create-admin -- --revoke --email=ops@marrso.com
docker compose exec api npm run create-admin -- --help
```

- La contraseña nunca va como argumento (`--password=` se rechaza). Para automatizar existen `CREATE_ADMIN_PASSWORD` o `--password-stdin`; en producción usa el modo interactivo para que no quede en el historial.
- Contraseña de operador: mínimo 12 caracteres, con letras y números.
- Si el correo ya tiene una cuenta de negocio, se le otorga el rol a esa misma cuenta; puede seguir usando su negocio con su sesión normal.
- Cambiar la contraseña cierra todas las sesiones del usuario; cambiar o quitar el rol cierra sus sesiones de plataforma.
- No se puede quitar ni bajar el rol al último SUPERADMIN.
- Cada cambio queda registrado en la tabla `PlatformAuditLog`, sin datos personales.

### Inicio de sesión de operadores

Los operadores entran por `POST /api/v1/platform/auth/login` (límite de 5 intentos por minuto y Turnstile con la acción `platform-login`). Esa sesión es independiente de la del negocio:

- El token de acceso dura 10 minutos y se renueva con `POST /api/v1/platform/auth/refresh` durante 12 horas.
- Un token de plataforma no funciona en la consola de negocios, y uno de negocio no funciona en `/platform/*`.
- El rol se consulta en la base de datos en cada request: al revocarlo, el acceso se corta en la siguiente petición.
- `GET /api/v1/platform/me` devuelve el rol y los permisos del operador.

### Permisos

Las rutas de plataforma piden permisos (definidos en `apps/api/src/platform/platform-permissions.ts`), no roles:

| Permiso | Para qué | ADMIN | SUPERADMIN |
| --- | --- | --- | --- |
| `tenants.read` | Ver negocios, tiendas, canales y su estado | Sí | Sí |
| `tenants.suspend` | Suspender o reactivar un negocio o su tienda | Sí | Sí |
| `tenants.delete` | Borrar un negocio y sus datos | No | Sí |
| `billing.read` | Ver cobros de planes | Sí | Sí |
| `billing.grant` | Cambiar planes, otorgar A medida, extender pruebas, reembolsos | No | Sí |
| `support.assist` | Sesión de asistencia auditada dentro de un negocio | Sí | Sí |
| `integrations.manage` | Credenciales globales (Meta, pagos, correo) | No | Sí |
| `metrics.read` | Métricas globales | Sí | Sí |
| `audit.read` | Leer la auditoría | Sí | Sí |
| `operators.manage` | Gestionar operadores desde la consola | No | Sí |

### Recuperación de acceso

Si se pierde la contraseña de un operador o no queda ningún SUPERADMIN con acceso, alguien con acceso al servidor usa la CLI: `--reset-password` para la contraseña o `--role=SUPERADMIN` para promover a otra persona. Es la vía de emergencia y se mantiene aunque exista la consola.

## 4. Próximamente: operadores desde la consola de operaciones

Cuando se lance la consola de operaciones, el día a día de los operadores pasará al navegador; la CLI queda para el primer SUPERADMIN y las emergencias. Requisito previo: MFA obligatorio para operadores.

- Un SUPERADMIN (`operators.manage`) invita por correo y rol, confirmando con su contraseña o un código MFA.
- El invitado recibe un enlace de un solo uso válido 48 horas, define su propia contraseña y activa su MFA. Nadie elige la contraseña de otra persona.
- Cambiar el rol o revocar a un operador se hace desde la consola, con la misma auditoría, cierre de sesiones y protección del último SUPERADMIN que la CLI.

Nunca se habilitará un "primer usuario registrado es admin", un asistente público de configuración ni un correo de superadmin definido por variable de entorno.
