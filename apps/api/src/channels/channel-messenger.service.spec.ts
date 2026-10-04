import { ChannelMessengerService } from './channel-messenger.service';
import { MetaInstagramClient } from './meta-instagram.client';
import { MetaWhatsAppClient } from './meta-whatsapp.client';

const whatsapp = {
  type: 'WHATSAPP' as const,
  metadata: { phoneNumberId: '123', accessToken: 'token' },
};
const link = { text: '*Total: PEN 10.00*\n\nAquí tienes el link de pago:', url: 'https://mp.com/x', footer: 'Pedido VD-0001' };

function setup() {
  const wa = {
    sendCtaUrlMessage: jest.fn().mockResolvedValue({ ok: true, messageId: 'wamid.cta' }),
    sendTextMessage: jest.fn().mockResolvedValue({ ok: true, messageId: 'wamid.text' }),
  };
  const ig = { sendTextMessage: jest.fn().mockResolvedValue({ ok: true, messageId: 'ig.text' }) };
  const messenger = new ChannelMessengerService(
    wa as unknown as MetaWhatsAppClient,
    ig as unknown as MetaInstagramClient,
  );
  return { wa, ig, messenger };
}

describe('ChannelMessengerService.sendPaymentLink', () => {
  it('sends the WhatsApp payment link as a "Pagar pedido" button without the URL in the text', async () => {
    const { wa, messenger } = setup();
    await expect(messenger.sendPaymentLink(whatsapp, '51999', link)).resolves.toMatchObject({ messageId: 'wamid.cta' });
    expect(wa.sendCtaUrlMessage).toHaveBeenCalledWith(
      expect.objectContaining({ body: link.text, buttonText: 'Pagar pedido', url: link.url, footer: link.footer }),
    );
    expect(wa.sendTextMessage).not.toHaveBeenCalled();
  });

  it('falls back to text with the URL when WhatsApp rejects the button', async () => {
    const { wa, messenger } = setup();
    wa.sendCtaUrlMessage.mockResolvedValue({ ok: false, error: 'unsupported' });
    await expect(messenger.sendPaymentLink(whatsapp, '51999', link)).resolves.toMatchObject({ messageId: 'wamid.text' });
    expect(wa.sendTextMessage).toHaveBeenCalledWith(expect.objectContaining({ text: `${link.text}\n\n${link.url}` }));
  });

  it('sends text with the URL when the body is over the interactive limit', async () => {
    const { wa, messenger } = setup();
    await messenger.sendPaymentLink(whatsapp, '51999', { ...link, text: 'a'.repeat(1025) });
    expect(wa.sendCtaUrlMessage).not.toHaveBeenCalled();
    expect(wa.sendTextMessage).toHaveBeenCalled();
  });

  it('sends text with the URL on Instagram', async () => {
    const { ig, wa, messenger } = setup();
    await messenger.sendPaymentLink(
      { type: 'INSTAGRAM', metadata: { accountId: 'ig1', accessToken: 'token' } },
      'thread-1',
      link,
    );
    expect(wa.sendCtaUrlMessage).not.toHaveBeenCalled();
    expect(ig.sendTextMessage).toHaveBeenCalledWith(expect.objectContaining({ text: `${link.text}\n\n${link.url}` }));
  });
});
