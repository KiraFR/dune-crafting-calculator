//! The keyboard for the overlay, only while one of the page's "I have" fields is open.
//!
//! The overlay window is not focusable, so the game keeps the keyboard. When a field opens, the window
//! becomes focusable and takes the foreground; when it closes, the foreground goes back to the window
//! that had it, usually the game. No key is ever simulated: tao's `set_focus` presses Alt when Windows
//! refuses the foreground, which would reach the game. Here the refusal is met the way Windows allows,
//! by joining the foreground thread's input for the one call.

use tauri::WebviewWindow;

#[cfg(windows)]
mod imp {
    use tauri::WebviewWindow;
    use windows_sys::Win32::Foundation::HWND;
    use windows_sys::Win32::System::Threading::{AttachThreadInput, GetCurrentThreadId};
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        GetForegroundWindow, GetWindowThreadProcessId, IsWindow, SetForegroundWindow,
    };

    fn hwnd(window: &WebviewWindow) -> Option<HWND> {
        window.hwnd().ok().map(|h| h.0 as HWND)
    }

    /// Brings `window` to the foreground; returns the window that had it (0 when none or unknown).
    /// Call it on the main thread, which owns the window.
    pub fn take(window: &WebviewWindow) -> isize {
        let Some(ours) = hwnd(window) else { return 0 };
        // SAFETY: plain Win32 calls on window handles; a stale handle only makes a call fail.
        unsafe {
            let previous = GetForegroundWindow();
            if previous == ours {
                return 0;
            }
            if SetForegroundWindow(ours) == 0 && !previous.is_null() {
                // Refused: only the foreground thread may give the foreground away, so join its input.
                let me = GetCurrentThreadId();
                let them = GetWindowThreadProcessId(previous, std::ptr::null_mut());
                if them != 0 && them != me && AttachThreadInput(me, them, 1) != 0 {
                    SetForegroundWindow(ours);
                    AttachThreadInput(me, them, 0);
                }
            }
            previous as isize
        }
    }

    /// Gives the foreground back to `previous`, unless the player has already moved to another window.
    pub fn give_back(window: &WebviewWindow, previous: isize) {
        let (Some(ours), false) = (hwnd(window), previous == 0) else { return };
        let previous = previous as HWND;
        // SAFETY: as above; IsWindow guards against a window closed meanwhile.
        unsafe {
            if GetForegroundWindow() == ours && IsWindow(previous) != 0 {
                SetForegroundWindow(previous);
            }
        }
    }
}

#[cfg(not(windows))]
mod imp {
    use tauri::WebviewWindow;

    pub fn take(_window: &WebviewWindow) -> isize {
        0
    }

    pub fn give_back(_window: &WebviewWindow, _previous: isize) {}
}

/// Makes the overlay take the keyboard (`wanted`) or give it back. Returns the window to give it back to.
pub fn hand(window: &WebviewWindow, wanted: bool, previous: isize) -> isize {
    if wanted {
        let _ = window.set_focusable(true);
        imp::take(window)
    } else {
        imp::give_back(window, previous);
        let _ = window.set_focusable(false);
        0
    }
}
