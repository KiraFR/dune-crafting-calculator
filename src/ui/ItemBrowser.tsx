// The "Add items" panel: category tabs with game icons, search and filters,
// then the items of the chosen tab as a tree (subcategory > model > items).

import { useDeferredValue, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import type { Item } from '../core/gameData';
import { craftableItems, translations } from '../data';
import { addToBuild } from '../state/store';
import { buildTree, MAIN_TABS, OTHER_NODE, TAB_ICON_ITEM, type TabKey, type TreeNode } from './categoryTree';
import { normalize } from './format';
import { useI18n } from './i18n';
import { ItemIcon, Panel } from './primitives';

/** Search matches the name in every language, whichever one is shown. */
const SEARCH_TEXT = new Map(
  craftableItems.map((i) => [
    i.id,
    normalize([i.name, ...Object.values(translations).map((t) => t?.items[i.id] ?? '')].join(' ')),
  ]),
);

/** Tiers that craftable items have, for the filter chips. */
const TIERS = [...new Set(craftableItems.map((i) => i.tier).filter((t): t is number => t !== undefined))].sort();

interface Filters {
  words: string[];
  uniqueOnly: boolean;
  /** Empty means every tier. */
  tiers: ReadonlySet<number>;
}

function matches(item: Item, { words, uniqueOnly, tiers }: Filters): boolean {
  if (uniqueOnly && !item.unique) return false;
  if (tiers.size && (item.tier === undefined || !tiers.has(item.tier))) return false;
  const text = SEARCH_TEXT.get(item.id)!;
  return words.every((w) => text.includes(w));
}

/** Tab labels are narrow: a word over 10 letters gets a soft hyphen in its middle, used only if it must break. */
function breakable(label: string): string {
  return label.replace(/\p{L}{11,}/gu, (word) => {
    const middle = Math.ceil(word.length / 2);
    return `${word.slice(0, middle)}­${word.slice(middle)}`;
  });
}

function GridGlyph() {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" aria-hidden="true" className="cat-tab__glyph">
      <rect x="6" y="6" width="8" height="8" />
      <rect x="18" y="6" width="8" height="8" />
      <rect x="6" y="18" width="8" height="8" />
      <rect x="18" y="18" width="8" height="8" />
    </svg>
  );
}

function DotsGlyph() {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" aria-hidden="true" className="cat-tab__glyph cat-tab__glyph--dots">
      <circle cx="9" cy="16" r="2" />
      <circle cx="16" cy="16" r="2" />
      <circle cx="23" cy="16" r="2" />
    </svg>
  );
}

function Caret({ open }: { open: boolean }) {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" className="tree-node__caret">
      <path d={open ? 'M2 4 L6 8 L10 4' : 'M4 2 L8 6 L4 10'} />
    </svg>
  );
}

interface BranchProps {
  node: TreeNode;
  depth: number;
  isOpen: (key: string) => boolean;
  toggle: (key: string) => void;
  inBuild: ReadonlySet<string>;
}

function ItemRows({ items, depth, inBuild }: { items: Item[]; depth: number; inBuild: ReadonlySet<string> }) {
  const { t, item: name } = useI18n();
  return (
    <>
      {items.map((item) => (
        <li key={item.id} style={{ '--depth': depth } as CSSProperties}>
          <button type="button" className="item-row tree-item" onClick={() => addToBuild(item.id)}>
            <ItemIcon item={item.id} size={32} />
            <span className="item-row__name">{name(item.id)}</span>
            <span className="item-row__add">{inBuild.has(item.id) ? '+1' : t('add')}</span>
          </button>
        </li>
      ))}
    </>
  );
}

