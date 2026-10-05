// Read-only staging benchmark; pass a store origin and one published product handle.
const [origin, handle] = process.argv.slice(2);
if (!origin || !handle) throw new Error('Usage: node scripts/benchmark-recommendations.mjs STORE_ORIGIN PRODUCT_HANDLE');
const target = new URL('/_api/recommendations', origin);
target.searchParams.set('handles', handle);
target.searchParams.set('context', 'cart');
const values = [];
for (let i = 0; i < 30; i++) {
  const start = performance.now();
  const response = await fetch(target, { signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error(`Benchmark HTTP ${response.status}`);
  await response.arrayBuffer();
  if (i >= 5) values.push(performance.now() - start);
}
values.sort((a, b) => a - b);
const p50 = values[Math.floor(values.length * 0.5)];
const p95 = values[Math.floor(values.length * 0.95)];
console.log(JSON.stringify({ requests: values.length, warmEndToEndP50Ms: +p50.toFixed(1), warmEndToEndP95Ms: +p95.toFixed(1), targetP95Ms: 50 }));
process.exitCode = p95 < 50 ? 0 : 1;
