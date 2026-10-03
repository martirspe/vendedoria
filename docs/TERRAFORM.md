# Infraestructura de AWS con Terraform

Fotos de productos (S3 + CloudFront) y correos de pedidos (SES) se crean con Terraform desde `infra/terraform/`. Un solo `terraform apply` deja la cuenta de AWS y los registros DNS de Cloudflare listos; la API solo necesita las variables que imprime al final.

```text
Consola (sube foto) → API → S3 privado (media/{tenantId}/…webp)
Comprador (tienda)  → media.marrso.com → CloudFront (OAC) → S3
Pedido pagado       → API → SES (DKIM marrso.com, MAIL FROM bounce.marrso.com) → comprador
Rebotes, quejas     → SNS → correo de alertas
```

Todo es opcional: sin estas variables la API guarda fotos en el volumen `uploads` y no envía correos (`EMAIL_MODE=preview`).

## Qué crea y qué no

| Archivo | Recursos |
|---|---|
| `bootstrap/main.tf` | Bucket S3 del *state* de Terraform (privado, cifrado, versionado). Una vez por cuenta. |
| `media.tf` | Bucket privado de fotos (bloqueo público, sin ACL, cifrado, versionado 30 días), CloudFront con Origin Access Control (solo HTTPS, GET/HEAD, HTTP/3, caché y cabeceras de seguridad gestionadas), certificado ACM en us-east-1 y su validación, CNAME `media.` en Cloudflare (solo DNS). |
| `ses.tf` | Identidad de dominio con Easy DKIM 2048, MAIL FROM `bounce.`, configuration set (TLS obligatorio, métricas de reputación), alertas SNS de rebotes/quejas/rechazos, lista de supresión de la cuenta y alarmas de reputación. Registros DKIM, MX y SPF en Cloudflare. DMARC opcional. |
| `iam.tf` | Usuario de la API con permisos mínimos: subir y borrar en `media/*` y enviar correo solo desde tu dominio. |
| `outputs.tf` | `server_env` (variables del `.env`), id de la distribución, usuario IAM, tema SNS. |

Queda manual, a propósito:

- **Salir del sandbox de SES**: lo revisa una persona de AWS (sección 4).
- **Access key de la API**: si la creara Terraform, el secreto quedaría guardado en el state.
- **Aprobar la suscripción de alertas**: AWS manda un correo de confirmación.

## 1. Requisitos (una vez por PC)

**Terraform 1.10 o superior, 64 bits.** El provider de Cloudflare no existe para 32 bits.

```powershell
winget install Hashicorp.Terraform     # o descarga "Windows AMD64" de developer.hashicorp.com/terraform/install
terraform version                      # debe decir "on windows_amd64"
```

Si dice `windows_386`, desinstala esa versión o reemplaza el `terraform.exe` que aparece en `where.exe terraform`.

**AWS CLI v2 con un perfil de operador** (tu usuario administrador, nunca el de la API ni la cuenta raíz):

```powershell
winget install Amazon.AWSCLI
aws configure --profile ops            # o: aws configure sso --profile ops
aws sts get-caller-identity --profile ops
```

**Token de Cloudflare**: Cloudflare → Mi perfil → Tokens de API → Crear token → plantilla *Editar DNS de zona* → Recursos de zona: *Incluir · Zona específica · marrso.com*. Copia también el **Zone ID** (página de inicio del dominio, columna derecha).

El token y el perfil se usan solo como variables de la terminal; nunca se guardan en archivos del repo:

```powershell
$env:AWS_PROFILE = "ops"
$env:CLOUDFLARE_API_TOKEN = "<token>"
```

## 2. Primera vez en la cuenta: bucket del state

El *state* es el registro de lo que Terraform creó. Vive en S3 para no perderlo y para que dos personas no apliquen a la vez (bloqueo con `use_lockfile`).

```powershell
cd infra/terraform/bootstrap
terraform init
terraform apply -var aws_region=us-east-1
terraform output -raw backend_config | Out-File -Encoding ascii ../backend.hcl
```

`backend.hcl` queda fuera de git. Si lo pierdes, vuelve a generarlo con el último comando.

