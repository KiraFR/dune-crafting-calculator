import { describe, expect, it } from 'vitest';
import { computePlan, RecipeCycleError, type Target } from './plan';
import { makeRecipeResolver, type StationSize } from './recipeChoice';
import { fixture, lookup, rawRemaining, realData } from './testing';

function plan(
  targets: Target[],
  { owned = {}, size = 'medium', overrides = {} }: { owned?: Record<string, number>; size?: StationSize; overrides?: Record<string, string> } = {},
) {
  return computePlan(realData, targets, { owned, recipeFor: makeRecipeResolver(realData, overrides, size) });
}

describe('computePlan on real data', () => {
  it('expands 10 steel ingots at medium refineries', () => {
    const p = plan([{ item: 'SteelBar', qty: 10 }]);
    // MediumSteelRecipe: 3 Dolomite + 1 Iron Ingot + 50 Water; MediumIronBar: 4 Magnetite + 25 Water.
    expect(rawRemaining(p)).toEqual({ DolomiteRock: 30, MagnetiteOre: 40, Water: 750 });
    expect(p.steps.map((s) => [s.recipe, s.crafts, s.totalDuration])).toEqual([
      ['MediumIronBar', 10, 70],
      ['MediumSteelRecipe', 10, 40],
    ]);
    expect(p.totalDuration).toBe(110);
    expect(p.lines.SteelBar).toMatchObject({ needed: 10, remaining: 10, crafts: 10, height: 2 });
    expect(p.lines.IronBar).toMatchObject({ needed: 10, crafts: 10, height: 1 });
  });

  it('lists ingredients before the steps that use them', () => {
    const p = plan([{ item: 'SteelBar', qty: 1 }]);
    expect(p.steps.map((s) => s.item)).toEqual(['IronBar', 'SteelBar']);
    expect(p.steps[1]).toMatchObject({ stations: ['MediumOreRefinery'], duration: 4, inputs: { DolomiteRock: 3, IronBar: 1, Water: 50 } });
  });

  it('switches every refinery recipe with the size preference', () => {
    expect(rawRemaining(plan([{ item: 'SteelBar', qty: 10 }], { size: 'small' }))).toEqual({
      DolomiteRock: 40,
      MagnetiteOre: 50,
      Water: 750,
    });
    expect(rawRemaining(plan([{ item: 'SteelBar', qty: 10 }], { size: 'large' }))).toEqual({
      DolomiteRock: 20,
      MagnetiteOre: 30,
      Water: 750,
    });
  });

  it('uses a per-item recipe override', () => {
    const p = plan([{ item: 'SteelBar', qty: 10 }], { overrides: { SteelBar: 'LargeSteelBar_Recipe' } });
    expect(rawRemaining(p)).toEqual({ DolomiteRock: 20, MagnetiteOre: 40, Water: 750 });
    expect(p.lines.SteelBar!.recipe).toBe('LargeSteelBar_Recipe');
  });

  describe('owned stock cascades', () => {
    it('owning all the ingots removes their ore and water', () => {
      const p = plan([{ item: 'SteelBar', qty: 10 }], { owned: { IronBar: 10 } });
      expect(p.lines.IronBar).toMatchObject({ needed: 10, owned: 10, remaining: 0, crafts: 0 });
      expect(p.lines.MagnetiteOre).toMatchObject({ needed: 0, remaining: 0 });
      expect(rawRemaining(p)).toEqual({ DolomiteRock: 30, MagnetiteOre: 0, Water: 500 });
      expect(p.steps.map((s) => s.item)).toEqual(['SteelBar']);
    });

    it('owning part of the ingots removes part of the ore', () => {
      const p = plan([{ item: 'SteelBar', qty: 10 }], { owned: { IronBar: 4 } });
      expect(p.lines.IronBar).toMatchObject({ owned: 4, remaining: 6, crafts: 6 });
      expect(rawRemaining(p)).toEqual({ DolomiteRock: 30, MagnetiteOre: 24, Water: 650 });
    });

    it('owning some of the build target shrinks the whole tree', () => {
      const p = plan([{ item: 'SteelBar', qty: 10 }], { owned: { SteelBar: 4 } });
      expect(rawRemaining(p)).toEqual({ DolomiteRock: 18, MagnetiteOre: 24, Water: 450 });
    });

    it('owning everything leaves nothing to do', () => {
      const p = plan([{ item: 'SteelBar', qty: 10 }], { owned: { SteelBar: 99 } });
      expect(p.steps).toEqual([]);
      expect(rawRemaining(p)).toEqual({ DolomiteRock: 0, MagnetiteOre: 0, Water: 0 });
    });

    it('owned raw materials only reduce themselves', () => {
      const p = plan([{ item: 'SteelBar', qty: 10 }], { owned: { DolomiteRock: 20, Water: 1000 } });
      expect(rawRemaining(p)).toEqual({ DolomiteRock: 10, MagnetiteOre: 40, Water: 0 });
      expect(p.lines.Water).toMatchObject({ needed: 750, owned: 750 });
    });

    it('counts shared owned stock once across build entries', () => {
      const p = plan(
        [
          { item: 'SteelBar', qty: 10 },
          { item: 'IronBar', qty: 5 },
        ],
        { owned: { IronBar: 12 } },
      );
      expect(p.lines.IronBar).toMatchObject({ needed: 15, owned: 12, remaining: 3, crafts: 3 });
      expect(p.lines.MagnetiteOre!.remaining).toBe(12);
    });
  });

  it('rounds crafts up to whole batches and reports the surplus', () => {
    // AmmoRecipe: 5 Scrap Metal -> 30 Light Darts.
    const p = plan([{ item: 'Ammo', qty: 31 }]);
    expect(p.lines.Ammo).toMatchObject({ crafts: 2, surplus: 29 });
    expect(rawRemaining(p)).toEqual({ ScrapMetal: 10 });
    const owned = plan([{ item: 'Ammo', qty: 31 }], { owned: { Ammo: 1 } });
    expect(owned.lines.Ammo).toMatchObject({ crafts: 1, surplus: 0 });
  });

  it('shares spice refinery crafts between melange and spice residue', () => {
    // MediumSpice_Recipe: 750 Spice Sand + 7000 Water -> 10 Melange + 75 Spice Residue.
    const p = plan([
      { item: 'MelangeSpice', qty: 20 },
      { item: 'SpiceResidue', qty: 200 },
    ]);
    const crafts = p.lines.MelangeSpice!.crafts + p.lines.SpiceResidue!.crafts;
    expect(crafts).toBe(3); // max(20 / 10, ceil(200 / 75))
    expect(rawRemaining(p)).toEqual({ SpiceSand: 2250, Water: 21000 });
  });

  it('uses the quality level of a build entry', () => {
    const helmet = 'Assassin_Light06_Unique_Helmet';
    expect(plan([{ item: helmet, qty: 1 }]).lines.GreatHouseComponent1!.needed).toBe(17);
    expect(plan([{ item: helmet, qty: 1, quality: 2 }]).lines.GreatHouseComponent1!.needed).toBe(21);
    // Out-of-range levels clamp to the last one.
    expect(plan([{ item: helmet, qty: 1, quality: 9 }]).lines.GreatHouseComponent1!.needed).toBe(40);
  });

  it('ignores invalid quantities', () => {
    const p = plan([{ item: 'SteelBar', qty: -3 }], { owned: { IronBar: Number.NaN } });
    expect(p.steps).toEqual([]);
    expect(p.lines.SteelBar!.needed).toBe(0);
  });

  it('plans every item at every quality level without a cycle', () => {
    for (const item of Object.values(realData.items)) {
      const levels = item.producers.length ? realData.recipes[item.producers[0]!]!.levels.length : 1;
      for (let quality = 0; quality < levels; quality++) {
        const p = plan([{ item: item.id, qty: 3, quality }]);
        for (const line of Object.values(p.lines)) {
          expect(line.remaining).toBeGreaterThanOrEqual(0);
          expect(line.needed).toBe(line.owned + line.byproduct + line.remaining);
        }
      }
    }
  });
});

