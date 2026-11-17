# Token Radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/745906790xf-cpu/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/745906790xf-cpu/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar: every protocol that records no token, ranked by what
its token would be worth — built for make.fun's **Build the best token
launch radar** bounty (token-radar-01).

## The model (radar-2)

The market already prices tokens per dollar of TVL. Each category is priced
at the **median mcap/TVL of its trading members** (three or more needed;
thinner categories use the whole market's median, clamped to 0.02–2.50):

```
implied = TVL × category multiple × growth × maturity × chains
```

- **Growth** — 1 + (7-day TVL change, clamped to −50%…+100%) × 0.4
- **Maturity** — 0.70 + (days since first listed, capped at 4 years) ÷ 4 years × 0.30
- **Chains** — 1 + 0.02 per chain beyond the first, at most 1.08

No protocol name is special-cased. The board ranks pre-token protocols
only (40 on the snapshot watchlist plus the 160 largest pre-token protocols
below the floor); protocols whose token already trades are listed separately
at their market caps.

## Honesty line

The snapshot records whether a protocol has a token on file — a protocol is
said to *record no token*, never that it *has none*. The implied value is
this entry's own claim, never make.fun's, and it predicts nothing about
whether or when a token is issued.

## Run it

Node 22+, standard library only, no network:

```
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>
```

Reads the sealed snapshot, writes `board.json` (200 rows), `data.js`, copies
`dashboard/` and `screenshots/`, and writes `dossier.json`.

## Layout

- `main.ts` — entrypoint
- `lib/model.ts` — the radar-2 model, the board builder, the farm plans
- `dashboard/` — the static page (index.html, app.css, app.js)
- `screenshots/` — the three dossier images (board, detail, filtered)
- `vendor/makefun-board.ts` — make.fun's dossier library, as shipped in the kit

## License

MIT — see LICENSE.
