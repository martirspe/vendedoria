'use strict';
const catalog = require('./catalog');
const schema = require('./manifest.schema.json');
const RENDERER_SECTIONS = require('./sections.json');

function checkSchema(value, rule, path, issues) {
  const fail = message => issues.push({ code: 'manifest_schema', path, message });
  if (rule.anyOf) {
    if (!rule.anyOf.some(option => { const errors = []; checkSchema(value, option, path, errors); return !errors.length; })) fail('El valor no cumple ninguna opción del contrato.');
    return;
  }
  const validType = rule.type === 'object' ? value !== null && typeof value === 'object' && !Array.isArray(value)
    : rule.type === 'array' ? Array.isArray(value)
    : rule.type === 'integer' ? Number.isInteger(value) : typeof value === rule.type;
  if (rule.type && !validType) { fail(`Se requiere ${rule.type}.`); return; }
  if (rule.enum && !rule.enum.includes(value)) fail('El valor no está permitido.');
  if (typeof value === 'string') {
    if (rule.minLength && value.length < rule.minLength) fail('El valor es demasiado corto.');
    if (rule.maxLength && value.length > rule.maxLength) fail('El valor es demasiado largo.');
    if (rule.pattern && !new RegExp(rule.pattern).test(value)) fail('El formato no es válido.');
  }
  if (typeof value === 'number' && rule.minimum !== undefined && value < rule.minimum) fail('El número es demasiado pequeño.');
  if (Array.isArray(value)) {
    if (rule.maxItems !== undefined && value.length > rule.maxItems) fail('Hay demasiados elementos.');
    if (rule.minItems !== undefined && value.length < rule.minItems) fail('Faltan elementos.');
    if (rule.uniqueItems && new Set(value.map(item => JSON.stringify(item))).size !== value.length) fail('Hay elementos duplicados.');
    value.forEach((item, i) => checkSchema(item, rule.items, `${path}[${i}]`, issues));
  } else if (value !== null && typeof value === 'object') {
    for (const key of rule.required ?? []) if (!Object.hasOwn(value, key)) fail(`Falta ${key}.`);
    for (const key of Object.keys(value)) {
      if (['__proto__', 'prototype', 'constructor'].includes(key)) { fail(`La propiedad ${key} no está permitida.`); continue; }
      const property = rule.properties && Object.hasOwn(rule.properties, key) ? rule.properties[key] : undefined;
      if (property) checkSchema(value[key], property, `${path}.${key}`, issues);
      else if (rule.additionalProperties === false || ['__proto__', 'prototype', 'constructor'].includes(key)) fail(`La propiedad ${key} no está permitida.`);
      else if (typeof rule.additionalProperties === 'object') checkSchema(value[key], rule.additionalProperties, `${path}.${key}`, issues);
    }
  }
}

