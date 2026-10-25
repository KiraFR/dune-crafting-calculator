// Aggregated crafting plan for a build list: how much of every item is needed,
// what owned stock covers, what is left to craft or gather, and in which order.
//
// Items are processed in topological order (every consumer before its
// ingredients), so an item's total demand is known before its crafts are
// counted. Owned stock is subtracted at that point, which is what makes it
// cascade: owning 10 ingots means 10 fewer crafts, hence no ore for them.

import { ingredientsAt, type GameData, type Recipe } from './gameData';
import type { RecipeResolver } from './recipeChoice';

export interface Target {
  item: string;
  qty: number;
  /** Quality level of the item's recipe; 0 (base) when absent. */
  quality?: number;
}

export interface PlanOptions {
  recipeFor: RecipeResolver;
  /** Owned quantities by item ID. */
  owned?: Readonly<Record<string, number>>;
}

export interface PlanLine {
  item: string;
  /** Recipe used to make it; undefined for raw materials. */
  recipe?: string;
  quality: number;
  /** Total demand: build list plus the ingredients of every craft that uses it. */
  needed: number;
  /** Part of `needed` covered by owned stock. */
  owned: number;
  /** Part of `needed` covered by other recipes' byproducts (spice residue). */
  byproduct: number;
  /** needed - owned - byproduct: left to craft, or to gather for raw materials. */
  remaining: number;
  crafts: number;
  /** Units made beyond `remaining` because a craft yields a whole batch. */
  surplus: number;
  /** 0 for raw materials, else 1 + the highest ingredient height. */
  height: number;
}

export interface PlanStep {
  item: string;
  recipe: string;
  crafts: number;
  stations: string[];
  /** Seconds per craft. */
  duration: number;
  totalDuration: number;
  inputs: Record<string, number>;
  /** Everything the crafts yield, byproducts included. */
  outputs: Record<string, number>;
  height: number;
}

export interface Plan {
  lines: Record<string, PlanLine>;
  /** Raw materials, in processing order. */
  raw: PlanLine[];
  /** Crafted items (build list included), lowest height first. */
  crafted: PlanLine[];
  /** Crafts still to do, ingredients before the items that use them. */
  steps: PlanStep[];
  /** Byproducts left over after covering demand. */
  byproducts: Record<string, number>;
  totalDuration: number;
}

export class RecipeCycleError extends Error {
  constructor(readonly items: string[]) {
    super(`Recipe cycle between: ${items.join(', ')}`);
  }
}

