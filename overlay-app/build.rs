//! Bakes the calculator's address into the app, so the repository never names it.
//!
//! SITE_URL comes from the environment (CI), else from ../.env.production (the site's production
//! settings, not committed). It becomes the SITE_URL compile-time variable, and the only origin the
//! CSP lets the overlay window frame, merged into the Tauri config through TAURI_CONFIG.
use std::{env, fs, path::Path};

const ENV_FILE: &str = "../.env.production";

fn main() {
    let site = site_origin();
    println!("cargo:rustc-env=SITE_URL={site}");

    let csp = format!(
        "default-src 'self'; frame-src {site}; style-src 'self' 'unsafe-inline'; img-src 'self' data:"
    );
    let mut config: serde_json::Value = env::var("TAURI_CONFIG")
        .ok()
        .and_then(|json| serde_json::from_str(&json).ok())
        .unwrap_or_else(|| serde_json::json!({}));
    config["app"]["security"]["csp"] = csp.into();
    let config = config.to_string();
    // tauri_build reads it in this process; generate_context! reads it while the crate compiles.
    env::set_var("TAURI_CONFIG", &config);
    println!("cargo:rustc-env=TAURI_CONFIG={config}");

    tauri_build::build()
}

fn site_origin() -> String {
    println!("cargo:rerun-if-env-changed=SITE_URL");
    if Path::new(ENV_FILE).exists() {
        println!("cargo:rerun-if-changed={ENV_FILE}");
    }
    let from_file = || {
        let text = fs::read_to_string(ENV_FILE).ok()?;
        text.lines().rev().find_map(|line| line.trim().strip_prefix("SITE_URL=").map(str::to_owned))
    };
    let url = env::var("SITE_URL")
        .ok()
        .filter(|value| !value.trim().is_empty())
        .or_else(from_file)
        .map(|value| value.trim().trim_end_matches('/').to_owned())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| {
            panic!("SITE_URL is not set: add SITE_URL=https://… to {ENV_FILE} (see .env.production.example) or set it in the environment")
        });
    let host = url.strip_prefix("https://").unwrap_or_default();
    assert!(
        !host.is_empty() && !host.contains(['/', '?', '#', ' ']),
        "SITE_URL must be an https origin such as https://dune.example.com, got {url:?}"
    );
    url
}
