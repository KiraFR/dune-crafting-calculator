// Dune Overlay: a transparent, always-on-top window over Dune: Awakening that shows the calculator's
// "what is left" page for a guild list while the game runs.
//
// The overlay window loads a local page (ui/overlay.html) that shows the calculator page in an iframe,
// so only the app's own pages talk to the app; the remote page gets no IPC. The window lets clicks
// through to the game, except while the cursor is over the panel, where the page offers tick / − / +.
// Settings live in ui/settings.html, opened from the tray icon, which can also open the whole
// calculator in a window of its own.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod detect;
mod settings;

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use settings::{Bounds, Settings};
use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{
    AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, RunEvent, Url, WebviewUrl, WebviewWindow,
    WebviewWindowBuilder, WindowEvent,
};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

const OVERLAY: &str = "overlay";
const SETTINGS: &str = "settings";
const SITE: &str = "site";
/// Logical size of a fresh overlay window: the calculator's panel is at most 360px wide.
const DEFAULT_SIZE: (f64, f64) = (380.0, 640.0);
/// Logical margin from the top-right corner of the primary screen for a fresh overlay window.
const DEFAULT_MARGIN: (f64, f64) = (40.0, 120.0);
/// Logical room kept around the panel when the window grows to fit it.
const FIT_MARGIN: f64 = 8.0;
/// The watch loop's period; the process list is read every DETECT_EVERY ticks (once a second).
const TICK: Duration = Duration::from_millis(50);
const DETECT_EVERY: u32 = 20;

/// The calculator panel inside the overlay window, in physical pixels from the window's top-left.
#[derive(Clone, Copy, Debug, Deserialize)]
struct Rect {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

struct State {
    path: PathBuf,
    settings: Mutex<Settings>,
    hidden_by_user: AtomicBool,
    moving: AtomicBool,
    dune_running: AtomicBool,
    /// Reported by the calculator page through ui/overlay.js; none until the page supports it.
    panel: Mutex<Option<Rect>>,
}

impl State {
    fn update(&self, change: impl FnOnce(&mut Settings)) -> Result<(), String> {
        let mut settings = self.settings.lock().unwrap();
        change(&mut settings);
        settings.save(&self.path).map_err(|e| format!("Réglages non enregistrés : {e}"))
    }
}

/// What the local pages show.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct View {
    site_url: &'static str,
    list_link: Option<String>,
    overlay_url: Option<String>,
    hotkey: String,
    opacity: f64,
    zoom: f64,
    always_visible: bool,
    show_gather: bool,
    show_craft: bool,
    moving: bool,
    dune_running: bool,
}

#[tauri::command]
fn get_view(state: tauri::State<State>) -> View {
    let settings = state.settings.lock().unwrap();
    View {
        site_url: settings::SITE_URL,
        list_link: settings.list_id.as_deref().map(settings::list_link),
        overlay_url: settings.list_id.as_deref().map(|id| settings::overlay_url(id, &settings.sections())),
        hotkey: settings.hotkey.clone(),
        opacity: settings.opacity,
        zoom: settings.zoom,
        always_visible: settings.always_visible,
        show_gather: settings.show_gather,
        show_craft: settings.show_craft,
        moving: state.moving.load(Ordering::Relaxed),
        dune_running: state.dune_running.load(Ordering::Relaxed),
    }
}

#[tauri::command]
fn set_list(app: AppHandle, state: tauri::State<State>, link: String) -> Result<String, String> {
    let id = settings::parse_list_id(&link).ok_or("Lien de liste non reconnu.")?;
    state.update(|s| s.list_id = Some(id.clone()))?;
    let sections = state.settings.lock().unwrap().sections();
    let _ = app.emit_to(OVERLAY, "overlay-url", settings::overlay_url(&id, &sections));
    if let Some(site) = app.get_webview_window(SITE) {
        if let Ok(url) = settings::list_link(&id).parse::<Url>() {
            let _ = site.navigate(url);
        }
    }
    Ok(settings::list_link(&id))
}