describe('computePlan on fixtures', () => {
  // Smelt: 2 Ore -> 1 Bar + 3 Slag. Press: 1 Ore -> 1 Slag.
  const data = fixture(['Ore', 'Bar', 'Slag'], {
    Smelt: { s: ['Bench'], d: 10, o: { Bar: 1, Slag: 3 }, q: [{ Ore: 2 }] },
    Press: { s: ['Bench'], d: 5, o: { Slag: 1 }, q: [{ Ore: 1 }] },
  });
  const recipeFor = lookup({ Bar: 'Smelt', Slag: 'Press' });

  it('uses byproducts before crafting the item itself', () => {
    // Bar is listed first, so a naive order would process Slag first.
    const p = computePlan(
      data,
      [
        { item: 'Bar', qty: 4 },
        { item: 'Slag', qty: 15 },
      ],
      { recipeFor },
    );
    expect(p.lines.Slag).toMatchObject({ needed: 15, byproduct: 12, remaining: 3, crafts: 3 });
    expect(p.lines.Ore!.needed).toBe(11);
    expect(p.byproducts).toEqual({});
  });

  it('reports unused byproducts', () => {
    const p = computePlan(data, [{ item: 'Bar', qty: 2 }], { recipeFor });
    expect(p.byproducts).toEqual({ Slag: 6 });
  });

  it('throws on a recipe cycle', () => {
    const cyclic = fixture(['A', 'B'], {
      MakeA: { s: ['Bench'], d: 1, o: { A: 1 }, q: [{ B: 1 }] },
      MakeB: { s: ['Bench'], d: 1, o: { B: 1 }, q: [{ A: 1 }] },
    });
    const resolve = lookup({ A: 'MakeA', B: 'MakeB' });
    expect(() => computePlan(cyclic, [{ item: 'A', qty: 1 }], { recipeFor: resolve })).toThrow(RecipeCycleError);
  });
});
