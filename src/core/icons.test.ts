import { describe, expect, it } from 'vitest';
import { iconFile } from './gameData';
import { realData } from './testing';

// Files exported by `RecipeExport icons` (tools/README.md, step 7).
const exported = new Set(
  Object.keys(import.meta.glob('../../public/icons/*.webp')).map((path) => path.slice(path.lastIndexOf('/') + 1)),
);

describe('icons', () => {
  it('names the file after the texture, for relative and DLC paths alike', () => {
    expect(iconFile(realData.items.SteelBar!.icon)).toBe('T_UI_IconResourceSteelBar_D.webp');
    expect(iconFile(realData.items.Water!.icon)).toBeUndefined();
    const dlc = Object.values(realData.items).find((i) => i.icon?.startsWith('/Game/DLC/'));
    expect(iconFile(dlc?.icon)).toMatch(/^T_[^/]+\.webp$/);
  });

  it('has an exported file for every item and station icon the data references', () => {
    const referenced = [
      ...Object.values(realData.items).map((i) => i.icon),
      ...Object.values(realData.stationIcons),
    ];
    const missing = referenced.map(iconFile).filter((file): file is string => file !== undefined && !exported.has(file));
    expect(missing).toEqual([]);
    expect(Object.keys(realData.stationIcons)).toHaveLength(18);
    expect(exported.size).toBe(431);
  });

  it('marks the items the game calls Unique', () => {
    expect(realData.items.Assassin_Light06_Unique_Helmet!.unique).toBe(true);
    expect(realData.items.SteelBar!.unique).toBe(false);
  });
});
