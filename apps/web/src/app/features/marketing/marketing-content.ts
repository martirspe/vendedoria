/** Prerendered commercial summary of apps/api/src/billing/plan-catalog.ts. */
export const MARKETING_PLANS = [
  {
    name: 'Inicia',
    price: 29,
    description: 'Tu primer vendedor IA para vender por chat.',
    highlights: [
      '50 chats nuevos al mes',
      'Hasta 25 productos',
      '1 usuario',
      'WhatsApp e Instagram',
    ],
    note: 'Venta por chat. No incluye tienda web.',
    featured: false,
  },
  {
    name: 'Crece',
    price: 79,
    description: 'Tu vendedor IA y tu tienda, trabajando juntos.',
    highlights: [
      '400 chats nuevos al mes',
      'Hasta 100 productos',
      'Tienda web y tu propio dominio',
      '5 cupones activos y 2 usuarios',
      '300 textos y 30 imágenes con IA al mes',
    ],
    note: 'Prueba 14 días con hasta 100 chats nuevos.',
    featured: true,
  },
  {
    name: 'Escala',
    price: 199,
    description: 'Más conversaciones, más catálogo y más equipo.',
    highlights: [
      '1 200 chats nuevos al mes',
      'Hasta 300 productos',
      'Todo lo de Crece, con más capacidad',
      '20 cupones activos y 5 usuarios',
      'Píxel de Meta y Google Analytics',
    ],
    note: 'Para negocios que invierten en anuncios.',
    featured: false,
  },
  {
    name: 'Lidera',
    price: 549,
    description: 'Capacidad para una operación de mayor volumen.',
    highlights: [
      '4 000 chats nuevos al mes',
      'Hasta 1 000 productos',
      'Todo lo de Escala, con más capacidad',
      'Cupones sin límite y 15 usuarios',
      'Soporte prioritario',
    ],
    note: 'Para catálogos y equipos grandes.',
    featured: false,
  },
] as const;

export const MARKETING_QUESTIONS = [
  {
    question: '¿Cómo funciona la prueba gratis?',
    answer:
      'Empiezas con 14 días del plan Crece, sin tarjeta. La prueba incluye hasta 100 chats nuevos, 100 textos y 10 imágenes con IA. Al terminar, eliges un plan para seguir usando el servicio. No se realiza un cobro automático.',
  },
  {
    question: '¿Necesito saber de tecnología?',
    answer:
      'Configuras tus canales, catálogo y vendedor desde la consola. Antes de activarlo, puedes probar sus respuestas en el chat de práctica. Para conectar WhatsApp e Instagram necesitas las cuentas y los permisos de Meta correspondientes.',
  },
  {
    question: '¿De dónde salen los precios y el stock?',
    answer:
      'Tu vendedor consulta la información de tu catálogo y las condiciones de envío que configuras. Puedes revisar sus respuestas en el chat de práctica antes de atender a tus clientes.',
  },
  {
    question: '¿Puedo responder personalmente?',
    answer:
      'Sí. Cuando escribes desde la consola, el vendedor IA se pausa en esa conversación. Tú continúas la atención y puedes reactivarlo cuando estés listo.',
  },
  {
    question: '¿Cómo recibo el pago de mis clientes?',
    answer:
      'Conecta tu cuenta de Mercado Pago para enviar enlaces de pago por chat y cobrar en tu tienda web. Los métodos disponibles dependen de tu cuenta y de Mercado Pago. El dinero se abona en tu cuenta; VendedorIA no cobra comisión por venta. Se aplican las tarifas de Mercado Pago.',
  },
  {
    question: '¿Qué cuenta como un chat nuevo?',
    answer:
      'Una conversación que se crea por primera vez con un cliente en un canal. Los mensajes posteriores de esa conversación no vuelven a contarse como chats nuevos. Puedes consultar tu consumo y sumar paquetes de chats desde la consola.',
  },
  {
    question: '¿Hay costos adicionales al plan?',
    answer:
      'El plan cubre el uso de VendedorIA según sus límites. Las tarifas de mensajería que aplique Meta, las comisiones de Mercado Pago y la compra de tu propio dominio se pagan por separado a cada proveedor.',
  },
] as const;
