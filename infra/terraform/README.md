# infra/terraform

Infraestructura de AWS (fotos en S3 + CloudFront, correo con SES, usuario IAM de la API) y sus registros DNS en Cloudflare. Guía completa: [docs/TERRAFORM.md](../../docs/TERRAFORM.md).

```text
bootstrap/          bucket S3 del state (una vez por cuenta, state local)
versions.tf         Terraform >= 1.10, providers fijados, backend S3 parcial
variables.tf        entradas (ver envs/*.tfvars.example)
media.tf            bucket privado + OAC + CloudFront + ACM + DNS de media
ses.tf              identidad SES + DKIM + MAIL FROM + configuration set + alertas
iam.tf              usuario de la API con permisos mínimos
outputs.tf          server_env (variables del .env de la API)
envs/               <entorno>.tfvars (git-ignored) a partir de los .example
backend.hcl         configuración del backend (git-ignored) a partir de bootstrap
```

Uso habitual (Terraform de 64 bits, `aws sso login --profile ops`, `$env:AWS_PROFILE = "ops"` y `$env:CLOUDFLARE_API_TOKEN` definidos). En PowerShell los flags van entre comillas para que no se partan en el punto:

```powershell
terraform init "-backend-config=.\backend.hcl"
terraform workspace select staging
terraform plan "-var-file=envs/staging.tfvars" "-out=staging.tfplan"
terraform apply "staging.tfplan"
terraform output -raw server_env
```

Antes de un commit: `terraform fmt -recursive` y `terraform validate`. Nunca edites a mano en AWS o Cloudflare lo que gestiona esta carpeta. El registro CAA `issue "amazon.com"` del dominio raíz es un requisito manual (no está en Terraform).
