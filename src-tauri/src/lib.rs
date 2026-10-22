use std::fs;
use std::path::Path;
use tauri::{Emitter, Manager};

#[tauri::command]
fn home_dir() -> String {
    std::env::var("HOME").unwrap_or_default()
}

#[tauri::command]
fn path_exists(path: String) -> bool {
    Path::new(&path).exists()
}

/// 列出同步文件夹里的所有 .md 便签，返回 (便签 id, 文件全文)
#[tauri::command]
fn list_notes(folder: String) -> Result<Vec<(String, String)>, String> {
    let dir = Path::new(&folder);
    if !dir.exists() {
        return Ok(vec![]);
    }
    let mut out = Vec::new();
    let entries = fs::read_dir(dir).map_err(|e| e.to_string())?;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|s| s.to_str()) == Some("md") {
            let id = path
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("")
                .to_string();
            if id.is_empty() {
                continue;
            }
            if let Ok(text) = fs::read_to_string(&path) {
                out.push((id, text));
            }
        }
    }
    Ok(out)
}

/// 原子写文件：先写同目录 `<name>.tmp` 再 rename，避免崩溃 / 断电留下半份文件
/// （同步文件夹场景下半份文件会被云盘扩散覆盖其他机器的好版本）
fn atomic_write(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let mut tmp_name = path
        .file_name()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_default();
    tmp_name.push_str(".tmp");
    let tmp = path.with_file_name(tmp_name);
    fs::write(&tmp, bytes).map_err(|e| e.to_string())?;
    fs::rename(&tmp, path).map_err(|e| {
        let _ = fs::remove_file(&tmp);
        e.to_string()
    })
}

#[tauri::command]
fn write_note(folder: String, id: String, text: String) -> Result<(), String> {
    fs::create_dir_all(&folder).map_err(|e| e.to_string())?;
    let safe = id.replace(['/', '\\'], "_");
    atomic_write(&Path::new(&folder).join(format!("{safe}.md")), text.as_bytes())
}

#[tauri::command]
fn delete_note(folder: String, id: String) -> Result<(), String> {
    let safe = id.replace(['/', '\\'], "_");
    let p = Path::new(&folder).join(format!("{safe}.md"));
    if p.exists() {
        fs::remove_file(p).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn write_attachment(folder: String, name: String, bytes: Vec<u8>) -> Result<(), String> {
    let dir = Path::new(&folder).join("attachments");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let safe = name.replace(['/', '\\'], "_");
    atomic_write(&dir.join(safe), &bytes)
}

#[tauri::command]
fn read_attachment(folder: String, name: String) -> Result<Vec<u8>, String> {
    let safe = name.replace(['/', '\\'], "_");
    fs::read(Path::new(&folder).join("attachments").join(safe)).map_err(|e| e.to_string())
}

/// 弹出系统文件夹选择器
#[tauri::command]
async fn pick_folder(app: tauri::AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let (tx, rx) = tokio::sync::oneshot::channel();
    app.dialog().file().pick_folder(move |f| {
        let _ = tx.send(f);
    });
    let picked = rx.await.map_err(|e| e.to_string())?;
    Ok(picked.map(|fp| fp.to_string()))
}

/// 聚焦主窗口
fn focus_main(app: &tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

/// 快速新建：聚焦窗口并把剪贴板文本（若有）随事件发给前端预填
fn quick_new(app: &tauri::AppHandle) {
    use tauri_plugin_clipboard_manager::ClipboardExt;
    focus_main(app);
    let text = app
        .clipboard()
        .read_text()
        .unwrap_or_default()
        .trim()
        .chars()
        .take(2000)
        .collect::<String>();
    let _ = app.emit("quick-new-note", text);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    use tauri::menu::{Menu, MenuItem};
    use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if event.state() == ShortcutState::Pressed {
                        quick_new(app);
                    }
                })
                .build(),
        )
        .setup(|app| {
            // 全局热键 ⌃⌥N：任何应用里一键新建便签（自动预填剪贴板文本）
            app.global_shortcut().register(Shortcut::new(
                Some(Modifiers::CONTROL | Modifiers::ALT),
                Code::KeyN,
            ))?;

            // 菜单栏托盘图标（必须保持存活，drop 会被系统移除 → 用 forget 常驻）
            let menu = Menu::with_items(
                app,
                &[
                    &MenuItem::with_id(app, "new", "新建便签", true, None::<&str>)?,
                    &MenuItem::with_id(app, "show", "显示主窗口", true, None::<&str>)?,
                    &MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?,
                ],
            )?;
            let tray = tauri::tray::TrayIconBuilder::new()
                .icon(tauri::image::Image::from_bytes(include_bytes!("../icons/tray.png"))?)
                .icon_as_template(true)
                .menu(&menu)
                .tooltip("MD 便签")
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "new" => quick_new(app),
                    "show" => focus_main(app),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .build(app)?;
            std::mem::forget(tray);

            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            home_dir,
            path_exists,
            list_notes,
            write_note,
            delete_note,
            write_attachment,
            read_attachment,
            pick_folder
        ])
        .run(tauri::generate_context!())
        .expect("error while building tauri application");
}
