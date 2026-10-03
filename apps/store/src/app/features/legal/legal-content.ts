import type { StorefrontView } from '@vendedoria/contracts';
import type { LegalSlug } from './legal-slugs';

export type Inline =
  | string
  | { text: string; route?: string; href?: string; strong?: boolean; missing?: boolean };

export type Block =
  | { kind: 'p'; parts: Inline[] }
  | { kind: 'ul'; items: Inline[][] }
  | { kind: 'table'; head: string[]; rows: Inline[][] };

export type LegalSection = { id: string; title: string; blocks: Block[] };

export type LegalDoc = {
  slug: LegalSlug;
  title: string;
  description: string;
  summary: Inline[][];
  sections: LegalSection[];
};

const p = (...parts: Inline[]): Block => ({ kind: 'p', parts });
const ul = (...items: (Inline | Inline[])[]): Block => ({
  kind: 'ul',
  items: items.map((item) => (Array.isArray(item) ? item : [item])),
});
const table = (head: string[], rows: Inline[][]): Block => ({ kind: 'table', head, rows });
const link = (text: string, route: string): Inline => ({ text, route });
const strong = (text: string): Inline => ({ text, strong: true });
const MISSING: Inline = { text: 'por configurar', missing: true };

function money(cents: number): string {
  return new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(cents / 100);
}

function phone(value: string | null): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, '');
  return digits.startsWith('51') && digits.length === 11
    ? `+51 ${digits.slice(2, 5)} ${digits.slice(5, 8)} ${digits.slice(8)}`
    : `+${digits}`;
}

export function legalUpdatedLabel(store: StorefrontView): string {
  return new Intl.DateTimeFormat('es-PE', { dateStyle: 'long', timeZone: 'America/Lima' }).format(
    new Date(store.legal.updatedAt),
  );
}

