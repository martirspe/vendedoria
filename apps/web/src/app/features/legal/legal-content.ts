import { LEGAL_LINKS, LEGAL_UPDATED_AT, PLATFORM_LEGAL } from './legal-identity';

export type LegalSlug =
  | 'terminos-y-condiciones'
  | 'politica-de-privacidad'
  | 'politica-de-cookies'
  | 'planes-pagos-y-reembolsos'
  | 'tratamiento-de-datos'
  | 'uso-aceptable';

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

const brand = PLATFORM_LEGAL.brand;
const owner = PLATFORM_LEGAL.legalName;
const email: Inline = { text: PLATFORM_LEGAL.email, href: `mailto:${PLATFORM_LEGAL.email}` };
const book: Inline = { text: 'Libro de Reclamaciones', href: PLATFORM_LEGAL.complaintsBookUrl };
const dataBank: Inline = PLATFORM_LEGAL.dataBankCode ?? MISSING;

const termsLink = link('Términos y Condiciones', LEGAL_LINKS.terms);
const privacyLink = link('Política de Privacidad', LEGAL_LINKS.privacy);
const cookiesLink = link('Política de Cookies', LEGAL_LINKS.cookies);
const billingLink = link('Planes, Pagos y Reembolsos', LEGAL_LINKS.billing);
const dataLink = link('Acuerdo de Tratamiento de Datos', LEGAL_LINKS.dataProcessing);
const useLink = link('Política de Uso Aceptable', LEGAL_LINKS.acceptableUse);

/** Days the account data is kept after a closure request or after the plan expires. */
const RETENTION_DAYS = 90;

export function legalUpdatedLabel(): string {
  return new Intl.DateTimeFormat('es-PE', { dateStyle: 'long', timeZone: 'America/Lima' }).format(
    new Date(`${LEGAL_UPDATED_AT}T12:00:00-05:00`),
  );
}

const identity = table(
  ['Dato', 'Detalle'],
  [
    ['Titular', owner],
    ['Nombre comercial', brand],
    ['RUC', PLATFORM_LEGAL.ruc],
    ['Domicilio', PLATFORM_LEGAL.address],
    ['Correo', email],
    ['Libro de Reclamaciones', book],
  ],
);

const processors: Inline[][] = [
  ['Amazon Web Services', 'Guardar y servir las imágenes del catálogo y de las tiendas; enviar correos de pedidos', 'Imágenes, correo del comprador y detalle del pedido', 'Estados Unidos'],
  ['OpenAI', 'Redactar las respuestas del vendedor IA y los textos e imágenes del editor de la tienda', 'Mensajes de la conversación, datos del catálogo e instrucciones del negocio', 'Estados Unidos'],
  ['Meta (WhatsApp e Instagram)', 'Recibir y enviar los mensajes de los canales que el negocio conecta', 'Número o usuario y contenido de los mensajes', 'Estados Unidos y otros países'],
  ['Cloudflare', 'DNS, dominios propios de las tiendas y verificación contra bots', 'Dirección IP y datos técnicos del navegador', 'Estados Unidos y otros países'],
  ['Proveedor de servidores en la nube', 'Alojar la plataforma y su base de datos', 'Todos los datos de la plataforma, cifrados en tránsito', MISSING],
];

