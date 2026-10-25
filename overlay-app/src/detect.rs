//! Is Dune: Awakening running?
//!
//! The game's executable is looked up in a process-list snapshot: the app never opens a handle to the
//! game process, which BattlEye guards.

/// The game process (the launcher and BattlEye run as other processes).
pub const GAME_EXE: &str = "DuneSandbox-Win64-Shipping.exe";

/// The executable to watch: the game, or `DUNE_OVERLAY_GAME_EXE` (e.g. `charmap.exe`) to try the
/// overlay without launching the game.
#[cfg(windows)]
fn watched_exe() -> String {
    std::env::var("DUNE_OVERLAY_GAME_EXE").unwrap_or_else(|_| GAME_EXE.to_string())
}

#[cfg(windows)]
mod imp {
    use super::watched_exe;
    use windows_sys::Win32::Foundation::{CloseHandle, INVALID_HANDLE_VALUE, POINT};
    use windows_sys::Win32::System::Diagnostics::ToolHelp::{
        CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W, TH32CS_SNAPPROCESS,
    };
    use windows_sys::Win32::UI::WindowsAndMessaging::GetCursorPos;

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

    /// The mouse cursor on the desktop, in physical pixels.
    pub fn cursor_position() -> Option<(i32, i32)> {
        let mut point = POINT { x: 0, y: 0 };
        // SAFETY: plain Win32 query into a local.
        (unsafe { GetCursorPos(&mut point) } != 0).then_some((point.x, point.y))
    }
}

#[cfg(not(windows))]
mod imp {
    /// The game only runs on Windows; elsewhere it never runs.
    #[derive(Default)]
    pub struct Detector;

    impl Detector {
        pub fn dune_running(&mut self) -> bool {
            false
        }
    }

    pub fn cursor_position() -> Option<(i32, i32)> {
        None
    }
}

pub use imp::{cursor_position, Detector};
