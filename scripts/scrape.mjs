#!/usr/bin/env node
// Builds a local index of every Awwwards Site of the Day, with all of its filters.
//
//   node scripts/scrape.mjs                 collect (or update), then write data/sotd.js
//   node scripts/scrape.mjs --full          ignore what is known and walk every listing again
//   node scripts/scrape.mjs --skip-details  skip site pages (colors, scores, descriptions)
//   node scripts/scrape.mjs --skip-facets   skip the Country and Font listings
//   node scripts/scrape.mjs --build         only rebuild data/sotd.js from data/state.json
//
// Sources:
//   - the SOTD listing (~200 pages): title, link, thumbnail, date, awards, categories, tags, technologies;
//   - the Country and Font listings of the filter menu: we keep the SOTDs found in them;
//   - each SOTD page: colors, score and sub-scores, description.
// Everything is stored in data/state.json, so a run can be interrupted and resumed.
// Later runs only walk listings until they reach sites they already know.

import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { BASE, ROOT, get, sleep, parseCards, parseFilterMenu, parseDetail, isoDate } from './lib.mjs';

const args = process.argv.slice(2);
const has = (f) => args.includes(`--${f}`);
const num = (f, d) => {
  const i = args.indexOf(`--${f}`);
  return i === -1 ? d : Number(args[i + 1]);
};

const FULL = has('full');
const CONCURRENCY = num('concurrency', 4);
const PAUSE = 300; // between two requests of the same worker
const DATA = join(ROOT, 'data');
const STATE = join(DATA, 'state.json');
const OUT = join(DATA, 'sotd.js');
const FACET_GROUPS = ['Country', 'Font'];
const TTY = process.stdout.isTTY;

let state = { filters: {}, sites: {}, lists: {}, details: {}, updated: null };
let dirty = false;
let saving = Promise.resolve();

async function load() {
  if (existsSync(STATE)) state = { ...state, ...JSON.parse(await readFile(STATE, 'utf8')) };
}

function save() {
  saving = saving.then(async () => {
    if (!dirty) return;
    dirty = false;
    await mkdir(DATA, { recursive: true });
    await writeFile(STATE + '.tmp', JSON.stringify(state));
    await rename(STATE + '.tmp', STATE);
  });
  return saving;
}

const log = (s) => TTY && process.stdout.write(`\r\x1b[2K${s}`);

// Runs fn on every item, n at a time.
async function pool(items, n, fn) {
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) {
        const item = items[i++];
        await fn(item);
        await sleep(PAUSE);
      }
    }),
  );
}

// Walks a paginated listing, `batch` pages at a time. Stops on 404, an empty page, a page already
// seen during this run (past the last page, Awwwards serves the last one again) or, when updating
// a listing walked before, on the first page made only of known sites.
async function crawlList(path, key, label, onCards) {
  const prev = state.lists[key];
  const known = !FULL && prev?.complete ? new Set(prev.seen) : null;
  const batch = known ? 1 : CONCURRENCY;
  const seen = new Set(known ?? []);
  const thisRun = new Set();
  let page = 1;
  let done = false;
  while (!done) {
    const pages = Array.from({ length: batch }, (_, k) => page + k);
    const results = await Promise.all(
      pages.map(async (p, k) => {
        await sleep(k * PAUSE);
        return get(`${BASE}/websites/${path}/${p > 1 ? `?page=${p}` : ''}`);
      }),
    );
    for (const [k, html] of results.entries()) {
      const cards = html ? parseCards(html) : [];
      if (!cards.length || cards.every((c) => thisRun.has(c.slug))) {
        done = true;
        break;
      }
      const fresh = cards.filter((c) => !seen.has(c.slug));
      cards.forEach((c) => (thisRun.add(c.slug), seen.add(c.slug)));
      onCards?.(cards);
      log(`${label}: page ${pages[k]} (${seen.size} sites)`);
      if (known && !fresh.length) {
        done = true;
        break;
      }
    }
    page += batch;
    if (known) await sleep(PAUSE);
  }
  state.lists[key] = { complete: true, seen: [...seen] };
  dirty = true;
  await save();
}

async function collect() {
  log('Filter menu…');
  const first = await get(`${BASE}/websites/sites_of_the_day/`);
  state.filters = parseFilterMenu(first);
  dirty = true;

  // 1. SOTD listing
  const before = Object.keys(state.sites).length;
  await crawlList('sites_of_the_day', 'sotd', 'SOTD listing', (cards) => {
    for (const c of cards) state.sites[c.slug] = { ...state.sites[c.slug], ...c };
  });
  const total = Object.keys(state.sites).length;
  console.log(`\n${total} SOTDs known (${total - before} new).`);

  // 2. Countries and fonts. Updates walk one page per listing, so listings run in parallel.
  if (!has('skip-facets')) {
    const lists = FACET_GROUPS.flatMap((g) => (state.filters[g] ?? []).map((it) => ({ g, ...it })));
    let n = 0;
    const walk = (it) => crawlList(encodeURIComponent(it.slug), `${it.g}:${it.slug}`, `${it.g} ${++n}/${lists.length} ${it.name}`);
    const updating = !FULL && lists.every((it) => state.lists[`${it.g}:${it.slug}`]?.complete);
    if (updating) await pool(lists, CONCURRENCY, walk);
    else for (const it of lists) await walk(it);
    console.log(`\n${lists.length} country / font listings walked.`);
  }

  // 3. Site pages, only for SOTDs not fetched yet.
  if (!has('skip-details')) {
    const todo = Object.keys(state.sites).filter((s) => !state.details[s]);
    let n = 0;
    const timer = setInterval(save, 20000);
    await pool(todo, CONCURRENCY, async (slug) => {
      try {
        const html = await get(`${BASE}/sites/${slug}/content`);
        state.details[slug] = html ? parseDetail(html) : { missing: true };
      } catch (e) {
        console.log(`\n  ${slug}: ${e.message}`);
      }
      dirty = true;
      log(`Site pages: ${++n}/${todo.length}`);
    });
    clearInterval(timer);
    console.log(`\n${todo.length} site pages fetched.`);
  }

  state.updated = new Date().toISOString();
  dirty = true;
  await save();
}

