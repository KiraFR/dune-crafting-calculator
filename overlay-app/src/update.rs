// Self-update from the GitHub releases (endpoint and public key in tauri.conf.json).
//
// The app checks at launch and every few hours, and downloads a newer version in the background.
// It installs it only at a quiet moment (Dune not running, no window of the app open; see `watch` in
// main.rs), because installing quits the app: the installer then runs silently and starts the new
// version.

use std::sync::Mutex;
use std::time::Duration;

use tauri::{AppHandle, Manager};
use tauri_plugin_updater::{Update, UpdaterExt};

const CHECK_EVERY: Duration = Duration::from_secs(6 * 60 * 60);

/// A downloaded update waiting for a quiet moment.
#[derive(Default)]
pub struct Pending(Mutex<Option<(Update, Vec<u8>)>>);

/// Looks for an update until one is downloaded. Errors (offline, no release yet) only wait for the
/// next check: nothing is shown.
pub fn start(app: AppHandle) {
    std::thread::spawn(move || loop {
        match tauri::async_runtime::block_on(fetch(&app)) {
            Ok(Some(downloaded)) => {
                *app.state::<Pending>().0.lock().unwrap() = Some(downloaded);
                return;
            }
            Ok(None) => {}
            Err(error) => eprintln!("update check failed: {error}"),
        }
        std::thread::sleep(CHECK_EVERY);
    });
}

async fn fetch(app: &AppHandle) -> tauri_plugin_updater::Result<Option<(Update, Vec<u8>)>> {
    let Some(update) = app.updater()?.check().await? else {
        return Ok(None);
    };
    let bytes = update.download(|_, _| {}, || {}).await?;
    Ok(Some((update, bytes)))
}

/// Installs the downloaded update, if any. On success the app quits here and the installer starts the
/// new version; on failure the update is dropped and the next launch tries again.
pub fn install_pending(app: &AppHandle) {
    let Some((update, bytes)) = app.state::<Pending>().0.lock().unwrap().take() else {
        return;
    };
    if let Err(error) = update.install(&bytes) {
        eprintln!("update {} not installed: {error}", update.version);
    }
}
