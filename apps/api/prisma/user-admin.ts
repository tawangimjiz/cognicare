/** Admin CLI. Usage: ts-node prisma/user-admin.ts create|link ... (see README, Deploy). */
import { PrismaClient } from '@prisma/client';
import { CliError, createUser, linkUsers, parseArgs, resolvePassword, validateCreate } from '../src/cli/user-admin';

// Hidden-input prompt: raw mode, nothing echoed.
function readHidden(label: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    let buf = '';
    process.stderr.write(label);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    const done = () => { stdin.setRawMode(false); stdin.pause(); stdin.off('data', onData); };
    const onData = (chunk: string) => {
      for (const c of chunk) {
        if (c === '\u0003') { done(); return reject(new CliError('Cancelled')); }
        if (c === '\r' || c === '\n') { done(); process.stderr.write('\n'); return resolve(buf); }
        if (c === '\u007f' || c === '\b') buf = buf.slice(0, -1);
        else buf += c;
      }
    };
    stdin.on('data', onData);
  });
}

async function promptTwice() {
  const a = await readHidden('Password: ');
  if (a !== (await readHidden('Confirm password: '))) throw new CliError('Passwords do not match');
  return a;
}

async function main() {
  const [cmd = '', ...rest] = process.argv.slice(2);
  const args = parseArgs(cmd, rest);
  const prisma = new PrismaClient();
  try {
    if (cmd === 'create') {
      const v = validateCreate(args);
      const { password, generated } = await resolvePassword(v.generate, process.env, !!process.stdin.isTTY, promptTwice);
      const u = await createUser(prisma as any, v, password);
      console.log(`Created ${u.role} ${u.email} (id ${u.id})`);
      if (generated) console.log(`Generated password (shown once): ${password}`);
    } else {
      (await linkUsers(prisma as any, args)).forEach((l) => console.log(l));
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e instanceof CliError ? `Error: ${e.message}` : e);
  process.exit(1);
});
