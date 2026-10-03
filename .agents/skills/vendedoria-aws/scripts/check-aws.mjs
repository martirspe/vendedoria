#!/usr/bin/env node
// Read-only audit of VendedorIA's AWS setup: S3 bucket, CloudFront distribution, SES sending.
//
// Usage (repo root; export the same values the API uses, never commit them):
//   AWS_PROFILE=ops node .agents/skills/vendedoria-aws/scripts/check-aws.mjs [--write-test]
//   CloudFront config checks: npm i --no-save @aws-sdk/client-cloudfront (once) and optionally
//   CLOUDFRONT_DISTRIBUTION_ID=<cloudfront_distribution_id output of infra/terraform>.
//
// Flags fall back to env vars: AWS_REGION, MEDIA_S3_BUCKET | AWS_S3_BUCKET, MEDIA_CDN_URL | AWS_CLOUDFRONT_URL,
// CLOUDFRONT_DISTRIBUTION_ID, EMAIL_FROM, SES_REGION, SES_CONFIGURATION_SET. --project <dir> sets where to load
// the AWS SDK from. Distribution checks need @aws-sdk/client-cloudfront (optional; without --distribution-id the
// distribution is discovered by the CDN host). Never prints credentials. Exit code 1 when any check FAILs.
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
import { resolveTxt } from 'node:dns/promises';
import { existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : undefined;
};
const env = process.env;
const project = resolve(flag('project') ?? process.cwd());
const opts = {
  region: flag('region') ?? env.AWS_REGION,
  bucket: flag('bucket') ?? env.MEDIA_S3_BUCKET ?? env.AWS_S3_BUCKET,
  cdn: (flag('cdn') ?? env.MEDIA_CDN_URL ?? env.AWS_CLOUDFRONT_URL)?.replace(/\/$/, ''),
  prefix: (flag('prefix') ?? 'media/').replace(/^\//, '').replace(/\/?$/, '/'),
  from: flag('from') ?? env.EMAIL_FROM,
  sesRegion: flag('ses-region') ?? env.SES_REGION,
  configSet: flag('config-set') ?? env.SES_CONFIGURATION_SET,
  distributionId: flag('distribution-id') ?? env.CLOUDFRONT_DISTRIBUTION_ID,
  writeTest: args.includes('--write-test'),
};
const CACHING_OPTIMIZED = '658327ea-f89d-4fab-a63d-7e88639e58f6';
const SECURITY_HEADERS = '67f7725c-6f97-4210-82d7-5512b31e9d03';
const MODERN_TLS = ['TLSv1.2_2021', 'TLSv1.2_2025', 'TLSv1.3_2025'];
const ctx = { policyStatements: null };

function loadSdk(name, { optional = false } = {}) {
  const roots = [project];
  for (const group of ['apps', 'packages', 'services']) {
    const dir = join(project, group);
    if (existsSync(dir)) for (const sub of readdirSync(dir)) roots.push(join(dir, sub));
  }
  const require = createRequire(join(project, 'package.json'));
  try {
    return require(require.resolve(name, { paths: roots }));
  } catch {
    if (optional) return null;
    console.error(`Cannot load ${name} from ${project}. Run from the project root (or pass --project) where it is installed.`);
    process.exit(2);
  }
}

let failures = 0;
const report = (level, check, detail = '') => {
  if (level === 'FAIL') failures += 1;
  console.log(`${level.padEnd(4)}  ${check}${detail ? ` — ${detail}` : ''}`);
};
const errorName = (error) => error?.code ?? error?.name ?? 'UnknownError';
async function step(check, fn) {
  try {
    await fn();
  } catch (error) {
    report('FAIL', check, errorName(error));
  }
}
const get = (url) => fetch(url, { signal: AbortSignal.timeout(10_000), redirect: 'manual' });

async function checkMedia() {
  const { bucket, region, cdn, prefix } = opts;
  if (!bucket || !region || !cdn) {
    report('WARN', 'Media', 'bucket, region or CDN URL missing; skipping S3/CloudFront');
    return;
  }
  const s3sdk = loadSdk('@aws-sdk/client-s3');
  const s3 = new s3sdk.S3Client({ region });
  console.log(`\n# S3 bucket + CloudFront`);

  await step('Bucket region', async () => {
    const { LocationConstraint } = await s3.send(new s3sdk.GetBucketLocationCommand({ Bucket: bucket }));
    const actual = LocationConstraint || 'us-east-1';
    report(actual === region ? 'OK' : 'FAIL', 'Bucket region', actual === region ? actual : `${actual} (expected ${region})`);
  });
  await step('Block Public Access', async () => {
    const { PublicAccessBlockConfiguration: c = {} } = await s3.send(
      new s3sdk.GetPublicAccessBlockCommand({ Bucket: bucket }),
    );
    const all = c.BlockPublicAcls && c.IgnorePublicAcls && c.BlockPublicPolicy && c.RestrictPublicBuckets;
    report(all ? 'OK' : 'FAIL', 'Block Public Access', all ? 'all four on' : 'enable all four settings');
  });
  await step('Object ownership', async () => {
    const { OwnershipControls } = await s3.send(new s3sdk.GetBucketOwnershipControlsCommand({ Bucket: bucket }));
    const value = OwnershipControls?.Rules?.[0]?.ObjectOwnership;
    report(value === 'BucketOwnerEnforced' ? 'OK' : 'FAIL', 'Object ownership (ACLs disabled)', value ?? 'not set');
  });
  await step('Default encryption', async () => {
    const { ServerSideEncryptionConfiguration: c } = await s3.send(
      new s3sdk.GetBucketEncryptionCommand({ Bucket: bucket }),
    );
    const rule = c?.Rules?.[0];
    const algorithm = rule?.ApplyServerSideEncryptionByDefault?.SSEAlgorithm;
    report(algorithm ? 'OK' : 'FAIL', 'Default encryption', algorithm ?? 'none');
    if (algorithm?.startsWith('aws:kms')) {
      report(rule.BucketKeyEnabled ? 'OK' : 'WARN', 'S3 Bucket Key (KMS cost)', rule.BucketKeyEnabled ? 'on' : 'enable');
    }
  });
  await step('Versioning', async () => {
    const { Status } = await s3.send(new s3sdk.GetBucketVersioningCommand({ Bucket: bucket }));
    report(Status === 'Enabled' ? 'OK' : 'WARN', 'Versioning (recovery window)', Status ?? 'never enabled');
  });
  await step('Lifecycle', async () => {
    try {
      const { Rules = [] } = await s3.send(new s3sdk.GetBucketLifecycleConfigurationCommand({ Bucket: bucket }));
      const noncurrent = Rules.some((r) => r.Status === 'Enabled' && r.NoncurrentVersionExpiration);
      const multipart = Rules.some((r) => r.Status === 'Enabled' && r.AbortIncompleteMultipartUpload);
      report(noncurrent ? 'OK' : 'WARN', 'Noncurrent versions expire');
      report(multipart ? 'OK' : 'WARN', 'Incomplete multipart uploads aborted');
    } catch (error) {
      if (errorName(error) !== 'NoSuchLifecycleConfiguration') throw error;
      report('WARN', 'Lifecycle', 'no rules (noncurrent expiration, abort multipart)');
    }
  });
  await step('Bucket policy', async () => {
    const { Policy } = await s3.send(new s3sdk.GetBucketPolicyCommand({ Bucket: bucket }));
    const statements = [].concat(JSON.parse(Policy ?? '{}').Statement ?? []);
    ctx.policyStatements = statements;
    const oac = statements.find(
      (s) =>
        s.Effect === 'Allow' &&
        JSON.stringify(s.Principal ?? '').includes('cloudfront.amazonaws.com') &&
        JSON.stringify(s.Condition ?? '').includes('AWS:SourceArn'),
    );
    const legacyOai = statements.some((s) => JSON.stringify(s.Principal ?? '').includes('CloudFront Origin Access Identity'));
    const publicAllow = statements.some(
      (s) => s.Effect === 'Allow' && (s.Principal === '*' || s.Principal?.AWS === '*') && !s.Condition,
    );
    const tls = statements.some(
      (s) => s.Effect === 'Deny' && JSON.stringify(s.Condition ?? '').includes('aws:SecureTransport'),
    );
    report(oac ? 'OK' : 'FAIL', 'OAC read grant', oac ? 'cloudfront.amazonaws.com + AWS:SourceArn' : 'missing');
    if (legacyOai) report('WARN', 'Legacy OAI in policy', 'migrate to OAC');
    report(publicAllow ? 'FAIL' : 'OK', 'No public Allow statement');
    report(tls ? 'OK' : 'WARN', 'TLS-only deny statement', tls ? '' : 'add aws:SecureTransport=false deny');
  });
  await step('Direct S3 access', async () => {
    const response = await get(`https://${bucket}.s3.${region}.amazonaws.com/`);
    report(response.status === 403 ? 'OK' : 'FAIL', 'Direct S3 listing blocked', `HTTP ${response.status} (expected 403)`);
  });
  await step('CloudFront endpoint', async () => {
    if (!cdn.startsWith('https://')) report('FAIL', 'CDN URL uses https');
    const response = await get(`${cdn}/${prefix}_missing-${randomBytes(4).toString('hex')}.webp`);
    const viaCloudFront = /cloudfront/i.test(`${response.headers.get('via')} ${response.headers.get('x-cache')}`);
    report(viaCloudFront ? 'OK' : 'FAIL', 'Served by CloudFront', viaCloudFront ? '' : 'no CloudFront headers');
    report([403, 404].includes(response.status) ? 'OK' : 'WARN', 'Missing object status', `HTTP ${response.status}`);
    const hsts = response.headers.get('strict-transport-security');
    report(hsts ? 'OK' : 'WARN', 'Security headers policy', hsts ? 'HSTS present' : 'attach SecurityHeadersPolicy');
    const http = await get(`${cdn.replace(/^https:/, 'http:')}/${prefix}x.webp`).catch(() => null);
    if (http) report([301, 302, 307, 308].includes(http.status) ? 'OK' : 'WARN', 'HTTP redirects to HTTPS', `HTTP ${http.status}`);
  });

  if (!opts.writeTest) return;
  const key = `${prefix}_healthcheck/${randomBytes(16).toString('hex')}.txt`;
  await step('Write test', async () => {
    await s3.send(
      new s3sdk.PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: 'ok',
        ContentType: 'text/plain',
        CacheControl: 'public, max-age=300',
        IfNoneMatch: '*',
      }),
    );
    try {
      const first = await get(`${cdn}/${key}`);
      const body = await first.text();
      report(first.ok && body === 'ok' ? 'OK' : 'FAIL', 'Upload readable through CloudFront', `HTTP ${first.status}`);
      const cacheControl = first.headers.get('cache-control');
      report(cacheControl === 'public, max-age=300' ? 'OK' : 'WARN', 'Object Cache-Control reaches viewers', cacheControl ?? 'missing');
      const second = await get(`${cdn}/${key}`);
      await second.arrayBuffer();
      const xCache = second.headers.get('x-cache') ?? '';
      report(/hit/i.test(xCache) ? 'OK' : 'WARN', 'Second request served from edge cache', xCache || 'no x-cache header');
      const direct = await get(`https://${bucket}.s3.${region}.amazonaws.com/${key}`);
      report(direct.status === 403 ? 'OK' : 'FAIL', 'Upload private on S3', `HTTP ${direct.status} (expected 403)`);
    } finally {
      await s3.send(new s3sdk.DeleteObjectCommand({ Bucket: bucket, Key: key }));
    }
  });
}

