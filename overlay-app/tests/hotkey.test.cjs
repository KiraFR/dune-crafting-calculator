// node --test tests/hotkey.test.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// ui/hotkey.js is a classic browser script. Run it as one, in a sandbox that offers it a CommonJS
// `module`: loading it with require would depend on the nearest package.json's "type".
const sandbox = { module: { exports: {} } };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'ui', 'hotkey.js'), 'utf8'), sandbox);
const { acceleratorFor, hotkeyLabel } = sandbox.module.exports;

const press = (code, mods = {}) => ({ code, ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, ...mods });

test('a combination becomes the plugin accelerator', () => {
  assert.equal(acceleratorFor(press('KeyO', { ctrlKey: true, shiftKey: true })).value, 'Ctrl+Shift+O');
  assert.equal(acceleratorFor(press('Digit5', { altKey: true })).value, 'Alt+5');
});

test('a function key works alone', () => {
  assert.equal(acceleratorFor(press('F8')).value, 'F8');
  assert.equal(acceleratorFor(press('F24')).value, 'F24');
});

test('a plain key is refused, modifiers alone wait for the key', () => {
  assert.ok(acceleratorFor(press('KeyO')).error);
  assert.ok(acceleratorFor(press('F25')).error);
  assert.equal(acceleratorFor(press('ShiftLeft', { shiftKey: true })), null);
});

test('labels use the French key names', () => {
  assert.equal(hotkeyLabel('Ctrl+Shift+O'), 'Ctrl + Maj + O');
  assert.equal(hotkeyLabel('Super+F8'), 'Win + F8');
});