const terms: LegalDoc = {
  slug: 'terminos-y-condiciones',
  title: 'Términos y Condiciones',
  description: `Condiciones de uso de ${brand} para negocios: vendedor IA, consola y tienda web.`,
  summary: [
    [`${brand} es un servicio de ${owner} que te da un vendedor con inteligencia artificial para WhatsApp e Instagram, una consola y una tienda web para tu negocio.`],
    ['Tú eres el vendedor frente a tus clientes: decides tus precios, tu stock y tus envíos, y respondes por tus productos.'],
    ['Pagas tu plan por adelantado. No hay contratos ni cobros automáticos; si no renuevas, el servicio se detiene al vencer.'],
    ['El vendedor IA trabaja con tu catálogo, pero puede equivocarse: revisa su configuración y supervisa tus conversaciones.'],
    ['Si algo sale mal, escríbenos a ', email, ' o usa nuestro ', book, '.'],
  ],
  sections: [
    { id: 'proveedor', title: 'Identificación del proveedor', blocks: [identity] },
    {
      id: 'aceptacion',
      title: 'Objeto, aceptación y versión aplicable',
      blocks: [
        p(`Estos términos regulan el uso de ${brand}, su consola, el vendedor IA, la tienda web y los demás servicios que ofrecemos a negocios. Forman un solo contrato con la `, billingLink, ', la ', useLink, ', el ', dataLink, ' y la ', privacyLink, '.'),
        p('Al crear tu cuenta o aceptar una invitación marcas que los aceptas. La aceptación por medios electrónicos tiene plena validez conforme a los artículos 141 y 1374 del Código Civil, modificados por la Ley N.° 27291. Guardamos la fecha y la versión que aceptaste.'),
      ],
    },
    {
      id: 'definiciones',
      title: 'Definiciones',
      blocks: [
        ul(
          [strong('Plataforma: '), `el software ${brand}, incluida la consola en la web.`],
          [strong('Negocio o tú: '), 'la persona natural o jurídica que crea la cuenta y contrata un plan.'],
          [strong('Equipo: '), 'las personas que el Negocio invita a su consola como dueño, administrador o asesor.'],
          [strong('Comprador: '), 'la persona que conversa con el Negocio o le compra por sus canales o su tienda.'],
          [strong('Vendedor IA: '), 'el asistente que responde a los Compradores en nombre del Negocio.'],
          [strong('Tienda: '), 'la tienda web del Negocio, en un subdominio de la plataforma o en su dominio propio.'],
        ),
      ],
    },
    {
      id: 'cuenta',
      title: 'Cuenta y equipo',
      blocks: [
        p('Para crear una cuenta debes ser mayor de 18 años, tener facultades para obligar al Negocio y darnos datos verdaderos. Eres responsable de la confidencialidad de tu contraseña y de lo que se haga con tu cuenta.'),
        p('El dueño y los administradores pueden invitar personas al Equipo, dentro del límite de usuarios del plan, y retirarlas cuando quieran. El Negocio responde por el uso que su Equipo haga de la plataforma. Si sospechas un acceso no autorizado, cambia tu contraseña y escríbenos de inmediato.'),
      ],
    },
    {
      id: 'servicio',
      title: 'El servicio',
      blocks: [
        p('Según tu plan, la plataforma te permite conectar WhatsApp e Instagram, cargar tu catálogo, configurar tu Vendedor IA, atender conversaciones, registrar pedidos, cobrar con Mercado Pago, publicar tu Tienda y ver métricas. Las funciones y los límites de cada plan se muestran en la página de planes y en tu consola.'),
        p('Mejoramos la plataforma de forma continua. Podemos cambiar o retirar funciones siempre que no reduzcamos de forma sustancial lo que incluye tu plan durante el periodo que ya pagaste.'),
      ],
    },
    {
      id: 'vendedor-ia',
      title: 'Vendedor IA',
      blocks: [
        p('El Vendedor IA responde con la información de tu catálogo, tus envíos y la configuración que tú defines. Está diseñado para no inventar precios, stock ni costos de envío y para avisar al Comprador cuando un dato no está disponible.'),
        p('Aun así, la inteligencia artificial puede cometer errores o interpretar mal un mensaje. Por eso debes mantener tu catálogo actualizado, probar tu vendedor antes de activarlo y supervisar tus conversaciones. Cuando alguien de tu Equipo escribe en una conversación, el Vendedor IA se pausa en ella hasta que lo reactives.'),
        p('Las respuestas se redactan con proveedores de inteligencia artificial, como OpenAI. Si llegas al límite de respuestas con IA de tu plan, el vendedor sigue respondiendo con respuestas básicas de tu catálogo.'),
        p('No configures al Vendedor IA para negar que es un asistente automático cuando un Comprador lo pregunte, ni para pedir datos sensibles, como información de salud, claves o datos completos de tarjetas.'),
      ],
    },
    {
      id: 'canales',
      title: 'WhatsApp, Instagram y otros servicios de terceros',
      blocks: [
        p('WhatsApp e Instagram se conectan con tus propias cuentas de Meta, y su uso se rige también por las condiciones y políticas de Meta, incluidas las de WhatsApp Business y de comercio. Meta cobra los mensajes de WhatsApp aparte, directamente en tu cuenta de WhatsApp Business.'),
        p('No controlamos las decisiones de Meta, Mercado Pago ni otros terceros, como la restricción de un número o una cuenta. Si eso ocurre, te ayudaremos a entender lo que sabemos, pero no somos responsables por esas decisiones.'),
      ],
    },
    {
      id: 'cobros',
      title: 'Cobros a tus Compradores',
      blocks: [
        p('Los pagos de tus Compradores se procesan con tu propia cuenta de Mercado Pago y el dinero llega directamente a ella. No recibimos, retenemos ni administramos ese dinero, y no cobramos comisión por venta. Las comisiones de Mercado Pago, los contracargos y las devoluciones se rigen por tu contrato con Mercado Pago.'),
      ],
    },
    {
      id: 'tienda',
      title: 'Tu Tienda y sus documentos legales',
      blocks: [
        p('La plataforma genera los términos, políticas y avisos de tu Tienda a partir de los datos que configuras (titular, RUC, domicilio, envíos, cambios y Libro de Reclamaciones). Son una base de apoyo: tú eres responsable de completar esos datos, de que sean verdaderos y de que los textos describan cómo vendes. Te recomendamos revisarlos con un abogado.'),
        p(`En los planes que lo indican, la Tienda muestra el aviso «Hecho con ${brand}».`),
      ],
    },
    {
      id: 'obligaciones',
      title: 'Tus obligaciones como vendedor',
      blocks: [
        p('Frente a tus Compradores, el proveedor eres tú. Te corresponde, entre otras cosas:'),
        ul(
          'Cumplir el Código de Protección y Defensa del Consumidor, las normas tributarias, sanitarias y sectoriales de tus productos, y las de publicidad.',
          'Respetar los precios, las promociones y las condiciones que ofreces, entregar lo vendido y atender garantías, cambios y reclamos.',
          'Contar con tu propio Libro de Reclamaciones y emitir tus comprobantes de pago cuando corresponda.',
          ['Tratar los datos de tus Compradores conforme a la Ley N.° 29733, como se explica en el ', dataLink, '.'],
          ['Usar la plataforma según la ', useLink, '.'],
        ),
      ],
    },
    {
      id: 'planes',
      title: 'Planes y pagos',
      blocks: [
        p('Los precios, la prueba gratis, los pagos por adelantado, los chats extra, los comprobantes y los reembolsos están en ', billingLink, '.'),
      ],
    },
    {
      id: 'contenido',
      title: 'Tu contenido y propiedad intelectual',
      blocks: [
        p('Tu catálogo, tus fotos, tus marcas, tus textos y tus conversaciones son tuyos. Nos das una licencia limitada, no exclusiva y gratuita para alojarlos, procesarlos y mostrarlos solo para prestarte el servicio, mientras tu cuenta exista. Declaras que tienes derecho a usar ese contenido.'),
        p('Los textos e imágenes que generes con IA en la plataforma son para tu uso. Revísalos antes de publicarlos: puede haber errores, y no debes usarlos para imitar marcas o contenidos de terceros.'),
        p(`El software, el diseño, la marca ${brand} y la documentación de la plataforma pertenecen a ${owner} y están protegidos por el Decreto Legislativo N.° 822 y la Decisión 486 de la Comunidad Andina. No puedes copiarlos, revenderlos ni descompilarlos.`),
      ],
    },
    {
      id: 'datos',
      title: 'Datos personales',
      blocks: [
        p('Tratamos los datos de tu cuenta según la ', privacyLink, '. Los datos de tus Compradores los tratamos por tu cuenta, según el ', dataLink, '. No te enviaremos publicidad sin tu consentimiento previo.'),
      ],
    },
    {
      id: 'disponibilidad',
      title: 'Disponibilidad y soporte',
      blocks: [
        p('Trabajamos para que la plataforma esté disponible de forma continua, pero puede haber interrupciones por mantenimiento, fallas de terceros (como Meta, Mercado Pago u OpenAI) o causas de fuerza mayor. Avisaremos con anticipación los mantenimientos programados que puedan afectarte.'),
        p('Puedes pedir ayuda escribiendo a ', email, '. La compensación por fallas atribuibles a nosotros está en ', billingLink, '.'),
      ],
    },
    {
      id: 'terminacion',
      title: 'Suspensión, cierre y fin del servicio',
      blocks: [
        p('Puedes dejar de usar la plataforma cuando quieras: como no hay cobros automáticos, basta con no renovar. Para cerrar tu cuenta y pedir que eliminemos tus datos, escríbenos a ', email, ' desde el correo de la cuenta del dueño.'),
        p('Podemos suspender el Vendedor IA, la Tienda o la cuenta si incumples estos términos o la Política de Uso Aceptable. Te avisaremos antes y te daremos un plazo razonable para corregirlo, salvo que exista un riesgo grave e inmediato (fraude, actividad ilegal, daño a Compradores o a la plataforma), en cuyo caso podremos actuar primero y avisarte después explicando el motivo.'),
        p(`Al cerrar tu cuenta, o si tu plan vence y no lo renuevas, conservamos tus datos durante ${RETENTION_DAYS} días para que puedas pedir una copia o retomar el servicio. Luego los eliminamos o anonimizamos, salvo lo que la ley nos obligue a conservar.`),
      ],
    },
    {
      id: 'responsabilidad',
      title: 'Responsabilidad',
      blocks: [
        p(`${brand} es una herramienta tecnológica: no es parte de las ventas entre tú y tus Compradores, y no responde por tus productos, tus precios, tus entregas ni tus obligaciones frente a ellos.`),
        p('Responderemos por los daños que te causemos por incumplir estos términos. Salvo dolo o culpa inexcusable, no respondemos por el lucro cesante ni por daños indirectos, y nuestra responsabilidad total no superará lo que nos pagaste en los 12 meses anteriores al hecho.'),
        p('Nada en estos términos limita o excluye la responsabilidad que corresponda por dolo o culpa inexcusable, ni los derechos irrenunciables que la ley te reconozca, incluidos los que tengas como consumidor.'),
        p('Del mismo modo, responderás frente a nosotros por los reclamos de terceros, incluidos Compradores y autoridades, que se deriven de tus productos, de tu contenido o de tu incumplimiento de estos términos.'),
      ],
    },
    {
      id: 'reclamos',
      title: 'Atención, reclamos y solución de controversias',
      blocks: [
        p('Puedes escribirnos a ', email, '. También puedes registrar un reclamo o una queja en nuestro ', book, '. Respondemos en un plazo no mayor a 15 días hábiles improrrogables.'),
        p('Presentar un reclamo no es requisito para acudir al INDECOPI, a sus mecanismos de conciliación o al Sistema de Arbitraje de Consumo.'),
      ],
    },
    {
      id: 'cambios',
      title: 'Modificaciones',
      blocks: [
        p('Podemos actualizar estos términos. Si un cambio te perjudica de forma relevante, te avisaremos por correo o en tu consola al menos 15 días calendario antes de que rija. Si no estás de acuerdo, puedes cerrar tu cuenta antes de esa fecha y te devolveremos la parte proporcional de los meses completos que hayas pagado por adelantado y no hayas usado.'),
        p('Los cambios no se aplican de forma retroactiva.'),
      ],
    },
    {
      id: 'ley',
      title: 'Legislación aplicable',
      blocks: [
        p('Estos términos se rigen por las leyes del Perú. Las controversias se resolverán ante el INDECOPI o los jueces competentes, según corresponda y sin limitar la vía que la ley te permita elegir.'),
        p('Si alguna cláusula fuera inválida, las demás seguirán vigentes. Que no exijamos una cláusula en un momento no significa que renunciemos a ella.'),
      ],
    },
  ],
};