## 3. Desplegar un entorno

Cada entorno (`staging`, `prod`) es un *workspace* de Terraform con su propio state y su archivo de variables. Empieza siempre por staging.

### 3.1 Archivo de variables

```powershell
cd infra/terraform
copy envs/staging.tfvars.example envs/staging.tfvars
notepad envs/staging.tfvars
```

| Variable | Qué es | Ejemplo |
|---|---|---|
| `environment` | Debe coincidir con el workspace | `prod` |
| `aws_region` | Región del bucket (`AWS_REGION`) | `us-east-1` |
| `ses_region` | Solo si SES va en otra región | `null` |
| `cloudflare_zone_id` | Zone ID de `marrso.com` | — |
| `media_domain` | Dominio de las fotos; `null` usa `*.cloudfront.net` | `media.marrso.com` |
| `price_class` | `PriceClass_All` incluye Sudamérica | `PriceClass_All` |
| `web_acl_arn` | WAF opcional (us-east-1) | `null` |
| `noncurrent_version_days` | Días para recuperar fotos borradas | `30` |
| `email_domain` | Dominio remitente | `marrso.com` (staging: `staging.marrso.com`) |
| `email_from` | `EMAIL_FROM` de la API | `VendedorIA <pedidos@marrso.com>` |
| `mail_from_subdomain` | Subdominio de rebotes | `bounce` |
| `manage_dmarc` | Crear `_dmarc`. **`false` si ya existe** (marrso.com ya tiene `p=reject`) | `false` |
| `dmarc_policy`, `dmarc_report_email` | Solo con `manage_dmarc = true` | `none` |
| `manage_account_settings` | Supresión y alarmas de la cuenta: `true` solo en prod | `true` |
| `alerts_email` | Recibe alarmas y avisos de rebote | `alertas@marrso.com` |

Antes del primer apply comprueba que no existan registros que Terraform vaya a crear (un DMARC duplicado invalida ambos):

```powershell
Resolve-DnsName _dmarc.marrso.com -Type TXT
Resolve-DnsName bounce.marrso.com -Type MX
Resolve-DnsName media.marrso.com
```

`media.` y `bounce.` responden con la IP del VPS por el comodín `A *` de las tiendas: es normal, el registro que crea Terraform tiene prioridad sobre el comodín. Lo que no debe existir es otro registro con ese mismo nombre en Cloudflare.

### 3.2 Plan y apply

```powershell
terraform init -backend-config=backend.hcl
terraform workspace new staging            # la próxima vez: terraform workspace select staging
terraform plan -var-file=envs/staging.tfvars -out=staging.tfplan
terraform apply staging.tfplan
```

Lee el plan antes de aplicar: la última línea dice cuántos recursos se crean, cambian o destruyen. En un entorno ya desplegado, cualquier `destroy` o `must be replaced` sobre el bucket, la distribución o la identidad SES merece detenerse y entender por qué. El primer apply tarda 5–15 minutos (CloudFront y la validación del certificado).

Prod es igual con `terraform workspace new prod` y `envs/prod.tfvars`. Si el workspace no coincide con `environment`, el plan se detiene con *Select the workspace of this environment first*.

## 4. Después del primer apply

1. **Confirma la suscripción** del correo que llega a `alerts_email` (“AWS Notification - Subscription Confirmation”).
2. **Sal del sandbox de SES** (solo prod): consola de SES → *Account dashboard* → *Request production access*. Tipo: *Transactional*. Caso de uso sugerido: “Confirmaciones de pedido y avisos de envío a compradores que hicieron una compra en tiendas de la plataforma. Sin marketing. Rebotes y quejas gestionados con la lista de supresión de la cuenta y alertas SNS.” Mientras tanto solo llegan correos a direcciones verificadas, 200 al día.
3. **Crea la access key de la API:**
   ```powershell
   aws iam create-access-key --user-name (terraform output -raw api_iam_user)
   ```
   Copia `AccessKeyId` y `SecretAccessKey` directo al `.env` del servidor. No la guardes en otro sitio.
