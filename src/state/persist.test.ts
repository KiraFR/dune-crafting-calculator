import { describe, expect, it } from 'vitest';
import { realData } from '../core/testing';
import { EMPTY_STATE, sanitizeState } from './persist';

describe('sanitizeState', () => {
  it('returns the empty state for garbage, in the fallback language', () => {
    expect(sanitizeState(realData, null)).toEqual(EMPTY_STATE);
    expect(sanitizeState(realData, 'x', 'fr')).toEqual({ ...EMPTY_STATE, lang: 'fr' });
  });

  it('keeps valid entries and drops what the game data no longer has', () => {
    const state = sanitizeState(realData, {
      build: [
        { item: 'SteelBar', qty: 10.7, quality: 0 },
        { item: 'SteelBar', qty: 3 },
        { item: 'MagnetiteOre', qty: 5 }, // raw: nothing to craft
        { item: 'RemovedItem', qty: 1 },
      ],
      owned: { IronBar: 4, MagnetiteOre: -2, RemovedItem: 3, Water: 'lots' },
      choices: { SteelBar: 'LargeSteelBar_Recipe' }, // per-item overrides from older saves are dropped
      machines: { OreRefinery: 'large', ChemicalRefinery: 'large', Teleporter: 'small' },
      lang: 'fr',
    });
    expect(state).toEqual({
      build: [{ item: 'SteelBar', qty: 10, quality: 0 }],
      owned: { IronBar: 4 },
      // Chemical refineries come in small and medium only.
      machines: { OreRefinery: 'large' },
      lang: 'fr',
    });
  });

  it('turns the single refinery size of older saves into a size per kind', () => {
    const state = sanitizeState(realData, { size: 'small', lang: 'de' }, 'en');
    expect(state.machines).toEqual({ ChemicalRefinery: 'small', OreRefinery: 'small', SpiceRefinery: 'small' });
    expect(state.lang).toBe('en');
  });
});
