import { describe, expect, it } from 'vitest';
import { addOwned, withOwned } from './changes';
import { EMPTY_SHARED, type SharedState } from './persist';

const owning = (owned: Record<string, number>): SharedState => ({ ...EMPTY_SHARED, owned });

describe('owned stock edits', () => {
  it('sets an owned quantity, and 0 clears it', () => {
    expect(withOwned('IronBar', 30)(owning({})).owned).toEqual({ IronBar: 30 });
    expect(withOwned('IronBar', 0)(owning({ IronBar: 30, Water: 5 })).owned).toEqual({ Water: 5 });
    expect(withOwned('IronBar', 2.7)(owning({})).owned).toEqual({ IronBar: 2 });
  });

  it('adds one or takes one away, never below 0', () => {
    expect(addOwned('IronBar', 1)(owning({})).owned).toEqual({ IronBar: 1 });
    expect(addOwned('IronBar', 1)(owning({ IronBar: 4 })).owned).toEqual({ IronBar: 5 });
    expect(addOwned('IronBar', -1)(owning({ IronBar: 1 })).owned).toEqual({});
    expect(addOwned('IronBar', -1)(owning({})).owned).toEqual({});
  });

  it('counts each step when replayed on a newer state', () => {
    const plusOne = addOwned('IronBar', 1);
    expect(plusOne(plusOne(owning({ IronBar: 3 }))).owned).toEqual({ IronBar: 5 });
  });

  it('leaves the state it was given untouched', () => {
    const before = owning({ IronBar: 3 });
    addOwned('IronBar', 1)(before);
    expect(before.owned).toEqual({ IronBar: 3 });
  });
});