async function checkDistribution() {
  const { bucket, cdn, prefix } = opts;
  if (!bucket || !cdn) return;
  console.log(`\n# CloudFront distribution`);
  const cfsdk = loadSdk('@aws-sdk/client-cloudfront', { optional: true });
  if (!cfsdk) {
    report('WARN', 'Distribution config', 'install @aws-sdk/client-cloudfront to audit it (npm i --no-save @aws-sdk/client-cloudfront)');
    return;
  }
  const cf = new cfsdk.CloudFrontClient({ region: 'us-east-1' });
  const host = new URL(cdn).host;

  await step('Distribution config', async () => {
    let id = opts.distributionId;
    if (!id) {
      let marker;
      do {
        const { DistributionList: list } = await cf.send(new cfsdk.ListDistributionsCommand({ Marker: marker }));
        const match = list?.Items?.find((d) => d.DomainName === host || d.Aliases?.Items?.includes(host));
        id = match?.Id;
        marker = list?.IsTruncated ? list.NextMarker : undefined;
      } while (!id && marker);
      if (!id) {
        report('FAIL', 'Distribution for CDN host', `${host} is not a domain or alias of any distribution`);
        return;
      }
    }
    const { Distribution: d } = await cf.send(new cfsdk.GetDistributionCommand({ Id: id }));
    const c = d.DistributionConfig;
    report('OK', 'Distribution', `${id} (${d.DomainName})`);
    report(d.Status === 'Deployed' ? 'OK' : 'WARN', 'Deployment status', d.Status);
    report(c.Enabled ? 'OK' : 'FAIL', 'Enabled');

    const origin = c.Origins?.Items?.find((o) => o.DomainName.startsWith(`${bucket}.s3`));
    if (!origin) {
      report('FAIL', 'S3 origin', `no origin for bucket ${bucket}`);
    } else {
      report(/s3-website/.test(origin.DomainName) ? 'FAIL' : 'OK', 'Origin is the S3 REST endpoint', origin.DomainName);
      report(origin.OriginAccessControlId ? 'OK' : 'FAIL', 'Origin Access Control attached', origin.OriginAccessControlId || 'none');
      if (origin.S3OriginConfig?.OriginAccessIdentity) report('WARN', 'Legacy OAI on origin', 'remove after moving to OAC');
      if (origin.OriginAccessControlId) {
        const { OriginAccessControl: oac } = await cf.send(
          new cfsdk.GetOriginAccessControlCommand({ Id: origin.OriginAccessControlId }),
        );
        const oc = oac?.OriginAccessControlConfig ?? {};
        const ok = oc.SigningBehavior === 'always' && oc.SigningProtocol === 'sigv4' && oc.OriginAccessControlOriginType === 's3';
        report(ok ? 'OK' : 'FAIL', 'OAC signing', `${oc.OriginAccessControlOriginType}/${oc.SigningProtocol}/${oc.SigningBehavior}`);
      }
    }

    const behavior =
      c.CacheBehaviors?.Items?.find((b) => b.PathPattern.replace(/^\//, '').startsWith(prefix)) ?? c.DefaultCacheBehavior;
    const name = behavior.PathPattern ? `Behavior ${behavior.PathPattern}` : 'Default behavior';
    report(
      ['redirect-to-https', 'https-only'].includes(behavior.ViewerProtocolPolicy) ? 'OK' : 'FAIL',
      `${name}: HTTPS only`,
      behavior.ViewerProtocolPolicy,
    );
    const methods = behavior.AllowedMethods?.Items ?? [];
    report(methods.every((m) => ['GET', 'HEAD', 'OPTIONS'].includes(m)) ? 'OK' : 'FAIL', `${name}: read-only methods`, methods.join(','));
    report(
      behavior.CachePolicyId ? 'OK' : 'WARN',
      `${name}: cache policy`,
      behavior.CachePolicyId === CACHING_OPTIMIZED ? 'Managed-CachingOptimized' : (behavior.CachePolicyId ?? 'legacy ForwardedValues'),
    );
    report(
      behavior.ResponseHeadersPolicyId ? 'OK' : 'WARN',
      `${name}: response headers policy`,
      behavior.ResponseHeadersPolicyId === SECURITY_HEADERS ? 'Managed-SecurityHeadersPolicy' : (behavior.ResponseHeadersPolicyId || 'none'),
    );
    report(behavior.Compress ? 'OK' : 'WARN', `${name}: compression`);

    report(/http2/.test(c.HttpVersion ?? '') ? 'OK' : 'WARN', 'HTTP version', c.HttpVersion);
    report(c.IsIPV6Enabled ? 'OK' : 'WARN', 'IPv6');
    report(c.DefaultRootObject ? 'WARN' : 'OK', 'No default root object', c.DefaultRootObject || '');
    report('OK', 'Price class', c.PriceClass);
    if (!host.endsWith('.cloudfront.net')) {
      report(c.Aliases?.Items?.includes(host) ? 'OK' : 'FAIL', 'Alias for CDN host', host);
      const tls = c.ViewerCertificate?.MinimumProtocolVersion;
      report(MODERN_TLS.includes(tls) ? 'OK' : 'WARN', 'Minimum viewer TLS', tls ?? 'default');
    }
    report(c.WebACLId ? 'OK' : 'WARN', 'AWS WAF', c.WebACLId ? 'attached' : 'none (optional)');
    report(c.Logging?.Enabled ? 'OK' : 'WARN', 'Standard logging (legacy)', c.Logging?.Enabled ? 'on' : 'off (fine if using logging v2)');

    if (ctx.policyStatements) {
      const pinned = ctx.policyStatements.some((s) => JSON.stringify(s.Condition ?? '').includes(d.ARN));
      report(pinned ? 'OK' : 'FAIL', 'Bucket policy pinned to this distribution', pinned ? '' : `AWS:SourceArn should be ${d.ARN}`);
    }
  });
}

async function checkEmail() {
  const region = opts.sesRegion || opts.region;
  if (!region || !opts.from) {
    report('WARN', 'Email', 'sender (--from) or region missing; skipping SES');
    return;
  }
  const address = opts.from.match(/<([^>]+)>/)?.[1] ?? opts.from.trim();
  const domain = address.split('@')[1];
  const sessdk = loadSdk('@aws-sdk/client-sesv2');
  const ses = new sessdk.SESv2Client({ region });
  console.log(`\n# SES (${region}, ${domain})`);

  await step('SES account', async () => {
    const account = await ses.send(new sessdk.GetAccountCommand({}));
    report(account.ProductionAccessEnabled ? 'OK' : 'FAIL', 'Production access', account.ProductionAccessEnabled ? '' : 'still in sandbox');
    report(account.SendingEnabled ? 'OK' : 'FAIL', 'Sending enabled');
    const reasons = account.SuppressionAttributes?.SuppressedReasons ?? [];
    report(
      reasons.includes('BOUNCE') && reasons.includes('COMPLAINT') ? 'OK' : 'FAIL',
      'Account suppression list',
      reasons.join(', ') || 'disabled',
    );
    if (account.EnforcementStatus && account.EnforcementStatus !== 'HEALTHY') {
      report('FAIL', 'Account enforcement status', account.EnforcementStatus);
    }
    const q = account.SendQuota;
    if (q) report('OK', 'Send quota', `${q.SentLast24Hours ?? 0}/${q.Max24HourSend} per 24h, ${q.MaxSendRate}/s`);
  });
  await step('Domain identity', async () => {
    const identity = await ses.send(new sessdk.GetEmailIdentityCommand({ EmailIdentity: domain }));
    report(identity.VerifiedForSendingStatus ? 'OK' : 'FAIL', 'Domain verified for sending');
    const dkim = identity.DkimAttributes;
    report(dkim?.Status === 'SUCCESS' && dkim.SigningEnabled ? 'OK' : 'FAIL', 'Easy DKIM signing', dkim?.Status ?? 'not configured');
    const mailFrom = identity.MailFromAttributes;
    report(
      mailFrom?.MailFromDomainStatus === 'SUCCESS' ? 'OK' : 'WARN',
      'Custom MAIL FROM (SPF alignment)',
      mailFrom?.MailFromDomain ? `${mailFrom.MailFromDomain} ${mailFrom.MailFromDomainStatus}` : 'not configured',
    );
  });
  await step('DMARC record', async () => {
    const records = (await resolveTxt(`_dmarc.${domain}`)).map((chunks) => chunks.join(''));
    const dmarc = records.filter((r) => r.toUpperCase().startsWith('V=DMARC1'));
    report(dmarc.length === 1 ? 'OK' : 'FAIL', 'DMARC record', dmarc.length > 1 ? 'multiple records (invalid)' : (dmarc[0] ?? 'missing'));
  });

  if (!opts.configSet) {
    report('WARN', 'Configuration set', 'not provided (no bounce/complaint events or reputation metrics)');
    return;
  }
  await step('Configuration set', async () => {
    const set = await ses.send(new sessdk.GetConfigurationSetCommand({ ConfigurationSetName: opts.configSet }));
    report('OK', 'Configuration set exists', opts.configSet);
    report(set.ReputationOptions?.ReputationMetricsEnabled ? 'OK' : 'WARN', 'Reputation metrics');
    report(set.DeliveryOptions?.TlsPolicy === 'REQUIRE' ? 'OK' : 'WARN', 'TLS required', set.DeliveryOptions?.TlsPolicy ?? 'OPTIONAL');
    const { EventDestinations = [] } = await ses.send(
      new sessdk.GetConfigurationSetEventDestinationsCommand({ ConfigurationSetName: opts.configSet }),
    );
    const events = new Set(EventDestinations.filter((d) => d.Enabled).flatMap((d) => d.MatchingEventTypes ?? []));
    report(events.has('BOUNCE') && events.has('COMPLAINT') ? 'OK' : 'WARN', 'Bounce/complaint events', [...events].join(', ') || 'none');
  });
}

await checkMedia();
await checkDistribution();
await checkEmail();
console.log(failures ? `\n${failures} check(s) failed.` : '\nAll required checks passed.');
process.exit(failures ? 1 : 0);