// Writes data/sotd.js for the interface (index.html). Group labels live in the interface.
async function build() {
  const groups = [
    { key: 'award', mode: 'and' },
    { key: 'year', mode: 'or' },
    { key: 'cat', mode: 'and', from: 'Category' },
    { key: 'tag', mode: 'and', from: 'Tag' },
    { key: 'tech', mode: 'and', from: 'Technology' },
    { key: 'country', mode: 'or', from: 'Country' },
    { key: 'font', mode: 'and', from: 'Font' },
    { key: 'color', mode: 'and', from: 'Color' },
  ];
  const items = Object.fromEntries(groups.map((g) => [g.key, new Map()]));
  const byName = new Map();
  const bySlug = new Map();
  for (const g of groups.filter((g) => g.from)) {
    for (const it of state.filters[g.from] ?? []) {
      items[g.key].set(it.slug, it.name);
      if (g.key !== 'color') byName.set(it.name.toLowerCase(), [g.key, it.slug]);
      bySlug.set(it.slug.toLowerCase(), [g.key, it.slug]);
    }
  }

  // SOTD members of each country / font listing
  const facetOf = new Map();
  for (const [key, list] of Object.entries(state.lists)) {
    const [group, slug] = key.split(/:(.*)/s);
    const g = { Country: 'country', Font: 'font' }[group];
    if (!g) continue;
    for (const s of list.seen) {
      if (!state.sites[s]) continue;
      if (!facetOf.has(s)) facetOf.set(s, []);
      facetOf.get(s).push(`${g}:${slug}`);
    }
  }

  const sites = [];
  for (const site of Object.values(state.sites)) {
    const det = state.details[site.slug] ?? {};
    const sotd = site.awards.find((a) => /site of the day/i.test(a.name));
    const date = isoDate(sotd?.date) ?? det.sotdDate ?? (site.createdAt ? new Date(site.createdAt * 1000).toISOString().slice(0, 10) : null);
    const f = new Set(facetOf.get(site.slug) ?? []);

    // Keyed by name: several awards share the same badge code (Honors…).
    for (const a of site.awards) {
      if (/site of the day/i.test(a.name) || !/[A-Z]/.test(a.name)) continue;
      const id = a.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      items.award.set(id, a.name);
      f.add(`award:${id}`);
    }
    if (date) {
      items.year.set(date.slice(0, 4), date.slice(0, 4));
      f.add(`year:${date.slice(0, 4)}`);
    }
    for (const t of site.tags ?? []) {
      const hit = byName.get(t.toLowerCase());
      if (hit) f.add(`${hit[0]}:${hit[1]}`);
      else {
        items.tag.set(t, t);
        f.add(`tag:${t}`);
      }
    }
    for (const s of det.tagSlugs ?? []) {
      const hit = bySlug.get(s.toLowerCase());
      if (hit) f.add(`${hit[0]}:${hit[1]}`);
    }
    for (const c of det.colors ?? []) {
      if (!items.color.has(c.bucket)) items.color.set(c.bucket, c.bucket);
      f.add(`color:${c.bucket}`);
    }

    sites.push({
      s: site.slug,
      t: site.title,
      u: site.url,
      i: site.thumb,
      a: site.author,
      d: date,
      sc: det.score ?? null,
      sub: det.sub ?? null,
      c: (det.colors ?? []).map((c) => c.hex),
      desc: det.desc ?? null,
      f: [...f],
    });
  }
  sites.sort((a, b) => (b.d ?? '').localeCompare(a.d ?? '') || a.s.localeCompare(b.s));

  const out = {
    updated: state.updated,
    groups: groups.map(({ key, mode }) => ({
      key,
      mode,
      items: [...items[key]].map(([id, label]) => ({ id: `${key}:${id}`, label })),
    })),
    sites,
  };
  await mkdir(DATA, { recursive: true });
  await writeFile(OUT, `window.SOTD = ${JSON.stringify(out)};\n`);
  const facets = Object.keys(state.lists).filter((k) => k.includes(':')).length;
  console.log(`data/sotd.js: ${sites.length} SOTDs, ${Object.keys(state.details).length} site pages, ${facets} country / font listings.`);
}

process.on('SIGINT', async () => {
  dirty = true;
  await save();
  console.log('\nInterrupted, progress saved. Run the same command again to resume.');
  process.exit(130);
});

await load();
if (!has('build')) await collect();
await build();
