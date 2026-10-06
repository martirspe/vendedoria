import type {
  PublicCatalogCard,
  PublicCatalogFacets,
  PublicCatalogSelection,
  PublicProductDetails,
  PublicProductList,
  StoreCatalogProduct,
  StorefrontView,
  StoreTemplate,
} from "@vendedoria/contracts";
import { getTheme } from '@vendedoria/themes/catalog';

const media = (file: string) => `/template-demos/media/${file}.webp`;
const DETAILS: PublicProductDetails = {
  useCases: [],
  exclusions: [],
  compatibility: [],
  returns: null,
  digitalFormat: null,
  license: null,
  accessDuration: null,
  size: null,
  benefits: [],
  usage: [],
  notes: [],
  highlights: [],
  family: null,
  intensity: null,
  scent: [],
  montage: false,
  attributes: [],
  audience: null,
  contents: [],
  warranty: null,
  faqs: [],
  requirements: [],
  coverage: null,
  cancellation: null,
};

function product(
  handle: string,
  name: string,
  category: string,
  price: number,
  file: string,
  details: Partial<PublicProductDetails> = {},
  options: string[] = [],
  secondary?: string,
): StoreCatalogProduct {
  const variants = options.map((value) => ({
    id: `${handle}-${value}`,
    label: value,
    options: [{ name: "Talla", value }],
    priceCents: price,
    isAvailable: true,
    imageUrl: null,
  }));
  return {
    handle,
    name,
    descriptionShort: details.benefits?.[0] ?? null,
    descriptionFull: details.benefits?.join(". ") ?? null,
    brand: null,
    categories: [category],
    currency: "PEN",
    priceCents: price,
    priceVaries: false,
    compareAtPriceCents: null,
    imageUrl: media(file),
    isAvailable: true,
    hasVariants: !!variants.length,
    kind: "PRODUCT",
    service: null,
    line: null,
    lineKey: null,
    format: handle.startsWith('set-') ? 'set' : 'individual',
    stockLeft: null,
    media: [file, ...(secondary ? [secondary] : [])].map((image) => ({
      url: media(image),
      alt: name,
      caption: null,
      kind: "image" as const,
    })),
    variants,
    details: { ...DETAILS, ...details },
    includes: [],
    seoTitle: null,
    seoDescription: null,
  };
}

export function demoProducts(template: StoreTemplate): StoreCatalogProduct[] {
  const renderer = getTheme(template)?.renderer.split('@')[0] ?? 'classic';
  const beauty = [
    product(
      "set-icono",
      "Set Ícono: perfume y loción",
      "Fragancias > Sets",
      15900,
      "icono-set",
      {
        benefits: ["Un ritual para regalar o disfrutar"],
        contents: ["Perfume", "Loción corporal"],
        size: "Set de 2 piezas",
        family: "Floral",
      },
      [],
      "icono-ritual",
    ),
    product(
      "perfume-icono",
      "Ícono Eau de Parfum",
      "Fragancias > Perfumes",
      9900,
      "icono-perfume",
      {
        benefits: ["Una fragancia con personalidad"],
        size: "50 ml",
        family: "Floral",
        usage: ["Aplica sobre la piel, en las zonas de pulsación."],
      },
      [],
      "icono-manos",
    ),
    product(
      "locion-icono",
      "Loción corporal Ícono",
      "Cuidado personal > Cuerpo",
      5900,
      "icono-locion",
      {
        benefits: ["Completa tu ritual de cuidado"],
        size: "200 ml",
        attributes: [{ name: "Formato", value: "Loción" }],
      },
      [],
      "icono-locion-manos",
    ),
    product(
      "set-osadia",
      "Set Osadía Infinita",
      "Fragancias > Sets",
      17900,
      "osadia-set",
      {
        benefits: ["Un detalle para alguien especial"],
        size: "Set de 2 piezas",
      },
      [],
      "osadia-ritual",
    ),
  ];
  const fashion = [
    product(
      "camisa-algodon",
      "Camisa de algodón",
      "Prendas",
      11900,
      "fashion-hero",
      {
        benefits: ["Una pieza versátil para cada día"],
        attributes: [
          { name: "Material", value: "Algodón" },
          { name: "Color", value: "Marfil" },
        ],
      },
      ["S", "M", "L"],
    ),
    product(
      "zapatillas-lona",
      "Zapatillas de lona",
      "Calzado",
      14900,
      "sneakers",
      {
        benefits: ["Líneas sencillas para combinar a tu manera"],
        attributes: [
          { name: "Material", value: "Lona" },
          { name: "Color", value: "Blanco" },
        ],
      },
      ["37", "38", "39", "40"],
    ),
    product("bolso-lona", "Bolso de lona", "Accesorios", 6900, "tote", {
      benefits: ["Lleva lo esencial contigo"],
      attributes: [
        { name: "Material", value: "Algodón" },
        { name: "Color", value: "Natural" },
      ],
    }),
    product(
      "pantalon-recto",
      "Pantalón de corte recto",
      "Prendas",
      13900,
      "fashion-hero",
      {
        benefits: ["Una silueta cómoda para tus planes"],
        attributes: [{ name: "Color", value: "Negro" }],
      },
      ["S", "M", "L"],
    ),
  ];
  return renderer === "selecta"
    ? beauty
    : renderer === "stride"
      ? fashion
      : [fashion[2], beauty[1], fashion[1], beauty[2]];
}