#[tauri::command]
fn set_hotkey(app: AppHandle, state: tauri::State<State>, accelerator: String) -> Result<String, String> {
    let new: Shortcut = accelerator.parse().map_err(|_| "Raccourci non reconnu.".to_string())?;
    let old = state.settings.lock().unwrap().hotkey.clone();
    let shortcuts = app.global_shortcut();
    if let Ok(old) = old.parse::<Shortcut>() {
        let _ = shortcuts.unregister(old);
    }
    if let Err(error) = shortcuts.register(new) {
        if let Ok(old) = old.parse::<Shortcut>() {
            let _ = shortcuts.register(old);
        }
        return Err(format!("Raccourci déjà pris par un autre programme ({error})."));
    }
    state.update(|s| s.hotkey = accelerator.clone())?;
    Ok(accelerator)
}

#[tauri::command]
fn set_opacity(app: AppHandle, state: tauri::State<State>, value: f64) -> Result<f64, String> {
    let value = settings::clamp_opacity(value);
    state.update(|s| s.opacity = value)?;
    let _ = app.emit_to(OVERLAY, "opacity", value);
    Ok(value)
}

#[tauri::command]
fn set_zoom(app: AppHandle, state: tauri::State<State>, value: f64) -> Result<f64, String> {
    let value = settings::clamp_zoom(value);
    state.update(|s| s.zoom = value)?;
    if let Some(overlay) = app.get_webview_window(OVERLAY) {
        overlay.set_zoom(value).map_err(|e| e.to_string())?;
    }
    Ok(value)
}

#[tauri::command]
fn set_always_visible(state: tauri::State<State>, on: bool) -> Result<(), String> {
    state.update(|s| s.always_visible = on)
}

#[tauri::command]
fn set_sections(app: AppHandle, state: tauri::State<State>, gather: bool, craft: bool) -> Result<(), String> {
    if !gather && !craft {
        return Err("Garder au moins une section.".into());
    }
    state.update(|s| {
        s.show_gather = gather;
        s.show_craft = craft;
    })?;
    let sections = state.settings.lock().unwrap().sections();
    let _ = app.emit_to(OVERLAY, "sections", sections);
    Ok(())
}

#[tauri::command]
fn set_move_mode(app: AppHandle, on: bool) -> Result<(), String> {
    apply_move_mode(&app, on).map_err(|e| e.to_string())
}

#[tauri::command]
fn open_list(app: AppHandle) {
    open_site(&app);
}

