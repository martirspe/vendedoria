import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const mode = process.argv[2] || 'dev';
const local = join(process.env.LOCALAPPDATA || '', 'Programs', 'DockerDesktop', 'resources', 'bin', 'docker.exe');
const docker = process.platform === 'win32' && existsSync(local) ? local : 'docker';
const dev = ['compose', '-f', 'docker-compose.dev.yml'];
// Stack anterior: la base `db` del proyecto `vendedoria`. El stack de producción
// también se llama `vendedoria`, pero su base es el servicio `postgres`.
const legacy = { project: 'vendedoria', service: 'db' };
const keepVolumes = new Set(['vendedoria_vendedoria_pg', 'vendedoria_pgdata']);

function run(args, { exit = true } = {}) {
  const result = spawnSync(docker, args, { stdio: 'inherit' });
  if (result.error) throw new Error('No se pudo ejecutar Docker Desktop. Revisa su instalación.');
  if (result.status !== 0 && exit) process.exit(result.status || 1);
  return result.status === 0;
}

function list(args) {
  const result = spawnSync(docker, args, { encoding: 'utf8' });
  return result.status === 0 ? result.stdout.split(/\r?\n/).filter(Boolean) : [];
}

function removeLegacyContainers() {
  const ids = list([
    'ps', '-aq',
    '--filter', `label=com.docker.compose.project=${legacy.project}`,
    '--filter', `label=com.docker.compose.service=${legacy.service}`,
  ]);
  if (ids.length) {
    console.log('Eliminando contenedores del stack anterior (vendedoria-db)…');
    run(['rm', '-f', ...ids]);
  }
}

if (mode === 'dev') {
  const setup = spawnSync(process.execPath, ['scripts/setup-local.mjs'], { stdio: 'inherit' });
  if (setup.status) process.exit(setup.status);
  removeLegacyContainers();
  run([...dev, 'up', '-d', '--build', '--remove-orphans', '--wait']);
  console.log(
    [
      'VendedorIA en Docker:',
      '  Consola  http://localhost:4201',
      '  API      http://localhost:3100/api/v1  (Swagger: http://localhost:3100/docs)',
      '  Tiendas  http://{slug}.localhost:4300',
      '  Logs     npm run docker:logs',
    ].join('\n'),
  );
} else if (mode === 'down') run([...dev, 'down']);
else if (mode === 'logs') run([...dev, 'logs', '-f', '--tail', '200', 'api', 'web', 'store']);
else if (mode === 'ps') run([...dev, 'ps']);
else if (mode === 'test') {
  // Base aislada vendedoria_test dentro del Postgres de desarrollo; los datos de desarrollo no se tocan.
  run([...dev, 'exec', '-T', 'postgres', 'sh', '-c',
    "psql -U postgres -d vendedoria -tAc \"SELECT 1 FROM pg_database WHERE datname='vendedoria_test'\" | grep -q 1 || createdb -U postgres vendedoria_test"]);
  const env = {
    DATABASE_URL: 'postgresql://postgres:postgres@postgres:5432/vendedoria_test?schema=public',
    NODE_ENV: 'test',
    MERCADOPAGO_ACCESS_TOKEN: '',
    OPENAI_API_KEY: '',
  };
  const flags = Object.entries(env).flatMap(([key, value]) => ['-e', `${key}=${value}`]);
  run([...dev, 'exec', '-T', ...flags, 'api', 'sh', '-c',
    'npx prisma migrate deploy && npx jest && npx jest --config ./test/jest-e2e.json']);
} else if (mode === 'clean-legacy') {
  removeLegacyContainers();
  const volumes = list(['volume', 'ls', '-q', '--filter', `label=com.docker.compose.project=${legacy.project}`])
    .filter((volume) => !keepVolumes.has(volume));
  if (volumes.length) {
    console.log(`Eliminando volúmenes sin uso: ${volumes.join(', ')}`);
    run(['volume', 'rm', ...volumes], { exit: false });
  }
  run(['image', 'prune', '-f'], { exit: false });
  console.log('Listo. Solo queda el stack de desarrollo (vendedoria-dev).');
} else {
  throw new Error('Modo no reconocido. Usa dev, down, logs, ps, test o clean-legacy.');
}
