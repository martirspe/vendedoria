import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import themes from '../packages/themes/index.js';

const identity = process.argv[2];
if (!/^[a-z][a-z0-9-]{1,39}\/[a-z][a-z0-9-]{1,39}$/.test(identity ?? '')) throw new Error('Uso: npm run theme:create -- namespace/slug');
const [namespace, slug] = identity.split('/');
if (themes.THEME_CATALOG.some(theme => theme.slug === slug)) throw new Error('Ese slug ya está registrado. Elige uno único.');
const root = path.resolve('theme-starters');
const directory = path.resolve(root, `${namespace}-${slug}`);
if (!directory.startsWith(root + path.sep)) throw new Error('Directorio inválido.');
await mkdir(root, { recursive: true });
await mkdir(directory); // Never overwrite an existing starter.
const manifest = JSON.parse(JSON.stringify(themes.getTheme('classic')));
Object.assign(manifest, { id: identity, namespace, slug, displayName: slug, version: '1.0.0', author: namespace, migrations: [], changelog: ['Primera versión.'] });
await writeFile(path.join(directory, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
await writeFile(path.join(directory, 'README.md'), `# ${identity}\n\nTheme declarativo basado en el renderer classic@1.\n\n1. Personaliza manifest.json: metadata, licencia, tokens y presets. Conserva todos los builtins; ordena u oculta solo los permitidos.\n2. Ejecuta npm run theme:check -- theme-starters/${namespace}-${slug}/manifest.json desde la raíz.\n3. Añade el manifiesto validado a packages/themes/catalog.json para integrarlo al build. No reemplaces releases anteriores.\n4. Ejecuta npm run theme:seal, npm run theme:build, npm run theme:check, npm run theme:test y npm run theme:test:store.\n5. Compila API, consola y tienda y ejecuta npm run test:docker con el stack activo. Revisa a11y, SEO y responsive en el navegador.\n6. Selecciona el theme en el panel, importa su muestra y revisa el borrador antes de publicar. La demo aislada está en /_templates/${slug}/.\n\nNo copies checkout ni catálogo. No se admiten scripts, CSS remoto, HTML libre o instalación de ZIP desde el panel. Consulta docs/THEMES.md para el tutorial, identidad, versionado, migraciones, tokens, extensiones de renderer y límites de seguridad.\n`);
console.log(`Starter creado: ${path.relative(process.cwd(), directory)}`);
