# AWS setup reference (S3 + CloudFront + SES)

Placeholders: `BUCKET` (e.g. `vendedoria-media-prod`), `REGION` (e.g. `us-east-1`), `ACCOUNT_ID`, `DISTRIBUTION_ID`, `DOMAIN` (sender domain, e.g. `example.pe`), `CONFIG_SET` (e.g. `vendedoria-prod-transactional`). Never commit the real values; they live only in the server `.env`.

Use one bucket, distribution and IAM user per environment (dev/staging/prod).

## 0. Terraform (S3 + CloudFront + SES + IAM + Cloudflare DNS)

`infra/terraform/` creates everything in sections 1–4 except the SES production access request and the IAM access key. Requirements: Terraform ≥ 1.10 **64-bit** (the Cloudflare provider has no `windows_386` build), AWS CLI with an operator profile (admin or enough rights for S3, CloudFront, ACM, SES, SNS, CloudWatch, IAM), and a Cloudflare API token limited to *Zone → DNS → Edit* on the zone.

```powershell
$env:AWS_PROFILE = "ops"
$env:CLOUDFLARE_API_TOKEN = "<token>"   # only in the shell, never in a file

# Once per AWS account: state bucket (local state)
cd infra/terraform/bootstrap
terraform init
terraform apply -var aws_region=us-east-1
terraform output -raw backend_config | Out-File -Encoding ascii ../backend.hcl   # `>` writes UTF-16 in Windows PowerShell

# Once per machine, then once per environment
cd ..
terraform init -backend-config=backend.hcl
terraform workspace new staging          # later: terraform workspace select staging
copy envs/staging.tfvars.example envs/staging.tfvars   # fill zone id, domains, alerts email
terraform plan -var-file=envs/staging.tfvars -out=staging.tfplan
terraform apply staging.tfplan
terraform output -raw server_env
```

- The workspace must match `environment` in the tfvars (a precondition stops the plan otherwise). Each workspace has its own state, locked with `use_lockfile`.
- Before the first apply, check `_dmarc.DOMAIN`: if a DMARC record already exists keep `manage_dmarc = false` (two records invalidate DMARC). Also check that `bounce.DOMAIN` and the media host have no records yet.
- `manage_account_settings = true` only in one workspace per account and SES region (prod): the suppression list and reputation alarms are account-wide.
- Staging sends from a subdomain (`staging.DOMAIN`) so its SES identity does not collide with prod.
- `server_env` gives every non-secret API variable. Then create the key by hand: `aws iam create-access-key --user-name <api_iam_user>` and put it only in the server `.env`.
- The alerts e-mail receives an SNS confirmation message: confirm it, or no alarm or bounce notice arrives.
- The bucket has `prevent_destroy`; `terraform destroy` fails instead of deleting photos.

Sections 1–4 below describe the same settings for review.

## 1. S3 bucket (private)

1. Create `BUCKET` in `REGION` (same region as the server or as close as possible).
2. Object Ownership: **Bucket owner enforced** (ACLs disabled).
3. Block Public Access: all four settings **on** (also at account level).
4. Default encryption: SSE-S3 (default) or SSE-KMS. With SSE-KMS, the KMS key policy must allow the CloudFront service principal (`kms:Decrypt`, same `AWS:SourceArn` condition) and the app user (`kms:GenerateDataKey`).
5. Versioning: on (protects against accidental deletes); add a lifecycle rule expiring noncurrent versions after 30 days and aborting incomplete multipart uploads after 7 days.
6. No CORS configuration is needed: uploads go through the API and reads through CloudFront `<img>` tags.
7. Optional: server access logs or CloudTrail data events to a separate log bucket.