4. **Configura el servidor**: `terraform output -raw server_env` imprime las variables (región, bucket, URL del CDN, remitente, configuration set). Pégalas en el `.env` del VPS junto con la key y, cuando SES esté fuera del sandbox, `EMAIL_MODE=live`. Luego `bash scripts/deploy.sh` (o `docker compose up -d --force-recreate api`). Si falta algo, la API no arranca y dice qué variable.
5. **Audita la cuenta** desde tu PC, con las mismas variables exportadas:
   ```powershell
   npm i --no-save @aws-sdk/client-cloudfront
   $env:CLOUDFRONT_DISTRIBUTION_ID = terraform output -raw cloudfront_distribution_id
   # más AWS_REGION, MEDIA_S3_BUCKET, MEDIA_CDN_URL, EMAIL_FROM, SES_CONFIGURATION_SET
   node .agents/skills/vendedoria-aws/scripts/check-aws.mjs --write-test
   ```
   Corrige todo `FAIL`. Mientras SES siga en sandbox, *Production access* sale en FAIL: es esperado.
6. **Prueba real**: sube una foto en la consola (la URL debe empezar por `https://media.marrso.com`), ábrela en la tienda, y haz un pedido de prueba; en el correo recibido, “Mostrar original” debe indicar `dkim=pass`, `spf=pass` y `dmarc=pass`.

Las fotos subidas antes del cambio siguen en el volumen `uploads`: no lo borres.

## 5. Día a día

| Tarea | Comandos |
|---|---|
| Cambiar algo | Edita el `.tf` o el `.tfvars` → `terraform plan -var-file=envs/prod.tfvars -out=prod.tfplan` → `terraform apply prod.tfplan` |
| Cambiar de entorno | `terraform workspace select prod` (y usa `envs/prod.tfvars`) |
| Ver valores | `terraform output` · `terraform output -raw server_env` |
| ¿Alguien tocó algo a mano? | `terraform plan -var-file=envs/prod.tfvars -detailed-exitcode` (código 2 = hay diferencias) |
| Antes de hacer commit | `terraform fmt -recursive` y `terraform validate` |
| Rotar la key de la API (cada 90 días) | `aws iam create-access-key` → actualiza el `.env` y redeploy → `aws iam update-access-key --status Inactive --access-key-id <vieja>` → comprueba que todo funciona → `aws iam delete-access-key --access-key-id <vieja>` |

Regla de oro: **nada de lo que gestiona Terraform se edita en la consola de AWS ni en Cloudflare.** Si alguien lo hace, el siguiente plan lo revierte o falla.

### Actualizar Terraform y los providers

Las versiones exactas de los providers están fijadas en `.terraform.lock.hcl` (sí va en git). Para actualizarlas:

```powershell
terraform init -upgrade -backend-config=backend.hcl
terraform providers lock -platform=windows_amd64 -platform=linux_amd64 -platform=darwin_arm64 -platform=darwin_amd64
terraform plan -var-file=envs/staging.tfvars
```

Si el plan de staging sale limpio (o con cambios que entiendes), aplica, prueba, repite en prod y haz commit del lock. Un cambio de versión mayor (`~> 6.0` → `~> 7.0`) exige leer la guía de actualización del provider antes. Terraform CLI se actualiza con `winget upgrade Hashicorp.Terraform`.

## 6. Otra PC u otra persona

```powershell
git clone … ; cd infra/terraform
# backend.hcl: regenéralo desde bootstrap (sección 2) o cópialo del gestor de contraseñas
# envs/prod.tfvars: cópialo del gestor de contraseñas (no está en git)
terraform init -backend-config=backend.hcl
terraform workspace select prod
terraform plan -var-file=envs/prod.tfvars
```

Guarda `backend.hcl` y los `.tfvars` en tu gestor de contraseñas o notas privadas: no son secretos, pero tampoco están en el repo.

## 7. Seguridad