const billing: LegalDoc = {
  slug: 'planes-pagos-y-reembolsos',
  title: 'Planes, Pagos y Reembolsos',
  description: `Cómo funcionan la prueba gratis, los pagos por adelantado, los chats extra y los reembolsos de ${brand}.`,
  summary: [
    ['Pruebas el plan Crece 14 días gratis, sin tarjeta.'],
    ['Pagas por adelantado, por 1, 3, 6 o 12 meses. No hay cobros automáticos ni contratos de permanencia.'],
    ['Los precios están en soles e incluyen IGV.'],
    ['Si te cobramos de más, dos veces o por error, te devolvemos el íntegro. Una vez activado un plan, no hay reembolso por desistimiento.'],
  ],
  sections: [
    {
      id: 'precios',
      title: 'Precios',
      blocks: [
        p('Los precios de cada plan, sus límites y el descuento por pagar varios meses se muestran en la página de planes y en tu consola antes de pagar. Están en soles (S/) e incluyen el IGV. El precio que pagas es el vigente al momento del pago; un cambio de precio posterior no afecta el periodo que ya pagaste.'),
        p('Meta cobra los mensajes de WhatsApp aparte, en tu propia cuenta de WhatsApp Business, y Mercado Pago cobra sus comisiones sobre tus ventas según tu contrato con ellos. Esos costos no forman parte de tu plan.'),
      ],
    },
    {
      id: 'prueba',
      title: 'Prueba gratis',
      blocks: [
        p('Cada negocio nuevo empieza con 14 días del plan Crece, sin pedir tarjeta, con los límites de prueba que indica la página de planes. Al terminar la prueba no se cobra nada: eliges si quieres pagar un plan.'),
      ],
    },
    {
      id: 'periodos',
      title: 'Pagos por adelantado y periodos',
      blocks: [
        ul(
          'Pagas 1, 3, 6 o 12 meses en un solo pago. Cada mes pagado suma 30 días.',
          'Si pagas el mismo plan antes de que termine (también durante la prueba de Crece), los días nuevos se suman al final del periodo actual.',
          [strong('Si eliges otro plan, el nuevo empieza el día del pago y reemplaza al actual. '), 'Los días que te quedaban del plan anterior no se suman ni se devuelven, por eso te recomendamos cambiar de plan cerca del vencimiento.'],
          'No hay renovación automática: antes de que venza tu plan, debes pagar el siguiente periodo si quieres seguir.',
        ),
      ],
    },
    {
      id: 'chats-extra',
      title: 'Chats extra',
      blocks: [
        p('Con un plan pagado y vigente puedes comprar paquetes de chats extra, cada uno con sus respuestas con IA. Se suman al mes calendario en el que los pagas y no se acumulan para los meses siguientes.'),
      ],
    },
    {
      id: 'vencimiento',
      title: 'Si tu plan vence',
      blocks: [
        p('No hay plan gratuito. Al vencer la prueba o el periodo pagado, el Vendedor IA deja de atender chats nuevos, se detienen las respuestas con IA, no puedes agregar productos y se desactivan las integraciones, incluida la Tienda. Tu Equipo conserva el acceso a la consola y tus datos se mantienen durante el plazo indicado en los ', termsLink, '. Al pagar, todo vuelve a funcionar.'),
      ],
    },
    {
      id: 'medios',
      title: 'Medios de pago',
      blocks: [
        p('Pagas desde tu consola con tarjeta o Yape, a través de Mercado Pago. Los datos de tu tarjeta y tu código de Yape van directamente a Mercado Pago: no los vemos ni los guardamos. Solo el dueño o un administrador pueden pagar el plan.'),
        p('Cada intento de pago es único: si haces doble clic o se corta la conexión, no se cobra dos veces. Si el pago queda en revisión, tu plan se activa en cuanto Mercado Pago lo confirme.'),
      ],
    },
    {
      id: 'comprobantes',
      title: 'Comprobantes de pago',
      blocks: [
        p(`${owner} emite el comprobante de pago electrónico que corresponda según las normas de SUNAT. Si necesitas factura, escríbenos a `, email, ' con tu RUC y la fecha del pago.'),
      ],
    },
    {
      id: 'reembolsos',
      title: 'Reembolsos',
      blocks: [
        p(strong('Te devolvemos el íntegro '), 'si te cobramos dos veces por lo mismo, si cobramos un monto distinto al que aceptaste o si pagaste y el plan o los chats no se activaron por una falla nuestra.'),
        p(strong('Fallas del servicio. '), 'Si una falla atribuible a nosotros te impide usar las funciones principales de tu plan por más de 72 horas seguidas, te compensamos con los días afectados o, si lo prefieres, con la devolución proporcional de esos días.'),
        p(strong('Desistimiento. '), 'Como puedes probar el servicio gratis antes de pagar y no hay cobros automáticos, una vez activado un plan o un paquete de chats no devolvemos lo pagado si decides dejar de usarlo. La excepción son los cambios de términos que te perjudiquen, como se explica en los ', termsLink, '.'),
        p('Para pedir un reembolso, escríbenos a ', email, ' con la fecha y el monto del pago. Respondemos en un máximo de 5 días hábiles y, si procede, lo hacemos al mismo medio de pago a través de Mercado Pago. El tiempo en que lo ves reflejado depende de tu banco o de Yape.'),
        p('Nada de lo anterior limita los derechos que la ley te reconozca si el servicio no corresponde a lo ofrecido.'),
      ],
    },
    {
      id: 'reclamos',
      title: 'Si no estás conforme',
      blocks: [p('Puedes registrar tu reclamo en nuestro ', book, ' o acudir al INDECOPI.')],
    },
  ],
};