Bucket policy (only CloudFront can read; TLS enforced):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowCloudFrontRead",
      "Effect": "Allow",
      "Principal": { "Service": "cloudfront.amazonaws.com" },
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::BUCKET/media/*",
      "Condition": {
        "StringEquals": { "AWS:SourceArn": "arn:aws:cloudfront::ACCOUNT_ID:distribution/DISTRIBUTION_ID" }
      }
    },
    {
      "Sid": "DenyInsecureTransport",
      "Effect": "Deny",
      "Principal": "*",
      "Action": "s3:*",
      "Resource": ["arn:aws:s3:::BUCKET", "arn:aws:s3:::BUCKET/*"],
      "Condition": { "Bool": { "aws:SecureTransport": "false" } }
    }
  ]
}
```

## 2. CloudFront distribution

- Origin: the bucket's **REST endpoint** (`BUCKET.s3.REGION.amazonaws.com`), not the website endpoint. Origin access: **Origin Access Control** (signing: always, SigV4). Do not use legacy OAI.
- Default behavior (or a `media/*` behavior): Viewer protocol **Redirect HTTP to HTTPS**; allowed methods **GET, HEAD**; compress objects automatically on.
- Cache policy: managed **CachingOptimized** (honours the `Cache-Control: immutable, max-age=31536000` set on upload; no query strings or cookies in the cache key).
- Origin request policy: none. Response headers policy: managed **SecurityHeadersPolicy** (adds HSTS, `X-Content-Type-Options: nosniff`, etc.).
- Price class: one that includes South America if buyers are in Peru (`PriceClass_All`), or `PriceClass_100` to save cost at the expense of latency.
- HTTP/2 and HTTP/3 on; IPv6 on. Default root object: empty (no listing).
- Custom domain (recommended, e.g. `media.example.pe`): ACM certificate **in us-east-1**, alternate domain name on the distribution, DNS `CNAME`/alias to the distribution; TLS security policy `TLSv1.2_2021` or newer. Then `MEDIA_CDN_URL=https://media.example.pe`.
- Optional: AWS WAF with the managed rate-based rule; standard logging to the log bucket.
- Since names are random and immutable, invalidations are never needed. A replaced photo is a new object.
- `MEDIA_CDN_URL` is the distribution domain (`https://dXXXX.cloudfront.net`) or the alias, without path; the API refuses S3 endpoints at boot.
- Monitoring: CloudFront metrics live in CloudWatch **us-east-1**; alarm on `5xxErrorRate` > 1% and watch `CacheHitRate` (enable additional metrics) — immutable media should stay above 90%.
- Optional later: Origin Shield in the bucket's region if the hit rate drops with many edge locations; standard logging v2 to CloudWatch Logs or S3 for traffic analysis.

The store CSP (`apps/store/src/server.ts`) and the console CSP (`docker/nginx/security-headers.conf`) already allow `img-src https:`; if they are ever narrowed, add `MEDIA_CDN_URL`'s origin.

## 3. SES (transactional email)

1. Region: pick one region for SES (can differ from S3 → `SES_REGION`). Do every step below in that region.
2. Identity: create a **domain** identity for `DOMAIN` (not just an email address) with **Easy DKIM** RSA 2048; publish the 3 DKIM `CNAME` records. Status must become *Verified* and DKIM *Successful*.
3. Custom MAIL FROM: `bounce.DOMAIN` with behavior on MX failure = *Use default MAIL FROM*; publish:
   - `MX bounce.DOMAIN → 10 feedback-smtp.REGION.amazonses.com`
   - `TXT bounce.DOMAIN → "v=spf1 include:amazonses.com ~all"`
   This aligns SPF with the From domain for DMARC.
4. DMARC: `TXT _dmarc.DOMAIN → "v=DMARC1; p=none; rua=mailto:dmarc@DOMAIN; adkim=s; aspf=r"`. Move to `p=quarantine` after reports show only legitimate sources.
5. Account-level suppression list: enable for **BOUNCE** and **COMPLAINT** (default for new accounts; verify).
6. Configuration set `CONFIG_SET`: reputation metrics on; TLS policy **Require**; event destination (SNS or CloudWatch) for `BOUNCE`, `COMPLAINT`, `REJECT`, `RENDERING_FAILURE`, `DELIVERY_DELAY`. Set it as the identity's default configuration set or via `SES_CONFIGURATION_SET`.
7. Production access: request it (use case: transactional order confirmations and shipping notices to buyers who placed an order; bounce/complaint handling through the suppression list). Until approved, only verified recipients receive mail and the quota is 200/day.
8. Monitoring: CloudWatch alarms on `Reputation.BounceRate` > 4% and `Reputation.ComplaintRate` > 0.08% (SES reviews accounts at 5% / 0.1%).
9. `EMAIL_FROM` must be on the verified domain, e.g. `VendedorIA <pedidos@DOMAIN>`. Use a monitored inbox for replies to the platform; buyer replies go to each store's `contactEmail` through `Reply-To`.

## 4. IAM

App user (or instance role) policy, attached to a dedicated principal per environment:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ManageProductMedia",
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:DeleteObject"],
      "Resource": "arn:aws:s3:::BUCKET/media/*"
    },
    {
      "Sid": "SendTransactionalEmail",
      "Effect": "Allow",
      "Action": "ses:SendEmail",
      "Resource": [
        "arn:aws:ses:REGION:ACCOUNT_ID:identity/DOMAIN",
        "arn:aws:ses:REGION:ACCOUNT_ID:configuration-set/CONFIG_SET"
      ],
      "Condition": { "StringLike": { "ses:FromAddress": "*@DOMAIN" } }
    }
  ]
}
```

- With SSE-KMS add `kms:GenerateDataKey` on the key.
- On a VPS (no instance role): IAM user with programmatic access only, keys in the server `.env` (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`), rotated at least every 90 days (create new key → deploy → deactivate old → delete). On EC2/ECS: instance/task role and no keys at all.
- Enable MFA and avoid console access for this user. Never reuse the operator's credentials in the app.
- Operator profile for `scripts/check-aws.mjs` needs read actions: `s3:GetBucketPublicAccessBlock`, `s3:GetBucketOwnershipControls`, `s3:GetEncryptionConfiguration`, `s3:GetBucketPolicy`, `s3:GetBucketVersioning`, `s3:GetBucketLocation`, `s3:GetLifecycleConfiguration`, `cloudfront:ListDistributions`, `cloudfront:GetDistribution`, `cloudfront:GetOriginAccessControl`, `ses:GetAccount`, `ses:GetEmailIdentity`, `ses:GetConfigurationSet`, `ses:GetConfigurationSetEventDestinations` (+ `s3:PutObject`/`s3:DeleteObject` on `media/_healthcheck/*` for `--write-test`).

## 5. Rollout

1. `terraform apply` on the staging workspace, then request SES production access (section 3, step 7) and create the API access key.
2. Run `node .agents/skills/vendedoria-aws/scripts/check-aws.mjs --write-test` with the target env vars exported; fix every FAIL.
3. Server `.env`: `AWS_REGION`, keys (if no role), `MEDIA_STORAGE=s3`, `MEDIA_S3_BUCKET`, `MEDIA_CDN_URL`; then `EMAIL_PROVIDER=ses`, `EMAIL_FROM`, optional `SES_REGION`/`SES_CONFIGURATION_SET`, and `EMAIL_MODE=live` only after production access is granted.
4. `docker compose up -d --force-recreate api` (the API validates the settings at boot and exits with the missing variable names).
5. Smoke test: upload a photo in the console, open it in the store, place a test order and check the email headers (`dkim=pass`, `spf=pass`, `dmarc=pass`).
6. Keep the `uploads` volume: earlier photos are still served from it by `/api/v1/media/:file`.

Rollback: set `MEDIA_STORAGE=local` and/or `EMAIL_MODE=preview` and recreate the API. Photos already on S3 keep working through CloudFront.
