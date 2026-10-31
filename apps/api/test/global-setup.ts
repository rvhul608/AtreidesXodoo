import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const apiRoot = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(apiRoot, '../../..');
const databaseUrl = 'postgresql://brightloop:password@localhost:5432/brightloop_test';

export default function setup() {
  const env = { ...process.env, DATABASE_URL: databaseUrl };
  execFileSync(process.execPath, [path.join(repositoryRoot, 'db/reset.js')], { cwd: repositoryRoot, env, stdio: 'inherit' });
  execFileSync(process.execPath, [path.join(repositoryRoot, 'db/migrate.js')], { cwd: repositoryRoot, env, stdio: 'inherit' });
}
