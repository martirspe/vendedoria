---
name: vendedoria-aws
description: AWS integration workflow for VendedorIA — product media on a private S3 bucket served by CloudFront (Origin Access Control), transactional order email through Amazon SES v2 (verified domain, DKIM/SPF/DMARC, configuration set, suppression list), least-privilege IAM, env validation and an infrastructure audit script. Use when touching apps/api/src/catalog/media.service.ts or checkout/order-email.service.ts, configuring buckets, CDN, email deliverability or AWS credentials, or when "S3", "CloudFront", "SES", "AWS", "bucket", "CDN", "correo", "DKIM", "rebote" or "IAM" appear.
---

# VendedorIA — AWS (S3, CloudFront, SES)

## Use when
- Changing how product photos are stored or served, or adding a new kind of uploaded file.
- Changing transactional email (provider, sender, templates' transport, deliverability).
- Preparing or auditing the AWS account for production (bucket, distribution, SES identity, IAM).

For flow A/B money emails also load `vendedoria-security`; for copy inside emails, `vendedoria-copy-audit`.

## How it works today (code wins)
- `apps/api/src/catalog/media.service.ts`: `MEDIA_STORAGE=s3` → `PutObject` to `MEDIA_S3_BUCKET` at `media/{tenantId}/{32 hex}.webp` with `IfNoneMatch: '*'`, `Cache-Control: public, max-age=31536000, immutable`, no ACL; returns `${MEDIA_CDN_URL}/{key}`. `local` (default) writes `UPLOADS_DIR`. `GET /api/v1/media/:file` always serves the local volume (pre-S3 photos, may be jpg/png), so the volume must survive the switch.
- Upload path: console resizes in the browser (WebP, JPEG on Safari) → `POST /catalog/media` (JWT, rate limited, base64 ≤ 750 KB) → magic-byte sniff must match the declared type → `sharp` (EXIF rotate, fit inside 1600 px, WebP q82, metadata stripped, `limitInputPixels`, `failOn: 'error'`; `concurrency(1)` + `cache(false)` for the 512 MB container) → storage. The tenant comes from the JWT, never from the body.
- Format decision: WebP is the stored format (universal display support, OG/WhatsApp previews work). AVIF only through a future on-the-fly variant service in front of CloudFront, never as the single stored file.
- Deletion: `CatalogService` calls `MediaService.remove` after a product update drops photos or a product is deleted, only for URLs no other product, variant or storefront setting of the tenant references; `remove` only touches S3 keys under `media/{tenantId}/` and never deletes local files. Best-effort (logged, never fails the request); bucket versioning gives a recovery window.
- `apps/api/src/checkout/order-email.service.ts`: `EMAIL_MODE=live` + `EMAIL_PROVIDER=ses` (default) → SESv2 `SendEmail` (Simple content, HTML + plain text, `ReplyTo` = store contact email, `ConfigurationSetName`, tag `kind`). `resend` remains an alternative. `preview` never contacts a provider.
- SES has no idempotency key: duplicates are prevented by the order email claim (`emailClaimedAt`, `emailStatus`) and status-transition guards. Keep that when adding new emails.
- `apps/api/src/config/env.validation.ts` refuses to boot with `MEDIA_STORAGE=s3` or `EMAIL_MODE=live` and incomplete settings. `MEDIA_CDN_URL` must be an https origin with no path that is not an `amazonaws.com` host (CloudFront domain or its alias), so the bucket can never be served directly.
- CloudFront delivery: `infra/aws/media-cdn.yaml` (CloudFormation) creates the private bucket, the OAC, the distribution (HTTPS only, GET/HEAD, managed `CachingOptimized` + `SecurityHeadersPolicy`, HTTP/2+3, optional alias/ACM/WAF), the bucket policy pinned to the distribution ARN and the app's managed IAM policy. Its outputs map 1:1 to `MEDIA_S3_BUCKET`, `AWS_REGION` and `MEDIA_CDN_URL`.
- Store SSR (`apps/store/src/app/core/seo.service.ts`) adds `<link rel="preconnect" data-media>` to the image origin when it differs from the store host, so the first product photo starts the TLS handshake with CloudFront early.

## Invariants
- Bucket is private: Block Public Access (all four), ACLs disabled (`BucketOwnerEnforced`), SSE enabled, reads only from CloudFront via OAC (`AWS:SourceArn` = the distribution). Never presign public reads or make objects public.
- Object keys are server-generated and random; never derive a key, path or bucket from client input. New file kinds get their own prefix (`media/`, …) and an allow-listed content type with byte sniffing.
- Credentials come from the AWS SDK default chain (instance role, or an IAM user's `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` in the server `.env`). Never root keys, never in code, logs, Docker images or examples with real values.
- App IAM policy is least privilege: `s3:PutObject` + `s3:DeleteObject` on `arn:aws:s3:::BUCKET/media/*` and `ses:SendEmail` on the identity (+ configuration set). No `s3:*`, no `ses:*`, no `ListBucket`.
- Never delete a stored file without proving the tenant no longer references it (products, variants, storefront JSON) and that the key is under that tenant's prefix.
- Log only error names/codes from AWS (`(error as Error).name`); never log email addresses, bodies or object URLs with tenant data.
- Email: `EMAIL_FROM` is on a domain identity verified with Easy DKIM; SPF via custom MAIL FROM; DMARC published; account out of the SES sandbox; account-level suppression for BOUNCE and COMPLAINT. Transactional only, no marketing from this sender.
- New env vars: `env.validation.ts` + `.env.example` + `.env.production.example` (placeholders only), as for every API var.

## Procedure
1. Classify: media storage / CDN delivery / email transport / IAM / infra audit.
2. Read only the service involved, its spec (`media.service.spec.ts`, `catalog.service.spec.ts`, `order-email.service.spec.ts`) and `config/env.validation.ts`.
3. Code changes: keep provider calls inside the owning service (no generic storage/email layer for one consumer), mock `S3Client.prototype.send` / `SESv2Client.prototype.send` with `jest.spyOn` in specs (no extra mock libraries).
4. Infra changes: change `infra/aws/media-cdn.yaml` first (lint with `cfn-lint`), then follow [reference.md](reference.md) for SES and the manual steps; record the resulting values only as env var names, never real ARNs/keys in the repo.
5. Audit the account with the script below before enabling `MEDIA_STORAGE=s3` or `EMAIL_MODE=live`.

## Infrastructure audit script
Read-only checks: bucket hardening, OAC policy, public access, CloudFront response headers; distribution config (S3 REST origin, OAC signing, HTTPS only, GET/HEAD, cache and headers policies, compression, alias + TLS, bucket policy pinned to the distribution ARN); SES production access, identity, DKIM, MAIL FROM, DMARC and configuration set. Run it with an operator profile that has read permissions, not with the app's IAM user:

```bash
npm i --no-save @aws-sdk/client-cloudfront   # once, enables the distribution checks
AWS_PROFILE=ops node .agents/skills/vendedoria-aws/scripts/check-aws.mjs
# Optional end-to-end upload through CloudFront (writes and deletes media/_healthcheck/*, checks Cache-Control and a CloudFront Hit):
AWS_PROFILE=ops node .agents/skills/vendedoria-aws/scripts/check-aws.mjs --write-test
```

It reads `AWS_REGION`, `SES_REGION`, `MEDIA_S3_BUCKET`, `MEDIA_CDN_URL`, `EMAIL_FROM`, `SES_CONFIGURATION_SET` and the optional `CLOUDFRONT_DISTRIBUTION_ID` (stack output `DistributionId`; otherwise the distribution is found by the CDN host) from the environment, prints `OK/WARN/FAIL` per check and exits 1 on any FAIL. It never prints credentials.

## Verification
- `npm run build:api`.
- `npx jest catalog order-email env.validation` (from `apps/api`; no DB needed) or the focused jest command in the dev stack.
- `npm run build:store` when touching the store preconnect.
- Template changes: `docker run --rm -v "${PWD}/infra/aws:/t" python:3.12-slim sh -c "pip install -q cfn-lint && cfn-lint /t/media-cdn.yaml"`.
- Staging with real AWS: upload a photo in the console → URL is on `MEDIA_CDN_URL` and loads in the store; direct S3 URL answers 403; a paid test order with `EMAIL_MODE=live` reaches the inbox with DKIM/SPF/DMARC `pass` in the headers.

## Definition of Done
- Invariants above hold; specs cover the new branch (provider call input, error path, preview/local untouched).
- Env vars documented; `CHANGELOG.md` notes deploy actions (new required vars, DNS records, sandbox exit).
- `docs/agent/context-map.md` → Discrepancies updated if planned items (image pipeline, SNS bounce processing) change.

## References
- Cross-project decision matrix, AWS CLI setup and generic audit: user-level skill `aws-s3-cloudfront-ses` if available. This skill wins where VendedorIA's code and rules differ.

## Avoid
- Public buckets, website endpoints as CloudFront origins, legacy OAI for new distributions, or `ACL: 'public-read'`.
- Pointing `MEDIA_CDN_URL` at the S3 endpoint, or invalidating CloudFront to "replace" a photo: a new photo is a new key.
- Creating the bucket or distribution by hand in the console when the template can do it: drift makes the audit and rollback unreliable.
- Presigned PUT uploads that bypass the server byte check, unless a design adds post-upload validation.
- Sending email from tenant-chosen addresses: the sender is always the verified platform identity (`EMAIL_FROM`); tenants only appear in `Reply-To` and the email body.
- Turning on `EMAIL_MODE=live` while SES is still in the sandbox (only verified recipients receive mail).
- Reading `.env` files or printing environment values while debugging.
