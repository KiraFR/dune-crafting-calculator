import { describe, expect, it } from 'vitest';
import {
  alternativeFamily,
  defaultRecipe,
  machineFamilies,
  makeRecipeResolver,
  stationFamily,
  stationSize,
} from './recipeChoice';
import { realData } from './testing';

describe('site data', () => {
  it('has the documented shape', () => {
    expect(Object.keys(realData.items)).toHaveLength(1025);
    expect(Object.keys(realData.recipes)).toHaveLength(981);
    expect(Object.keys(realData.stations)).toHaveLength(18);
  });

  it('has 14 items with alternative recipes', () => {
    const multi = Object.values(realData.items).filter((i) => i.producers.length > 1);
    expect(multi).toHaveLength(14);
  });

  it('reads MediumSteelRecipe with its known values', () => {
    expect(realData.recipes.MediumSteelRecipe).toEqual({
      id: 'MediumSteelRecipe',
      stations: ['MediumOreRefinery'],
      duration: 4,
      outputs: { SteelBar: 1 },
      levels: [{ DolomiteRock: 3, IronBar: 1, Water: 50 }],
    });
  });
});

describe('stationSize', () => {
  it('classifies refineries and leaves fabricators unsized', () => {
    expect(stationSize('SmallOreRefinery')).toBe('small');
    expect(stationSize('MediumChemicalRefinery')).toBe('medium');
    expect(stationSize('LargeSpiceRefinery')).toBe('large');
    expect(stationSize('SpiceRefinery')).toBe('small');
    expect(stationSize('WeaponsFabricator')).toBeUndefined();
  });
});

describe('defaultRecipe', () => {
  it('picks the station matching the preferred size', () => {
    expect(defaultRecipe(realData, 'SteelBar', 'small')).toBe('T5_Material_SteelBar_Recipe');
    expect(defaultRecipe(realData, 'SteelBar', 'medium')).toBe('MediumSteelRecipe');
    expect(defaultRecipe(realData, 'SteelBar', 'large')).toBe('LargeSteelBar_Recipe');
    expect(defaultRecipe(realData, 'MelangeSpice', 'small')).toBe('RefinedSpiceRecipe');
    expect(defaultRecipe(realData, 'MelangeSpice', 'medium')).toBe('MediumSpice_Recipe');
  });

  it('falls back to the largest smaller station, then the smallest larger one', () => {
    // Duraluminum: Medium and Large only.
    expect(defaultRecipe(realData, 'DuraluminumRod', 'small')).toBe('T5_Material_DuraluminumRods_Recipe');
    expect(defaultRecipe(realData, 'DuraluminumRod', 'large')).toBe('LargeDuraluminiumBar_Recipe');
    // Fuel cell: Small and Medium only.
    expect(defaultRecipe(realData, 'FuelCanister', 'large')).toBe('MediumFuelBladder_Recipe');
  });

  it('returns the only recipe, or none for raw materials', () => {
    expect(defaultRecipe(realData, 'Ammo', 'large')).toBe('AmmoRecipe');
    expect(defaultRecipe(realData, 'MagnetiteOre', 'medium')).toBeUndefined();
    expect(defaultRecipe(realData, 'Water', 'medium')).toBeUndefined();
  });
});

describe('machines per kind', () => {
  it('groups the refineries that alternative recipes use by kind', () => {
    expect(machineFamilies(realData)).toEqual([
      {
        family: 'ChemicalRefinery',
        stations: [
          { size: 'small', station: 'SmallChemicalRefinery' },
          { size: 'medium', station: 'MediumChemicalRefinery' },
        ],
      },
      {
        family: 'OreRefinery',
        stations: [
          { size: 'small', station: 'SmallOreRefinery' },
          { size: 'medium', station: 'MediumOreRefinery' },
          { size: 'large', station: 'LargeOreRefinery' },
        ],
      },
      {
        family: 'SpiceRefinery',
        stations: [
          { size: 'small', station: 'SpiceRefinery' },
          { size: 'medium', station: 'MediumSpiceRefinery' },
          { size: 'large', station: 'LargeSpiceRefinery' },
        ],
      },
    ]);
    expect(stationFamily('SpiceRefinery')).toBe('SpiceRefinery');
    expect(alternativeFamily(realData, 'SteelBar')).toBe('OreRefinery');
    expect(alternativeFamily(realData, 'Ammo')).toBeUndefined();
  });

  it('uses the machine chosen for each kind, medium when none is', () => {
    const prefs = { OreRefinery: 'large', ChemicalRefinery: 'small' } as const;
    expect(defaultRecipe(realData, 'SteelBar', prefs)).toBe('LargeSteelBar_Recipe');
    expect(defaultRecipe(realData, 'Silicone', prefs)).toBe('T2_Material_Silicone_Recipe');
    expect(defaultRecipe(realData, 'MelangeSpice', prefs)).toBe('MediumSpice_Recipe');
  });

  it('falls back when an item cannot be made on the chosen machine', () => {
    // Duraluminum has no small ore refinery recipe.
    expect(defaultRecipe(realData, 'DuraluminumRod', { OreRefinery: 'small' })).toBe('T5_Material_DuraluminumRods_Recipe');
  });
});

describe('makeRecipeResolver', () => {
  it('honours overrides that make the item and ignores the others', () => {
    const resolve = makeRecipeResolver(
      realData,
      { SteelBar: 'LargeSteelBar_Recipe', IronBar: 'MediumSteelRecipe' },
      'medium',
    );
    expect(resolve('SteelBar')).toBe('LargeSteelBar_Recipe');
    expect(resolve('IronBar')).toBe('MediumIronBar');
  });
});
