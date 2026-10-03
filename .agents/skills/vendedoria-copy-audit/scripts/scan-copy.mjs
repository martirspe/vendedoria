#!/usr/bin/env node
/**
 * Flags user-visible strings that look like development guidance, placeholders,
 * unfinished features or local URLs. It is a triage tool: every hit needs a human
 * (or agent) decision, and a clean run does not prove the copy is production-ready.
 *
 * Usage (repo root):
 *   node .agents/skills/vendedoria-copy-audit/scripts/scan-copy.mjs [paths...] [--json]
 * Default paths: apps/web/src apps/store/src apps/api/src
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative, sep } from 'node:path';

const DEFAULT_ROOTS = ['apps/web/src', 'apps/store/src', 'apps/api/src'];
const SKIP_DIRS = new Set(['node_modules', 'dist', '.angular', 'seed-data', 'coverage', 'environments']);
const SKIP_FILE = /\.(spec|e2e-spec|d)\.ts$/;
const EXTENSIONS = new Set(['.html', '.ts']);

const RULES = [
  { id: 'dev-marker', level: 'high', re: /\b(TODO|FIXME|XXX|HACK)\b/ },
  {
    id: 'dev-jargon',
    level: 'high',
    re: /\b(roadmap|smoke|enum|stub|mock|fixture|seed|endpoint|payload|backend|frontend|refactor|DTO|schema|adapter|sprint|MVP|wedge|dominio|happy path)\b/i,
  },
  {
    id: 'dev-instruction',
    level: 'high',
    re: /(revisa (la|el) (API|servidor|backend|consola del navegador|log)|modo (dev|desarrollo)|de desarrollo|variable(s)? de entorno|\.env\b|docker|npm run|swagger)/i,
  },
  { id: 'placeholder', level: 'high', re: /(lorem ipsum|dolor sit|\bfoo\b|\bbar baz\b|\basdf\b|john doe|example\.(com|pe|org))/i },
  { id: 'local-url', level: 'high', re: /(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?/ },
  { id: 'unfinished', level: 'medium', re: /\b(próximamente|coming soon|en construcción|work in progress|WIP|waitlist|beta|por implementar|no implementado)\b/i },
  { id: 'internal-tone', level: 'medium', re: /\b(sin promesas|honest[oa]|fuera del alcance)\b/i },
];
/** Server entry files log and redirect to localhost on purpose (dev only). */
const LOCAL_URL_OK = /(^|\/)server\.ts$/;

/** API exceptions surface to the console or store; English messages need a Spanish decision. */
const ENGLISH_EXCEPTION = /new \w+Exception\(\s*(['"`])([A-Z][a-z]+(?: [a-zA-Z']+){1,})\1/;

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const roots = args.filter((arg) => !arg.startsWith('--'));
const targets = roots.length ? roots : DEFAULT_ROOTS;

function walk(path, files) {
  let stats;
  try {
    stats = statSync(path);
  } catch {
    console.error(`skip (not found): ${path}`);
    return;
  }
  if (stats.isDirectory()) {
    for (const entry of readdirSync(path)) {
      if (!SKIP_DIRS.has(entry)) walk(join(path, entry), files);
    }
  } else if (EXTENSIONS.has(extname(path)) && !SKIP_FILE.test(path)) {
    files.push(path);
  }
}

/** Text a user can read: string literals in TS, everything but comments in HTML. */
function visibleChunks(line, ext) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return [];
  if (/\b(console|this\.logger|logger)\.(log|info|warn|error|debug)\(/.test(line)) return [];
  if (ext === '.html') return trimmed.startsWith('<!--') ? [] : [line];
  if (/^\s*(import|export \* from)\b/.test(line) || /\b(selector|templateUrl|styleUrl|loadComponent|path):/.test(line)) {
    return [];
  }
  const chunks = [];
  for (const match of line.matchAll(/(['"`])((?:\\.|(?!\1).)*)\1/g)) {
    const text = match[2].replace(/\$\{[^}]*\}/g, '…');
    if (/\s/.test(text) || /[áéíóúñ¿¡]/i.test(text)) chunks.push(text);
  }
  return chunks;
}

const files = [];
for (const target of targets) walk(target, files);

const hits = [];
for (const file of files) {
  const ext = extname(file);
  const isApi = file.split(sep).join('/').includes('apps/api/');
  const lines = readFileSync(file, 'utf8').split(/\r?\n/);
  lines.forEach((line, index) => {
    const where = { file: relative(process.cwd(), file).split(sep).join('/'), line: index + 1 };
    if (isApi) {
      const english = ENGLISH_EXCEPTION.exec(line);
      if (english) hits.push({ ...where, rule: 'english-error', level: 'low', text: english[2] });
    }
    for (const chunk of visibleChunks(line, ext)) {
      for (const rule of RULES) {
        if (isApi && rule.id === 'dev-jargon') continue;
        if (rule.id === 'local-url' && LOCAL_URL_OK.test(where.file)) continue;
        if (rule.re.test(chunk)) {
          hits.push({ ...where, rule: rule.id, level: rule.level, text: chunk.trim().slice(0, 160) });
        }
      }
    }
  });
}

if (asJson) {
  console.log(JSON.stringify({ scanned: files.length, hits }, null, 2));
} else {
  const order = { high: 0, medium: 1, low: 2 };
  hits.sort((a, b) => order[a.level] - order[b.level] || a.file.localeCompare(b.file) || a.line - b.line);
  for (const hit of hits) console.log(`${hit.level.padEnd(6)} ${hit.rule.padEnd(15)} ${hit.file}:${hit.line}  ${hit.text}`);
  const count = (level) => hits.filter((hit) => hit.level === level).length;
  console.log(`\n${files.length} files scanned · ${hits.length} hits (high ${count('high')}, medium ${count('medium')}, low ${count('low')})`);
}
