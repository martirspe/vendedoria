/**
 * Creates, updates or revokes VendedorIA staff (SUPERADMIN | ADMIN). The only way to grant a platform role.
 *
 *   npm run create-admin -w @vendedoria/api
 *   npm run create-admin -w @vendedoria/api -- --role=ADMIN --email=ops@vendedoria.pe --name="Ops"
 *   npm run create-admin -w @vendedoria/api -- --revoke --email=ops@vendedoria.pe
 *
 * The password never goes in argv: interactive hidden prompt, CREATE_ADMIN_PASSWORD or --password-stdin.
 */
import { PrismaClient, type PlatformRole } from '@prisma/client';
import { stdin, stdout } from 'node:process';
import { createInterface, type Interface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import {
  applyOperatorChange,
  assertOperatorEmail,
  assertOperatorPassword,
  PLATFORM_ROLES,
} from './platform-operators';

const PASSWORD_ENV = 'CREATE_ADMIN_PASSWORD';

type Args = {
  role?: PlatformRole;
  email?: string;
  name?: string;
  resetPassword: boolean;
  passwordStdin: boolean;
  revoke: boolean;
  help: boolean;
};

const HELP = `
Uso:
  npm run create-admin -w @vendedoria/api                       (interactivo)
  npm run create-admin -w @vendedoria/api -- --role=SUPERADMIN|ADMIN --email=... [--name=...] [--reset-password]
  npm run create-admin -w @vendedoria/api -- --revoke --email=...
  Producción: docker compose exec api npm run create-admin -- ...

Roles:
  SUPERADMIN  Control total de la plataforma, incluida la gestión de operadores.
  ADMIN       Operación global sin gestión de operadores.

Contraseña (mínimo 12 caracteres, letras y números):
  - Interactiva (oculta), recomendada.
  - ${PASSWORD_ENV}='...' o --password-stdin para automatizar. Nunca --password=.
    Si exportaste ${PASSWORD_ENV} en tu shell, ejecuta luego: unset ${PASSWORD_ENV}

Al cambiar la contraseña se cierran todas las sesiones; al cambiar o quitar el rol, las de la plataforma.
No se puede quitar el rol al último SUPERADMIN.
`;

function parseArgs(argv: string[]): Args {
  const args: Args = {
    resetPassword: false,
    passwordStdin: false,
    revoke: false,
    help: false,
  };
  for (const raw of argv) {
    if (raw === '--help' || raw === '-h') args.help = true;
    else if (raw === '--reset-password') args.resetPassword = true;
    else if (raw === '--password-stdin') args.passwordStdin = true;
    else if (raw === '--revoke') args.revoke = true;
    else if (raw === '--password' || raw.startsWith('--password=')) {
      throw new Error(
        `No pases la contraseña por argumento. Usa el modo interactivo, ${PASSWORD_ENV} o --password-stdin.`,
      );
    } else {
      const match = /^--(role|email|name)=(.*)$/.exec(raw);
      if (!match) throw new Error(`Argumento desconocido: ${raw}`);
      const value = match[2].trim();
      if (match[1] === 'role') args.role = parseRole(value);
      if (match[1] === 'email') args.email = parseEmail(value);
      if (match[1] === 'name') args.name = value;
    }
  }
  return args;
}

function parseEmail(value: string): string {
  const email = value.toLowerCase();
  assertOperatorEmail(email);
  return email;
}

function parseRole(value: string): PlatformRole {
  const role = value.toUpperCase() as PlatformRole;
  if (!PLATFORM_ROLES.includes(role))
    throw new Error('Rol inválido: usa SUPERADMIN o ADMIN.');
  return role;
}

/** Readline whose echo can be muted to read passwords without showing them. */
function createPrompt() {
  const output = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      if (!muted) stdout.write(chunk);
      callback();
    },
  });
  let muted = false;
  const rl: Interface = createInterface({
    input: stdin,
    output,
    terminal: true,
  });
  return {
    async ask(question: string, defaultValue = ''): Promise<string> {
      const suffix = defaultValue ? ` [${defaultValue}]` : '';
      const answer = (await rl.question(`${question}${suffix}: `)).trim();
      return answer || defaultValue;
    },
    async askHidden(question: string): Promise<string> {
      stdout.write(`${question}: `);
      muted = true;
      try {
        return await rl.question('');
      } finally {
        muted = false;
        stdout.write('\n');
      }
    },
    close: () => rl.close(),
  };
}