export function demoStore(template: StoreTemplate): StorefrontView {
  const manifest = getTheme(template)!;
  const renderer = manifest.renderer.split('@')[0] as 'classic' | 'selecta' | 'stride';
  const products = demoProducts(template);
  const hero =
    renderer === "stride"
      ? "fashion-hero"
      : renderer === "selecta"
        ? "icono-ritual"
        : "tote";
  return {
    slug: `template-demo-${template}`,
    displayName:
      template === "classic" ? "Casa Clara" : manifest.displayName,
    tagline: "Una selección para tus momentos favoritos.",
    logoUrl: null,
    heroImageUrl: media(hero),
    brandColor:
      renderer === "stride"
        ? "#c8ff31"
        : renderer === "selecta"
          ? "#4a1429"
          : "#2f3b38",
    accentColor: renderer === "stride" ? "#171717" : "#c9a779",
    whatsappPhone: null,
    contactEmail: null,
    seoTitle: null,
    seoDescription: null,
    country: "PE",
    currency: "PEN",
    categories: [...new Set(products.flatMap((p) => p.categories))],
    kinds: ["PRODUCT"],
    status: "PUBLISHED",
    isPreview: false,
    showPlatformBadge: false,
    shipping: {
      options: [
        {
          mode: "PICKUP",
          label: "Recojo en tienda",
          cents: 0,
          eta: "Punto de recojo de ejemplo",
          byDistance: false,
        },
      ],
      freeShippingFromCents: null,
      origin: null,
    },
    legal: {
      sellerType: "INDIVIDUAL",
      legalName: null,
      ruc: null,
      legalAddress: null,
      complaintsBookUrl: null,
      dataBankCode: null,
      exchangeDays: 0,
      updatedAt: "2026-10-05T00:00:00.000Z",
    },
    checkout: {
      mode: "online",
      publicKey: null,
      liveMode: false,
      simulator: false,
      couponsEnabled: false,
      turnstileSiteKey: null,
    },
    industry:
      renderer === "stride"
        ? "moda"
        : renderer === "selecta"
          ? "belleza"
          : "general",
    template,
    themeRelease: {
      id: manifest.id, slug: manifest.slug, version: manifest.version, renderer, tokens: manifest.tokens,
      defaultLayout: manifest.presets[0].layout, safeMode: false,
    },
    templateContent: {
      version: 1,
      sections: {
        hero: { image: media(hero) },
        ...(renderer === "selecta"
          ? { banner: { image: media("osadia-ritual") } }
          : {}),
        ...(renderer === "stride"
          ? {
              editorial: { image1: media("tote"), image2: media("sneakers") },
              stories: { image1: media("fashion-hero"), image2: media("tote") },
            }
          : {}),
      },
    },
    tracking: null,
  };
}

function facets(products: StoreCatalogProduct[]): PublicCatalogFacets {
  const values = new Map<string, Map<string, number>>();
  const add = (key: string, entries: string[]) => {
    const counts = values.get(key) ?? new Map<string, number>();
    for (const value of new Set(entries))
      counts.set(value, (counts.get(value) ?? 0) + 1);
    values.set(key, counts);
  };
  for (const p of products) {
    add(
      "category",
      p.categories.flatMap((category) => {
        const parts = category.split(" > ");
        return parts.map((_, i) => parts.slice(0, i + 1).join(" > "));
      }),
    );
    if (p.brand) add("brand", [p.brand]);
    add("benefit", p.details.benefits);
    for (const name of new Set(
      p.variants.flatMap((v) => v.options.map((o) => o.name)),
    ))
      add(
        `variant:${name}`,
        p.variants.flatMap((v) =>
          v.options.filter((o) => o.name === name).map((o) => o.value),
        ),
      );
    for (const name of new Set(p.details.attributes.map((a) => a.name)))
      add(
        `attribute:${name}`,
        p.details.attributes.filter((a) => a.name === name).map((a) => a.value),
      );
  }
  const mapped = (entries: Map<string, number>) =>
    [...entries].map(([value, count]) => ({ value, count }));
  return {
    categories: mapped(values.get("category") ?? new Map()),
    groups: [...values]
      .filter(([key]) => key !== "category")
      .map(([key, entries]) => ({
        key,
        label:
          key === "brand"
            ? "Marca"
            : key === "benefit"
              ? "Beneficio"
              : key.split(":").slice(1).join(":"),
        values: mapped(entries),
      })),
    price: products.length
      ? {
          currency: "PEN",
          minCents: Math.min(...products.map((p) => p.priceCents)),
          maxCents: Math.max(...products.map((p) => p.priceCents)),
        }
      : null,
  };
}

