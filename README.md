# Dune: Awakening Crafting Calculator

Plan what you want to craft in Dune: Awakening, tick off what you already have, and see what is left
to gather: in the browser, with your guild, and over the game.

## What it does

- **Plans a build.** Pick items and quantities: the calculator totals the raw materials and lists the
  crafting steps in order, with the refinery each one needs.
- **Subtracts what you own, in cascade.** Owning 10 ingots removes the ore for those 10. Partial stock
  works too ("I have 40").
- **Shares a list with your guild.** One secret link, no accounts: everyone edits the same list and
  stock, live.
- **Shows what is left in game.** A small Windows overlay floats the remaining items over Dune, and you
  can tick them without leaving the game.
- **English or French**, game names included (taken from the game's own French localization).
- **Recipes straight from the game files**, so they match the patch they were extracted from (see
  [tools/README.md](tools/README.md)).

## Using it

### The calculator

1. Pick items from the list on the left (category tabs, search, Unique / tier filters) and set their
   quantities.
2. In **Machines**, choose the refinery you use for each kind (ore, chemical, spice): recipes follow
   that size.
3. Read **Raw materials** and **Crafting steps**. Tick a row once you have it, or click its quantity to
   enter what you have so far.

Your list stays in your browser.

### With your guild

**Share with guild** puts the list online and adds `?list=…` to the address. Send that link to your
guild with **Copy link**: everyone who has it sees and edits the same list and stock, live. The link is
the only key, so keep it within the guild. **My list** brings you back to your personal list.

### The in-game overlay

1. Download `dune-overlay-setup.exe` from the [latest release](../../releases/latest) and run it. It
   installs for your Windows user only, with no admin rights. The app is not code-signed, so Windows
   SmartScreen warns the first time: **More info**, then **Run anyway**.
2. Play Dune in **borderless windowed** mode. Nothing can draw over exclusive fullscreen.
3. Paste your guild link in the overlay's settings. From then on, the overlay shows whenever Dune runs.
4. **Ctrl + Shift + O** hides or shows it. Hover the panel to tick a row or change it with − / +.

The hotkey, position, size, opacity, text size and sections can all be changed from its settings or
its tray icon: see [overlay-app/README.md](overlay-app/README.md). The overlay never touches the game
process (nothing is injected into it or read from it): it only checks the process list to see whether
Dune runs.

Release builds open the site they were built for. To use the overlay with your own copy of the site,
build it with your address (see [Building the overlay app](#building-the-overlay-app)).

## Running your own copy

### Locally

Needs Node 22 or later.

```
npm install
npm run dev        # http://localhost:5173, the overlay page at http://localhost:5173/overlay/
```

That is the whole calculator, without guild lists. To try those locally too (needs Docker):

```
npm run db:start               # local Supabase; the first run pulls its images
cp .env.example .env.local     # then fill in the values it lists
```

`npm test` runs the unit tests (planning maths, sync, translations); `npm run build` typechecks and
writes the static site to `dist/`.

### Guild lists

Guild lists are stored in a [Supabase](https://supabase.com) project; the free tier is plenty.

1. Create a project and apply `supabase/migrations/` once: paste the SQL in the dashboard's SQL editor,
   or run `npx supabase link` then `npx supabase db push`.
2. Copy `.env.production.example` to `.env.production` (it is not committed) and fill in the project's
   URL and publishable key (dashboard, Project Settings > API). Both are public anyway, since they ship
   in the site's code. Never put the `service_role` key or the database password there.

Without them, `npm run build` still works and gives a personal calculator without Share.

### Deploying

The site is static. `deploy/deploy.sh` serves it with nginx in a Docker container on your server, behind
the reverse proxy that already handles HTTPS there (Caddy, Traefik, nginx…). You need SSH access to the
server, and Docker with Compose on it.

1. Fill in the deployment part of `.env.production`:

   | Variable | Meaning |
   | --- | --- |
   | `SITE_URL` | the site's public address, e.g. `https://dune.example.com` (for the overlay app) |
   | `DEPLOY_HOST` | the server: an SSH host, or an alias from `~/.ssh/config` |
   | `DEPLOY_DIR` | the directory on the server for the site and its compose file |
   | `DEPLOY_NETWORK` | the Docker network your reverse proxy shares with the site's container |

2. Point the host name's DNS record at the server, and have the reverse proxy forward it to
   `dune-web:80` over `DEPLOY_NETWORK`. With Caddy:

   ```
   dune.example.com {
       reverse_proxy dune-web:80
   }
   ```

3. Deploy, now and after each change:

   ```
   bash deploy/deploy.sh
   ```

   It stops before doing anything if a Supabase or `DEPLOY_` setting is missing. Otherwise it builds the
   site, uploads it as a
   new release in `$DEPLOY_DIR/site/releases/`, switches `site/current` to it in one step (the three
   latest releases are kept), and makes sure the `dune-web` container runs (`deploy/docker-compose.yml`,
   `deploy/nginx.conf`). The container publishes no port: only the reverse proxy reaches it.

### Building the overlay app

Needs Rust (MSVC toolchain) and the Visual Studio C++ build tools.

```
cd overlay-app
npx @tauri-apps/cli@2.12.4 build   # the exe, then the installer in target/release/bundle/nsis/
```

The app is built against one site, `SITE_URL`, read from the environment or from `.env.production`.
The build stops if it is missing.

GitHub Actions builds the exe and the installer on every push that touches `overlay-app/` (artifact
`dune-overlay-windows`). It reads `SITE_URL` from a repository secret of the same name (Settings >
Secrets and variables > Actions), which keeps it out of the build logs. Pushing a tag `overlay-v<version>` also publishes both as a
release; bump `version` in `overlay-app/tauri.conf.json` and `overlay-app/Cargo.toml` first, since the
installer compares it with the installed one. Tests and internals: [overlay-app/README.md](overlay-app/README.md).

## How it works

### The plan

- Items are processed in topological order, every consumer before its ingredients, so an item's
  total demand is known before its crafts are counted. Owned stock is subtracted at that point,
  which is what makes it cascade. The recipe graph has no cycles; a cycle would raise
  `RecipeCycleError`.
- Crafts round up to whole batches (Light Darts craft 30 at a time); the extra is reported as surplus.
- Spice refining yields Spice Residue as a byproduct. Byproducts cover demand for that item before
  any craft of it, and leftovers are reported.
- 14 items have several recipes that differ by refinery size within one kind of refinery (ore,
  chemical, spice). The player picks the machine used for each kind (the page shows a choice only for
  the kinds the current list needs; medium by default). Each item then uses the largest machine of its
  kind not above that size, else the smallest above it (Duraluminum has no small ore refinery recipe).
  `makeRecipeResolver` also accepts per-item overrides; the page does not offer them.
- 193 recipes have quality levels 0 to 5; a build entry picks its level, ingredients stay at level 0.

### State and guild lists

The personal list (build list, owned quantities, machines) and the language are saved in
`localStorage` under `dune-crafting-calculator:v1`; an overlay page in the same browser follows it
live. A guild list lives in Supabase instead; the language stays personal.

- Storage: one `lists` row per list (`supabase/migrations/`). The table is closed to the public API;
  clients call `create_list`, `get_list` and `save_list`, so lists cannot be enumerated.
- Saves are compare-and-swap on a version number. Each edit is a pure function of the shared state
  (`src/state/store.ts`): shown at once, saved in the background, and replayed on top of the latest
  list when someone saved first (`src/sync/sharedList.ts`, unit-tested).
- A − / + is saved as "one more owned" rather than as the new total, so two players pressing − at once
  count twice (`src/state/changes.ts`).
- Live updates: after each save the client broadcasts the new state on the Realtime channel
  `list:<uuid>`. A client that reconnects, or a tab that comes back, reads the list again. Offline
  edits stay on screen and are sent when the network is back.

### The overlay page

`/overlay/?list=<uuid>` shows a guild list's remaining items. `sections=gather` or `sections=craft`
shows one section only (both by default, gathering above crafting). The overlay app loads it with
`&app=1`, and the page then talks to the app through `postMessage`:

- it posts its panel's rectangle (`dune-overlay:layout`, `src/overlay/appBridge.ts`) so the app can fit
  its window to it and let the mouse through everywhere else;
- while the mouse is over the panel, each row shows a tick box and the row under the mouse − / + on the
  quantity left (− is one more owned);
- a click on a quantity opens the "I have" field, and the page asks the app for the keyboard while it is
  open (`dune-overlay:keyboard`, `wanted: true`, then `false`);
- the app switches sections live with `{ type: 'dune-overlay:options', sections: [...] }`.

### Layout

```
data/site-data.json   recipe data extracted from the game (see tools/README.md)
data/names.fr.json    French names of its items, categories and stations
public/icons/         item and station icons extracted from the game, 64px WebP, served at /icons/
tools/                extraction pipeline (DataTables and icons)
src/core/             planning maths, framework-free and unit-tested
  gameData.ts         typed, indexed view of site-data.json
  recipeChoice.ts     which recipe makes an item (machine chosen per kind of refinery)
  plan.ts             aggregated plan: totals, owned cascade, byproducts, ordered steps
src/state/            state (personal in localStorage, or a guild list) and the derived plan
src/sync/             guild list sync: SharedList (optimistic edits, CAS saves) and its Supabase backend
supabase/             local Supabase config and the lists migration
src/ui/               React views: item list, selected items, raw materials and crafting steps;
                      i18n.ts holds the interface strings and the name lookups per language
src/app/, src/overlay/  the two pages
src/styles/           design tokens and component styles (see DESIGN.md)
deploy/               deployment script, nginx container and its config
overlay-app/          the in-game overlay window (Tauri), see overlay-app/README.md
```

## Game data

This is a fan project, not affiliated with or endorsed by Funcom. `data/site-data.json` and the icons
in `public/icons/` are extracted from Dune: Awakening and belong to Funcom and its licensors.
