# SOTD Index

**Every Awwwards Site of the Day since 2009, with filters you can actually combine.**

→ **[esirop.github.io/awwwards-sotd-index](https://esirop.github.io/awwwards-sotd-index/)**

[Awwwards](https://www.awwwards.com/websites/sites_of_the_day/) lets you browse the Sites of the Day, or a category,
or a technology, but never several filters at once. This project collects every SOTD with all of its filters
and puts them in a single page where they can be crossed freely: *Music & Sound × 3D × France*,
*Three.js sites with a red palette scored above 7.5*, *every Developer Award in 2024 without WebGL*…

## Features

- About 6,300 Sites of the Day, from June 2009 to today, updated every day.
- Filters: awards (Site of the Month, Site of the Year, Developer Award, Honors), year, category, tag,
  technology, country, font and color.
- **AND / OR** per group, and **exclusion** of any value (✕ on hover).
- Live counts next to each value: how many sites remain if you add it.
- Full-text search on title, author and description. Sort by date, score or title.
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

## Automatic updates

A [GitHub Actions workflow](.github/workflows/update.yml) runs every day at 11:00 Paris time, once Awwwards has
published its new Site of the Day: it fetches what is new,
commits `data/`, then deploys the page to GitHub Pages. On the 1st of each month it walks every listing again.

## Disclaimer

Unofficial project, not affiliated with Awwwards. The data, scores and thumbnails belong to Awwwards and to the
authors of each website; thumbnails are loaded from Awwwards' servers. The code is under the [MIT license](LICENSE).

---

## En français

Awwwards ne permet pas de croiser ses filtres. Ce projet récupère tous les Sites of the Day avec leurs
catégories, tags, technos, pays, polices, couleurs, notes et distinctions, et les rend combinables
dans une seule page, en français ou en anglais : **[esirop.github.io/awwwards-sotd-index](https://esirop.github.io/awwwards-sotd-index/)**.

En local : ouvrir `index.html`. Pour mettre les données à jour : `node scripts/scrape.mjs`.
