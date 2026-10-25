//! Persisted preferences: the guild list, the hide/show hotkey, how the overlay looks and where the app's
//! windows sit.

use serde::{Deserialize, Serialize};
use std::{fs, io, path::Path};

/// The calculator's address (an https origin), baked in at build time from SITE_URL: see build.rs.
pub const SITE_URL: &str = env!("SITE_URL");
/// The calculator's "what is left" page; the app only ever shows it for a list id.
pub const OVERLAY_PAGE: &str = concat!(env!("SITE_URL"), "/overlay/");
/// The calculator itself, where a player copies a guild list link from.
pub const LIST_PAGE: &str = concat!(env!("SITE_URL"), "/");
pub const DEFAULT_HOTKEY: &str = "Ctrl+Shift+O";
/// Below this the panel is too faint to read over the game.
pub const MIN_OPACITY: f64 = 0.3;
/// Text size range of the overlay (webview zoom).
pub const ZOOM_RANGE: (f64, f64) = (0.8, 1.5);

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Settings {
    pub list_id: Option<String>,
    pub hotkey: String,
    /// The overlay window.
    pub bounds: Option<Bounds>,
    /// The window showing the whole calculator.
    pub site_bounds: Option<Bounds>,
    /// Opacity of the whole overlay, MIN_OPACITY to 1.
    pub opacity: f64,
    /// Text size of the overlay, within ZOOM_RANGE.
    pub zoom: f64,
    /// Show the overlay whether or not Dune is running.
    pub always_visible: bool,
    /// The overlay's sections; at least one stays on.
    pub show_gather: bool,
    pub show_craft: bool,
}

/// Window position and size, in physical pixels.
#[derive(Clone, Copy, Debug, Serialize, Deserialize)]
pub struct Bounds {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            list_id: None,
            hotkey: DEFAULT_HOTKEY.into(),
            bounds: None,
            site_bounds: None,
            opacity: 1.0,
            zoom: 1.0,
            always_visible: false,
            show_gather: true,
            show_craft: true,
        }
    }
}

pub fn clamp_opacity(value: f64) -> f64 {
    if value.is_finite() { value.clamp(MIN_OPACITY, 1.0) } else { 1.0 }
}

pub fn clamp_zoom(value: f64) -> f64 {
    if value.is_finite() { value.clamp(ZOOM_RANGE.0, ZOOM_RANGE.1) } else { 1.0 }
}

impl Settings {
    pub fn load(path: &Path) -> Self {
        fs::read_to_string(path)
            .ok()
            .and_then(|text| serde_json::from_str(&text).ok())
            .unwrap_or_default()
    }

    pub fn save(&self, path: &Path) -> io::Result<()> {
        if let Some(dir) = path.parent() {
            fs::create_dir_all(dir)?;
        }
        fs::write(path, serde_json::to_string_pretty(self).map_err(io::Error::other)?)
    }

    /// The overlay page's `sections` values, in display order (gather above craft).
    pub fn sections(&self) -> Vec<&'static str> {
        let both = !self.show_gather && !self.show_craft; // never stored, but never show nothing
        let mut names = Vec::new();
        if self.show_gather || both {
            names.push("gather");
        }
        if self.show_craft || both {
            names.push("craft");
        }
        names
    }
}

/// Accepts a guild list link copied from the calculator (`…/?list=<uuid>`) or the bare id.
pub fn parse_list_id(input: &str) -> Option<String> {
    let text = input.trim();
    let candidate = text.find("list=").map_or(text, |i| &text[i + "list=".len()..]);
    let id: String = candidate.chars().take_while(|c| c.is_ascii_hexdigit() || *c == '-').collect();
    is_uuid(&id).then(|| id.to_ascii_lowercase())
}

fn is_uuid(s: &str) -> bool {
    s.len() == 36
        && s.char_indices().all(|(i, c)| match i {
            8 | 13 | 18 | 23 => c == '-',
            _ => c.is_ascii_hexdigit(),
        })
}

/// `app=1` asks the page for the app's extras: layout messages and tick / − / + on hover.
pub fn overlay_url(list_id: &str, sections: &[&str]) -> String {
    format!("{OVERLAY_PAGE}?list={list_id}&app=1&sections={}", sections.join(","))
}

pub fn list_link(list_id: &str) -> String {
    format!("{LIST_PAGE}?list={list_id}")
}

#[cfg(test)]
mod tests {
    use super::*;

    const ID: &str = "d4e2abed-47db-4dc8-985a-a23219b51ed4";

    #[test]
    fn reads_a_copied_link() {
        let link = format!("https://dune.example.com/?list={ID}");
        assert_eq!(parse_list_id(&link).as_deref(), Some(ID));
    }

    #[test]
    fn reads_a_bare_id_and_trims_it() {
        assert_eq!(parse_list_id(&format!("  {}\n", ID.to_uppercase())).as_deref(), Some(ID));
    }

    #[test]
    fn ignores_trailing_parameters() {
        let link = format!("https://dune.example.com/overlay/?list={ID}&lang=fr");
        assert_eq!(parse_list_id(&link).as_deref(), Some(ID));
    }

    #[test]
    fn rejects_anything_else() {
        assert_eq!(parse_list_id("https://dune.example.com/"), None);
        assert_eq!(parse_list_id("list=1234"), None);
        assert_eq!(parse_list_id(&ID.replace('-', "")), None);
    }

    #[test]
    fn missing_fields_take_defaults() {
        let settings: Settings = serde_json::from_str(r#"{"listId":null}"#).unwrap();
        assert_eq!(settings.hotkey, DEFAULT_HOTKEY);
        assert!(settings.bounds.is_none());
        assert_eq!(settings.opacity, 1.0);
        assert_eq!(settings.zoom, 1.0);
        assert!(!settings.always_visible);
        assert_eq!(settings.sections(), ["gather", "craft"]);
    }

    #[test]
    fn opacity_stays_readable() {
        assert_eq!(clamp_opacity(0.05), MIN_OPACITY);
        assert_eq!(clamp_opacity(1.7), 1.0);
        assert_eq!(clamp_opacity(0.6), 0.6);
        assert_eq!(clamp_opacity(f64::NAN), 1.0);
    }

    #[test]
    fn zoom_stays_in_range() {
        assert_eq!(clamp_zoom(0.2), ZOOM_RANGE.0);
        assert_eq!(clamp_zoom(3.0), ZOOM_RANGE.1);
        assert_eq!(clamp_zoom(1.2), 1.2);
    }

    #[test]
    fn sections_keep_their_order_and_never_vanish() {
        let mut settings = Settings { show_gather: false, ..Settings::default() };
        assert_eq!(settings.sections(), ["craft"]);
        settings.show_craft = false;
        assert_eq!(settings.sections(), ["gather", "craft"]);
    }

    #[test]
    fn overlay_url_asks_for_the_app_extras() {
        assert_eq!(
            overlay_url(ID, &["gather"]),
            format!("{SITE_URL}/overlay/?list={ID}&app=1&sections=gather")
        );
    }
}
