// Shared helpers: polite fetching and parsing of Awwwards HTML.

import { fileURLToPath } from 'node:url';

export const BASE = 'https://www.awwwards.com';
export const ROOT = fileURLToPath(new URL('..', import.meta.url));
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const decode = (s = '') =>
  s
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .trim();

// Returns the HTML, or null on 404. Backs off and retries on 429, 5xx and network errors.
export async function get(url) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'en' } });
      if (res.status === 404) return null;
      if (res.ok) return await res.text();
      if (res.status !== 429 && res.status < 500) throw new Error(`${res.status} on ${url}`);
    } catch (e) {
      if (attempt >= 6 || /^\d{3} on/.test(e.message)) throw e;
    }
    if (attempt >= 6) throw new Error(`gave up after ${attempt} attempts: ${url}`);
    await sleep(15000 * attempt);
  }
}

const MONTHS = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 };
// "Oct 21, 2026" -> "2026-10-21"
export function isoDate(s) {
  const m = s?.match(/([A-Z][a-z]{2})\w*\s+(\d{1,2}),\s*(\d{4})/);
  if (!m) return null;
  return `${m[3]}-${String(MONTHS[m[1]]).padStart(2, '0')}-${m[2].padStart(2, '0')}`;
}

// Site cards of a listing page (/websites/...).
export function parseCards(html) {
  const cards = [];
  const blocks = html.split(/<li class="[^"]*js-collectable/).slice(1);
  for (const raw of blocks) {
    const block = raw.split(/<\/li>\s*<li|<\/ul>/)[0];
    const link = block.match(/aria-label="([^"]*)"[^>]*href="\/sites\/([^"/]+)"/);
    if (!link) continue;
    let model = {};
    const json = block.match(/data-collectable-model-value="([^"]*)"/)?.[1];
    if (json) {
      try {
        model = JSON.parse(json.replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
      } catch {}
    }
    const awards = [];
    const re = /budget-tag--(\w+)">\s*[^<]*<\/span>[\s\S]*?<strong[^>]*>\s*([^<]+?)\s*<\/strong>(?:\s*<br><span[^>]*>([^<]+)<\/span>)?/g;
    for (const m of block.matchAll(re)) awards.push({ code: m[1], name: decode(m[2]), date: m[3]?.trim() ?? null });
    cards.push({
      slug: link[2],
      title: decode(link[1]),
      page: `${BASE}/sites/${link[2]}`,
      url: block.match(/class="figure-rollover__bt"\s+href="([^"]+)"/)?.[1] ?? null,
      thumb: block.match(/data-srcset="([^\s"]+)/)?.[1] ?? null,
      author: decode(block.match(/avatar-name__title">([^<]*)</)?.[1] ?? ''),
      createdAt: model.createdAt ?? null,
      tags: (model.tags ?? []).map(decode),
      awards,
    });
  }
  return cards;
}

// Filter menu of a listing page: { Category: [{slug, name}], Tag: [...], ... }
export function parseFilterMenu(html) {
  const groups = {};
  for (const section of html.split('data-grid-target="filterItem"').slice(1)) {
    const name = section.match(/<span>([^<]+)<\/span>/)?.[1]?.trim();
    if (!name) continue;
    const items = [];
    for (const m of section.matchAll(/<a class="nav-filters__subitem[^"]*" href="([^"]+)"[^>]*>\s*<span class="js-filter-item-name">([^<]+)/g)) {
      const href = decode(m[1]);
      const slug = href.match(/^\/websites\/([^?/]+)\/$/)?.[1] ?? href.match(/palette=([^&]+)/)?.[1];
      if (slug) items.push({ slug: decodeURIComponent(slug), name: decode(m[2]) });
    }
    // Colors are unlabeled swatches: their name is the hex code.
    for (const m of section.matchAll(/href="[^"]*palette=%23([0-9A-Fa-f]{6})"\s*class="nav-filters__color/g)) {
      items.push({ slug: `#${m[1]}`, name: `#${m[1]}` });
    }
    if (items.length) groups[name] = items;
  }
  return groups;
}

// Site page /sites/<slug>/content: score, sub-scores, colors, description, tags.
export function parseDetail(html) {
  const score = html.match(/c-heading-score__note">\s*→\s*([\d.]+)/)?.[1] ?? html.match(/box-score__note">\s*<strong>([\d.]+)/)?.[1];
  const overall = html.split('layout-overall"')[1] ?? '';
  const sub = [...overall.matchAll(/data-note="([\d.]+)"/g)].slice(0, 4).map((m) => Number(m[1]));
  const colors = [];
  for (const m of html.matchAll(/list-palette__name"><strong>HEX<\/strong>\s*(#[0-9a-fA-F]{3,8})[\s\S]*?href="\/websites\/(%23[0-9A-Fa-f]{6})\/"/g)) {
    colors.push({ hex: m[1].toLowerCase(), bucket: decodeURIComponent(m[2]) });
  }
  const desc = html.match(/>Description<\/h2>[\s\S]*?<h3[^>]*>([\s\S]*?)<\/h3>/)?.[1];
  const tagSlugs = [...html.matchAll(/href="\/websites\/([^"/?]+)\/" class="button button--tag"/g)].map((m) => decodeURIComponent(m[1]));
  const sotdDate = html.match(/Site of the Day - ([A-Z][a-z]{2} \d{1,2}, \d{4})/)?.[1];
  return {
    score: score ? Number(score) : null,
    sub: sub.length === 4 ? sub : null,
    colors,
    desc: desc ? decode(desc.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')) : null,
    tagSlugs,
    sotdDate: isoDate(sotdDate),
  };
}