const privacy: LegalDoc = {
  slug: 'politica-de-privacidad',
  title: 'Política de Privacidad',
  description: `Cómo ${owner} trata los datos personales de quienes usan ${brand}.`,
  summary: [
    ['Usamos los datos de tu cuenta para prestarte el servicio, cobrar tu plan, darte soporte y proteger la plataforma.'],
    ['Los datos de tus compradores son tuyos: los tratamos solo por tu cuenta y según tus instrucciones.'],
    ['No vendemos ni alquilamos datos, no guardamos datos de tarjetas y no enviamos publicidad sin tu consentimiento.'],
    ['Puedes ejercer tus derechos escribiendo a ', email, '.'],
  ],
  sections: [
    {
      id: 'titular',
      title: 'Titular del banco de datos',
      blocks: [
        identity,
        p('Banco de datos de usuarios de la plataforma. Código de inscripción en el Registro Nacional de Protección de Datos Personales: ', dataBank, '.'),
      ],
    },
    {
      id: 'marco',
      title: 'Marco normativo',
      blocks: [p('Tratamos los datos conforme a la Ley N.° 29733, Ley de Protección de Datos Personales, y su Reglamento aprobado por el Decreto Supremo N.° 016-2024-JUS.')],
    },
    {
      id: 'alcance',
      title: 'A quién se aplica',
      blocks: [
        p(`Esta política se aplica a quienes visitan nuestro sitio, crean una cuenta de negocio, forman parte de un equipo o nos escriben. Para estos datos, ${owner} es el titular del banco de datos.`),
        p('Los datos de los compradores de cada negocio (conversaciones, pedidos y datos de entrega) pertenecen al negocio, que es su titular. Nosotros solo los tratamos por su cuenta, como se explica en el ', dataLink, '. Si eres comprador, revisa la política de privacidad de la tienda donde compraste o escríbele al negocio.'),
      ],
    },
    {
      id: 'datos',
      title: 'Datos que tratamos',
      blocks: [
        table(
          ['Categoría', 'Datos', 'Origen'],
          [
            ['Cuenta', 'Nombre, correo, contraseña (guardada de forma irreversible), rol y fecha en que aceptaste estos documentos', 'Tú, al registrarte o aceptar una invitación'],
            ['Negocio', 'Nombre comercial, razón social o nombre del titular, RUC, domicilio, correo y WhatsApp de contacto, logo y configuración', 'Tú, en la consola'],
            ['Integraciones', 'Identificadores de tus cuentas de WhatsApp, Instagram y Mercado Pago, y las credenciales necesarias para operarlas', 'Tú, al conectarlas'],
            ['Pagos del plan', 'Plan, monto, estado y referencia de la operación, correo del pagador y, si los ingresas, tipo y número de documento o celular de Yape', 'Tú y Mercado Pago'],
            ['Soporte', 'Mensajes que nos envías y la información que compartes para resolverlos', 'Tú'],
            ['Técnicos y de seguridad', 'Dirección IP, que se usa transformada de forma irreversible y por unos minutos para limitar intentos abusivos, y señales del navegador para la verificación contra bots', 'Tu navegador y Cloudflare'],
          ],
        ),
        p('No almacenamos el número, la fecha de vencimiento ni el código de seguridad de tarjetas, ni códigos de aprobación de Yape. No nos envíes datos sensibles, como información de salud.'),
      ],
    },
    {
      id: 'finalidades',
      title: 'Finalidades',
      blocks: [
        ul(
          'Crear y administrar tu cuenta y la de tu equipo.',
          'Prestarte el servicio contratado: vendedor IA, consola, tienda, integraciones y métricas.',
          'Cobrar tu plan, emitir comprobantes y cumplir obligaciones tributarias y legales.',
          'Enviarte avisos del servicio, como cambios en tu plan, en estos documentos o incidentes de seguridad.',
          'Atender consultas, reclamos y solicitudes de derechos.',
          'Prevenir fraudes y abusos y proteger la seguridad de la plataforma.',
        ),
        p('No usamos tus datos para publicidad ni para elaborar perfiles comerciales. Si en el futuro quisiéramos hacerlo, te pediremos un consentimiento separado, libre y revocable, que no condicionará el servicio.'),
      ],
    },
    {
      id: 'base',
      title: 'Base legal y carácter obligatorio',
      blocks: [p('Tratamos estos datos porque son necesarios para ejecutar el contrato que celebras con nosotros y para cumplir obligaciones legales, supuestos en los que la Ley N.° 29733 no exige consentimiento. Los datos que piden los formularios de registro y de pago son necesarios: sin ellos no podemos crear tu cuenta ni activar tu plan.')],
    },
    {
      id: 'destinatarios',
      title: 'Destinatarios y transferencias internacionales',
      blocks: [
        p('Compartimos datos solo con los proveedores que necesitamos para prestar el servicio:'),
        table(
          ['Destinatario', 'Finalidad', 'Datos', 'País'],
          [
            ...processors,
            ['Mercado Pago', 'Procesar el pago de tu plan y prevenir fraude', 'Datos de pago, correo y, en Yape, tu celular', 'Perú y otros países'],
            ['ReclamoFácil', 'Gestionar nuestro Libro de Reclamaciones', 'Los datos que ingreses en tu reclamo', 'Perú'],
            ['SUNAT y autoridades', 'Cumplir obligaciones tributarias y legales', 'Datos del comprobante o lo que la ley exija', 'Perú'],
          ],
        ),
        p('Algunos proveedores procesan los datos fuera del Perú. Lo hacemos porque es necesario para ejecutar el contrato contigo y elegimos proveedores con medidas de seguridad reconocidas. No vendemos ni alquilamos datos.'),
        p('Usamos OpenAI a través de su servicio para empresas. Según sus condiciones vigentes para ese servicio, los datos que recibe no se usan para entrenar sus modelos. Nosotros tampoco usamos tus conversaciones para entrenar modelos propios.'),
      ],
    },
    {
      id: 'conservacion',
      title: 'Conservación',
      blocks: [
        table(
          ['Datos', 'Plazo'],
          [
            ['Cuenta, negocio e integraciones', `Mientras tu cuenta exista y hasta ${RETENTION_DAYS} días después de que pidas cerrarla o de que venza tu plan sin renovarlo`],
            ['Pagos y comprobantes', 'Hasta que prescriban las obligaciones tributarias y legales'],
            ['Reclamos y quejas', 'Al menos 2 años desde su registro'],
            ['Sesión iniciada en tu navegador', 'Hasta que cierres sesión o pasen 30 días sin usar la consola'],
            ['Registro de intentos para limitar abusos', 'Unos minutos'],
          ],
        ),
      ],
    },
    {
      id: 'seguridad',
      title: 'Seguridad',
      blocks: [
        p('La plataforma funciona con conexión cifrada (HTTPS). Las contraseñas y los tokens de sesión se guardan de forma irreversible, y las credenciales de Mercado Pago de cada negocio se guardan cifradas. Los datos de cada negocio están aislados de los demás. Nuestro personal accede a la información solo cuando lo necesita para dar soporte o proteger la plataforma, con permisos según su función y un registro de sus acciones.'),
      ],
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
      blocks: [p(`${brand} está dirigido a negocios y a personas mayores de 18 años. No recopilamos a sabiendas datos de menores de edad en nuestras cuentas.`)],
    },
    {
      id: 'cookies',
      title: 'Cookies',
      blocks: [p('Lee la ', cookiesLink, ' para saber qué guardamos en tu navegador.')],
    },
    {
      id: 'incidentes',
      title: 'Incidentes de seguridad',
      blocks: [p('Si ocurriera un incidente que afecte datos personales, lo comunicaremos a la Autoridad Nacional de Protección de Datos Personales y a las personas afectadas, conforme al Reglamento.')],
    },
    {
      id: 'cambios',
      title: 'Cambios a esta política',
      blocks: [p('Publicaremos aquí cualquier cambio y te avisaremos si es relevante. Si añadimos nuevas finalidades que requieran consentimiento, te lo pediremos antes de aplicarlas.')],
    },
  ],
};