- El state contiene ids de recursos, dominios y el correo de alertas; **no** contiene claves. Aun así el bucket del state es privado, cifrado, versionado y solo para operadores.
- Credenciales solo como variables de la terminal (`AWS_PROFILE`, `CLOUDFLARE_API_TOKEN`). El token de Cloudflare solo puede editar DNS de una zona.
- El usuario de la API no puede listar el bucket, leer fotos por S3, ni enviar correo desde otro dominio.
- El bucket de fotos tiene `prevent_destroy`: `terraform destroy` falla antes de borrar fotos.
- Nunca subas `*.tfstate`, `backend.hcl` ni `envs/*.tfvars` (ya están en `.gitignore`).

## 8. Rollback y recuperación

- **La app falla con S3 o SES**: en el `.env` pon `MEDIA_STORAGE=local` y/o `EMAIL_MODE=preview` y redeploy. Las fotos ya subidas a S3 siguen funcionando por CloudFront.
- **Un cambio de infraestructura salió mal**: `git revert` del cambio → plan → apply.
- **Foto borrada por error**: el bucket guarda versiones 30 días; recupérala desde la consola de S3 (*Mostrar versiones*).
- **State dañado**: el bucket del state es versionado; restaura la versión anterior de `env:/prod/aws.tfstate` desde la consola de S3.
- **"Error acquiring the state lock"**: otra ejecución está en curso. Si seguro que no (una terminal se cerró a medias), `terraform force-unlock <LOCK_ID>`.

## 9. Problemas frecuentes

| Mensaje | Causa | Solución |
|---|---|---|
| `does not have a package available for your current platform, windows_386` | Terraform de 32 bits | Instala la versión de 64 bits (sección 1) |
| `Select the workspace of this environment first` | Workspace distinto de `environment` | `terraform workspace select <entorno>` |
| `Backend initialization required` | Falta `init` o cambió `backend.hcl` | `terraform init -backend-config=backend.hcl` (`-reconfigure` si cambió) |
| `No valid credential sources found` / `AccessDenied` | Perfil de AWS ausente o sin permisos | `$env:AWS_PROFILE="ops"` y `aws sts get-caller-identity` |
| Error de autenticación de Cloudflare | Falta el token o no cubre la zona | Revisa `$env:CLOUDFLARE_API_TOKEN` y el alcance del token |
| `An identical record already exists` / `record already exists` | El registro DNS ya existe en Cloudflare | Bórralo si es basura o impórtalo (sección 10) |
| `CNAMEAlreadyExists` en CloudFront | `media_domain` ya es alias de otra distribución | Quítalo de la otra distribución o usa otro dominio |
| La validación del certificado no termina | CNAME de validación con proxy o ausente | En Cloudflare debe estar en *Solo DNS* (Terraform lo crea así) |
| `already exists` en SES | La identidad ya fue creada a mano | Impórtala (sección 10) |
| `Instance cannot be destroyed` | `prevent_destroy` del bucket | Es intencional: el bucket de fotos no se borra con Terraform |
| DMARC `FAIL` en la auditoría (“multiple records”) | Dos registros `_dmarc` | Deja uno solo; con uno existente, `manage_dmarc = false` |

## 10. Importar recursos que ya existen

Si algo se creó a mano antes, se adopta sin borrarlo. Crea un archivo temporal `infra/terraform/imports.tf`:

```hcl
import {
  to = aws_sesv2_email_identity.domain
  id = "marrso.com"
}
import {
  to = cloudflare_dns_record.mail_from_mx
  id = "<ZONE_ID>/<RECORD_ID>"   # id del registro: API de Cloudflare o URL del panel
}
```

`terraform plan -var-file=envs/prod.tfvars` debe mostrar *import* y ningún *destroy*; aplica y borra `imports.tf`. Ids habituales: bucket = nombre, distribución = id (`E…`), configuration set = nombre, usuario IAM = nombre, política IAM = ARN.

## Referencias

- Detalle técnico y checklist de AWS: `.agents/skills/vendedoria-aws/` (`SKILL.md`, `reference.md`).
- Despliegue de la app: [DEPLOY.md](DEPLOY.md).
- Terraform S3 backend: https://developer.hashicorp.com/terraform/language/backend/s3
- Provider AWS: https://registry.terraform.io/providers/hashicorp/aws/latest/docs
- Provider Cloudflare: https://registry.terraform.io/providers/cloudflare/cloudflare/latest/docs