function card(p: StoreCatalogProduct): PublicCatalogCard {
  return {
    ...p,
    secondaryImageUrl: p.media[1]?.url ?? null,
    benefit: p.details.benefits[0] ?? null,
  };
}

function listProducts(
  products: StoreCatalogProduct[],
  query: URLSearchParams,
): PublicProductList {
  const q = (query.get("q") ?? "").toLocaleLowerCase("es");
  const base = products.filter(
    (p) =>
      (!query.get("kind") || query.get("kind") === p.kind) &&
      (!q ||
        `${p.name} ${p.descriptionShort ?? ""}`
          .toLocaleLowerCase("es")
          .includes(q)),
  );
  let filters: PublicCatalogSelection[] = [];
  try {
    filters = JSON.parse(
      query.get("filters") ?? "[]",
    ) as PublicCatalogSelection[];
  } catch {
    /* A malformed demo link falls back to the collection. */
  }
  if (!Array.isArray(filters)) filters = [];
  const valid = filters
    .filter((f) => f && typeof f.key === "string" && Array.isArray(f.values))
    .slice(0, 20);
  const category = query.get("category");
  const items = base.filter(
    (p) =>
      (!category ||
        p.categories.some(
          (c) => c === category || c.startsWith(category + " > "),
        )) &&
      (!query.has("minPriceCents") ||
        p.priceCents >= Number(query.get("minPriceCents"))) &&
      (!query.has("maxPriceCents") ||
        p.priceCents <= Number(query.get("maxPriceCents"))) &&
      valid
        .filter((f) => !f.key.startsWith("variant:"))
        .every((f) => {
          const values =
            f.key === "brand"
              ? [p.brand]
              : f.key === "benefit"
                ? p.details.benefits
                : p.details.attributes
                    .filter((a) => a.name === f.key.slice(10))
                    .map((a) => a.value);
          return values.some((v) => f.values.includes(v ?? ""));
        }) &&
      (!valid.some((f) => f.key.startsWith("variant:")) ||
        p.variants.some((v) =>
          valid
            .filter((f) => f.key.startsWith("variant:"))
            .every((f) =>
              v.options.some(
                (o) => o.name === f.key.slice(8) && f.values.includes(o.value),
              ),
            ),
        )),
  );
  if (query.get("sort") === "price-asc")
    items.sort((a, b) => a.priceCents - b.priceCents);
  if (query.get("sort") === "price-desc")
    items.sort((a, b) => b.priceCents - a.priceCents);
  if (query.get("sort") === "newest") items.reverse();
  const pageSize = Math.min(
    48,
    Math.max(1, Number(query.get("pageSize")) || 24),
  );
  const page = Math.min(500, Math.max(1, Number(query.get("page")) || 1));
  return {
    items: items.slice((page - 1) * pageSize, page * pageSize).map(card),
    total: items.length,
    page,
    pageSize,
    facets: facets(base),
  };
}

/** Read-only fixtures; unknown paths never fall through to merchant data. */
export function demoResponse(
  template: StoreTemplate,
  path: string,
  query = new URLSearchParams(),
): unknown | null {
  const products = demoProducts(template);
  if (!path || path === "/") return demoStore(template);
  if (path === "/products") return listProducts(products, query);
  if (path === "/catalog") return products;
  if (path.startsWith("/catalog/") || path.startsWith("/products/")) {
    const p = products.find(
      (p) => p.handle === decodeURIComponent(path.split("/")[2] ?? ""),
    );
    if (!p) return null;
    return path.startsWith("/catalog/")
      ? p
      : {
          ...p,
          media: p.media.map((m) => m.url),
          related: products.filter((other) => other !== p).slice(0, 3),
        };
  }
  if (path === "/recommendations") return { items: [] };
  if (path === "/recovery/options")
    return { email: false, whatsapp: false, consentVersion: "demo" };
  if (path === "/ubigeos") return [];
  if (path === "/shipping-quote") return [];
  return null;
}