const cookies: LegalDoc = {
  slug: 'politica-de-cookies',
  title: 'Política de Cookies',
  description: `Qué guarda ${brand} en tu navegador.`,
  summary: [
    ['No usamos cookies de analítica ni de publicidad.'],
    ['Solo guardamos lo necesario para mantener tu sesión, proteger los formularios y procesar pagos.'],
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
            ['vendedoria.accessToken', 'Propia, necesaria (localStorage)', 'Mantener tu sesión iniciada en la consola', 'Hasta que cierres sesión; vence a los 15 minutos y se renueva sola'],
            ['vendedoria.refreshToken', 'Propia, necesaria (localStorage)', 'Renovar tu sesión sin pedirte la contraseña otra vez', 'Hasta que cierres sesión o pasen 30 días sin usar la consola'],
            ['Cloudflare Turnstile', 'De terceros, necesaria', 'Verificar que no eres un bot en el registro, el inicio de sesión y las invitaciones', 'Según la política de Cloudflare'],
            ['Cookies de Mercado Pago', 'De terceros, necesarias', 'Procesar el pago de tu plan y prevenir fraude; se cargan solo al pagar', 'Según la política de Mercado Pago'],
          ],
        ),
        p('Cuando abres el editor o la vista previa de tu tienda, esta se carga con sus propias cookies necesarias, descritas en la política de cookies de cada tienda.'),
      ],
    },
    {
      id: 'sin-analitica',
      title: 'Analítica y publicidad',
      blocks: [
        p(`Hoy ${brand} no usa herramientas de analítica, píxeles publicitarios ni cookies de seguimiento en su sitio ni en la consola. Si las incorporamos, te mostraremos un aviso para aceptarlas o rechazarlas con la misma facilidad antes de activarlas.`),
        p('Si activas Google Analytics o el píxel de Meta en tu tienda, esas herramientas se cargan solo en tu tienda y solo después de que el comprador las acepta en el aviso de cookies de la tienda.'),
      ],
    },
    {
      id: 'gestion',
      title: 'Cómo gestionarlas',
      blocks: [p('Puedes borrar o bloquear estos datos desde la configuración de tu navegador. Si bloqueas los necesarios, no podrás iniciar sesión, registrarte ni pagar tu plan.')],
    },
  ],
};

