export type WhatsAppChannelMetadata = {
  accessToken: string;
  phoneNumberId: string;
  wabaId?: string;
};

export function asWhatsAppMetadata(
  metadata: unknown,
): WhatsAppChannelMetadata | null {
  if (!metadata || typeof metadata !== 'object') {
    return null;
  }
  const value = metadata as Record<string, unknown>;
  if (
    typeof value.accessToken !== 'string' ||
    typeof value.phoneNumberId !== 'string'
  ) {
    return null;
  }
  return {
    accessToken: value.accessToken,
    phoneNumberId: value.phoneNumberId,
    wabaId: typeof value.wabaId === 'string' ? value.wabaId : undefined,
  };
}
