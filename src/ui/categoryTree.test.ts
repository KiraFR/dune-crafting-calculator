import { describe, expect, it } from 'vitest';
import { realData } from '../core/testing';
import { buildTree, MAIN_TABS, OTHER_NODE, TAB_ICON_ITEM, tabOf } from './categoryTree';

const craftable = Object.values(realData.items).filter((i) => i.producers.length > 0);
const label = (name: string) => name;
const summary = (node: { children: { name: string; count: number }[] }) => node.children.map((c) => [c.name, c.count]);

describe('category tree', () => {
  it('puts every craftable item under exactly one tab', () => {
    const total = [...MAIN_TABS, 'other' as const].reduce((n, tab) => n + buildTree(craftable, tab, label, 'en').count, 0);
    expect(total).toBe(craftable.length);
    expect(buildTree(craftable, 'all', label, 'en').count).toBe(craftable.length);
  });

  it('shows a tab’s subcategories as the first level', () => {
    const weapons = buildTree(craftable, 'Weapons', label, 'en');
    expect(summary(weapons)).toEqual([
      ['Ammunition', 1],
      ['Melee Weapons', 56],
      ['Ranged Weapons', 110],
    ]);
    // Ranged weapons go one level deeper, by weapon model.
    expect(weapons.children[2]!.children.length).toBe(12);
  });

  it('groups the small leftover categories under Other', () => {
    const other = buildTree(craftable, 'other', label, 'en');
    expect(other.count).toBe(27);
    expect(other.children).toHaveLength(8);
    const all = buildTree(craftable, 'all', label, 'en');
    expect(all.children.find((c) => c.name === OTHER_NODE)?.count).toBe(27);
    expect(all.children).toHaveLength(7);
  });

  it('has a real item for every tab icon', () => {
    for (const [tab, item] of Object.entries(TAB_ICON_ITEM)) {
      expect(realData.items[item]?.icon, item).toBeTruthy();
      expect(tabOf(realData.items[item]!)).toBe(tab);
    }
  });
});
