# Dune Overlay

A small Windows app that floats the crafting calculator's "what is left" panel over Dune: Awakening.
The window is transparent and always on top, and it shows while the game runs, Alt-Tab included. Clicks
go through it to the game, except over the panel, where items can be ticked or their owned quantity
changed. The game must run in borderless windowed mode (an always-on-top window cannot cover exclusive
fullscreen).

## Installing, updating, uninstalling

- **Install**: run `dune-overlay-setup.exe` from the latest `overlay-v*` release. It installs for the
  current Windows user only, in `%LOCALAPPDATA%\Dune Overlay`, without admin rights, and adds a Start
  menu shortcut. It is in French or English, after Windows' language.
- **Updates install themselves** (from 0.3.0 on). The app checks for a newer release at launch and
  every 6 hours, downloads it in the background, and installs it at a quiet moment: when Dune is not
  running and neither the settings nor the list window is open, so never during a game. It then quits
  for a few seconds and comes back in the new version; settings are kept. The tray icon's tooltip shows
  the version. Running a newer setup by hand still works too.
- **Uninstall**: Windows Settings > Apps > Installed apps > Dune Overlay. The uninstaller offers to
  delete the app's data as well (settings and the WebView2 profile); unticked, they stay for a later
  install.
- The portable `dune-overlay.exe` from the same release still runs as is. It shares the settings with
  an installed copy; delete it once the installed one runs.
- Neither file is code-signed, so Windows SmartScreen warns on first launch ("More info" > "Run anyway").

## Using it

- **First launch**: the settings window asks for the guild list link, copied from the calculator's
  "Copy link" (`<site>/?list=<id>`). It is remembered.
- **Ticking from the overlay**: hover the panel to get a tick box (owned in full) and − / + on the
  quantity left (− = one more owned) on each row; the guild list updates for everyone. Away from the panel, the mouse
  goes to the game. This needs the calculator's overlay page with `app=1` support.
- **Hide / show**: `Ctrl + Shift + O` by default, from anywhere, the game included. Change it in the
  settings: click the field, press the new keys. A plain letter needs Ctrl, Alt or Shift (it would fire
  while typing in chat); F1 to F24 work alone.
- **Position and size**: "Move the overlay" in the settings or the tray menu. The window then takes the
  mouse: drag it by its dashed frame, resize it from the corner grip, then "Lock". The place is kept for
  the next launch. The window also grows by itself when the list no longer fits in it.
- **Look**: opacity (30 to 100 %) and text size (80 to 150 %), applied at once.
- **Sections**: show "À récolter", "À fabriquer" or both (one above the other); one stays on.
- **Always visible**: shows the overlay even when Dune is not running (the hotkey still hides it).
- **The whole calculator**: "Open the list" in the settings or the tray opens the guild list's
  calculator in a window of the app, to tick without a browser. Its place is kept too.
- **Tray icon** (next to the clock): settings, open the list, move / lock, hide / show, quit. Closing a
  window keeps the app running.

Settings live in `%APPDATA%\dune-crafting-calculator.overlay\settings.json`.

## How it works

- The calculator's address (`<site>` here) is baked in at build time, from `SITE_URL` (see Building).
- `ui/overlay.html` is a local page that shows `<site>/overlay/?list=<id>&app=1&sections=gather,craft`
  in an iframe, and draws the move-mode frame and grip itself. Only the app's own pages can call the app
  (`capabilities/default.json`); the calculator pages (the overlay iframe and the list window) get no
  IPC, and the CSP allows frames from that site only. The app builds the URLs from the list id, never
  from pasted text.
- With `app=1` the calculator page posts `{ type: 'dune-overlay:layout', panel: {x, y, width, height} }`
  (CSS px) to its parent whenever its panel changes. `ui/overlay.js` checks the origin, converts with
  `devicePixelRatio` and hands it to the app, which keeps it for the hover test and grows the window to
  fit (never shrinks it, and keeps it on its screen). Section changes go the other way as
  `{ type: 'dune-overlay:options', sections }`, so nothing reloads.
- Both pages declare `color-scheme: dark`, like the calculator: Chromium paints an opaque backdrop
  behind an iframe whose scheme differs from its parent's.
- `src/detect.rs` looks `DuneSandbox-Win64-Shipping.exe` up in a process-list snapshot once a second.
  It never opens a handle to the game process, which BattlEye protects; nothing is injected into or read
  from the game.
