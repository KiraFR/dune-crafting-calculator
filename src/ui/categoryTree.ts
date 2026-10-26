// Category tabs of the item list and the tree shown under the chosen tab.
// The six big top-level categories and the machines (the construction menu's
// "Placeables") get a tab each; the small leftovers (stray vehicle-part
// categories of 2 to 6 items) share an "Other" tab.

import type { Item } from '../core/gameData';

export const MAIN_TABS = ['Garments', 'Vehicles', 'Weapons', 'Utility', 'Augmentations', 'Misc', 'Placeables'] as const;

export type TabKey = 'all' | (typeof MAIN_TABS)[number] | 'other';

/** Item whose icon stands for each main tab. */
export const TAB_ICON_ITEM: Record<(typeof MAIN_TABS)[number], string> = {
  Garments: 'Assassin_Light06_Unique_Helmet',
  Vehicles: 'BuggyChassis_3',
  Weapons: 'AtreSmg3',
  Utility: 'MiningTool_1h_Heavy',
  Augmentations: 'T6_Augment_Acuracy1',
  Misc: 'SteelBar',
  Placeables: 'MediumOreRefinery_Placeable',
};

/** Node name standing for the "Other" group in the All tab. */
export const OTHER_NODE = '__other';

const isMain = (top: string | undefined): top is (typeof MAIN_TABS)[number] =>
  (MAIN_TABS as readonly (string | undefined)[]).includes(top);

export function tabOf(item: Item): TabKey {
  const top = item.category?.[0];
  return isMain(top) ? top : 'other';
}

export interface TreeNode {
  /** Path from the tab root, joined; unique within a tab. */
  key: string;
  /** English category name (or OTHER_NODE); translate for display. */
  name: string;
  children: TreeNode[];
  /** Items whose category ends at this node. */
  items: Item[];
  /** Items in this node and below. */
  count: number;
}

/** Path of an item below the tab's root. */
function pathIn(item: Item, tab: TabKey): string[] {
  const path = item.category ?? [];
  if (tab === 'all') return isMain(path[0]) ? path : [OTHER_NODE, ...path];
  if (tab === 'other') return path;
  return path.slice(1);
}

/**
 * Tree of `items` under a tab (items outside the tab are skipped). Item order
 * is kept as given; child nodes are sorted by `label`, the displayed name.
 */
export function buildTree(items: readonly Item[], tab: TabKey, label: (name: string) => string, lang: string): TreeNode {
  const root: TreeNode = { key: '', name: '', children: [], items: [], count: 0 };
  const index = new Map<string, TreeNode>([['', root]]);

  for (const item of items) {
    if (tab !== 'all' && tabOf(item) !== tab) continue;
    let node = root;
    node.count++;
    for (const name of pathIn(item, tab)) {
      const key = node.key ? `${node.key} › ${name}` : name;
      let child = index.get(key);
      if (!child) {
        child = { key, name, children: [], items: [], count: 0 };
        index.set(key, child);
        node.children.push(child);
      }
      node = child;
      node.count++;
    }
    node.items.push(item);
  }

  const sort = (node: TreeNode) => {
    node.children.sort((a, b) => label(a.name).localeCompare(label(b.name), lang));
    node.children.forEach(sort);
  };
  sort(root);
  return root;
}
