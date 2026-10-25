// Settings window: the guild list link (and opening it in an app window), the hide/show hotkey, the
// overlay's opacity, text size and sections, move mode, "always visible", and whether Dune runs.
const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;

const listInput = document.getElementById('list');
const listStatus = document.getElementById('list-status');
const hotkeyButton = document.getElementById('hotkey');
const hotkeyStatus = document.getElementById('hotkey-status');
const opacityInput = document.getElementById('opacity');
const opacityValue = document.getElementById('opacity-value');
const zoomInput = document.getElementById('zoom');
const zoomValue = document.getElementById('zoom-value');
const gatherInput = document.getElementById('gather');
const craftInput = document.getElementById('craft');
const moveButton = document.getElementById('move');
const alwaysInput = document.getElementById('always');
const duneDot = document.getElementById('dune-dot');
const duneText = document.getElementById('dune-text');

let hotkey = '';
let capturing = false;
let moving = false;

const percentLabel = (percent) => `${percent} %`; // French spacing before the percent sign

function setStatus(element, text, kind = '') {
  element.textContent = text;
  element.dataset.kind = kind;
}

function showHotkey() {
  hotkeyButton.textContent = capturing ? 'Appuyer sur une touche…' : hotkeyLabel(hotkey);
  hotkeyButton.classList.toggle('input--capturing', capturing);
}

function showRange(input, label, percent) {
  input.value = percent;
  label.textContent = percentLabel(percent);
}

// One section always stays on: the last ticked box cannot be unticked.
function showSections(gather, craft) {
  gatherInput.checked = gather;
  craftInput.checked = craft;
  gatherInput.disabled = gather && !craft;
  craftInput.disabled = craft && !gather;
}

function showMoving(on) {
  moving = on;
  moveButton.textContent = on ? 'Verrouiller la position' : "Déplacer l'overlay";
  moveButton.classList.toggle('button--active', on);
}

function showDune(running) {
  duneDot.classList.toggle('dot--live', running);
  duneText.textContent = running ? 'Dune ouvert' : 'Dune non lancé';
}

invoke('get_view').then((view) => {
  listInput.placeholder = `${view.siteUrl}/?list=…`;
  listInput.value = view.listLink ?? '';
  hotkey = view.hotkey;
  showHotkey();
  showRange(opacityInput, opacityValue, Math.round(view.opacity * 100));
  showRange(zoomInput, zoomValue, Math.round(view.zoom * 100));
  showSections(view.showGather, view.showCraft);
  alwaysInput.checked = view.alwaysVisible;
  showMoving(view.moving);
  showDune(view.duneRunning);
});
listen('dune', (event) => showDune(event.payload));
listen('move-mode', (event) => showMoving(event.payload));

document.getElementById('list-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    listInput.value = await invoke('set_list', { link: listInput.value });
    setStatus(listStatus, 'Liste enregistrée.', 'ok');
  } catch (error) {
    setStatus(listStatus, String(error), 'error');
  }
});
document.getElementById('open-list').addEventListener('click', () => invoke('open_list'));

hotkeyButton.addEventListener('click', () => {
  capturing = true;
  setStatus(hotkeyStatus, '');
  showHotkey();
});
hotkeyButton.addEventListener('blur', () => {
  capturing = false;
  showHotkey();
});
hotkeyButton.addEventListener('keydown', async (event) => {
  if (!capturing) return;
  event.preventDefault();
  if (event.key === 'Escape') {
    capturing = false;
    showHotkey();
    return;
  }
  const result = acceleratorFor(event);
  if (!result) return;
  if (result.error) {
    setStatus(hotkeyStatus, result.error, 'error');
    return;
  }
  try {
    hotkey = await invoke('set_hotkey', { accelerator: result.value });
    setStatus(hotkeyStatus, 'Raccourci enregistré.', 'ok');
  } catch (error) {
    setStatus(hotkeyStatus, String(error), 'error');
  }
  capturing = false;
  showHotkey();
});

opacityInput.addEventListener('input', () => {
  const percent = Number(opacityInput.value);
  showRange(opacityInput, opacityValue, percent);
  invoke('set_opacity', { value: percent / 100 });
});

zoomInput.addEventListener('input', () => {
  const percent = Number(zoomInput.value);
  showRange(zoomInput, zoomValue, percent);
  invoke('set_zoom', { value: percent / 100 });
});

function onSectionsChange() {
  showSections(gatherInput.checked, craftInput.checked);
  invoke('set_sections', { gather: gatherInput.checked, craft: craftInput.checked });
}
gatherInput.addEventListener('change', onSectionsChange);
craftInput.addEventListener('change', onSectionsChange);

moveButton.addEventListener('click', () => invoke('set_move_mode', { on: !moving }));

alwaysInput.addEventListener('change', () => invoke('set_always_visible', { on: alwaysInput.checked }));