type Prompt = ReturnType<typeof createPrompt>;

async function readStdinLine(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8').split(/\r?\n/)[0] ?? '';
}

async function resolvePassword(
  args: Args,
  prompt: Prompt | null,
): Promise<string> {
  if (args.passwordStdin) return readStdinLine();
  const fromEnv = process.env[PASSWORD_ENV];
  if (fromEnv) {
    delete process.env[PASSWORD_ENV];
    return fromEnv;
  }
  if (!prompt)
    throw new Error(
      `Falta la contraseña: usa el modo interactivo, ${PASSWORD_ENV} o --password-stdin.`,
    );
  for (;;) {
    const password = await prompt.askHidden('Contraseña');
    if ((await prompt.askHidden('Confirmar contraseña')) !== password) {
      console.error('Las contraseñas no coinciden.');
      continue;
    }
    try {
      assertOperatorPassword(password);
      return password;
    } catch (error) {
      console.error((error as Error).message);
    }
  }
}

async function askUntilValid<T>(
  prompt: Prompt,
  question: string,
  parse: (value: string) => T,
  defaultValue = '',
) {
  for (;;) {
    try {
      return parse(await prompt.ask(question, defaultValue));
    } catch (error) {
      console.error((error as Error).message);
    }
  }
}

async function run(
  prisma: PrismaClient,
  args: Args,
  prompt: Prompt | null,
): Promise<void> {
  const need = (field: string) =>
    new Error(`Falta --${field} (o ejecuta en una terminal interactiva).`);
  const email =
    args.email ??
    (prompt ? await askUntilValid(prompt, 'Email', parseEmail) : undefined);
  if (!email) throw need('email');

  if (args.revoke) {
    const result = await applyOperatorChange(prisma, { kind: 'revoke', email });
    console.log(
      `Rol de plataforma retirado (usuario ${result.userId}). Sesiones de plataforma cerradas.`,
    );
    return;
  }

  const role =
    args.role ??
    (prompt
      ? await askUntilValid(
          prompt,
          'Rol (SUPERADMIN|ADMIN)',
          parseRole,
          'SUPERADMIN',
        )
      : undefined);
  if (!role) throw need('role');

  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });
  let needsPassword = !existing || args.resetPassword;
  if (
    existing &&
    !needsPassword &&
    prompt &&
    !args.passwordStdin &&
    !process.env[PASSWORD_ENV]
  ) {
    needsPassword = /^(s|si|sí|y|yes)$/i.test(
      await prompt.ask(
        'El usuario ya existe. ¿Cambiar su contraseña? (s/N)',
        'N',
      ),
    );
  }
  const fullName =
    args.name ??
    (!existing
      ? prompt
        ? await prompt.ask('Nombre completo', 'Equipo VendedorIA')
        : 'Equipo VendedorIA'
      : undefined);
  const password = needsPassword
    ? await resolvePassword(args, prompt)
    : undefined;

  const result = await applyOperatorChange(prisma, {
    kind: 'grant',
    email,
    role,
    fullName,
    password,
  });
  const summary =
    result.actions.length > 0 ? result.actions.join(', ') : 'sin cambios';
  console.log(`Operador ${role} listo (usuario ${result.userId}): ${summary}.`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(HELP);
    return;
  }
  const interactive = Boolean(stdin.isTTY) && !args.passwordStdin;
  const prompt = interactive ? createPrompt() : null;
  const prisma = new PrismaClient();
  try {
    await run(prisma, args, prompt);
  } finally {
    prompt?.close();
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  delete process.env[PASSWORD_ENV];
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