const dataProcessing: LegalDoc = {
  slug: 'tratamiento-de-datos',
  title: 'Acuerdo de Tratamiento de Datos',
  description: `Cómo ${brand} trata, por cuenta de cada negocio, los datos de sus compradores.`,
  summary: [
    ['Tú eres el titular de los datos de tus compradores; nosotros somos el encargado que los trata por tu cuenta.'],
    ['Usamos esos datos solo para prestarte el servicio según tu configuración. No los vendemos ni los usamos para nuestros propios fines.'],
    ['Te avisamos si ocurre un incidente y te ayudamos a atender las solicitudes de tus compradores.'],
    [`Al terminar el servicio, eliminamos los datos dentro de los ${RETENTION_DAYS} días, salvo obligación legal.`],
  ],
  sections: [
    {
      id: 'partes',
      title: 'Partes y objeto',
      blocks: [
        p(`Este acuerdo forma parte de los `, termsLink, ` y se celebra entre el Negocio, como titular del banco de datos de sus compradores, y ${owner}, como encargado del tratamiento, conforme a la Ley N.° 29733 y su Reglamento.`),
      ],
    },
    {
      id: 'datos',
      title: 'Datos y finalidades',
      blocks: [
        table(
          ['Datos', 'Para qué los tratamos'],
          [
            ['Nombre, número de WhatsApp o usuario de Instagram y contenido de las conversaciones', 'Que el vendedor IA y tu equipo respondan, y mostrarte el historial en tu bandeja'],
            ['Correo, celular, documento de identidad y dirección de entrega', 'Registrar y entregar pedidos y enviar sus confirmaciones'],
            ['Productos, montos, cupones y estado del pago', 'Gestionar pedidos, cobros y métricas de tu negocio'],
          ],
        ),
      ],
    },
    {
      id: 'instrucciones',
      title: 'Instrucciones del Negocio',
      blocks: [
        p('Tratamos estos datos solo para prestarte el servicio, según la configuración que haces en la plataforma, que constituye tus instrucciones, y según la ley. No los usamos para nuestros propios fines, no los vendemos ni los compartimos con terceros distintos de los subencargados indicados, y no los usamos para entrenar modelos de inteligencia artificial.'),
      ],
    },
    {
      id: 'confidencialidad',
      title: 'Confidencialidad y acceso',
      blocks: [
        p('Las personas de nuestro equipo que pueden acceder a estos datos están obligadas a guardar confidencialidad. Acceden solo cuando es necesario para darte soporte, investigar un problema o proteger la plataforma, con permisos según su función y un registro de sus acciones.'),
      ],
    },
    {
      id: 'seguridad',
      title: 'Seguridad',
      blocks: [
        p('Aplicamos medidas técnicas y organizativas proporcionales al riesgo: conexión cifrada, aislamiento de los datos de cada negocio, credenciales de pago cifradas, control de acceso por roles, límites contra abusos y registros de seguridad sin datos personales.'),
      ],
    },
    {
      id: 'subencargados',
      title: 'Subencargados',
      blocks: [
        p('Nos autorizas a apoyarnos en los siguientes proveedores. Si incorporamos otro, actualizaremos esta lista y te avisaremos.'),
        table(['Proveedor', 'Finalidad', 'Datos', 'País'], processors),
        p('Meta y Mercado Pago también prestan servicios directamente al Negocio, con las cuentas que este conecta, y tratan los datos según sus propias condiciones.'),
      ],
    },
    {
      id: 'transferencias',
      title: 'Transferencias internacionales',
      blocks: [p('Algunos subencargados tratan los datos fuera del Perú, como se indica arriba. Esas transferencias son necesarias para prestar el servicio que contratas, y las informamos para que puedas reflejarlas en la política de privacidad de tu negocio.')],
    },
    {
      id: 'asistencia',
      title: 'Asistencia al Negocio',
      blocks: [
        p('Si un comprador te pide acceder, rectificar o eliminar sus datos, te ayudaremos a ubicarlos y a atender la solicitud. Si nos escribe directamente, le indicaremos que se dirija a ti y te avisaremos.'),
      ],
    },
    {
      id: 'incidentes',
      title: 'Incidentes de seguridad',
      blocks: [p('Si confirmamos un incidente que afecte los datos de tus compradores, te avisaremos sin demora indebida y, en lo posible, dentro de las 24 horas, con la información que tengamos para que puedas cumplir tus obligaciones frente a la Autoridad y a los afectados.')],
    },
    {
      id: 'obligaciones',
      title: 'Obligaciones del Negocio',
      blocks: [
        ul(
          'Informar a tus compradores cómo tratas sus datos, por ejemplo con la política de privacidad de tu tienda, e indicar a los subencargados como destinatarios.',
          'Contar con una base legal para cada tratamiento y pedir consentimiento cuando la ley lo exija, como para enviar publicidad.',
          'Inscribir tu banco de datos en el Registro Nacional de Protección de Datos Personales cuando corresponda.',
          'No pedir ni configurar el vendedor IA para pedir datos sensibles, salvo que la ley te lo permita y sea indispensable.',
        ),
      ],
    },
    {
      id: 'fin',
      title: 'Fin del encargo',
      blocks: [
        p(`Al cerrar tu cuenta o vencer tu plan sin renovarlo, conservamos los datos durante ${RETENTION_DAYS} días para que puedas pedirnos una copia. Luego los eliminamos o anonimizamos, salvo lo que la ley nos obligue a conservar.`),
      ],
    },
  ],
};