function validateManifest(value) {
  const issues = [];
  checkSchema(value, schema, 'manifest', issues);
  if (issues.length) return issues;
  const fail = (code, path, message) => issues.push({ code, path, message });
  if (value.id !== `${value.namespace}/${value.slug}`) fail('identity', 'id', 'La identidad debe coincidir con namespace/slug.');
  const renderer = value.renderer.split('@')[0];
  const sections = RENDERER_SECTIONS[renderer];
  if (!sections) fail('renderer', 'renderer', 'La presentación no está registrada.');
  else {
    const known = new Map(sections.map(section => [section.id, section]));
    for (const id of value.sections) if (!known.has(id)) fail('section', 'sections', `La presentación no admite ${id}.`);
    for (const section of sections.filter(section => section.role === 'builtin')) {
      if (!value.sections.includes(section.id)) fail('required_section', 'sections', `Se requiere ${section.id}.`);
    }
    for (const preset of value.presets) {
      for (const [id, fields] of Object.entries(preset.sections)) {
        const section = known.get(id);
        if (!section || !value.sections.includes(id)) { fail('preset_section', 'presets', `Sección desconocida: ${id}.`); continue; }
        for (const [key, text] of Object.entries(fields)) {
          const field = section.fields.find(field => field.id === key);
          if (!field || ['image', 'url'].includes(field.kind) && text !== '' || ['text', 'multiline'].includes(field.kind) && text.length > field.maxLength || field.kind === 'choice' && !field.options.some(option => option.value === text)) fail('preset_field', 'presets', `El campo ${id}.${key} no cumple su definición.`);
          if (/^(quote\d+|author\d+)$/.test(key) && text) fail('demo_proof', 'presets', 'Las muestras no pueden inventar opiniones de clientes.');
        }
      }
      const seen = new Set();
      for (const item of preset.layout) {
        const section = known.get(item.type);
        if (seen.has(item.id) || !section || section.role !== 'builtin' || item.id !== item.type || item.hidden && !section.canHide || !value.sections.includes(item.type)) fail('preset_layout', 'presets', 'La composición de la muestra no es válida.');
        seen.add(item.id);
      }
      for (const section of sections.filter(section => section.role === 'builtin')) {
        if (!seen.has(section.id)) fail('preset_layout', 'presets', `La muestra requiere ${section.id}.`);
      }
    }
  }
  if (new Set(value.presets.map(preset => preset.id)).size !== value.presets.length) fail('preset_identity', 'presets', 'Hay muestras duplicadas.');
  for (const key of Object.keys(value.tokens)) if (!value.settings.includes(key)) fail('token_setting', 'tokens', `La opción ${key} no está declarada.`);
  if (value.assets.styles.some(asset => !['/selecta.css', '/stride.css'].includes(asset) || asset !== `/${renderer}.css`)) fail('asset', 'assets.styles', 'La hoja de estilos debe pertenecer a la presentación registrada.');
  if (renderer !== 'classic' && !value.assets.styles.includes(`/${renderer}.css`)) fail('asset', 'assets.styles', 'Falta la hoja de estilos de la presentación.');
  for (const migration of value.migrations) {
    if (migration.to !== value.version || catalog.compareVersions(migration.from, migration.to) >= 0) fail('migration', 'migrations', 'La migración debe avanzar hacia la versión del paquete.');
    for (const field of migration.renameFields) {
      for (const path of [field.from, field.to]) {
        const [id, key] = path.split('.');
        if (!sections?.some(section => section.id === id && section.fields.some(field => field.id === key)) || ['constructor', 'prototype', '__proto__'].includes(id) || ['constructor', 'prototype', '__proto__'].includes(key)) fail('migration_field', 'migrations', `El campo ${path} no está registrado.`);
      }
    }
  }
  return issues;
}

function compatibility(value, environment = catalog.THEME_ENVIRONMENT) {
  if (!value) return { status: 'incompatible', issues: [{ code: 'release_missing', path: 'manifest', message: 'Esta versión de la plantilla no está disponible. Prepara una versión compatible o recupera el diseño.' }] };
  const issues = validateManifest(value);
  if (issues.length) return { status: 'incompatible', issues };
  let requiresUpdate = false;
  for (const [key, version] of Object.entries(value.contracts)) {
    if (version !== environment.contracts[key]) {
      const label = { engine: 'motor de plantillas', editor: 'editor', storefront: 'tienda', content: 'contenido' }[key];
      issues.push({ code: 'contract', path: `contracts.${key}`, message: `Esta plantilla necesita la versión ${version} del ${label}; la plataforma ofrece la versión ${environment.contracts[key]}.` });
      if (version < environment.contracts[key]) requiresUpdate = true;
    }
  }
  if (!environment.renderers.includes(value.renderer)) issues.push({ code: 'renderer', path: 'renderer', message: 'La presentación requerida no está disponible.' });
  for (const capability of value.capabilities.requires) {
    if (!environment.capabilities.includes(capability)) issues.push({ code: 'capability', path: 'capabilities.requires', message: `Falta la función ${capability}.` });
  }
  if (issues.length) return { status: requiresUpdate && issues.every(issue => issue.code === 'contract') ? 'update_required' : 'incompatible', issues };
  for (const capability of [...value.capabilities.supports, ...value.capabilities.optional]) {
    if (!environment.capabilities.includes(capability)) issues.push({ code: 'optional_capability', path: 'capabilities', message: `La función opcional ${capability} no está disponible.` });
  }
  return { status: issues.length ? 'warnings' : 'compatible', issues };
}

