import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DEFAULT_STOREFRONT_URL_TEMPLATE,
  slugFromHost,
  storefrontBaseDomain,
} from '../storefront/storefront-host';
import type { TurnstileAction } from './turnstile.decorator';

const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
/** Cloudflare's dummy secrets: they answer with a fixed action and hostname. */
export const TURNSTILE_TEST_SECRET = /^[123]x0{31}AA$/;
const MAX_TOKEN_LENGTH = 2048;
const TIMEOUT_MS = 5_000;
const ATTEMPTS = 2;

export type TurnstileResult = 'ok' | 'rejected' | 'unavailable';

type SiteverifyResponse = {
  success: boolean;
  action?: string;
  hostname?: string;
  'error-codes'?: string[];
};

@Injectable()
export class TurnstileService {
  private readonly logger = new Logger(TurnstileService.name);
  private readonly secret: string | null;
  private readonly testKeys: boolean;
  private readonly consoleHosts: Set<string>;
  private readonly storeBaseDomain: string;
  readonly siteKey: string | null;

  constructor(config: ConfigService) {
    this.secret = config.get<string>('TURNSTILE_SECRET_KEY') || null;
    this.siteKey = this.secret ? config.get<string>('TURNSTILE_SITE_KEY') || null : null;
    this.testKeys = Boolean(this.secret && TURNSTILE_TEST_SECRET.test(this.secret));
    this.consoleHosts = new Set(
      (config.get<string>('CORS_ORIGIN') ?? 'http://localhost:4200')
        .split(',')
        .map((origin) => hostnameOf(origin.trim()))
        .filter((host): host is string => Boolean(host)),
    );
    this.storeBaseDomain = storefrontBaseDomain(
      config.get<string>('STOREFRONT_URL_TEMPLATE') ?? DEFAULT_STOREFRONT_URL_TEMPLATE,
    );
    if (!this.secret && config.get<string>('NODE_ENV') === 'production') {
      this.logger.warn('Turnstile is not configured: login, sign-up and store checkout rely on rate limits only');
    }
  }

  get enabled(): boolean {
    return this.secret !== null;
  }

  /**
   * Redeems a widget token once with Siteverify. Besides `success`, the token must come from
   * the expected action and from the console host or, for store routes, a host of that store.
   */
  async verify(
    token: string | undefined,
    expected: {
      action: TurnstileAction;
      remoteIp?: string;
      storeSlug?: string;
      /** Verified own domain of that store. */
      storeDomain?: string | null;
    },
  ): Promise<TurnstileResult> {
    if (!this.secret) return 'ok';
    if (!token || token.length > MAX_TOKEN_LENGTH) return this.reject(expected.action, 'missing-or-oversized');

    const outcome = await this.siteverify(token, expected.remoteIp);
    if (!outcome) return 'unavailable';
    if (!outcome.success) return this.reject(expected.action, (outcome['error-codes'] ?? []).join(',') || 'failed');
    if (this.testKeys) return 'ok';
    if (outcome.action !== expected.action) return this.reject(expected.action, 'action-mismatch');
    const hostname = outcome.hostname?.toLowerCase() ?? '';
    const hostOk = expected.storeSlug
      ? slugFromHost(hostname, this.storeBaseDomain) === expected.storeSlug ||
        (Boolean(expected.storeDomain) && hostname === expected.storeDomain)
      : this.consoleHosts.has(hostname);
    return hostOk ? 'ok' : this.reject(expected.action, 'hostname-mismatch');
  }

  /** One retry with the same idempotency key, so a lost response never burns the token twice. */
  private async siteverify(token: string, remoteIp?: string): Promise<SiteverifyResponse | null> {
    const body = JSON.stringify({
      secret: this.secret,
      response: token,
      ...(remoteIp ? { remoteip: remoteIp } : {}),
      idempotency_key: randomUUID(),
    });
    for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
      try {
        const response = await fetch(SITEVERIFY_URL, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body,
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if (response.status < 500) return (await response.json()) as SiteverifyResponse;
        this.logger.warn(`Turnstile siteverify answered ${response.status}`);
      } catch (error) {
        this.logger.warn(`Turnstile siteverify failed: ${(error as Error).name}`);
      }
    }
    return null;
  }

  private reject(action: TurnstileAction, reason: string): TurnstileResult {
    this.logger.warn(`Turnstile rejected action=${action} reason=${reason}`);
    return 'rejected';
  }
}

function hostnameOf(origin: string): string | null {
  try {
    return new URL(origin).hostname.toLowerCase();
  } catch {
    return null;
  }
}