const acceptableUse: LegalDoc = {
  slug: 'uso-aceptable',
  title: 'Política de Uso Aceptable',
  description: `Qué no está permitido vender ni hacer con ${brand}.`,
  summary: [
    ['Vende solo productos y servicios legales, con los permisos que exija su sector.'],
    ['No envíes mensajes no solicitados ni engañes a tus compradores.'],
    ['No intentes vulnerar la plataforma ni saltarte los límites de tu plan.'],
    ['Si incumples, podemos retirar contenido o suspender el servicio.'],
  ],
  sections: [
    {
      id: 'productos',
      title: 'Productos y servicios prohibidos',
      blocks: [
        p('No puedes usar la plataforma para ofrecer:'),
        ul(
          'Productos o servicios ilegales, drogas, armas, municiones o explosivos.',
          'Productos falsificados o que infrinjan marcas o derechos de autor.',
          'Medicamentos, alimentos, suplementos, cosméticos u otros productos regulados sin el registro, la notificación o la autorización sanitaria que exija la ley.',
          'Bebidas alcohólicas o tabaco a menores de edad, o sin las licencias exigidas.',
          'Contenido sexual explícito, animales o especies protegidas, documentos falsos o bases de datos personales.',
          'Juegos de azar, esquemas piramidales o servicios financieros sin autorización.',
          'Lo que prohíban las políticas de comercio de Meta para WhatsApp e Instagram.',
        ),
      ],
    },
    {
      id: 'mensajes',
      title: 'Mensajes y trato con compradores',
      blocks: [
        ul(
          'No envíes mensajes masivos o publicidad a personas que no te lo autorizaron.',
          'No te hagas pasar por otra persona o empresa, ni configures el vendedor IA para negar que es un asistente automático cuando se lo pregunten.',
          'No uses publicidad engañosa, precios de referencia falsos ni promociones que no piensas cumplir.',
          'No publiques contenido difamatorio, discriminatorio, violento o que incite al odio.',
          'No pidas claves, códigos de verificación ni datos completos de tarjetas por chat.',
        ),
      ],
    },
    {
      id: 'plataforma',
      title: 'Uso de la plataforma',
      blocks: [
        ul(
          'No intentes acceder a cuentas o datos de otros negocios, ni probar o vulnerar la seguridad sin nuestra autorización escrita.',
          'No copies la plataforma de forma automatizada, no la descompiles ni la sobrecargues.',
          'No crees varias cuentas para repetir la prueba gratis ni para saltarte los límites de tu plan.',
          'No revendas ni compartas el acceso fuera de tu equipo.',
        ),
      ],
    },
    {
      id: 'consecuencias',
      title: 'Consecuencias',
      blocks: [
        p('Si detectamos un incumplimiento, podemos retirar el contenido, pausar el vendedor IA o la tienda, o suspender la cuenta, como se explica en los ', termsLink, '. Si la ley lo exige, colaboraremos con las autoridades.'),
      ],
    },
    {
      id: 'reportes',
      title: 'Reportar un abuso',
      blocks: [p(`Si ves un uso indebido de ${brand}, escríbenos a `, email, ' con el enlace o el detalle del caso.')],
    },
  ],
};

export const LEGAL_DOCS: LegalDoc[] = [terms, billing, privacy, cookies, dataProcessing, acceptableUse];
