import { test } from "node:test";
import assert from "node:assert/strict";
import { templateDemoFromPath } from "../src/app/core/template-demo-path.ts";
import {
  demoProducts,
  demoResponse,
  demoStore,
} from "../src/app/demos/template-demo-data.ts";
import type { PublicProductList } from "@vendedoria/contracts";

test("only exact shipped demo namespaces are accepted", () => {
  assert.equal(
    templateDemoFromPath("/_templates/selecta/productos"),
    "selecta",
  );
  for (const path of [
    "/productos",
    "/_templates/selecta-other/",
    "/_templates/unknown/",
    "/_templates/%73electa/",
    "/_templates/../selecta/",
  ]) {
    assert.equal(templateDemoFromPath(path), null);
  }
});

test("each demo has example-only identity, local photos and no payment/tracking credentials", () => {
  for (const template of ["classic", "selecta", "stride"] as const) {
    const store = demoStore(template);
    assert.equal(store.template, template);
    assert.equal(store.isPreview, false); // No private merchant draft/preview token is involved.
    assert.equal(store.checkout.publicKey, null);
    assert.equal(store.checkout.simulator, false);
    assert.equal(store.tracking, null);
    assert.equal(store.whatsappPhone, null);
    assert.equal(store.contactEmail, null);
    assert.ok(
      demoProducts(template).every((p) =>
        p.imageUrl?.startsWith("/template-demos/media/"),
      ),
    );
    assert.equal(store.templateContent.theme, undefined);
  }
});

test("unknown products and order/payment paths cannot access tenant records", () => {
  for (const path of [
    "/products/merchant-product",
    "/catalog/merchant-product",
    "/orders/abc",
    "/checkout",
    "/behavior",
  ]) {
    assert.equal(demoResponse("classic", path), null);
  }
});

test("catalog selection, pagination and price order reflect the example collection", () => {
  const result = demoResponse(
    "stride",
    "/products",
    new URLSearchParams("sort=price-asc&pageSize=2&page=2"),
  ) as PublicProductList;
  assert.equal(result.total, 4);
  assert.equal(result.items.length, 2);
  assert.deepEqual(
    result.items.map((p) => p.priceCents),
    [13900, 14900],
  );
  assert.equal(
    result.facets.categories.find((c) => c.value === "Prendas")?.count,
    2,
  );
});

test("variant and attribute filters combine and do not mutate the original demo catalog", () => {
  const query = new URLSearchParams({
    filters: JSON.stringify([
      { key: "variant:Talla", values: ["M"] },
      { key: "attribute:Color", values: ["Marfil"] },
    ]),
  });
  const result = demoResponse(
    "stride",
    "/products",
    query,
  ) as PublicProductList;
  assert.deepEqual(
    result.items.map((p) => p.handle),
    ["camisa-algodon"],
  );
  assert.equal(demoProducts("stride").length, 4);
});

test("hierarchical categories and empty search use real example counts", () => {
  const categorized = demoResponse(
    "selecta",
    "/products",
    new URLSearchParams("category=Fragancias"),
  ) as PublicProductList;
  assert.equal(categorized.total, 3);
  assert.equal(
    categorized.facets.categories.find((c) => c.value === "Fragancias")?.count,
    3,
  );
  const empty = demoResponse(
    "selecta",
    "/products",
    new URLSearchParams("q=zzzzzz"),
  ) as PublicProductList;
  assert.equal(empty.total, 0);
  assert.deepEqual(empty.items, []);
});
