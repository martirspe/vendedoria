/**
 * Owner of VendedorIA shown in the legal documents, the marketing footer and the signup forms.
 * The site is prerendered, so these values are fixed at build time; null renders "por configurar".
 */
export const PLATFORM_LEGAL = {
  brand: 'VendedorIA',
  legalName: 'MARRSO S.A.C.',
  ruc: '20613518895',
  address: 'Cal. 6 Mza. R Lote 22B Int. 3, A.H. Enrique Montenegro',
  email: 'legal@marrso.com',
  complaintsBookUrl: 'https://marrso.reclamofacil.com/',
  /** Registro Nacional de Protección de Datos Personales; null until the data bank is registered. */
  dataBankCode: null as string | null,
} as const;

/** Must match `LEGAL_TERMS_VERSION` in `apps/api/src/auth/legal-terms.ts`. */
export const LEGAL_UPDATED_AT = '2026-10-04';

export const LEGAL_LINKS = {
  terms: '/terminos-y-condiciones',
  privacy: '/politica-de-privacidad',
  cookies: '/politica-de-cookies',
  billing: '/planes-pagos-y-reembolsos',
  dataProcessing: '/tratamiento-de-datos',
  acceptableUse: '/uso-aceptable',
  center: '/legal',
} as const;
