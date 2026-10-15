export type WhatsAppChannelMetadata = {
  accessToken: string;
  phoneNumberId: string;
  wabaId?: string;
  appSecretEnc?: string;
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
    appSecretEnc: typeof value.appSecretEnc === 'string' ? value.appSecretEnc : undefined,
  };
}

export function publicWhatsAppMetadata(metadata: unknown) {
  if (!metadata || typeof metadata !== 'object') return null;
  const stored = metadata as Record<string, unknown>;
  if (typeof stored.phoneNumberId !== 'string') return null;
  return {
    phoneNumberId: stored.phoneNumberId,
    wabaId: typeof stored.wabaId === 'string' ? stored.wabaId : undefined,
    onboarding: stored.onboarding === 'MANUAL' || stored.onboarding === 'EMBEDDED_SIGNUP' ? stored.onboarding : 'LEGACY',
    hasAccessToken: typeof stored.accessToken === 'string',
  };
}
