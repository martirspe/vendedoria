const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const db = new PrismaClient();
const slug = 'catalog-qa-20261004';
const email = 'catalog-qa-20261004@example.invalid';
async function main() {
  if (process.argv[2] === 'clean') {
    await db.tenant.deleteMany({ where: { slug, name: 'Catalog QA fixture' } });
    await db.user.deleteMany({ where: { email, fullName: 'Catalog QA fixture' } });
    return;
  }
  if (await db.tenant.findUnique({ where: { slug } })) throw new Error('Fixture already exists');
  const tenant = await db.tenant.create({ data: { slug, name: 'Catalog QA fixture', planTier: 'ENTERPRISE', planTrial: false, planExpiresAt: null,
    integrations: { create: { key: 'store', enabled: true } },
    storefront: { create: { status: 'PUBLISHED', displayName: 'Colección de prueba', industry: 'belleza', template: 'selecta', deliveryEnabled: false,
      sellerType: 'INDIVIDUAL', legalName: 'Tienda de prueba', legalDistrict: 'Lima', complaintsBookUrl: 'https://example.com/reclamos' } } } });
  await db.user.create({ data: { email, fullName: 'Catalog QA fixture', passwordHash: await bcrypt.hash('CatalogQA-2026-local!', 10),
    memberships: { create: { tenantId: tenant.id, role: 'OWNER' } } } });
  await db.product.createMany({ data: Array.from({ length: 51 }, (_, i) => ({ tenantId: tenant.id, handle: `ficha-${i + 1}`,
    name: i === 50 ? 'Curso de fotografía digital' : `Producto de prueba ${i + 1}`, sortOrder: i, basePriceCents: 9900,
    descriptionShort: 'Información completa para elegir con confianza.', descriptionFull: 'Contenido detallado de la ficha de prueba.',
    isPublishedOnStore: true, stockUnlimited: true, categories: ['Fotografía'], kind: i === 50 ? 'DIGITAL' : 'PRODUCT',
    digitalAccessUrl: i === 50 ? 'https://example.com/curso-privado' : null,
    details: { useCases: ['Fotografía de productos para tu tienda'], exclusions: ['No incluye cámara'], compatibility: ['Navegador actualizado'],
      contents: ['Videos y ejercicios'], digitalFormat: 'Video y PDF', license: 'Uso personal', accessDuration: '12 meses',
      requirements: ['Conexión a Internet'], attributes: [{ name: 'Idioma', value: 'Español' }], returns: 'Consultar condiciones antes de comprar' }
  })) });
  console.log('Local fixture ready: catalog-qa-20261004.localhost:4300 and localhost:4201');
}
main().finally(() => db.$disconnect());
