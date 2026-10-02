import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const target = 'apps/api/.env';
if (existsSync(target)) process.exit(0);

const secret = () => randomBytes(48).toString('base64url');
const generated = new Set(['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET', 'META_VERIFY_TOKEN']);
const lines = readFileSync('.env.example', 'utf8')
  .split(/\r?\n/)
  .map((line) => {
    const key = line.split('=')[0];
    return generated.has(key) ? `${key}=${secret()}` : line;
  });
writeFileSync(target, lines.join('\n'), { mode: 0o600 });
console.log(`Creado ${target} con secretos aleatorios para desarrollo.`);
