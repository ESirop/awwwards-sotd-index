#!/usr/bin/env node
// One-off cross search over any Awwwards listings, without building the full index.
//
//   node scripts/search.mjs music-sound --award sotd
//   node scripts/search.mjs music-sound 3d --award sotd,sotm
//   node scripts/search.mjs --list
//
// Each argument is a /websites/<slug>/ slug (category, tag, technology, country, font…).
// Every page of each listing is walked, sites present in all listings are kept, then filtered
// on the requested awards. Writes results/<query>.json and results/<query>.html.

import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { BASE, ROOT, get, sleep, parseCards, parseFilterMenu } from './lib.mjs';

const CACHE_DIR = join(ROOT, '.cache');
const OUT_DIR = join(ROOT, 'results');
const CACHE_TTL = 24 * 3600 * 1000;
const DELAY = 700;

// Matched on the badge name: the same award can use several badge codes.
const AWARDS = {
  sotd: /site of the day/i,
  sotm: /site of the month/i,
  soty: /site of the year/i,
  dev: /developer/i,
  hm: /honorable/i,
  honors: /honors/i,
};

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(`--${name}`);
  if (i === -1) return undefined;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  if (i === -1) return false;
  args.splice(i, 1);
  return true;
};

async function fetchPage(url, { fresh = false } = {}) {
  await mkdir(CACHE_DIR, { recursive: true });
  const file = join(CACHE_DIR, url.replace(/^https?:\/\//, '').replace(/[^a-z0-9]+/gi, '_') + '.html');
  if (!fresh && existsSync(file) && Date.now() - (await stat(file)).mtimeMs < CACHE_TTL) return readFile(file, 'utf8');
  await sleep(DELAY);
  const html = await get(url);
  if (html) await writeFile(file, html);
  return html;
}

const hasAward = (site, codes) => site.awards.some((a) => codes.some((c) => AWARDS[c]?.test(a.name)));

async function crawl(slug, { maxPages, fresh, award }) {
  const all = [];
  for (let p = 1; p <= maxPages; p++) {
    const html = await fetchPage(`${BASE}/websites/${slug}/${p > 1 ? `?page=${p}` : ''}`, { fresh });
    if (!html) break;
    const cards = parseCards(html);
    if (!cards.length) break;
    all.push(...cards);
    const hits = award ? all.filter((c) => hasAward(c, award)).length : all.length;
    process.stderr.write(`\r  ${slug}: page ${p}, ${all.length} sites read, ${hits} kept   `);
    if (!html.includes(`?page=${p + 1}"`)) break;
  }
  process.stderr.write('\n');
  return all;
}

async function listFilters() {
  const menu = parseFilterMenu(await fetchPage(`${BASE}/websites/`));
  for (const [name, items] of Object.entries(menu)) {
    console.log(`\n${name} (${items.length})\n  ${items.map((it) => it.slug).join(', ')}`);
  }
}

function renderHtml(title, sites) {
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const cards = sites
    .map(
      (s) => `<article>
  <a href="${esc(s.url ?? s.page)}" target="_blank" rel="noopener"><img loading="lazy" src="${esc(s.thumb)}" alt=""></a>
  <h2><a href="${esc(s.page)}" target="_blank" rel="noopener">${esc(s.title)}</a></h2>
  <p>${esc(s.author)}</p>
  <p class="tags">${s.awards.map((a) => `<span title="${esc(a.name)}">${esc(a.name)}${a.date ? ` · ${esc(a.date)}` : ''}</span>`).join(' ')}</p>
</article>`,
    )
    .join('\n');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<style>
  :root { color-scheme: light dark; --bg: #fafafa; --fg: #111; --muted: #777; --card: #fff; }
  @media (prefers-color-scheme: dark) { :root { --bg: #111; --fg: #eee; --muted: #999; --card: #1b1b1b; } }
  body { margin: 0; padding: 32px 16px; background: var(--bg); color: var(--fg); font: 14px/1.4 system-ui, sans-serif; }
  h1 { margin: 0 0 24px; font-size: 22px; }
  main { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 24px; }
  article { background: var(--card); border-radius: 10px; overflow: hidden; }
  img { display: block; width: 100%; aspect-ratio: 4/3; object-fit: cover; background: #8882; }
  h2 { margin: 10px 12px 0; font-size: 15px; } h2 a { color: inherit; text-decoration: none; }
  p { margin: 2px 12px; color: var(--muted); } .tags { margin: 8px 12px 12px; display: flex; flex-wrap: wrap; gap: 4px; }
  .tags span { font-size: 11px; padding: 2px 6px; border-radius: 4px; background: #8882; color: var(--fg); }
</style></head>
<body><h1>${esc(title)} · ${sites.length} sites</h1><main>
${cards}
</main></body></html>`;
}

async function main() {
  if (flag('list')) return listFilters();

  const award = opt('award')?.toLowerCase().split(',');
  const maxPages = Number(opt('pages') ?? 500);
  const fresh = flag('fresh');
  const slugs = args.filter((a) => !a.startsWith('--'));

  if (!slugs.length) {
    console.log(`Usage: node scripts/search.mjs <slug> [<slug>…] [--award ${Object.keys(AWARDS).join(',')}] [--pages N] [--fresh]
       node scripts/search.mjs --list      list available slugs

Slugs are combined with AND. --pages limits each listing to its N most recent pages.`);
    return;
  }

  let result = null;
  for (const slug of slugs) {
    const cards = await crawl(slug, { maxPages, fresh, award });
    if (!cards.length) console.error(`  No site for "${slug}" (wrong slug?)`);
    const bySlug = new Map(cards.map((c) => [c.slug, c]));
    result = result ? new Map([...result].filter(([k]) => bySlug.has(k))) : bySlug;
  }

  let sites = [...result.values()];
  if (award) sites = sites.filter((s) => hasAward(s, award));

  const name = [...slugs, ...(award ?? [])].join('+');
  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(join(OUT_DIR, `${name}.json`), JSON.stringify(sites, null, 2));
  await writeFile(join(OUT_DIR, `${name}.html`), renderHtml(`${slugs.join(' + ')}${award ? ` · ${award.join('/').toUpperCase()}` : ''}`, sites));

  console.log(`\n${sites.length} sites. Results: results/${name}.html (and .json)`);
  for (const s of sites.slice(0, 15)) {
    const a = s.awards.find((x) => !award || award.some((c) => AWARDS[c]?.test(x.name)));
    console.log(`  ${s.title}${a?.date ? ` (${a.date})` : ''}  ${s.page}`);
  }
  if (sites.length > 15) console.log(`  … and ${sites.length - 15} more`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
