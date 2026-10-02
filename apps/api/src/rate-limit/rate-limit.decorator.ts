import { SetMetadata } from '@nestjs/common';

export const RATE_LIMIT_KEY = 'rateLimit';

export type RateLimitRule = {
  /** Counter shared by every route with the same bucket. */
  bucket: string;
  /** Requests allowed per client IP per minute. */
  perMinute: number;
};

/** Limits an endpoint per client IP; enforced by `RateLimitGuard`. */
export const RateLimit = (bucket: string, perMinute: number) =>
  SetMetadata(RATE_LIMIT_KEY, { bucket, perMinute } satisfies RateLimitRule);
