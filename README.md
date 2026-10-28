# SOTD Index

**Every Awwwards Site of the Day since 2009, with filters you can actually combine.**

→ **[esirop.github.io/awwwards-sotd-index](https://esirop.github.io/awwwards-sotd-index/)**

[Awwwards](https://www.awwwards.com/websites/sites_of_the_day/) lets you browse the Sites of the Day, or a category,
or a technology, but never several filters at once. This project collects every SOTD with all of its filters
and puts them in a single page where they can be crossed freely: *Music & Sound × 3D × France*,
*Three.js sites with a red palette scored above 7.5*, *every Developer Award in 2024 without WebGL*…

## Features

- About 6,300 Sites of the Day, from June 2009 to today.
- Filters: awards (Site of the Month, Site of the Year, Developer Award, Honors), year, category, tag,
  technology, country, font and color.
- **AND / OR** per group, and **exclusion** of any value (✕ on hover).
- Live counts next to each value: how many sites remain if you add it.
- Full-text search on title, author and description. Newest or oldest first.
- The URL keeps your filters, so a search can be bookmarked or shared.
- English and French interface. Works on mobile.

## Run it locally

Requires Node.js 18 or later, no dependencies.

```bash
git clone https://github.com/ESirop/awwwards-sotd-index.git
cd awwwards-sotd-index
```

Then open `index.html` in a browser (no server needed). The repository already contains the data.

To refresh the data yourself:

```bash
node scripts/scrape.mjs
```

| Source | What it gives |
| --- | --- |
| SOTD listing (~200 pages) | title, link, thumbnail, date, author, awards, categories, tags, technologies |
| Country and Font listings of the filter menu (~2,000 pages) | country and fonts of each SOTD |
| Each SOTD page (~6,300) | colors, score and sub-scores, description |

The first run takes about an hour. Everything is saved in `data/state.json`: the run can be stopped (Ctrl+C)
and resumed, and later runs only fetch what is new.

Options: `--full` (walk every listing again), `--skip-details`, `--skip-facets`,
`--build` (only rebuild `data/sotd.js`), `--concurrency N` (default 4).

### One-off cross search

`scripts/search.mjs` crosses any `/websites/<slug>/` listings live, without the index:

```bash
node scripts/search.mjs music-sound --award sotd
node scripts/search.mjs music-sound 3d --award sotd,sotm
node scripts/search.mjs --list
```

## Updating the live page

Awwwards blocks requests coming from GitHub's servers, so the data is refreshed from a regular computer:

```bash
npm run update            # fetch what is new (a few minutes), commit and push data/
npm run update -- --full  # walk every listing again (about an hour)
```

Every push to `main` redeploys the page through a [GitHub Actions workflow](.github/workflows/deploy.yml).

## Disclaimer

Unofficial project, not affiliated with Awwwards. The data, scores and thumbnails belong to Awwwards and to the
authors of each website; thumbnails are loaded from Awwwards' servers. The code is under the [MIT license](LICENSE).
Fonts: [Inter Tight](https://fonts.google.com/specimen/Inter+Tight) and [Piazzolla](https://fonts.google.com/specimen/Piazzolla),
both under the SIL Open Font License (see `assets/fonts/`).

Made by [griffon noir](https://griffonnoir.com/).

---

## En français

Awwwards ne permet pas de croiser ses filtres. Ce projet récupère tous les Sites of the Day avec leurs
catégories, tags, technos, pays, polices, couleurs, notes et distinctions, et les rend combinables
dans une seule page, en français ou en anglais : **[esirop.github.io/awwwards-sotd-index](https://esirop.github.io/awwwards-sotd-index/)**.

En local : ouvrir `index.html`. Pour mettre à jour la page en ligne : `npm run update`
(récupère les nouveautés, puis commit et push de `data/` ; la page se redéploie toute seule).
