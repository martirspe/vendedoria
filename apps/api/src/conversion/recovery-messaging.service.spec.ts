import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import {
  RecoveryMessagingService,
  RecoveryTransportError,
} from './recovery-messaging.service';

describe('RecoveryMessagingService', () => {
  afterEach(() => jest.restoreAllMocks());
  it('uses a separate sender and escapes merchant content with an opt-out link', async () => {
    const send = jest
      .spyOn(SESv2Client.prototype, 'send')
      .mockResolvedValue({} as never);
    const service = new RecoveryMessagingService(
      new ConfigService({
        EMAIL_MODE: 'live',
        RECOVERY_EMAIL_FROM: 'recovery@example.test',
        AWS_REGION: 'us-east-1',
      }),
      {} as PrismaService,
    );
    await service.email(
      'buyer@example.test',
      '<script>shop</script>',
      'https://shop.example.test/carrito?recover=token',
      'https://shop.example.test/carrito?stop=token',
      'delivery',
    );
    const command = send.mock.calls[0][0] as SendEmailCommand;
    expect(command.input.FromEmailAddress).toBe('recovery@example.test');
    expect(command.input.Content?.Simple?.Body?.Html?.Data).not.toContain(
      '<script>',
    );
    expect(command.input.Content?.Simple?.Body?.Text?.Data).toContain(
      'Dejar de recibir recordatorios:',
    );
  });
  it('does not contact providers in preview mode', async () => {
    const send = jest.spyOn(SESv2Client.prototype, 'send');
    const service = new RecoveryMessagingService(
      new ConfigService({ EMAIL_MODE: 'preview' }),
      {} as PrismaService,
    );
    expect(
      await service.email(
        'buyer@example.test',
        'Shop',
        'https://example.test',
        'https://example.test',
        'delivery',
      ),
    ).toBe('preview');
    expect(send).not.toHaveBeenCalled();
  });
  it('classifies a missing live sender as a definite failure before contacting a provider', async () => {
    const send = jest.spyOn(SESv2Client.prototype, 'send');
    const service = new RecoveryMessagingService(
      new ConfigService({ EMAIL_MODE: 'live' }),
      {} as PrismaService,
    );
    await expect(
      service.email(
        'buyer@example.test',
        'Shop',
        'https://example.test',
        'https://example.test',
        'delivery',
      ),
    ).rejects.toEqual(new RecoveryTransportError('failed'));
    expect(send).not.toHaveBeenCalled();
  });
});
