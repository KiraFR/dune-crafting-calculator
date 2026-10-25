// Edits to the owned stock, as pure functions of the shared state. A guild list
// replays a pending edit on top of the latest list when someone saved first
// (src/sync/sharedList.ts), so a step says what it changes rather than the
// result: two players who each add one end with two more, not one.

import type { SharedState } from './persist';

export const whole = (n: number) => (Number.isFinite(n) && n > 0 ? Math.floor(n) : 0);

/** Sets the owned quantity of an item; 0 removes it. */
export const withOwned =
  (item: string, qty: number) =>
  (s: SharedState): SharedState => {
    const owned = { ...s.owned };
    if (whole(qty)) owned[item] = whole(qty);
    else delete owned[item];
    return { ...s, owned };
  };

/** Adds `delta` (negative to take away) to the owned quantity, never going below 0. */
export const addOwned =
  (item: string, delta: number) =>
  (s: SharedState): SharedState =>
    withOwned(item, (s.owned[item] ?? 0) + delta)(s);