/// The calculator page reports where its panel is: keep it for the hover test, and grow the window
/// when the panel no longer fits in it.
#[tauri::command]
fn panel_layout(app: AppHandle, state: tauri::State<State>, rect: Rect) -> Result<(), String> {
    *state.panel.lock().unwrap() = Some(rect);
    if let Some(overlay) = app.get_webview_window(OVERLAY) {
        fit_panel(&overlay, rect).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Grows the overlay window (never shrinks it) so the panel fits, keeping it on its screen.
fn fit_panel(window: &WebviewWindow, panel: Rect) -> tauri::Result<()> {
    let size = window.inner_size()?;
    let margin = FIT_MARGIN * window.scale_factor()?;
    let need_width = (panel.x + panel.width + margin).ceil() as u32;
    let need_height = (panel.y + panel.height + margin).ceil() as u32;
    if need_width <= size.width && need_height <= size.height {
        return Ok(());
    }
    let grown = PhysicalSize::new(size.width.max(need_width), size.height.max(need_height));
    let mut position = window.outer_position()?;
    if let Some(monitor) = window.current_monitor()? {
        let (left, top) = (monitor.position().x, monitor.position().y);
        let right = left + monitor.size().width as i32;
        let bottom = top + monitor.size().height as i32;
        if position.x + grown.width as i32 > right {
            position.x = (right - grown.width as i32).max(left);
        }
        if position.y + grown.height as i32 > bottom {
            position.y = (bottom - grown.height as i32).max(top);
        }
    }
    window.set_size(grown)?;
    window.set_position(position)?;
    Ok(())
}

/// Move mode makes the overlay take the mouse (drag it, resize it from its corner); leaving it locks the
/// place and hands the mouse back to the watch loop's hover test.
fn apply_move_mode(app: &AppHandle, on: bool) -> tauri::Result<()> {
    let state = app.state::<State>();
    state.moving.store(on, Ordering::Relaxed);
    if let Some(window) = app.get_webview_window(OVERLAY) {
        window.set_ignore_cursor_events(!on)?;
        if !on {
            let position = window.outer_position()?;
            let size = window.inner_size()?;
            let bounds = Bounds { x: position.x, y: position.y, width: size.width, height: size.height };
            let _ = state.update(|s| s.bounds = Some(bounds));
        }
    }
    app.emit_to(OVERLAY, "move-mode", on)?;
    app.emit_to(SETTINGS, "move-mode", on)?;
    Ok(())
}

fn place(window: &WebviewWindow, bounds: Option<Bounds>) -> tauri::Result<()> {
    if let Some(b) = bounds {
        window.set_size(PhysicalSize::new(b.width, b.height))?;
        window.set_position(PhysicalPosition::new(b.x, b.y))?;
    }
    Ok(())
}

fn create_overlay(app: &AppHandle) -> tauri::Result<()> {
    let (bounds, zoom) = {
        let state = app.state::<State>();
        let settings = state.settings.lock().unwrap();
        (settings.bounds, settings.zoom)
    };
    let window = WebviewWindowBuilder::new(app, OVERLAY, WebviewUrl::App("overlay.html".into()))
        .title("Dune Overlay")
        .transparent(true)
        .decorations(false)
        .shadow(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(true)
        .focused(false)
        .focusable(false)
        .visible(false)
        .inner_size(DEFAULT_SIZE.0, DEFAULT_SIZE.1)
        .build()?;
    if bounds.is_some() {
        place(&window, bounds)?;
    } else if let Some(monitor) = window.primary_monitor()? {
        let scale = monitor.scale_factor();
        let size = window.outer_size()?;
        let x = monitor.position().x + monitor.size().width as i32 - size.width as i32 - (DEFAULT_MARGIN.0 * scale) as i32;
        let y = monitor.position().y + (DEFAULT_MARGIN.1 * scale) as i32;
        window.set_position(PhysicalPosition::new(x, y))?;
    }
    window.set_zoom(zoom)?;
    window.set_ignore_cursor_events(true)?;
    Ok(())
}

fn open_settings(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(SETTINGS) {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
        return;
    }
    let _ = WebviewWindowBuilder::new(app, SETTINGS, WebviewUrl::App("settings.html".into()))
        .title("Dune Overlay")
        .inner_size(460.0, 700.0)
        .resizable(false)
        .center()
        .build();
}

/// The whole calculator for the guild list, in a normal window whose place is remembered.
fn open_site(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(SITE) {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
        return;
    }
    let (list_id, bounds) = {
        let state = app.state::<State>();
        let settings = state.settings.lock().unwrap();
        (settings.list_id.clone(), settings.site_bounds)
    };
    let Some(url) = list_id.and_then(|id| settings::list_link(&id).parse::<Url>().ok()) else {
        open_settings(app); // no list yet: the settings ask for it
        return;
    };
    let Ok(window) = WebviewWindowBuilder::new(app, SITE, WebviewUrl::External(url))
        .title("Dune — liste de guilde")
        .inner_size(1400.0, 900.0)
        .min_inner_size(400.0, 400.0)
        .center()
        .build()
    else {
        return;
    };
    let _ = place(&window, bounds);
    let handle = app.clone();
    let site = window.clone();
    window.on_window_event(move |event| {
        if let WindowEvent::CloseRequested { .. } = event {
            if let (Ok(position), Ok(size)) = (site.outer_position(), site.inner_size()) {
                let bounds = Bounds { x: position.x, y: position.y, width: size.width, height: size.height };
                let _ = handle.state::<State>().update(|s| s.site_bounds = Some(bounds));
            }
        }
    });
}

fn toggle_hidden(app: &AppHandle) {
    app.state::<State>().hidden_by_user.fetch_xor(true, Ordering::Relaxed);
}

fn build_tray(app: &AppHandle) -> tauri::Result<()> {
    let settings_item = MenuItem::with_id(app, "settings", "Réglages", true, None::<&str>)?;
    let site_item = MenuItem::with_id(app, "site", "Ouvrir la liste", true, None::<&str>)?;
    let move_item = MenuItem::with_id(app, "move", "Déplacer / verrouiller l'overlay", true, None::<&str>)?;
    let toggle_item = MenuItem::with_id(app, "toggle", "Masquer / afficher", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, "quit", "Quitter", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&settings_item, &site_item, &move_item, &toggle_item, &quit_item])?;
    let mut tray = TrayIconBuilder::with_id("main")
        .tooltip("Dune Overlay")
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "settings" => open_settings(app),
            "site" => open_site(app),
            "move" => {
                let on = !app.state::<State>().moving.load(Ordering::Relaxed);
                let _ = apply_move_mode(app, on);
            }
            "toggle" => toggle_hidden(app),
            "quit" => app.exit(0),
            _ => {}
        });
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.build(app)?;
    Ok(())
}

