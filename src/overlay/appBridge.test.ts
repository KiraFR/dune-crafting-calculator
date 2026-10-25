import { describe, expect, it } from 'vitest';
import { isAppMode, keyboardMessage, layoutReporter, parseSections, readOptions, type LayoutMessage } from './appBridge';

describe('overlay app bridge', () => {
  it('turns on only with app=1', () => {
    expect(isAppMode('?list=abc&app=1')).toBe(true);
    expect(isAppMode('?app=1')).toBe(true);
    expect(isAppMode('?list=abc')).toBe(false);
    expect(isAppMode('?list=abc&app=0')).toBe(false);
    expect(isAppMode('')).toBe(false);
  });

  it('posts the panel rectangle once per change', () => {
    const posted: LayoutMessage[] = [];
    const report = layoutReporter((m) => posted.push(m));
    report({ x: 0, y: 0, width: 360, height: 412.5 });
    report({ x: 0, y: 0, width: 360, height: 412.5 });
    report({ x: 0, y: 0, width: 360, height: 380 });
    expect(posted).toEqual([
      { type: 'dune-overlay:layout', panel: { x: 0, y: 0, width: 360, height: 412.5 } },
      { type: 'dune-overlay:layout', panel: { x: 0, y: 0, width: 360, height: 380 } },
    ]);
  });

  it('reads the sections from the URL, in page order, both by default', () => {
    expect(parseSections('gather,craft')).toEqual(['gather', 'craft']);
    expect(parseSections('craft,gather')).toEqual(['gather', 'craft']);
    expect(parseSections('gather')).toEqual(['gather']);
    expect(parseSections('craft')).toEqual(['craft']);
    expect(parseSections(' craft ')).toEqual(['craft']);
    expect(parseSections('')).toEqual(['gather', 'craft']);
    expect(parseSections('nonsense')).toEqual(['gather', 'craft']);
  });

  it('reads the sections of an options message and ignores anything else', () => {
    expect(readOptions({ type: 'dune-overlay:options', sections: ['craft'] })).toEqual(['craft']);
    expect(readOptions({ type: 'dune-overlay:options', sections: ['craft', 'gather'] })).toEqual(['gather', 'craft']);
    expect(readOptions({ type: 'dune-overlay:options', sections: [] })).toEqual(['gather', 'craft']);
    expect(readOptions({ type: 'dune-overlay:options' })).toBeUndefined();
    expect(readOptions({ type: 'dune-overlay:layout', sections: ['craft'] })).toBeUndefined();
    expect(readOptions('dune-overlay:options')).toBeUndefined();
    expect(readOptions(null)).toBeUndefined();
  });

  it('asks for the keyboard and gives it back with the agreed message', () => {
    expect(keyboardMessage(true)).toEqual({ type: 'dune-overlay:keyboard', wanted: true });
    expect(keyboardMessage(false)).toEqual({ type: 'dune-overlay:keyboard', wanted: false });
  });

  it('reads a DOMRect-like object, whose fields are getters', () => {
    const posted: LayoutMessage[] = [];
    class Rect {
      get x() { return 1; }
      get y() { return 2; }
      get width() { return 360; }
      get height() { return 500; }
      get top() { return 2; }
    }
    layoutReporter((m) => posted.push(m))(new Rect());
    expect(posted[0]!.panel).toEqual({ x: 1, y: 2, width: 360, height: 500 });
  });
});