function validateCatalog(themes = catalog.THEME_CATALOG) {
  const issues = [];
  const identities = new Map();
  const names = new Map();
  const releases = new Set();
  for (const theme of themes) {
    const errors = validateManifest(theme);
    issues.push(...errors);
    if (errors.length) continue;
    if (identities.has(theme.slug) && identities.get(theme.slug) !== theme.id) issues.push({ code: 'duplicate_slug', path: theme.slug, message: 'El slug pertenece a otra identidad.' });
    identities.set(theme.slug, theme.id);
    if (names.has(theme.id) && names.get(theme.id) !== theme.displayName) issues.push({ code: 'identity_name', path: theme.id, message: 'El nombre comercial de la identidad debe permanecer estable entre releases.' });
    names.set(theme.id, theme.displayName);
    const key = `${theme.id}@${theme.version}`;
    if (releases.has(key)) issues.push({ code: 'duplicate_release', path: key, message: 'El release ya está registrado.' });
    releases.add(key);
    for (const migration of theme.migrations) {
      if (!themes.some(other => other.id === theme.id && other.version === migration.from)) issues.push({ code: 'migration_source', path: key, message: 'La versión de origen no existe.' });
    }
  }
  return issues;
}

function migrationPath(slug, from, to, themes = catalog.THEME_CATALOG) {
  if (from === to) return [];
  const edges = themes.filter(theme => theme.slug === slug).flatMap(theme => theme.migrations);
  const queue = [{ version: from, path: [] }];
  const visited = new Set();
  while (queue.length) {
    const current = queue.shift();
    if (visited.has(current.version)) continue;
    visited.add(current.version);
    for (const edge of edges.filter(edge => edge.from === current.version)) {
      const path = [...current.path, edge];
      if (edge.to === to) return path;
      queue.push({ version: edge.to, path });
    }
  }
  throw new Error('No existe una migración segura entre esas versiones.');
}

function migrateContent(content, slug, from, to, themes = catalog.THEME_CATALOG) {
  const next = JSON.parse(JSON.stringify(content));
  if (content.version !== 1) throw new Error('Actualiza la plataforma antes de migrar este contenido.');
  for (const migration of migrationPath(slug, from, to, themes)) {
    for (const field of migration.renameFields) {
      if ([field.from, field.to].some(path => !/^[a-zA-Z][a-zA-Z0-9]{0,39}\.[a-zA-Z][a-zA-Z0-9]{0,39}$/.test(path) || path.split('.').some(key => ['constructor', 'prototype', '__proto__'].includes(key)))) {
        throw new Error('La migración contiene un campo no permitido.');
      }
      const [sourceSection, sourceKey] = field.from.split('.');
      const [targetSection, targetKey] = field.to.split('.');
      const value = next.sections[sourceSection]?.[sourceKey];
      if (value === undefined || field.from === field.to) continue;
      if (next.sections[targetSection]?.[targetKey] !== undefined) throw new Error('La migración necesita revisar dos personalizaciones en conflicto.');
      (next.sections[targetSection] ??= {})[targetKey] = value;
      delete next.sections[sourceSection][sourceKey];
    }
  }
  return next;
}

function importPreset(content, theme, presetId) {
  const preset = theme.presets.find(preset => preset.id === presetId);
  if (!preset) throw new Error('Esa muestra no está disponible.');
  const next = JSON.parse(JSON.stringify(content));
  for (const [id, fields] of Object.entries(preset.sections)) {
    for (const [key, value] of Object.entries(fields)) {
      if (next.sections[id]?.[key] === undefined) (next.sections[id] ??= {})[key] = value;
    }
  }
  // Existing layouts and explicit empty overrides belong to the merchant.
  if (!next.layouts?.[theme.slug]) (next.layouts ??= {})[theme.slug] = JSON.parse(JSON.stringify(preset.layout));
  for (const [key, value] of Object.entries(theme.tokens)) {
    if (next.theme?.[key] === undefined) (next.theme ??= {})[key] = value;
  }
  return next;
}

Object.assign(exports, catalog, { RENDERER_SECTIONS, validateManifest, compatibility, validateCatalog, migrationPath, migrateContent, importPreset });
