// Turning a key press into the accelerator the global-shortcut plugin parses ("Ctrl+Shift+O"), and back
// into the label shown to the player ("Ctrl + Maj + O"). Pure functions, so they run under Node tests.

const MODIFIER_CODES = new Set([
  'ControlLeft', 'ControlRight', 'ShiftLeft', 'ShiftRight', 'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight',
]);
const LABELS = { Ctrl: 'Ctrl', Shift: 'Maj', Alt: 'Alt', Super: 'Win' };

function keyName(code) {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  return code; // F8, Numpad1, Backquote, Insert…: names the plugin's parser knows
}

/**
 * The accelerator for a keydown, `null` while only modifiers are held, or `{ error }` for a plain key:
 * a letter alone would fire while typing in the game's chat, so it needs Ctrl, Alt or Shift.
 */
function acceleratorFor(event) {
  if (MODIFIER_CODES.has(event.code)) return null;
  const parts = [];
  if (event.ctrlKey) parts.push('Ctrl');
  if (event.altKey) parts.push('Alt');
  if (event.shiftKey) parts.push('Shift');
  if (event.metaKey) parts.push('Super');
  const key = keyName(event.code);
  if (parts.length === 0 && !/^F([1-9]|1[0-9]|2[0-4])$/.test(key)) {
    return { error: 'Ajouter Ctrl, Alt ou Maj, ou choisir une touche F1 à F24.' };
  }
  return { value: [...parts, key].join('+') };
}

function hotkeyLabel(accelerator) {
  return accelerator
    .split('+')
    .map((part) => LABELS[part] ?? part)
    .join(' + ');
}

if (typeof module !== 'undefined') module.exports = { acceleratorFor, hotkeyLabel };
