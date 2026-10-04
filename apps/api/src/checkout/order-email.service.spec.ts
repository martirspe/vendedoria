import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
import { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../prisma/prisma.service';
import { OrderEmailService, htmlToText } from './order-email.service';

const order = {
  id: 'order-1',
  code: 'VD-0001',
  status: 'SHIPPED',
  customerName: 'Ana',
  customerEmail: 'ana@example.pe',
  trackingCode: 'TRK-1',
  delivery: { mode: 'DELIVERY', label: 'Olva Courier' },
  items: [],
  tenant: {
    storefront: {
      displayName: 'Tienda & Co',
      contactEmail: 'ventas@example.pe',
      legalName: 'Tienda SAC',
      whatsappPhone: null,
    },
  },
};

const handoffConversation = {
  channel: { type: 'WHATSAPP' },
  tenant: {
    name: 'Tienda & Co',
    memberships: [{ user: { email: 'duena@example.pe' } }, { user: { email: 'equipo@example.pe' } }],
  },
};

function build(env: Record<string, string>) {
  const prisma = {
    order: { findUnique: jest.fn().mockResolvedValue(order) },
    conversation: { findFirst: jest.fn().mockResolvedValue(handoffConversation) },
  };
  return new OrderEmailService(prisma as unknown as PrismaService, new ConfigService(env));
}

describe('htmlToText', () => {
  it('keeps one paragraph per block and decodes escaped characters', () => {
    expect(htmlToText('<div><p>Hola &#38; gracias</p><h1>Total:<br>S/ 10.00</h1></div>')).toBe(
      'Hola & gracias\n\nTotal:\n\nS/ 10.00',
    );
  });
});

describe('OrderEmailService transport', () => {
  afterEach(() => jest.restoreAllMocks());

  it('sends through SES with text part, reply-to, configuration set and kind tag', async () => {
    const send = jest.spyOn(SESv2Client.prototype, 'send').mockResolvedValue({} as never);
    await build({
      EMAIL_MODE: 'live',
      EMAIL_FROM: 'Tienda <pedidos@example.pe>',
      AWS_REGION: 'us-east-1',
      SES_CONFIGURATION_SET: 'transactional',
    }).sendLogistics('order-1');

    const command = send.mock.calls[0][0] as SendEmailCommand;
    expect(command).toBeInstanceOf(SendEmailCommand);
    expect(command.input).toMatchObject({
      FromEmailAddress: 'Tienda <pedidos@example.pe>',
      Destination: { ToAddresses: ['ana@example.pe'] },
      ReplyToAddresses: ['ventas@example.pe'],
      ConfigurationSetName: 'transactional',
      EmailTags: [{ Name: 'kind', Value: 'logistics' }],
    });
    const body = command.input.Content?.Simple?.Body;
    expect(body?.Html?.Data).toContain('Tienda &#38; Co');
    expect(body?.Text?.Data).toContain('Tienda & Co');
    expect(body?.Text?.Data).not.toMatch(/<[^>]+>/);
  });

  it('never contacts a provider in preview mode', async () => {
    const send = jest.spyOn(SESv2Client.prototype, 'send');
    const fetchSpy = jest.spyOn(globalThis, 'fetch');
    await build({ EMAIL_MODE: 'preview', AWS_REGION: 'us-east-1' }).sendLogistics('order-1');
    expect(send).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('keeps Resend available with its idempotency key', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 200 }));
    await build({
      EMAIL_MODE: 'live',
      EMAIL_PROVIDER: 'resend',
      RESEND_API_KEY: 'test-key',
      EMAIL_FROM: 'pedidos@example.pe',
    }).sendLogistics('order-1');

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.resend.com/emails');
    expect((init.headers as Record<string, string>)['Idempotency-Key']).toBe('logistics/order-1/SHIPPED');
    expect(JSON.parse(init.body as string)).toMatchObject({ to: ['ana@example.pe'], reply_to: 'ventas@example.pe' });
  });
});

describe('OrderEmailService handoff alert', () => {
  afterEach(() => jest.restoreAllMocks());
  const live = {
    EMAIL_MODE: 'live',
    EMAIL_FROM: 'avisos@example.pe',
    AWS_REGION: 'us-east-1',
    CORS_ORIGIN: 'https://app.example.pe,https://www.example.pe',
  };

  it('emails each team member a link to the conversation, without buyer data', async () => {
    const send = jest.spyOn(SESv2Client.prototype, 'send').mockResolvedValue({} as never);
    await build(live).sendHandoffAlert('tenant-1', 'conv-1', true);

    const inputs = send.mock.calls.map(([command]) => (command as SendEmailCommand).input);
    expect(inputs.map((input) => input.Destination?.ToAddresses)).toEqual([
      ['duena@example.pe'],
      ['equipo@example.pe'],
    ]);
    const html = inputs[0].Content?.Simple?.Body?.Html?.Data ?? '';
    expect(inputs[0].Content?.Simple?.Subject?.Data).toBe('Un cliente quiere hablar con una persona · WhatsApp');
    expect(html).toContain('https://app.example.pe/app/messages?conversation=conv-1');
    expect(html).toContain('se pausó');
    expect(inputs[0].EmailTags).toEqual([{ Name: 'kind', Value: 'handoff' }]);
  });

  it('sends nothing in preview mode', async () => {
    const send = jest.spyOn(SESv2Client.prototype, 'send');
    await build({ ...live, EMAIL_MODE: 'preview' }).sendHandoffAlert('tenant-1', 'conv-1', true);
    expect(send).not.toHaveBeenCalled();
  });
});