- `src/update.rs` uses Tauri's updater plugin. It reads `latest.json` from the latest GitHub release
  (endpoint in `tauri.conf.json`), checks the installer's signature against the public key there, and
  runs the installer silently (`installMode: quiet`), which restarts the app.
- `src/main.rs` ticks every 50 ms and is the only place that shows or hides the overlay (shown in move
  mode, otherwise when a list is set, the player has not hidden it and Dune runs or "always visible" is
  on) and, outside move mode, the only place that gives it the mouse: only while the cursor
  (`GetCursorPos`) is inside the panel. The overlay window cannot take focus, so neither showing it nor
  clicking it pulls focus away from the game.

## Building

Needs Rust (MSVC toolchain), the Visual Studio C++ build tools and the WebView2 runtime (built into
Windows 11). No Node packages: the pages are plain HTML and JavaScript.

The app is built against one calculator: `SITE_URL`, an https origin without a trailing slash (e.g.
`https://dune.example.com`), taken from the environment, else from the repository's `.env.production`
(see `.env.production.example`). `build.rs` stops the build if it is missing or malformed, and writes
the CSP's `frame-src` from it (`tauri.conf.json` only holds a fallback that allows no frames).

```
cargo build --release          # target/release/dune-overlay.exe, runs as is
cargo test                     # list link parsing, settings defaults and ranges, overlay URL
node --test tests/hotkey.test.cjs
python scripts/make_icons.py   # redraws icons/ (standard library only)
npx @tauri-apps/cli@2.12.4 build   # the exe, then the installer in target/release/bundle/nsis/
```

The installer is Tauri's NSIS bundle, set in `tauri.conf.json` (`bundle.windows.nsis`: per-user
install, French and English). The first build downloads NSIS into `%LOCALAPPDATA%\tauri`. A plain
build is unsigned, which is fine to try the app; installed apps only accept updates signed with the
updater's key.

`nsis/installer.nsi` is Tauri's own NSIS template, from the Tauri CLI version the build uses (2.12.4),
with one change, described at its top: the installer also finds an installed version through its
uninstall entry. Tauri looks it up under the publisher's registry key only, and the publisher changed
after 0.2.1, so without the change a 0.2.1 install could not be uninstalled by a newer setup ("Unable to
uninstall"). When upgrading the Tauri CLI, take its new template and reapply the change.

GitHub Actions (`.github/workflows/overlay-app.yml`) runs the tests and builds the exe and the installer
on a Windows runner for every push to `main` or pull request that touches `overlay-app/`, and on demand
(Run workflow). Both are the run's `dune-overlay-windows` artifact (kept 90 days). It needs three
repository secrets (Settings > Secrets and variables > Actions), masked in the logs:

| Secret | What |
| --- | --- |
| `SITE_URL` | the calculator's address; pull requests from forks, which get no secrets, build against a placeholder |
| `TAURI_SIGNING_PRIVATE_KEY` | the updater's private key, the content of the `.key` file |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | its password |

The key pair comes from `npx @tauri-apps/cli@2.12.4 signer generate -w <file>`: the public half goes in
`tauri.conf.json` (`plugins.updater.pubkey`), the private half and its password in the secrets. Keep a
copy of both somewhere safe: an app installed with this public key only accepts updates signed with
that private key, so losing it means every player has to reinstall by hand. A fork uses its own key
pair and points `plugins.updater.endpoints` at its own releases.

To publish a version:

1. Bump `version` in both `tauri.conf.json` and `Cargo.toml` (then build once so `Cargo.lock` follows),
   and push.
2. Push a tag `overlay-v<version>`, e.g. `overlay-v0.3.0`. The workflow refuses a tag that does not
   match the version, builds and signs the installer (`tauri.updater.conf.json` turns the signature on),
   writes `latest.json` and publishes a GitHub release with `dune-overlay-setup.exe`, `dune-overlay.exe`
   and `latest.json`.
3. Installed apps pick it up within 6 hours, or at their next launch.

The updater reads the release from GitHub without signing in, so it only works while the repository
is public.

To try it without the game, set `DUNE_OVERLAY_GAME_EXE` to another program's executable before
launching (`charmap.exe` works well). The overlay then shows while that program runs. Quit from the
tray rather than killing the process: a forced kill leaves WebView2 processes behind for a few seconds,
and a relaunch in that window can start badly.
