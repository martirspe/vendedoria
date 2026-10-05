import { applyDecorators, SetMetadata } from '@nestjs/common';
import { ApiHeader } from '@nestjs/swagger';

export const TURNSTILE_ACTION_KEY = 'turnstileAction';
export const TURNSTILE_HEADER = 'x-turnstile-token';

/** Widget `action` names; Cloudflare allows up to 32 chars of `[a-z0-9_-]`. */
export type TurnstileAction =
  | 'login'
  | 'register'
  | 'checkout'
  | 'recovery'
  | 'platform-login';

/**
 * Requires a Cloudflare Turnstile token rendered with the same `action` in the
 * `X-Turnstile-Token` header; enforced by `TurnstileGuard` after the rate limit.
 */
export const Turnstile = (action: TurnstileAction) =>
  applyDecorators(
    SetMetadata(TURNSTILE_ACTION_KEY, action),
    ApiHeader({
      name: 'X-Turnstile-Token',
      required: false,
      description: `Cloudflare Turnstile token (action "${action}"). Required when the API has TURNSTILE_SECRET_KEY.`,
    }),
  );