export function legalDocs(store: StorefrontView): LegalDoc[] {
  const brand = store.displayName;
  const legal = store.legal;
  const owner: Inline = legal.legalName ?? MISSING;
  const ruc: Inline = legal.ruc ?? MISSING;
  const address: Inline = legal.legalAddress ?? MISSING;
  const email: Inline = store.contactEmail
    ? { text: store.contactEmail, href: `mailto:${store.contactEmail}` }
    : MISSING;
  const whatsapp = phone(store.whatsappPhone);
  const book: Inline = legal.complaintsBookUrl
    ? { text: 'Libro de Reclamaciones', href: legal.complaintsBookUrl }
    : { text: 'Libro de Reclamaciones (por configurar)', missing: true };
  const online = store.checkout.mode === 'online';
  const options = store.shipping.options;
  const delivery = options.filter((o) => o.mode !== 'PICKUP');
  const pickup = options.find((o) => o.mode === 'PICKUP') ?? null;
  const freeFrom = store.shipping.freeShippingFromCents;
  const exchangeDays = legal.exchangeDays;
  const channels: Inline[] = [
    'al correo ',
    email,
    ...(whatsapp ? [' o por WhatsApp al ', { text: whatsapp, href: `https://wa.me/${store.whatsappPhone?.replace(/\D/g, '')}` }] : []),
  ];

  const identity = table(
    ['Dato', 'Detalle'],
    [
      ['Titular', owner],
      ['Nombre comercial', brand],
      ['RUC', ruc],
      ['Domicilio', address],
      ['Correo', email],
      ['WhatsApp', whatsapp ?? 'No disponible'],
    ],
  );

  const terms: LegalDoc = {
    slug: 'terminos-y-condiciones',
    title: 'Términos y Condiciones',
    description: `Condiciones de compra en la tienda online de ${brand}.`,
    summary: [
      ['Compras a ', owner, ` (${brand}), con RUC `, ruc, '.'],
      ['Los precios están en soles e incluyen impuestos. El costo de envío se muestra antes de pagar.'],
      online
        ? ['Pagas con tarjeta o Yape a través de Mercado Pago. No guardamos los datos de tu tarjeta.']
        : ['Confirmas tu pedido por WhatsApp y coordinamos contigo el pago antes del despacho.'],
      ['Tu garantía legal está siempre protegida. Si algo sale mal, escríbenos o usa el ', book, '.'],
    ],
    sections: [
      { id: 'proveedor', title: 'Identificación del proveedor', blocks: [identity] },
      {
        id: 'aceptacion',
        title: 'Objeto, aceptación y versión aplicable',
        blocks: [
          p('Estos términos regulan las compras que haces en esta tienda online. Al realizar un pedido declaras haber leído y aceptado estos términos y las políticas que se enlazan aquí.'),
          p('La aceptación por medios electrónicos tiene plena validez conforme a los artículos 141 y 1374 del Código Civil, modificados por la Ley N.° 27291. A cada compra se le aplica la versión vigente en la fecha del pedido.'),
        ],
      },
      {
        id: 'capacidad',
        title: 'Capacidad y datos',
        blocks: [
          p('Para comprar debes ser mayor de 18 años y darnos datos verdaderos y completos. Usamos esos datos para atender tu pedido, como se explica en la ', link('Política de Privacidad', '/politica-de-privacidad'), '.'),
        ],
      },
      {
        id: 'productos',
        title: 'Productos e información',
        blocks: [
          p('Describimos cada producto con la mayor exactitud posible. Las imágenes son referenciales y pueden variar ligeramente en color o presentación sin afectar sus características.'),
          p('La disponibilidad se actualiza en línea. Si un producto se agota, no podrás agregarlo a un pedido nuevo.'),
          p(`Las marcas de terceros que se muestren pertenecen a sus titulares y se usan solo para identificar productos genuinos. ${brand} no es su representante oficial salvo que se indique expresamente.`),
        ],
      },
      {
        id: 'precios',
        title: 'Precios',
        blocks: [
          p('Los precios se expresan en soles (S/) e incluyen los impuestos aplicables. El costo de envío y cualquier descuento se muestran antes de confirmar el pedido. El precio que pagas es el vigente al momento de registrar tu pedido.'),
          p('Si un precio tachado aparece junto al precio actual, corresponde a un precio realmente aplicado antes.'),
          p(strong('Error material evidente. '), 'Si un precio se publica con un error material evidente e inequívoco, te contactaremos antes del despacho para que elijas entre continuar con el precio correcto o anular el pedido con la devolución íntegra de lo pagado.'),
        ],
      },
      {
        id: 'compra',
        title: 'Proceso de compra',
        blocks: online
          ? [
              ul(
                'Agregas productos al carrito y eliges cómo recibirlos.',
                'Completas tus datos, aplicas un cupón si tienes uno y aceptas estos términos.',
                'Registramos tu pedido y reservamos los productos durante 15 minutos mientras pagas.',
                'Pagas con tarjeta o Yape. Si el pago no se completa a tiempo, la reserva vence y el pedido se cancela sin costo.',
                'Cuando Mercado Pago confirma el pago, el contrato queda perfeccionado y te enviamos la confirmación por correo.',
              ),
              p('Solo podemos anular un pedido pagado por falta de stock, sospecha razonable de fraude, falta de cobertura en tu dirección o un error material evidente. En esos casos te avisamos y te devolvemos el íntegro de lo pagado.'),
            ]
          : [
              ul(
                'Agregas productos al carrito.',
                'Envías tu pedido por WhatsApp con el detalle generado por la tienda.',
                'Te confirmamos disponibilidad, costo de envío, total y forma de pago antes de cobrar.',
                'El contrato queda perfeccionado cuando confirmamos tu pago.',
              ),
            ],
      },
      {
        id: 'pagos',
        title: 'Medios de pago',
        blocks: online
          ? [
              p('Los pagos se procesan a través de Mercado Pago, que recibe directamente los datos de tu tarjeta o tu código de Yape. Nosotros no vemos ni almacenamos el número de tu tarjeta, su código de seguridad ni tu código de aprobación de Yape.'),
              p('Los pagos con tarjeta se realizan en una sola cuota desde la tienda; tu banco puede ofrecerte otras condiciones. Si un pago es rechazado, puedes intentarlo de nuevo con otro medio mientras la reserva esté vigente.'),
              p('Si detectas un cobro duplicado o no reconocido, escríbenos y lo revisaremos junto con Mercado Pago para devolver lo que corresponda.'),
            ]
          : [p('Coordinamos contigo el medio de pago por WhatsApp antes del despacho. Nunca te pediremos claves, códigos de verificación ni datos completos de tu tarjeta por chat.')],
      },
      {
        id: 'comprobantes',
        title: 'Comprobantes de pago',
        blocks: [
          p('Emitimos el comprobante de pago electrónico que corresponda según las normas de SUNAT. Si necesitas factura, pídela con tu RUC al hacer el pedido escribiéndonos ', ...channels, '.'),
        ],
      },
      {
        id: 'entregas',
        title: 'Entregas',
        blocks: [p('Las opciones, costos y plazos de entrega están en la ', link('Política de Envíos y Entregas', '/envios-y-entregas'), '.')],
      },
      {
        id: 'garantia',
        title: 'Garantía legal, cambios y devoluciones',
        blocks: [p('Tienes derecho a la garantía legal por productos defectuosos o distintos a lo ofrecido. Las condiciones están en la ', link('Política de Cambios y Devoluciones', '/cambios-y-devoluciones'), '.')],
      },
      {
        id: 'promociones',
        title: 'Promociones y cupones',
        blocks: [p('Las reglas de descuentos y cupones están en la ', link('Política de Promociones y Cupones', '/promociones-y-cupones'), '.')],
      },
      {
        id: 'uso',
        title: 'Uso del sitio',
        blocks: [p('No está permitido usar la tienda para fines fraudulentos, intentar acceder a datos de otros clientes, alterar precios o pedidos, ni interferir con su funcionamiento.')],
      },
      {
        id: 'propiedad',
        title: 'Propiedad intelectual',
        blocks: [p('Los textos, fotografías, logotipos y diseños de la tienda pertenecen a sus titulares y están protegidos por el Decreto Legislativo N.° 822 y la Decisión 486 de la Comunidad Andina.')],
      },
      {
        id: 'responsabilidad',
        title: 'Responsabilidad',
        blocks: [p('Nada en estos términos limita o excluye la responsabilidad que corresponda por dolo o culpa inexcusable, ni los derechos irrenunciables que la ley reconoce al consumidor.')],
      },
      {
        id: 'reclamos',
        title: 'Atención, reclamos y solución de controversias',
        blocks: [
          p('Puedes escribirnos ', ...channels, '. También puedes registrar un reclamo o una queja en nuestro ', book, '. Respondemos en un plazo no mayor a 15 días hábiles improrrogables.'),
          p('Presentar un reclamo no es requisito para acudir al INDECOPI, a sus mecanismos de conciliación o al Sistema de Arbitraje de Consumo.'),
        ],
      },
      {
        id: 'comunicaciones',
        title: 'Datos personales y comunicaciones',
        blocks: [p('Tratamos tus datos según la ', link('Política de Privacidad', '/politica-de-privacidad'), '. No te enviaremos publicidad sin tu consentimiento previo.')],
      },
      {
        id: 'cambios',
        title: 'Modificaciones',
        blocks: [p('Podemos actualizar estos términos. Los cambios rigen desde su publicación; los pedidos anteriores se rigen por la versión que aceptaste.')],
      },
      {
        id: 'ley',
        title: 'Legislación aplicable',
        blocks: [p('Estos términos se rigen por las leyes del Perú, en particular el Código de Protección y Defensa del Consumidor (Ley N.° 29571). Puedes acudir al INDECOPI o a los jueces competentes, según prefieras. Si alguna cláusula fuera inválida, las demás seguirán vigentes.')],
      },
    ],
  };

  const recipients: Inline[][] = [
    ['Proveedor de la plataforma de la tienda (VendedorIA)', 'Alojar la tienda, registrar pedidos y enviar correos por nuestra cuenta', 'Datos de contacto, entrega y pedido'],
    ...(online
      ? [['Mercado Pago', 'Procesar el pago y prevenir fraude', 'Datos de pago, correo y, en Yape, tu celular'] as Inline[]]
      : []),
    ...(delivery.length ? [['Empresas de reparto', 'Entregar tu pedido', 'Nombre, celular y dirección'] as Inline[]] : []),
    ...(whatsapp ? [['WhatsApp (Meta)', 'Atender tus mensajes si nos escribes', 'Número y contenido de la conversación'] as Inline[]] : []),
    ['SUNAT y autoridades', 'Cumplir obligaciones tributarias y legales', 'Datos del comprobante o lo que la ley exija'],
  ];

  const privacy: LegalDoc = {
    slug: 'politica-de-privacidad',
    title: 'Política de Privacidad',
    description: `Cómo ${brand} trata tus datos personales.`,
    summary: [
      ['Usamos tus datos solo para atender tu pedido, emitir tu comprobante y responder tus consultas.'],
      ['No vendemos ni alquilamos tus datos. No guardamos los datos de tu tarjeta.'],
      ['No te enviamos publicidad sin tu consentimiento.'],
      ['Puedes ejercer tus derechos escribiendo a ', email, '.'],
    ],
    sections: [
      {
        id: 'titular',
        title: 'Titular del banco de datos',
        blocks: [
          identity,
          p('Banco de datos de clientes. Código de inscripción en el Registro Nacional de Protección de Datos Personales: ', legal.dataBankCode ?? 'en trámite o no aplicable', '.'),
        ],
      },
      {
        id: 'marco',
        title: 'Marco normativo',
        blocks: [p('Tratamos tus datos conforme a la Ley N.° 29733, Ley de Protección de Datos Personales, y su Reglamento aprobado por el Decreto Supremo N.° 016-2024-JUS.')],
      },
      {
        id: 'datos',
        title: 'Datos que tratamos',
        blocks: [
          table(
            ['Categoría', 'Datos', 'Origen'],
            [
              ['Identificación y contacto', 'Nombre, correo, celular y, si lo indicas, DNI o CE', 'Tú, en el checkout'],
              ['Entrega', 'Departamento, provincia, distrito (ubigeo), dirección y referencia', 'Tú, en el checkout'],
              ['Pedido', 'Productos, montos, cupón usado y estado del pago', 'La tienda'],
              ...(online ? [['Pago', 'Estado y referencia de la operación (no el número de tarjeta)', 'Mercado Pago'] as Inline[]] : []),
              ...(whatsapp ? [['Conversaciones', 'Mensajes que nos envías por WhatsApp', 'Tú'] as Inline[]] : []),
              ['Técnicos y de seguridad', 'Tu dirección IP, que se usa transformada de forma irreversible y por unos minutos para limitar intentos abusivos', 'Tu navegador'],
            ],
          ),
          p('No almacenamos el número, la fecha de vencimiento ni el código de seguridad de tu tarjeta, ni tu código de aprobación de Yape. Por favor, no nos envíes datos sensibles, como información de salud.'),
        ],
      },
      {
        id: 'finalidades',
        title: 'Finalidades',
        blocks: [
          ul(
            'Registrar, cobrar, preparar y entregar tu pedido.',
            'Enviarte la confirmación y avisos sobre el estado de tu pedido.',
            'Emitir el comprobante de pago y cumplir obligaciones legales.',
            'Atender consultas, cambios, devoluciones, reclamos y quejas.',
            'Prevenir fraudes y proteger la seguridad de la tienda.',
          ),
          p('No usamos tus datos para publicidad ni para elaborar perfiles comerciales. Si en el futuro quisiéramos hacerlo, te pediremos un consentimiento separado, libre y revocable, que no condicionará tus compras.'),
        ],
      },
      {
        id: 'base',
        title: 'Base legal y carácter obligatorio',
        blocks: [p('Tratamos tus datos porque son necesarios para ejecutar el contrato de compra que celebras con nosotros y para cumplir obligaciones legales, supuestos en los que la Ley N.° 29733 no exige consentimiento. Los datos marcados como obligatorios en el checkout son necesarios: sin ellos no podemos procesar ni entregar tu pedido.')],
      },
      {
        id: 'destinatarios',
        title: 'Destinatarios y encargados',
        blocks: [
          table(['Destinatario', 'Finalidad', 'Datos'], recipients),
          p('Estos proveedores tratan los datos solo por nuestra cuenta o para cumplir su propio servicio. Algunos pueden procesarlos fuera del Perú; lo hacemos porque es necesario para ejecutar tu compra.'),
        ],
      },
      {
        id: 'conservacion',
        title: 'Conservación',
        blocks: [
          table(
            ['Datos', 'Plazo'],
            [
              ['Pedidos y comprobantes', 'Mientras sean necesarios y hasta que prescriban las obligaciones tributarias y legales'],
              ['Reclamos y quejas', 'Al menos 2 años desde su registro'],
              ['Carrito guardado en tu navegador', 'Hasta que lo vacíes o borres los datos del sitio'],
            ],
          ),
        ],
      },
      {
        id: 'seguridad',
        title: 'Seguridad',
        blocks: [p('La tienda funciona con conexión cifrada (HTTPS). Cada pedido se consulta con un enlace privado y único. Los pagos se procesan en los formularios seguros de Mercado Pago, y el acceso a la información de los pedidos está restringido al personal autorizado.')],
      },
      {
        id: 'derechos',
        title: 'Tus derechos',
        blocks: [
          p('Puedes ejercer tus derechos de información, acceso, rectificación, cancelación, oposición y revocación escribiendo a ', email, ', con una copia de tu documento de identidad (o el poder de tu representante). La atención es gratuita y respondemos en los plazos que fija el Reglamento.'),
          p('Si no estás conforme con la respuesta, puedes presentar una reclamación ante la Autoridad Nacional de Protección de Datos Personales del Ministerio de Justicia y Derechos Humanos.'),
        ],
      },
      {
        id: 'menores',
        title: 'Menores de edad',
        blocks: [p('La tienda está dirigida a mayores de 18 años. No recopilamos a sabiendas datos de menores de edad.')],
      },
      {
        id: 'cookies',
        title: 'Cookies',
        blocks: [p('Lee la ', link('Política de Cookies', '/politica-de-cookies'), ' para saber qué guardamos en tu navegador.')],
      },
      {
        id: 'incidentes',
        title: 'Incidentes de seguridad',
        blocks: [p('Si ocurriera un incidente que afecte tus datos, lo comunicaremos a la Autoridad Nacional de Protección de Datos Personales y a las personas afectadas, conforme al Reglamento.')],
      },
      {
        id: 'cambios',
        title: 'Cambios a esta política',
        blocks: [p('Publicaremos aquí cualquier cambio. Si añadimos nuevas finalidades, te pediremos un nuevo consentimiento antes de aplicarlas.')],
      },
    ],
  };

  const tracking = store.tracking;
  const trackingRows: Inline[][] = [
    ...(tracking ? [['vendedoria-consent:*', 'Propia, necesaria (localStorage)', 'Recordar si aceptaste o rechazaste la analítica', 'Hasta que borres los datos del sitio'] as Inline[]] : []),
    ...(tracking?.ga4MeasurementId
      ? [['_ga, _ga_*', 'De terceros (Google Analytics), opcional', 'Medir visitas y compras de forma estadística', 'Hasta 2 años'] as Inline[]]
      : []),
    ...(tracking?.metaPixelId
      ? [['_fbp', 'De terceros (Meta), opcional', 'Medir anuncios de Facebook e Instagram y mostrarte publicidad relevante', '3 meses'] as Inline[]]
      : []),
  ];
  const cookies: LegalDoc = {
    slug: 'politica-de-cookies',
    title: 'Política de Cookies',
    description: `Qué guarda la tienda de ${brand} en tu navegador.`,
    summary: tracking
      ? [
          ['Guardamos lo necesario para que funcionen el carrito y el pago.'],
          ['La analítica y la publicidad se activan solo si las aceptas.'],
          ['Puedes cambiar tu decisión cuando quieras.'],
        ]
      : [
          ['No usamos cookies de analítica ni de publicidad.'],
          ['Solo guardamos lo necesario para que funcionen el carrito y el pago.'],
          ['Si incorporamos analítica o publicidad, te pediremos permiso antes.'],
        ],
    sections: [
      {
        id: 'que-son',
        title: 'Qué son',
        blocks: [p('Las cookies y el almacenamiento local (localStorage y sessionStorage) son pequeños archivos o registros que un sitio guarda en tu navegador para recordar información entre páginas.')],
      },
      {
        id: 'tabla',
        title: 'Qué usamos',
        blocks: [
          table(
            ['Nombre', 'Tipo', 'Finalidad', 'Duración'],
            [
              ['vendedoria-cart:*', 'Propia, necesaria (localStorage)', 'Recordar los productos de tu carrito', 'Hasta que vacíes el carrito o borres los datos del sitio'],
              ['vendedoria-checkout-key', 'Propia, necesaria (sessionStorage)', 'Evitar que un doble clic cree dos pedidos', 'Hasta cerrar la pestaña'],
              ['store_preview', 'Propia, necesaria (cookie HttpOnly)', 'Solo para el dueño de la tienda: ver la vista previa antes de publicar', '1 hora'],
              ...(online
                ? [['Cookies de Mercado Pago', 'De terceros, necesarias', 'Procesar el pago de forma segura y prevenir fraude; se cargan solo en la página de pago', 'Según la política de Mercado Pago'] as Inline[]]
                : []),
              ...trackingRows,
            ],
          ),
        ],
      },
      {
        id: 'sin-analitica',
        title: 'Analítica y publicidad',
        blocks: [
          tracking
            ? p('Usamos Google Analytics o el píxel de Meta solo si los aceptas en el aviso de cookies. Estos proveedores pueden tratar los datos fuera del Perú según sus propias políticas. Si los rechazas, la tienda funciona igual.')
            : p('Hoy no usamos herramientas de analítica, píxeles publicitarios ni cookies de seguimiento. Si las incorporamos, te mostraremos un aviso para aceptarlas o rechazarlas con la misma facilidad antes de activarlas.'),
        ],
      },
      {
        id: 'gestion',
        title: 'Cómo gestionarlas',
        blocks: [
          p(
            tracking
              ? 'Puedes cambiar tu decisión sobre la analítica con el botón «Cambiar mi decisión sobre cookies» de esta página. También puedes bloquear las cookies desde la configuración del navegador; si bloqueas las necesarias, el carrito o el pago podrían no funcionar.'
              : 'Puedes borrar o bloquear estos datos desde la configuración de tu navegador. Si bloqueas los necesarios, el carrito o el pago podrían no funcionar.',
          ),
        ],
      },
    ],
  };

  const shippingRows: Inline[][] = options.map((o) => [
    o.label,
    o.mode === 'PICKUP' ? 'Gratis' : money(o.cents),
    o.mode === 'PICKUP' ? `Dirección: ${o.eta ?? 'por confirmar'}` : (o.eta ?? 'Se informa al confirmar el pedido'),
  ]);

  const shipping: LegalDoc = {
    slug: 'envios-y-entregas',
    title: 'Envíos y Entregas',
    description: `Opciones, costos y plazos de entrega de ${brand}.`,
    summary: [
      options.length
        ? [`Opciones de entrega: ${options.map((o) => o.label).join(' · ')}.`]
        : [{ text: 'Las formas de entrega están por configurar.', missing: true }],
      ['El costo de envío se muestra antes de pagar.'],
      freeFrom !== null && delivery.length
        ? [`El envío es gratis en compras desde ${money(freeFrom)}, después de descuentos.`]
        : ['Los plazos se cuentan en días hábiles desde la confirmación del pago.'],
      ['El riesgo del transporte es nuestro hasta que recibes el pedido.'],
    ],
    sections: [
      {
        id: 'opciones',
        title: 'Opciones, costos y plazos',
        blocks: [
          options.length
            ? table(['Opción', 'Costo', 'Plazo o detalle'], shippingRows)
            : p({ text: 'Las formas de entrega están por configurar.', missing: true }),
          p('Los plazos son en días hábiles y se cuentan desde la confirmación del pago.'),
          ...(freeFrom !== null && delivery.length
            ? [p(`El envío es gratis cuando el subtotal de tu compra, después de aplicar descuentos, es de ${money(freeFrom)} o más. Un cupón de envío gratis también elimina este costo.`)]
            : []),
        ],
      },
      {
        id: 'tarifas',
        title: 'Tarifas',
        blocks: [p('El costo que ves en el checkout es el que pagas. Si la tarifa real resultara mayor, no te cobraremos la diferencia sin tu aprobación previa y expresa; si no la aceptas, podrás elegir otra opción o anular el pedido con reembolso total.')],
      },
      {
        id: 'retrasos',
        title: 'Retrasos',
        blocks: [p('Si no podemos cumplir el plazo informado por causas que no dependen de ti, te avisaremos y podrás elegir entre esperar o anular el pedido con la devolución íntegra de lo pagado.')],
      },
      {
        id: 'recepcion',
        title: 'Recepción',
        blocks: [p('Al recibir, revisa el paquete. Si llega dañado o incompleto, anótalo con el repartidor si es posible y avísanos lo antes posible, de preferencia dentro de las 48 horas. Esta recomendación no limita tu garantía legal.')],
      },
      {
        id: 'fallidas',
        title: 'Entregas fallidas',
        blocks: [p('Si la entrega falla por una dirección incorrecta o porque nadie pudo recibir el pedido, te contactaremos para coordinar un nuevo intento. Un nuevo envío puede tener costo adicional, que te informaremos antes de realizarlo.')],
      },
      ...(pickup
        ? [
            {
              id: 'recojo',
              title: 'Recojo en tienda',
              blocks: [p(`Puedes recoger tu pedido en ${pickup.eta ?? 'la dirección que te indicaremos'} cuando te confirmemos que está listo. Presenta tu documento de identidad y el código de tu pedido. Si enviarás a otra persona, avísanos su nombre y DNI.`)],
            },
          ]
        : []),
      {
        id: 'riesgo',
        title: 'Riesgo y fuerza mayor',
        blocks: [p('Asumimos el riesgo de pérdida o daño del pedido hasta que lo recibes. Ante eventos de fuerza mayor (desastres, paros, restricciones oficiales), te informaremos y podrás esperar o anular con reembolso total.')],
      },
    ],
  };

  const returns: LegalDoc = {
    slug: 'cambios-y-devoluciones',
    title: 'Cambios y Devoluciones',
    description: `Garantía legal, cambios y reembolsos en ${brand}.`,
    summary: [
      ['Si el producto llega defectuoso, dañado, vencido, incompleto o distinto, elige reposición, cambio o devolución del dinero, sin costo.'],
      exchangeDays > 0
        ? [`Además, aceptamos cambios por preferencia dentro de los ${exchangeDays} días calendario desde la entrega.`]
        : ['No ofrecemos cambios por preferencia; tu garantía legal se mantiene siempre.'],
      ['Los reembolsos se hacen al mismo medio de pago.'],
    ],
    sections: [
      {
        id: 'alcance',
        title: 'Alcance',
        blocks: [p('Esta política no limita la garantía legal que te reconoce el Código de Protección y Defensa del Consumidor.')],
      },
      {
        id: 'garantia',
        title: 'Garantía legal',
        blocks: [
          p('Si el producto llega defectuoso, dañado, vencido, incompleto o distinto a lo que compraste, puedes elegir entre la reposición, el cambio por otro producto o la devolución de lo pagado. Los costos de recojo y reenvío corren por nuestra cuenta.'),
          p('Escríbenos ', ...channels, ' con el código de tu pedido y fotos o videos del problema. Te responderemos en un máximo de 5 días hábiles con la solución.'),
        ],
      },
      {
        id: 'preferencia',
        title: 'Cambio por preferencia',
        blocks:
          exchangeDays > 0
            ? [
                p(`Puedes pedir un cambio por talla, color, modelo u otro producto dentro de los ${exchangeDays} días calendario desde la entrega. El producto debe estar sin usar, completo y con su empaque original.`),
                p('El costo de retorno de un cambio por preferencia corre por tu cuenta, salvo que te indiquemos lo contrario. Si el nuevo producto cuesta más, pagas la diferencia; si cuesta menos, te devolvemos la diferencia.'),
              ]
            : [p('No ofrecemos cambios ni devoluciones por preferencia. Esto no afecta tu garantía legal descrita arriba.')],
      },
      {
        id: 'exclusiones',
        title: 'Exclusiones',
        blocks: [p('Por higiene o seguridad, no aceptamos cambios por preferencia de productos abiertos que no puedan revenderse (por ejemplo, alimentos, cosméticos o ropa interior usados), ni de productos dañados por mal uso. Estas exclusiones no afectan la garantía legal.')],
      },
      {
        id: 'promociones',
        title: 'Compras con descuento',
        blocks: [p('Si devuelves un producto comprado con descuento, te reembolsamos lo que efectivamente pagaste por él. Si el descuento dependía de comprar varias unidades y devuelves parte, recalculamos el beneficio y te mostramos el cálculo.')],
      },
      {
        id: 'cancelacion',
        title: 'Cancelación antes del despacho',
        blocks: [
          p('Mientras tu pedido esté pendiente de pago, puedes cancelarlo desde su página sin costo. Si ya pagaste y aún no lo despachamos, escríbenos y te devolveremos el íntegro.'),
        ],
      },
      {
        id: 'reembolsos',
        title: 'Reembolsos',
        blocks: [p('Hacemos el reembolso al mismo medio de pago dentro de los 5 días hábiles siguientes a aprobar la devolución. El tiempo en que lo ves reflejado depende de tu banco o de Yape. Si no es posible, te ofreceremos una transferencia bancaria.')],
      },
      {
        id: 'reclamos',
        title: 'Si no estás conforme',
        blocks: [p('Puedes registrar tu reclamo en nuestro ', book, ' o acudir al INDECOPI.')],
      },
    ],
  };

  const promotions: LegalDoc = {
    slug: 'promociones-y-cupones',
    title: 'Promociones y Cupones',
    description: `Reglas de descuentos y cupones de ${brand}.`,
    summary: [
      ['Cada promoción informa su vigencia (hora de Lima), los productos participantes y sus condiciones.'],
      ['Puedes usar un cupón por pedido. No es canjeable por dinero.'],
      ['El descuento se calcula y valida al registrar tu pedido; si lo cancelas o vence, el uso del cupón se libera.'],
    ],
    sections: [
      {
        id: 'marco',
        title: 'Marco',
        blocks: [p('Nuestras promociones siguen el Código de Protección y Defensa del Consumidor y el Decreto Legislativo N.° 1044. No modificaremos una promoción en tu perjuicio durante su vigencia. Si una promoción está sujeta a stock, indicaremos la cantidad mínima disponible; si no lo indicamos, habrá stock suficiente durante toda la vigencia.')],
      },
      {
        id: 'tipos',
        title: 'Tipos de cupón',
        blocks: [
          ul(
            [strong('Porcentaje: '), 'descuento sobre los productos participantes, con un tope en soles si se indica.'],
            [strong('Monto fijo: '), 'descuento en soles sobre los productos participantes.'],
            [strong('Envío gratis: '), 'elimina el costo de envío a domicilio.'],
            [strong('Compra X, lleva Y: '), 'al llevar el número indicado de productos participantes, las unidades de regalo reciben el beneficio indicado. El beneficio se aplica a las unidades de menor precio.'],
          ),
          p('Ejemplo de «Compra 2, lleva 3»: si llevas tres productos participantes de S/ 40, S/ 30 y S/ 20, el de S/ 20 es gratis y pagas S/ 70.'),
        ],
      },
      {
        id: 'reglas',
        title: 'Reglas',
        blocks: [
          ul(
            'Un cupón por pedido.',
            'Cada cupón puede tener fecha de inicio y fin, compra mínima en productos participantes, cantidad mínima de unidades, límite total de usos, límite por cliente y restricción a primera compra. Las condiciones se muestran al aplicarlo.',
            'Los límites por cliente y de primera compra se verifican con el correo del pedido.',
            'El uso del cupón queda reservado mientras pagas. Si el pedido se cancela o la reserva vence, el uso se libera.',
            'El descuento nunca deja el total de los productos por debajo de S/ 1.00.',
            'Los cupones no son canjeables por dinero ni acumulables entre sí.',
          ),
          p('Podemos anular el beneficio en casos de fraude o error material evidente, sin afectar los pedidos ya confirmados.'),
        ],
      },
      ...(freeFrom !== null && delivery.length
        ? [
            {
              id: 'envio-gratis',
              title: 'Envío gratis por monto',
              blocks: [p(`El envío a domicilio es gratis cuando el subtotal, después de descuentos, es de ${money(freeFrom)} o más.`)],
            },
          ]
        : []),
      {
        id: 'precios-referencia',
        title: 'Precios de referencia',
        blocks: [p('Un precio tachado corresponde a un precio realmente aplicado antes. No usamos precios de referencia ficticios.')],
      },
      {
        id: 'devoluciones',
        title: 'Devoluciones',
        blocks: [p('Si devuelves productos comprados con un cupón, se aplica lo previsto en la ', link('Política de Cambios y Devoluciones', '/cambios-y-devoluciones'), '.')],
      },
    ],
  };

  return [terms, privacy, cookies, shipping, returns, promotions];
}
