# Design system

The UI follows the **Dune Crafting Calculator UI** design system:
https://claude.ai/artifact/8qdQSWR29N9xv5p1Di7te3 (private to its owner; read its `project/README.md`
first). It holds the brand book, every token with its usage, the fonts, and a guideline plus preview
for each component.

The code is the source of truth. When a value changes, change it in both places:

| What | In the repository | In the design system |
| --- | --- | --- |
| Colors, fonts, spacing, radii | `src/styles/tokens.css` | `project/tokens.json` |
| Component styles | `src/styles/base.css`, `components.css`, `overlay.css` | `project/components/bundle.css` (a concatenated copy) |
| Component markup | `src/ui/*.tsx` | `project/components/<Name>/preview.html` (static copies) |
| Overlay app pages | `overlay-app/ui/style.css` (its own copy of the tokens it uses) | not mirrored |

## Rules in brief

- **Simple first**, modelled on dune.gaming.tools: one page, no tabs. The item list on the left; on the
  middle three stacked panels: Selected items, Raw materials, Crafting steps; on the right, the Machines
  panel. The machine is chosen once per kind of refinery, from picture cards (only the kinds the list
  needs), never per item. Below 1400px the Machines panel moves above Selected items, its kinds side by
  side. The item list has category tabs with game icons (All, six big categories, Other), then the
  chosen tab's items as a tree (subcategory › model › items; branches open by themselves while searching
  or filtering), and Unique / tier filter chips. No dropdowns for browsing. Add information only when the
  player asks.
- **Guild lists** (`src/ui/GuildBar.tsx`, header): on the personal list a "Share with guild" outline
  button; on a guild list a status chip (dot: `ibad-400` live, `spice-400` sending, `rust-400` offline or
  not found; name in the label face), "Copy link" and a ghost "My list". Never a spinner: edits show at
  once and the dot tells the sync state.
- **Two languages.** EN | FR in the header switches every string and every game name (the game's own
  French localization, `data/names.fr.json`). Interface strings live in `src/ui/i18n.ts`; French uses
  neutral wording (infinitives, neither "tu" nor "vous") and French number spacing (`1 500`). French names run long:
  lists wrap names onto two lines instead of truncating them.
- **Every plan row is the same**: tick box · quantity left · icon · name, with at most one details line
  for crafting steps (crafts · duration · ingredients as small icons). Clicking the quantity opens an
  "I have" field for partial stock, shown as "have N" in Ibad blue. Covered rows sink to the bottom of
  their panel, struck through; rows nothing needs any more disappear.
- **Dark only**, warm umber neutrals: `night-950` page, `night-900` panels, `night-800` controls and icon
  tiles, `night-700` dividers, `night-600` control borders.
- **Color is state.** `spice-400` = left to do (and the accent for actions and focus); `ibad-400` =
  covered or owned; `sand-500` = done, struck through; `rust-400` = errors only. Always pair the color
  with a form (a filled check, a strike-through).
- **Two faces.** Saira Semi Condensed only in uppercase labels and the title; IBM Plex Sans for
  everything read. Every quantity uses tabular figures (`.num`). Fonts are self-hosted via `@fontsource`.
- **4px grid**, radii by role (`radius-sm` chips and icon tiles, `radius-md` controls, `radius-lg`
  panels), no shadows except the overlay's text shadow.
- **Game icons** (`ItemIcon`, `StationIcon` in `src/ui/primitives.tsx`) sit on a fixed `night-800` tile:
  32px in the item list and selected items, 28px in plan rows, 18px for ingredients, 24px in the overlay,
  40px on machine cards. An item without an icon (Water) keeps an empty tile so columns stay aligned.
- **Choices are outlined in spice**: the chosen machine card and pressed filter chips get a `spice-400`
  border on `night-800`; the rest stay `night-700` / `night-600` outlines.
- **Game words verbatim**, quantity before the item (`30 Carbon Ore`), durations as `1m 10s`.
- **Overlay** (`/overlay/`): transparent page, one `overlay-panel` panel at most 360px wide, 15px text
  with `overlay-shadow`, read-only (the window is click-through), showing only what is left. In
  "Craft", the materials made along the way come first, then a `night-600` divider, then the items of
  the build list (no divider when only one of the two is left). In the
  overlay app (`?app=1`) the panel is a fixed 360px and, only while the mouse is over it, every row
  shows its tick box and the row under the mouse a small − / + on the quantity left (− = one more
  owned; + is disabled while nothing is owned, the row then showing everything needed). Clicking a quantity
  opens the same "I have" field as the calculator, at the row's height; the app lends the keyboard
  only while it is open. The tick box column is always reserved, so nothing moves on hover.
- **Overlay app** (`overlay-app/ui/`): its settings window uses the same tokens (label face for the
  title, outline spice buttons, `ibad-400` dot when the game is in front); its move mode draws a
  dashed `spice-400` frame with a "Déplacement" tag and a spice corner grip over the panel.
