import { describe, expect, it } from 'vitest';
import { craftableItems, gameData, translations } from '../data';
import { i18nFor } from './i18n';

describe('French names', () => {
  const fr = i18nFor('fr');

  it('covers every item, category and station of the data file', () => {
    const names = translations.fr!;
    expect(Object.keys(names.items).sort()).toEqual(Object.keys(gameData.items).sort());
    expect(names.categories).toHaveLength(gameData.categories.length);
    expect(Object.keys(names.stations).sort()).toEqual(Object.keys(gameData.stations).sort());
  });

  it('translates game names and keeps English as the fallback', () => {
    expect(fr.item('SteelBar')).toBe("Lingot d'acier");
    expect(fr.item('Water')).toBe('Eau');
    expect(fr.station('MediumOreRefinery')).toBe('Raffinerie de minerai de taille moyenne');
    expect(fr.category('Refined Resources')).toBe('Ressources raffinées');
    expect(i18nFor('en').item('SteelBar')).toBe('Steel Ingot');
    expect(fr.item('NotAnItem')).toBe('NotAnItem');
  });

  it('formats numbers and fills interface strings per language', () => {
    expect(i18nFor('en').qty(14000)).toBe('14,000');
    expect(fr.qty(14000)).toMatch(/^14\s000$/u);
    expect(fr.t('craftsOther', { n: 3 })).toBe('3 fabrications');
    expect(i18nFor('en').t('have', { n: 12 })).toBe('have 12');
  });

  it('sorts the item list by the shown name', () => {
    expect(fr.craftable).toHaveLength(craftableItems.length);
    const names = fr.craftable.map((i) => fr.item(i.id));
    expect(names).toEqual([...names].sort(new Intl.Collator('fr-FR').compare));
  });
});
