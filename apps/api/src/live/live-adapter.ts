import { NotImplementedException } from '@nestjs/common';
import type { LiveIntegration } from '@prisma/client';

export const LIVE_INTEGRATION_ACCESS = Symbol('LIVE_INTEGRATION_ACCESS');
export interface LiveIntegrationAccess {
  requireActive(tenantId: string): Promise<LiveIntegration>;
}

export type CapabilityStatus = 'supported' | 'pending_approval' | 'unsupported';
export type LiveCapabilities = Record<
  | 'identity'
  | 'liveSessions'
  | 'liveProducts'
  | 'inboundComments'
  | 'outboundReplies'
  | 'shopOrders'
  | 'productSync'
  | 'webhooks',
  CapabilityStatus
>;

/** Implement a vendor adapter only after the official product/scope and wire format are verified. */
export interface LiveChannelAdapter {
  readonly channel: string;
  capabilities(scopes: readonly string[]): LiveCapabilities;
  sendReply(
    accountId: string,
    externalUserId: string,
    text: string,
  ): Promise<void>;
}

export class TikTokLiveAdapter implements LiveChannelAdapter {
  readonly channel = 'TIKTOK_LIVE';
  capabilities(scopes: readonly string[]): LiveCapabilities {
    return {
      identity: scopes.includes('user.info.basic')
        ? 'supported'
        : 'pending_approval',
      liveSessions: 'unsupported',
      liveProducts: 'pending_approval',
      inboundComments: 'unsupported',
      outboundReplies: 'unsupported',
      shopOrders: 'pending_approval',
      productSync: 'pending_approval',
      // Login Kit deauthorization only; this is not a LIVE message subscription.
      webhooks: scopes.includes('user.info.basic')
        ? 'supported'
        : 'pending_approval',
    };
  }
  sendReply(): Promise<void> {
    return Promise.reject(
      new NotImplementedException(
        'TikTok no habilitó respuestas automáticas LIVE para esta conexión.',
      ),
    );
  }
}
