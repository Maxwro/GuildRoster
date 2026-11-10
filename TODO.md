# Forever Armory — TODO

## Done
- [x] Guild page: banner with real guild crest, stats, class breakdown, sortable/filterable roster
- [x] Character pages: gear with icons, stats, professions, mounts, achievements
- [x] Achievements: click a category to see what's missing, unfold the step-by-step checklist
- [x] Real data from Blizzard's API via `fetch-data.mjs` (realmless Forever lookups)
- [x] Missing Forever icons borrowed from Retail
- [x] Explain hidden profiles (privacy setting) instead of showing "—"
- [x] Removed login button and "Hall of Heroes" name

## Live data on this PC
- [x] `node watch-data.mjs` runs `fetch-data.mjs` every 3 minutes
- [x] The page checks for new data every minute and redraws without leaving the current view
- [x] `cache.json`: mounts/achievements/icons downloaded once a day, characters only re-downloaded
      after they log out — a refresh is ~125 API calls / 2 seconds instead of ~2,400 / 35 seconds
- [x] On GitHub: `cache.json` is kept between runs with GitHub's cache (not in the repository).
      GitHub's timer can't run more often than every 5 minutes (and is often late)

## Go live (learning project — one step at a time)
- [x] `fetch-data.mjs` reads the keys from environment variables (falls back to `.mcp.json` on the PC)
- [x] Workflow `.github/workflows/refresh.yml`: every 10 min fetch, then publish to Pages
- [x] `.gitignore` keeps `data.js` and `cache.json` out of the repository
- [ ] Create a public GitHub repository from the `armory` folder only (never `Test` — it has `.mcp.json`)
- [ ] Store the API keys as GitHub Secrets `BNET_CLIENT_ID` and `BNET_CLIENT_SECRET`
- [ ] Settings > Pages > Source: "GitHub Actions"
- [ ] Run the workflow once by hand, check the site, share the link with the guild

## Design changes
- [x] Remove the crest's border lines (they didn't line up)
- [x] Remove the site title ("Forever Armory") and the logo icon from the header
- [x] Redesign "dark fantasy, richer": no cards/boxes, gold ornament dividers, textured background,
      Cinzel + EB Garamond, stats as text, dotted leaders, text-link filters, no emojis/pill badges

## Last online for characters under level 10
- [ ] After going live: each refresh compares levels with the previous one, and when a low-level
      character's level goes up, saves "last seen levelling" with the time (runs on GitHub, no PC needed)
  - Blizzard gives no last-online date under level 10, and it only notices levelling, not logins
  - Needs a small file that survives between refreshes (kept in the repository)
  - Ruled out: an addon export, because it would need your own PC to keep uploading data

## Search other guilds
- [ ] Search for any Forever guild, not just The Freeblades
  - Blizzard can look up a guild by its exact name, but has no "search by part of a name"
  - A live site can't call the API from the browser (the key must stay secret), so this needs
    either a pre-fetched list of guilds or a small free "middleman" server (e.g. Cloudflare Workers)

## Armory improvements
- [ ] Real guild rank names (the current ones in `RANK_NAMES` are guesses)
- [ ] Crest: bigger, or a glow so the dark border stands out
- [ ] Guild-wide leaderboards (achievements, professions, item level)
- [ ] Full-body character pictures, once Blizzard fixes the wrong-race renders
- [ ] Mount sources (Blizzard's data only knows 2 of 141)
- [ ] Check the layout on a phone

## WoW MCP
- [ ] Teach it the Forever API: no realms, character `name-surname`, guild lookups and rosters
- [ ] Fix the outdated "Forever: 403" note in `WoW MCP/lib/bnet.js`
