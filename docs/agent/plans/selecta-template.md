# Selecta como plantilla de tienda + paridad funcional

Fuente: `catalogo-digital/catalogo` (Selecta). Falabella queda fuera. La plantilla Selecta se ofrece al rubro "Belleza y cuidado personal".

## Modelo de datos (migración `0009_store_templates`)
- `Storefront.industry` (`general` por defecto) y `Storefront.template` (`classic` | `selecta`). La API rechaza `selecta` fuera de `belleza`.
- `Storefront.templateCopy Json?`: textos de la plantilla (portada, banner, FAQ, aviso del pie). Sin valor, la tienda usa los textos de Selecta con el nombre del negocio.
- `Storefront.shippingOriginUbigeo` + `Storefront.carrierRates Json?` (`{ olva: number[5], shalom: number[5] }` en céntimos): tarifas por distancia (≤20, ≤100, ≤400, ≤900, >900 km o sin coordenadas) calculadas con haversine desde el ubigeo de origen, como Selecta.
- `Product.sku`, `Product.line`, `Product.details Json?` (`size`, `benefits`, `usage`, `notes`, `highlights`, `family`, `intensity`, `scent`, `montage`).
- `ProductMedia.alt`, `ProductMedia.caption`; `kind` acepta `image` | `related`.
- `ProductComponent(setId, componentId, quantity)`: un set descuenta las unidades de sus piezas; su stock es el mínimo de `floor(stock pieza / cantidad)`.
- `OrderItem.allocations Json?`: piezas descontadas al reservar (la devolución usa la foto, no la receta actual).
- `CouponScope.LINE` + `Coupon.applyToSets`.
- `Order.trackingCode`. Logística con los estados existentes: `SHIPPED` en recojo = "Listo para recoger"; `COMPLETED` = "Entregado". Enviar sin recojo exige código de seguimiento.

## API
- `GET storefront/:slug/catalog`: catálogo completo publicado (máx. 500) con detalles, piezas, stock bajo (`stockLeft` ≤ 20) y medios con alt/caption.
- `GET storefront/:slug/shipping-quote?ubigeo=`: cotización Olva/Shalom.
- Checkout: modos `OLVA`/`SHALOM` exigen ubigeo y `acknowledgeRate`.
- Consola: industria/plantilla/textos, tarifas por distancia, componentes de set, detalles de producto, subida de fotos (imagen redimensionada en el navegador, base64 < 1 MB), inventario por SKU, conciliar pago con referencia `ORD…`, vista previa del correo, código de seguimiento.

## Tienda (`apps/store`)
- Rutas raíz con `canMatch` por plantilla: `templates/selecta/*` (shell, portada, ficha, bolsa, checkout, pedido, legal) o la plantilla clásica actual.
- Estilos de Selecta copiados tal cual en `templates/selecta/selecta.scss`, anidados bajo `body.tpl-selecta`. Los estilos de elementos de la tienda clásica pasan a `@layer store-base` para no ganarle a las capas de Selecta.
- Lógica de pago reutilizada: la plantilla Selecta extiende las clases de checkout/pedido existentes. Diferencia aceptada: el pago (Yape/tarjeta) se completa en `/pedido/:id` con el mismo diseño de Selecta.
- Ofertas (`templates/selecta/offers.ts`): sets que incluyen la pieza, piezas del set, complementos (bolsa y order bump), escasez, `?cupon=` guardado en `sessionStorage`.

## Orden
1. Migración + contrato + mapper/catálogo + stock por piezas + cupones LINE.
2. Envíos por distancia + logística + endpoints de consola.
3. Consola (tienda, productos, inventario, pedidos).
4. Plantilla Selecta en la tienda.
5. Pruebas, builds, verificación en navegador, CHANGELOG, commits.
