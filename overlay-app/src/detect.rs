//! Is Dune: Awakening running, and where is the mouse cursor?
//!
//! The game's executable is looked up in a process-list snapshot: the app never opens a handle to the
//! game process, which BattlEye guards.

/// The game process (the launcher and BattlEye run as other processes).
pub const GAME_EXE: &str = "DuneSandbox-Win64-Shipping.exe";

/// The mouse cursor as the screen shows it.
#[derive(Clone, Copy, Debug)]
pub struct Cursor {
    /// On the desktop, in physical pixels.
    pub x: i32,
    pub y: i32,
    /// false while the window under it hides it, as the game does outside its menus.
    pub shown: bool,
}

/// The executable to watch: the game, or `DUNE_OVERLAY_GAME_EXE` (e.g. `charmap.exe`) to try the
/// overlay without launching the game.
#[cfg(windows)]
fn watched_exe() -> String {
    std::env::var("DUNE_OVERLAY_GAME_EXE").unwrap_or_else(|_| GAME_EXE.to_string())
}

#[cfg(windows)]
mod imp {
    use super::{watched_exe, Cursor};
    use windows_sys::Win32::Foundation::{CloseHandle, INVALID_HANDLE_VALUE};
    use windows_sys::Win32::System::Diagnostics::ToolHelp::{
        CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W, TH32CS_SNAPPROCESS,
    };
    use windows_sys::Win32::UI::WindowsAndMessaging::{GetCursorInfo, CURSORINFO, CURSOR_SHOWING};

    pub struct Detector {
        exe: String,
    }

    impl Default for Detector {
        fn default() -> Self {
            Self { exe: watched_exe() }
        }
    }

    impl Detector {
        pub fn dune_running(&mut self) -> bool {
            // SAFETY: the snapshot handle is checked and closed; the entry is sized as the API requires.
            unsafe {
                let snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
                if snapshot == INVALID_HANDLE_VALUE {
                    return false;
                }
                let mut entry: PROCESSENTRY32W = std::mem::zeroed();
                entry.dwSize = std::mem::size_of::<PROCESSENTRY32W>() as u32;
                let mut found = false;
                let mut ok = Process32FirstW(snapshot, &mut entry) != 0;
                while ok && !found {
                    let len = entry.szExeFile.iter().position(|&c| c == 0).unwrap_or(entry.szExeFile.len());
                    found = String::from_utf16_lossy(&entry.szExeFile[..len]).eq_ignore_ascii_case(&self.exe);
                    ok = Process32NextW(snapshot, &mut entry) != 0;
                }
                CloseHandle(snapshot);
                found
            }
        }
    }

    /// The global cursor, whichever process set it: hidden either through ShowCursor or as no cursor at all.
    pub fn cursor() -> Option<Cursor> {
        // SAFETY: plain Win32 query into a local, sized as the API requires.
        unsafe {
            let mut info: CURSORINFO = std::mem::zeroed();
            info.cbSize = std::mem::size_of::<CURSORINFO>() as u32;
            if GetCursorInfo(&mut info) == 0 {
                return None;
            }
            let shown = info.flags & CURSOR_SHOWING != 0 && !info.hCursor.is_null();
            Some(Cursor { x: info.ptScreenPos.x, y: info.ptScreenPos.y, shown })
        }
    }
}

#[cfg(not(windows))]
mod imp {
    use super::Cursor;

    /// The game only runs on Windows; elsewhere it never runs.
    #[derive(Default)]
    pub struct Detector;

    impl Detector {
        pub fn dune_running(&mut self) -> bool {
            false
        }
    }

    pub fn cursor() -> Option<Cursor> {
        None
    }
}

pub use imp::{cursor, Detector};
