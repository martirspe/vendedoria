import { detectLiveIntent } from './live-intent';
import { TikTokLiveAdapter } from './live-adapter';
import { createHmac } from 'node:crypto';
import { verifyTikTokSignature } from './tiktok-client';
import { liveReservationId, liveReservationToken } from './live-reservations';

describe('LIVE intent and channel boundaries', () => {
  it.each([
    ['quiero', 'BUY', 1],
    ['quiero 2', 'BUY_QUANTITY', 2],
    ['me separas dos', 'BUY_QUANTITY', 2],
    ['precio?', 'PRICE', 0],
    ['stock', 'STOCK', 0],
    ['hay envío?', 'SHIPPING', 0],
    ['cómo pago', 'PAYMENT', 0],
    ['no quiero 2', 'CANCEL', 0],
    ['cancela la reserva', 'CANCEL', 0],
    ['me ayudas a elegir', 'UNKNOWN', 0],
  ])('classifies %s without an LLM', (text, intent, quantity) => {
    expect(detectLiveIntent(text)).toEqual({ intent, quantity });
  });
  it('never grants LIVE permissions from identity or invented scope names', async () => {
    const adapter = new TikTokLiveAdapter();
    expect(
      adapter.capabilities(['user.info.basic', 'live.comments']).identity,
    ).toBe('supported');
    expect(
      adapter.capabilities(['user.info.basic', 'live.comments'])
        .inboundComments,
    ).toBe('unsupported');
    expect(adapter.capabilities(['user.info.basic']).outboundReplies).toBe(
      'unsupported',
    );
    await expect(adapter.sendReply()).rejects.toThrow();
  });
  it('requires the signed exact raw body and rejects expired or malformed signatures', () => {
    const secret = 'test-client-secret';
    const time = Math.floor(Date.now() / 1000);
    const body = Buffer.from('{"event":"authorization.removed"}');
    const signature = `t=${time},s=${createHmac('sha256', secret).update(`${time}.`).update(body).digest('hex')}`;
    expect(verifyTikTokSignature(secret, signature, body)).toBe(true);
    expect(verifyTikTokSignature(secret, signature, Buffer.from('{}'))).toBe(
      false,
    );
    expect(verifyTikTokSignature('', signature, body)).toBe(false);
    expect(
      verifyTikTokSignature(secret, signature, body, Date.now() + 600000),
    ).toBe(false);
    expect(verifyTikTokSignature(secret, `t=${time},s=invalid`, body)).toBe(
      false,
    );
  });
  it('binds checkout reservations to tenant and expiry without revealing identity', () => {
    const row = {
      id: 'c1234567890123456789012345',
      tenantId: 'tenant-a',
      expiresAt: new Date(Date.now() + 300000),
    };
    const token = liveReservationToken('fixture-secret', row);
    expect(liveReservationId('fixture-secret', 'tenant-a', token)).toBe(row.id);
    expect(liveReservationId('fixture-secret', 'tenant-b', token)).toBeNull();
    expect(liveReservationId('wrong-secret', 'tenant-a', token)).toBeNull();
    expect(
      liveReservationId(
        'fixture-secret',
        'tenant-a',
        liveReservationToken('fixture-secret', {
          ...row,
          expiresAt: new Date(Date.now() - 1),
        }),
      ),
    ).toBeNull();
  });
});