function count(value: number | undefined): number {
  return value !== undefined && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

function add(map: Map<string, number> | Record<string, number>, key: string, amount: number): void {
  if (map instanceof Map) map.set(key, (map.get(key) ?? 0) + amount);
  else map[key] = (map[key] ?? 0) + amount;
}

/** Kahn's algorithm; undefined when the edges contain a cycle. */
function topologicalOrder(nodes: Set<string>, edges: (node: string) => string[]): string[] | undefined {
  const indegree = new Map<string, number>();
  for (const n of nodes) indegree.set(n, 0);
  for (const n of nodes) for (const m of edges(n)) add(indegree, m, 1);

  const order = [...nodes].filter((n) => indegree.get(n) === 0);
  for (let i = 0; i < order.length; i++) {
    for (const m of edges(order[i]!)) {
      const left = indegree.get(m)! - 1;
      indegree.set(m, left);
      if (left === 0) order.push(m);
    }
  }
  return order.length === nodes.size ? order : undefined;
}

export function computePlan(data: GameData, targets: readonly Target[], options: PlanOptions): Plan {
  const owned = options.owned ?? {};
  const demand = new Map<string, number>();
  const quality = new Map<string, number>();
  for (const t of targets) {
    add(demand, t.item, count(t.qty));
    if (!quality.has(t.item)) quality.set(t.item, count(t.quality));
  }

  const recipes = new Map<string, Recipe | undefined>();
  const recipeOf = (item: string): Recipe | undefined => {
    if (!recipes.has(item)) {
      const id = options.recipeFor(item);
      recipes.set(item, id === undefined ? undefined : data.recipes[id]);
    }
    return recipes.get(item);
  };
  const ingredientsOf = (item: string): Record<string, number> => {
    const recipe = recipeOf(item);
    return recipe ? ingredientsAt(recipe, quality.get(item) ?? 0) : {};
  };

  // Every item the build can reach through the chosen recipes.
  const reached = new Set<string>();
  const pending = [...demand.keys()];
  while (pending.length) {
    const item = pending.pop()!;
    if (reached.has(item)) continue;
    reached.add(item);
    pending.push(...Object.keys(ingredientsOf(item)));
  }

  // Consumers come before ingredients. Byproducts also come after the item whose
  // recipe yields them, so the free units are known when the byproduct is
  // processed; that ordering is dropped if it would create a cycle. Two items
  // made by the same recipe (melange and spice residue) need no ordering: either
  // way the crafts add up to what the larger of the two needs.
  const ingredientEdges = (item: string) => Object.keys(ingredientsOf(item));
  const byproductEdges = (item: string) => {
    const recipe = recipeOf(item);
    const outs = Object.keys(recipe?.outputs ?? {});
    const freed = outs.filter((o) => o !== item && reached.has(o) && recipeOf(o) !== recipe);
    return [...ingredientEdges(item), ...freed];
  };
  const order = topologicalOrder(reached, byproductEdges) ?? topologicalOrder(reached, ingredientEdges);
  if (!order) throw new RecipeCycleError([...reached]);

  const freeUnits = new Map<string, number>();
  const lines: Record<string, PlanLine> = {};
  const steps: PlanStep[] = [];

  for (const item of order) {
    const needed = demand.get(item) ?? 0;
    const fromOwned = Math.min(count(owned[item]), needed);
    const fromByproduct = Math.min(freeUnits.get(item) ?? 0, needed - fromOwned);
    if (fromByproduct) add(freeUnits, item, -fromByproduct);
    const remaining = needed - fromOwned - fromByproduct;

    const recipe = recipeOf(item);
    let crafts = 0;
    let surplus = 0;
    if (recipe) {
      const perCraft = recipe.outputs[item]!;
      crafts = Math.ceil(remaining / perCraft);
      surplus = crafts * perCraft - remaining;
      if (crafts > 0) {
        const step: PlanStep = {
          item,
          recipe: recipe.id,
          crafts,
          stations: recipe.stations,
          duration: recipe.duration,
          totalDuration: crafts * recipe.duration,
          inputs: {},
          outputs: {},
          height: 0,
        };
        for (const [ingredient, n] of Object.entries(ingredientsOf(item))) {
          add(demand, ingredient, crafts * n);
          step.inputs[ingredient] = crafts * n;
        }
        for (const [out, n] of Object.entries(recipe.outputs)) {
          step.outputs[out] = crafts * n;
          if (out !== item) add(freeUnits, out, crafts * n);
        }
        steps.push(step);
      }
    }

    lines[item] = {
      item,
      recipe: recipe?.id,
      quality: recipe ? (quality.get(item) ?? 0) : 0,
      needed,
      owned: fromOwned,
      byproduct: fromByproduct,
      remaining,
      crafts,
      surplus,
      height: 0,
    };
  }

  // Height: longest chain down to raw materials. Reverse processing order puts
  // ingredients first, so each height is computed after its ingredients'.
  for (const item of [...order].reverse()) {
    const line = lines[item]!;
    if (!line.recipe) continue;
    line.height = 1 + Math.max(0, ...ingredientEdges(item).map((i) => lines[i]!.height));
  }
  for (const step of steps) step.height = lines[step.item]!.height;

  const byName = (a: string, b: string) => (data.items[a]?.name ?? a).localeCompare(data.items[b]?.name ?? b);
  steps.sort((a, b) => a.height - b.height || byName(a.item, b.item));

  const all = order.map((item) => lines[item]!);
  const crafted = all.filter((l) => l.recipe).sort((a, b) => a.height - b.height || byName(a.item, b.item));

  const byproducts: Record<string, number> = {};
  for (const [item, left] of freeUnits) if (left > 0) byproducts[item] = left;

  return {
    lines,
    raw: all.filter((l) => !l.recipe),
    crafted,
    steps,
    byproducts,
    totalDuration: steps.reduce((sum, s) => sum + s.totalDuration, 0),
  };
}
