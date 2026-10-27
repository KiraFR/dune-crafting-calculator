// Overlay window page: shows the calculator's overlay page in an iframe and, in move mode, a frame to
// drag the window by and a grip to resize it from.
//
// The calculator page (`app=1`) posts where its panel is; that goes to the app, which grows the window
// to fit and gives the window the mouse while the cursor is over the panel. The page also asks for the
// keyboard while an "I have" field is open, and gives it back when it closes. The app's section choice
// goes back to the page the same way, so switching sections reloads nothing.
const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;
const { getCurrentWindow } = window.__TAURI__.window;

// The calculator's origin, from the app (SITE_URL, baked in at build time); the only page trusted here.
let siteOrigin = null;
const frame = document.getElementById('frame');
const move = document.getElementById('move');

function showUrl(url) {
  if (url && frame.src !== url) frame.src = url;
}

function showMove(on) {
  move.hidden = !on;
}

// Opacity applies to the calculator panel only; the move-mode frame stays fully visible.
function showOpacity(value) {
  frame.style.opacity = value;
}

invoke('get_view').then((view) => {
  siteOrigin = view.siteUrl;
  showUrl(view.overlayUrl);
  showMove(view.moving);
  showOpacity(view.opacity);
});
listen('overlay-url', (event) => showUrl(event.payload));
listen('move-mode', (event) => showMove(event.payload));
listen('opacity', (event) => showOpacity(event.payload));
listen('sections', (event) => {
  if (!siteOrigin) return;
  frame.contentWindow?.postMessage({ type: 'dune-overlay:options', sections: event.payload }, siteOrigin);
});

window.addEventListener('message', (event) => {
  if (!siteOrigin || event.origin !== siteOrigin || event.source !== frame.contentWindow) return;
  const { type, panel, wanted } = event.data ?? {};
  if (type === 'dune-overlay:keyboard') {
    invoke('take_keyboard', { wanted: wanted === true });
    return;
  }
  if (type !== 'dune-overlay:layout' || !panel) return;
  // The page measures in its CSS pixels; the app works in physical pixels. devicePixelRatio covers both
  // the screen scaling and the text size (zoom).
  const ratio = window.devicePixelRatio;
  invoke('panel_layout', {
    rect: { x: panel.x * ratio, y: panel.y * ratio, width: panel.width * ratio, height: panel.height * ratio },
  });
});

document.getElementById('grip').addEventListener('mousedown', (event) => {
  event.preventDefault();
  getCurrentWindow().startResizeDragging('SouthEast');
});
document.getElementById('lock').addEventListener('click', () => invoke('set_move_mode', { on: false }));