function Branch({ node, depth, isOpen, toggle, inBuild }: BranchProps) {
  const { t, category } = useI18n();
  const open = isOpen(node.key);
  return (
    <li>
      <button
        type="button"
        className={`tree-node${depth === 0 ? ' tree-node--top' : ''}`}
        style={{ '--depth': depth } as CSSProperties}
        aria-expanded={open}
        onClick={() => toggle(node.key)}
      >
        <Caret open={open} />
        <span className="tree-node__name">{node.name === OTHER_NODE ? t('other') : category(node.name)}</span>
        <span className="tree-node__count">{node.count}</span>
      </button>
      {open && (
        <ul className="tree-list">
          {node.children.map((child) => (
            <Branch key={child.key} node={child} depth={depth + 1} isOpen={isOpen} toggle={toggle} inBuild={inBuild} />
          ))}
          <ItemRows items={node.items} depth={depth + 1} inBuild={inBuild} />
        </ul>
      )}
    </li>
  );
}

export function ItemBrowser({ inBuild }: { inBuild: ReadonlySet<string> }) {
  const i18n = useI18n();
  const { t } = i18n;
  const [tab, setTab] = useState<TabKey>('all');
  const [query, setQuery] = useState('');
  const [uniqueOnly, setUniqueOnly] = useState(false);
  const [tiers, setTiers] = useState<ReadonlySet<number>>(new Set());
  const [opened, setOpened] = useState<ReadonlySet<string>>(new Set());
  const deferredQuery = useDeferredValue(query);

  const words = useMemo(() => normalize(deferredQuery).split(/\s+/).filter(Boolean), [deferredQuery]);
  const filtering = words.length > 0 || uniqueOnly || tiers.size > 0;

  const tree = useMemo(() => {
    const items = i18n.craftable.filter((item) => matches(item, { words, uniqueOnly, tiers }));
    const label = (name: string) => (name === OTHER_NODE ? t('other') : i18n.category(name));
    return buildTree(items, tab, label, i18n.lang);
  }, [words, uniqueOnly, tiers, tab, i18n, t]);

  const toggleIn = <T,>(set: ReadonlySet<T>, value: T) => {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
  };

  // While searching or filtering, every branch with a match is open.
  const isOpen = (key: string) => filtering || opened.has(key);
  const toggle = (key: string) => setOpened((prev) => toggleIn(prev, key));
  const chooseTab = (next: TabKey) => {
    setTab(next);
    setOpened(new Set());
  };

  const tabs: { key: TabKey; label: string; icon: ReactNode }[] = [
    { key: 'all', label: t('all'), icon: <GridGlyph /> },
    ...MAIN_TABS.map((key) => ({ key, label: i18n.category(key), icon: <ItemIcon item={TAB_ICON_ITEM[key]} size={32} /> })),
    { key: 'other', label: t('other'), icon: <DotsGlyph /> },
  ];

  return (
    <Panel title={t('addItems')}>
      <div className="browser__filters">
        <div className="cat-tabs" role="group" aria-label={t('categories')}>
          {tabs.map(({ key, label, icon }) => (
            <button
              key={key}
              type="button"
              className="cat-tab"
              aria-pressed={tab === key}
              title={label}
              onClick={() => chooseTab(key)}
            >
              {icon}
              <span className="cat-tab__label">{breakable(label)}</span>
            </button>
          ))}
        </div>
        <input
          className="search"
          type="search"
          placeholder={t('searchItems')}
          aria-label={t('searchItems')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="chips" role="group" aria-label={t('filters')}>
          <button type="button" className="chip" aria-pressed={uniqueOnly} onClick={() => setUniqueOnly((u) => !u)}>
            {t('unique')}
          </button>
          {TIERS.map((tier) => (
            <button
              key={tier}
              type="button"
              className="chip"
              aria-pressed={tiers.has(tier)}
              aria-label={t('tier', { n: tier })}
              onClick={() => setTiers((prev) => toggleIn(prev, tier))}
            >
              T{tier}
            </button>
          ))}
        </div>
      </div>
      {tree.count === 0 && <p className="caption browser__empty">{t('noResults')}</p>}
      <ul className="browser__list tree-list">
        {tree.children.map((node) => (
          <Branch key={node.key} node={node} depth={0} isOpen={isOpen} toggle={toggle} inBuild={inBuild} />
        ))}
        <ItemRows items={tree.items} depth={0} inBuild={inBuild} />
      </ul>
    </Panel>
  );
}
