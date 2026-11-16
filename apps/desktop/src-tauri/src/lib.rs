//! Mendunia Workbase desktop shell (Tauri v2, PRD §4). The UI is the bundled apps/web SPA; this
//! crate only adds OS integration: keychain, tray, single instance + deep links, native
//! notifications, badge, signed auto-update and optional launch at login.

mod secrets;

use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, WindowEvent,
};

const MAIN_WINDOW: &str = "main";
const TRAY_ID: &str = "main";
/// Passed by the autostart entry so a login-time launch stays in the tray.
const MINIMIZED_FLAG: &str = "--minimized";

fn show_main(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(MAIN_WINDOW) {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

/// Unread counter: dock/launcher badge where the OS supports it, otherwise the window
/// title (Windows taskbar), plus the tray tooltip everywhere.
#[tauri::command]
fn set_badge(app: AppHandle, count: u32) {
    if let Some(window) = app.get_webview_window(MAIN_WINDOW) {
        let _ = window.set_badge_count(if count > 0 { Some(i64::from(count)) } else { None });
        #[cfg(target_os = "windows")]
        {
            let title = if count > 0 { format!("({}) Mendunia Workbase", count.min(99)) } else { "Mendunia Workbase".to_string() };
            let _ = window.set_title(&title);
        }
    }
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        let tooltip = if count > 0 { format!("Mendunia Workbase — {count} belum dibaca") } else { "Mendunia Workbase".to_string() };
        let _ = tray.set_tooltip(Some(tooltip));
    }
}

fn build_tray(app: &AppHandle) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", "Buka Mendunia Workbase", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Keluar", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &PredefinedMenuItem::separator(app)?, &quit])?;

    let mut tray = TrayIconBuilder::with_id(TRAY_ID)
        .tooltip("Mendunia Workbase")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open" => show_main(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                show_main(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.build(app)?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    #[cfg(desktop)]
    {
        // Must be registered first: a second launch (or a taskapp:// link) focuses the
        // running window instead; the `deep-link` feature forwards the URL to it.
        builder = builder
            .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| show_main(app)))
            .plugin(tauri_plugin_updater::Builder::new().build())
            .plugin(tauri_plugin_autostart::init(
                tauri_plugin_autostart::MacosLauncher::LaunchAgent,
                Some(vec![MINIMIZED_FLAG]),
            ));
    }

    let app = builder
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            secrets::secret_get,
            secrets::secret_set,
            secrets::secret_delete,
            set_badge
        ])
        .setup(|app| {
            // Installers register taskapp:// themselves; this covers dev and portable runs.
            #[cfg(any(windows, target_os = "linux"))]
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                let _ = app.deep_link().register_all();
            }
            build_tray(app.handle())?;
            if std::env::args().any(|arg| arg == MINIMIZED_FLAG) {
                if let Some(window) = app.get_webview_window(MAIN_WINDOW) {
                    let _ = window.hide();
                }
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            // Closing the window keeps Mendunia Workbase running in the tray so notifications keep
            // arriving (PRD §4). "Keluar" in the tray menu quits for real.
            if let WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == MAIN_WINDOW {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building Mendunia Workbase");

    app.run(|_app, _event| {
        // macOS: clicking the dock icon of a hidden app brings the window back.
        #[cfg(target_os = "macos")]
        if let tauri::RunEvent::Reopen { .. } = _event {
            show_main(_app);
        }
    });
}
