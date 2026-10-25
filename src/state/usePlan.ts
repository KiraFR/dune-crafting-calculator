import { useMemo } from 'react';
import { computePlan, type Plan } from '../core/plan';
import { makeRecipeResolver } from '../core/recipeChoice';
import { gameData } from '../data';
import type { CalcState } from './persist';

export interface Derived {
  plan?: Plan;
  error?: string;
}

/** Plan for the current state; recomputed when the state changes. */
export function usePlan(state: CalcState): Derived {
  return useMemo(() => {
    const recipeFor = makeRecipeResolver(gameData, {}, state.machines);
    try {
      return { plan: computePlan(gameData, state.build, { recipeFor, owned: state.owned }) };
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
  }, [state.build, state.owned, state.machines]);
}
