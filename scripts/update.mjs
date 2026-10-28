#!/usr/bin/env node
// Refreshes the data, then commits and pushes data/ so GitHub Pages redeploys the page.
//
//   npm run update            fetch what is new
//   npm run update -- --full  walk every listing again (about an hour)

import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { ROOT } from './lib.mjs';

const run = (cmd, args, opts = {}) => {
  const r = spawnSync(cmd, args, { cwd: ROOT, stdio: 'inherit', ...opts });
  if (r.status !== 0) process.exit(r.status ?? 1);
  return r;
};

run(process.execPath, [join(ROOT, 'scripts', 'scrape.mjs'), ...process.argv.slice(2)]);

run('git', ['add', 'data']);
const changed = spawnSync('git', ['diff', '--cached', '--quiet'], { cwd: ROOT }).status !== 0;
if (!changed) {
  console.log('Nothing new, nothing to push.');
  process.exit(0);
}
run('git', ['commit', '-q', '-m', `Update data ${new Date().toISOString().slice(0, 10)}`]);
run('git', ['push', '-q']);
console.log('Pushed. The page will be redeployed in a minute.');