fn cursor_over_panel(window: &WebviewWindow, panel: Option<Rect>) -> bool {
    let (Some(panel), Some((cx, cy)), Ok(origin)) = (panel, detect::cursor_position(), window.inner_position())
    else {
        return false;
    };
    let (x, y) = (f64::from(cx - origin.x), f64::from(cy - origin.y));
    x >= panel.x && x < panel.x + panel.width && y >= panel.y && y < panel.y + panel.height
}

/// The only place the overlay is shown or hidden, and (outside move mode) the only place that gives it
/// the mouse. Shown in move mode, otherwise while a list is set, the player has not hidden it, and Dune
/// runs (or "always visible" is on). It takes the mouse only while the cursor is over the panel.
fn watch(app: AppHandle) {
    std::thread::spawn(move || {
        let mut detector = detect::Detector::default();
        let (mut shown, mut takes_mouse) = (false, false);
        let mut tick: u32 = 0;
        loop {
            let state = app.state::<State>();
            if tick % DETECT_EVERY == 0 {
                let running = detector.dune_running();
                if state.dune_running.swap(running, Ordering::Relaxed) != running {
                    let _ = app.emit_to(SETTINGS, "dune", running);
                }
            }
            tick = tick.wrapping_add(1);

            let moving = state.moving.load(Ordering::Relaxed);
            let (has_list, always) = {
                let settings = state.settings.lock().unwrap();
                (settings.list_id.is_some(), settings.always_visible)
            };
            let running = state.dune_running.load(Ordering::Relaxed);
            let want = moving || (has_list && (running || always) && !state.hidden_by_user.load(Ordering::Relaxed));

            if let Some(window) = app.get_webview_window(OVERLAY) {
                if want != shown {
                    let _ = if want { window.show() } else { window.hide() };
                    shown = want;
                }
                if moving {
                    takes_mouse = true; // apply_move_mode gave it the mouse
                } else {
                    let over = shown && cursor_over_panel(&window, *state.panel.lock().unwrap());
                    if over != takes_mouse {
                        let _ = window.set_ignore_cursor_events(!over);
                        takes_mouse = over;
                    }
                }
            }
            std::thread::sleep(TICK);
        }
    });
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| open_settings(app)))
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if event.state() == ShortcutState::Pressed {
                        toggle_hidden(app);
                    }
                })
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            get_view,
            set_list,
            set_hotkey,
            set_opacity,
            set_zoom,
            set_always_visible,
            set_sections,
            set_move_mode,
            open_list,
            panel_layout
        ])
        .setup(|app| {
            let path = app.path().app_config_dir()?.join("settings.json");
            let settings = Settings::load(&path);
            let hotkey = settings.hotkey.clone();
            let has_list = settings.list_id.is_some();
            app.manage(State {
                path,
                settings: Mutex::new(settings),
                hidden_by_user: AtomicBool::new(false),
                moving: AtomicBool::new(false),
                dune_running: AtomicBool::new(false),
                panel: Mutex::new(None),
            });

            let handle = app.handle().clone();
            if let Ok(shortcut) = hotkey.parse::<Shortcut>() {
                if let Err(error) = handle.global_shortcut().register(shortcut) {
                    eprintln!("hotkey {hotkey} unavailable: {error}");
                }
            }
            create_overlay(&handle)?;
            build_tray(&handle)?;
            if !has_list {
                open_settings(&handle);
            }
            watch(handle);
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("failed to build the overlay app")
        .run(|_app, event| {
            // Closing the settings or list window must not quit: the app lives in the tray until "Quitter".
            if let RunEvent::ExitRequested { code: None, api, .. } = event {
                api.prevent_exit();
            }
        });
}
