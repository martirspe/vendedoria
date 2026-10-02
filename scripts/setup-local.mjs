import { randomBytes } from 'node:crypto';
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';

const target = 'apps/api/.env';
const generators = {
  JWT_ACCESS_SECRET: () => randomBytes(48).toString('base64url'),
  JWT_REFRESH_SECRET: () => randomBytes(48).toString('base64url'),
  META_VERIFY_TOKEN: () => randomBytes(48).toString('base64url'),
  PAYMENT_CREDENTIALS_KEY: () => randomBytes(32).toString('hex'),
};

if (!existsSync(target)) {
  const lines = readFileSync('.env.example', 'utf8')
    .split(/\r?\n/)
    .map((line) => {
      const key = line.split('=')[0];
      return generators[key] ? `${key}=${generators[key]()}` : line;
    });
  writeFileSync(target, lines.join('\n'), { mode: 0o600 });
  console.log(`Creado ${target} con secretos aleatorios para desarrollo.`);
}

// Secrets added after the file was created are appended, never overwritten.
const present = new Set(
  readFileSync(target, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.split('=')[0].trim())
    .filter(Boolean),
);
const missing = Object.keys(generators).filter((key) => !present.has(key));
if (missing.length) {
  appendFileSync(target, `\n${missing.map((key) => `${key}=${generators[key]()}`).join('\n')}\n`);
  console.log(`Añadido a ${target}: ${missing.join(', ')}.`);
}
