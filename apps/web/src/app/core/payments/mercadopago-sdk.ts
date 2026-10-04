const SDK_URL = 'https://sdk.mercadopago.com/js/v2';

export type CardFormData = {
  token: string;
  payment_method_id: string;
  payer?: { email?: string; identification?: { type?: string; number?: string } };
};

export type CardBrickController = { unmount: () => void };

export type MercadoPagoInstance = {
  bricks: () => {
    create: (
      kind: 'cardPayment',
      containerId: string,
      settings: {
        initialization: { amount: number; payer?: { email?: string } };
        customization?: Record<string, unknown>;
        callbacks: {
          /** Mercado Pago rejects `create` with live keys unless both callbacks are present. */
          onReady: () => void;
          onSubmit: (data: CardFormData, extra?: { paymentTypeId?: string }) => Promise<void>;
          onError: (error: unknown) => void;
        };
      },
    ) => Promise<CardBrickController>;
  };
  yape: (options: { otp: string; phoneNumber: string }) => { create: () => Promise<{ id: string }> };
};

type MercadoPagoConstructor = new (
  publicKey: string,
  options?: { locale?: string },
) => MercadoPagoInstance;

let loading: Promise<MercadoPagoConstructor> | null = null;

/** Loads the official SDK once, in the browser only. */
export function loadMercadoPago(): Promise<MercadoPagoConstructor> {
  const existing = (window as unknown as { MercadoPago?: MercadoPagoConstructor }).MercadoPago;
  if (existing) return Promise.resolve(existing);
  loading ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SDK_URL;
    script.async = true;
    script.onload = () => {
      const sdk = (window as unknown as { MercadoPago?: MercadoPagoConstructor }).MercadoPago;
      if (sdk) resolve(sdk);
      else reject(new Error('Mercado Pago SDK unavailable'));
    };
    script.onerror = () => {
      loading = null;
      reject(new Error('Mercado Pago SDK failed to load'));
    };
    document.head.appendChild(script);
  });
  return loading;
}
