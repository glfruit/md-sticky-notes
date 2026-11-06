use std::fs;
use std::path::Path;
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{Emitter, Manager};
use tauri::ipc::Response;

#[tauri::command]
fn home_dir() -> String {
    std::env::var("HOME").unwrap_or_default()
}

#[tauri::command]
fn path_exists(path: String) -> bool {
    Path::new(&path).exists()
}

// ---------- 磁盘布局契约（单源；前端 lib/storage/folderAdapter 拼同名概念，勿在两侧散改） ----------

/// 回收站子目录名（前端 folderAdapter 同名字符串）
const TRASH_DIR: &str = ".trash";
/// 附件子目录名
const ATTACHMENTS_DIR: &str = "attachments";

/// 用户输入的便签 id / 附件名 → 安全文件名：路径分隔符换成下划线（防穿越）。
/// 全部 IPC 命令共用，改规则只改这里。
fn sanitize_name(s: &str) -> String {
    s.replace(['/', '\\'], "_")
}

/// 便签 id → 同步文件夹下的文件路径 `<folder>/<safe-id>.md`。
/// list_notes 的反向提取（extension == "md" + file_stem）依赖同一契约。
fn note_path(folder: &str, id: &str) -> std::path::PathBuf {
    Path::new(folder).join(format!("{}.md", sanitize_name(id)))
}

/// 附件目录 `<folder>/attachments`
fn attachments_dir(folder: &str) -> std::path::PathBuf {
    Path::new(folder).join(ATTACHMENTS_DIR)
}

/// 已知「非文件提供方」云盘同步根（相对 HOME）：坚果云客户端自管目录 + 旧版 Dropbox 挂载路径。
/// macOS 文件提供方服务（Dropbox / OneDrive / Google Drive / Box 等）统一挂在
/// ~/Library/CloudStorage/ 下，运行时枚举该目录即可，无需逐个硬编码。
const SYNC_ROOT_CANDIDATES: &[&str] = &["Nutstore Files", "我的坚果云", "Dropbox"];

/// 在候选同步根里找出包含 target 的那一个（嵌套时取最长前缀），返回服务显示名
fn sync_root_for(target: &Path, roots: &[(std::path::PathBuf, String)]) -> Option<String> {
    roots
        .iter()
        .filter(|(root, _)| target.starts_with(root))
        .max_by_key(|(root, _)| root.components().count())
        .map(|(_, name)| name.clone())
}

/// 检测路径是否位于云盘同步目录内，返回服务名（如 "Dropbox" / "Nutstore Files" / "iCloud Drive"），
/// 不在任何同步目录内返回空串。切换同步文件夹前用来提醒用户 / 决定是否自动迁移。
#[tauri::command]
fn detect_sync_root(path: String) -> Result<String, String> {
    let home = std::path::PathBuf::from(std::env::var("HOME").unwrap_or_default());
    let mut roots: Vec<(std::path::PathBuf, String)> = Vec::new();
    let cs = home.join("Library/CloudStorage");
    if let Ok(entries) = fs::read_dir(&cs) {
        for e in entries.flatten() {
            roots.push((e.path(), e.file_name().to_string_lossy().into_owned()));
        }
    }
    roots.push((
        home.join("Library/Mobile Documents/com~apple~CloudDocs"),
        "iCloud Drive".to_string(),
    ));
    for c in SYNC_ROOT_CANDIDATES {
        roots.push((home.join(c), (*c).to_string()));
    }
    Ok(sync_root_for(Path::new(&path), &roots).unwrap_or_default())
}

/// 把 src 目录下的全部文件复制到 dst 目录（不递归，目标已存在的同名文件跳过不覆盖），返回复制数
fn copy_dir_files(src: &Path, dst: &Path) -> Result<usize, String> {
    if !src.exists() {
        return Ok(0);
    }
    fs::create_dir_all(dst).map_err(|e| e.to_string())?;
    let mut n = 0;
    for entry in fs::read_dir(src).map_err(|e| e.to_string())?.flatten() {
        let p = entry.path();
        if !p.is_file() {
            continue;
        }
        let target = dst.join(entry.file_name());
        if target.exists() {
            continue;
        }
        fs::copy(&p, &target).map_err(|e| e.to_string())?;
        n += 1;
    }
    Ok(n)
}

/// 切换同步文件夹前的数据迁移：复制旧文件夹的便签、.trash/ 回收站和 attachments/ 附件。
/// 目标已存在的同名文件一律跳过（以目标为准，保守合并不覆盖），返回 (便签, 回收站, 附件) 数量。
#[tauri::command]
fn copy_folder_contents(from: String, to: String) -> Result<(usize, usize, usize), String> {
    let (src, dst) = (Path::new(&from), Path::new(&to));
    if !src.exists() {
        return Ok((0, 0, 0));
    }
    // 防呆：新旧目录相同或互为父子时拒绝（旧目录已确认存在；新目录来自系统选择器必存在）
    let src_canon = src.canonicalize().map_err(|e| e.to_string())?;
    let dst_canon = dst
        .canonicalize()
        .map_err(|e| format!("目标文件夹不可用：{e}"))?;
    if src_canon == dst_canon
        || src_canon.starts_with(&dst_canon)
        || dst_canon.starts_with(&src_canon)
    {
        return Err("目标文件夹与当前文件夹相同或互为父子目录，无法迁移".to_string());
    }
    let notes = copy_dir_files(src, dst)?;
    let trash = copy_dir_files(&src.join(TRASH_DIR), &dst.join(TRASH_DIR))?;
    let atts = copy_dir_files(
        &src.join(ATTACHMENTS_DIR),
        &dst.join(ATTACHMENTS_DIR),
    )?;
    Ok((notes, trash, atts))
}

/// 列出同步文件夹里的所有 .md 便签，返回 (便签 id, 文件全文)。
/// 文件名契约是 note_path 的反向（<safe-id>.md → stem 即 id）
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
    atomic_write(&note_path(&folder, &id), text.as_bytes())
}

#[tauri::command]
fn delete_note(folder: String, id: String) -> Result<(), String> {
    let p = note_path(&folder, &id);
    if p.exists() {
        fs::remove_file(p).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// 回收站移入/恢复的原子换位（#31）：fs::rename 一步完成「写目标 + 删源」，
/// 消除两步 invoke 之间崩溃导致的便签两处并存（同步文件夹下中间态会被云盘扩散）。
/// rename 成功后 atomic_write 更新内容（updatedAt / z 与操作时刻一致）；此间崩溃
/// 则文件已在目标位置、内容为旧版——位置一致优先，不产生两处并存。
/// 目标已存在时 rename 直接覆盖（Unix 语义；Windows 侧 std 走 MoveFileExW 带
/// REPLACE_EXISTING 同样覆盖）——重复移入/恢复幂等。
/// 源不存在时退化为直写目标（云盘/他机已移走源时不阻断回收站路径，行为同旧版 write）。
#[tauri::command]
fn move_note(
    from_folder: String,
    to_folder: String,
    id: String,
    text: String,
) -> Result<(), String> {
    let src = note_path(&from_folder, &id);
    let dst = note_path(&to_folder, &id);
    fs::create_dir_all(&to_folder).map_err(|e| e.to_string())?;
    if src.exists() {
        fs::rename(&src, &dst).map_err(|e| e.to_string())?;
    }
    atomic_write(&dst, text.as_bytes())
}

#[tauri::command]
fn write_attachment(folder: String, name: String, data_b64: String) -> Result<(), String> {
    use base64::Engine;
    let dir = attachments_dir(&folder);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(data_b64)
        .map_err(|e| e.to_string())?;
    atomic_write(&dir.join(sanitize_name(&name)), &bytes)
}

/// 原始二进制返回（IPC raw payload），避免大图片走 JSON 数字数组
#[tauri::command]
fn read_attachment(folder: String, name: String) -> Result<Response, String> {
    let bytes =
        fs::read(attachments_dir(&folder).join(sanitize_name(&name))).map_err(|e| e.to_string())?;
    Ok(Response::new(bytes))
}

/// 列出 attachments 目录下的全部附件文件名（孤儿清理用）
#[tauri::command]
fn list_attachments(folder: String) -> Result<Vec<String>, String> {
    let dir = attachments_dir(&folder);
    if !dir.exists() {
        return Ok(vec![]);
    }
    let mut out = Vec::new();
    let entries = fs::read_dir(&dir).map_err(|e| e.to_string())?;
    for entry in entries.flatten() {
        let p = entry.path();
        // 崩溃残留的 .tmp 不会被任何便签引用，一并返回、按孤儿清理
        if let Some(name) = p.file_name().and_then(|s| s.to_str()) {
            out.push(name.to_string());
        }
    }
    Ok(out)
}

#[tauri::command]
fn delete_attachment(folder: String, name: String) -> Result<(), String> {
    let p = attachments_dir(&folder).join(sanitize_name(&name));
    if p.exists() {
        fs::remove_file(p).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// 监听同步文件夹（便签 / 回收站 / 附件变更），去抖后通知前端重载。
/// 重复调用会替换旧 watcher（drop 后通道关闭、线程自动退出）。
struct WatchState {
    _watcher: notify::RecommendedWatcher,
}

static WATCH_STATE: Mutex<Option<WatchState>> = Mutex::new(None);

#[tauri::command]
fn watch_folder(app: tauri::AppHandle, folder: String) -> Result<(), String> {
    use notify::Watcher;
    use std::sync::mpsc;
    let (tx, rx) = mpsc::channel::<()>();
    let mut watcher =
        notify::recommended_watcher(move |res: Result<notify::Event, _>| {
            if res.is_ok() {
                let _ = tx.send(());
            }
        })
        .map_err(|e| e.to_string())?;
    watcher
        .watch(Path::new(&folder), notify::RecursiveMode::Recursive)
        .map_err(|e| e.to_string())?;
    *WATCH_STATE.lock().unwrap() = Some(WatchState { _watcher: watcher });
    std::thread::spawn(move || {
        let mut last: Option<Instant> = None;
        loop {
            match rx.recv_timeout(Duration::from_millis(200)) {
                Ok(()) => last = Some(Instant::now()),
                Err(mpsc::RecvTimeoutError::Timeout) => {
                    // 静默 400ms 后合并为一次通知
                    if last.is_some_and(|t| t.elapsed() >= Duration::from_millis(400)) {
                        last = None;
                        let _ = app.emit("folder-changed", ());
                    }
                }
                Err(mpsc::RecvTimeoutError::Disconnected) => return,
            }
        }
    });
    Ok(())
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
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_opener::init())
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
            detect_sync_root,
            copy_folder_contents,
            list_notes,
            write_note,
            delete_note,
            move_note,
            write_attachment,
            read_attachment,
            list_attachments,
            delete_attachment,
            watch_folder,
            pick_folder
        ])
        .run(tauri::generate_context!())
        .expect("error while building tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn roots(list: &[(&str, &str)]) -> Vec<(PathBuf, String)> {
        list.iter()
            .map(|(p, n)| (PathBuf::from(p), n.to_string()))
            .collect()
    }

    #[test]
    fn sync_root_matches_full_components_only() {
        let r = roots(&[("/h/Nutstore Files", "Nutstore Files")]);
        assert_eq!(
            sync_root_for(Path::new("/h/Nutstore Files/MD 便签"), &r),
            Some("Nutstore Files".to_string())
        );
        // 同名字符串前缀但不同路径分量不算命中
        assert_eq!(sync_root_for(Path::new("/h/Nutstore Files2/x"), &r), None);
        assert_eq!(sync_root_for(Path::new("/h/Documents/x"), &r), None);
    }

    #[test]
    fn sync_root_prefers_longest_prefix() {
        let r = roots(&[
            ("/h/Library/Mobile Documents", "Mobile Documents"),
            (
                "/h/Library/Mobile Documents/com~apple~CloudDocs",
                "iCloud Drive",
            ),
        ]);
        assert_eq!(
            sync_root_for(Path::new("/h/Library/Mobile Documents/com~apple~CloudDocs/a.md"), &r),
            Some("iCloud Drive".to_string())
        );
    }

    #[test]
    fn copy_dir_files_skips_existing_targets() {
        let base = std::env::temp_dir().join(format!("mdsn-copy-{}", std::process::id()));
        let (src, dst) = (base.join("src"), base.join("dst"));
        let _ = fs::remove_dir_all(&base);
        fs::create_dir_all(&src).unwrap();
        fs::write(src.join("a.md"), "new").unwrap();
        fs::write(src.join("b.md"), "new").unwrap();
        fs::create_dir_all(&dst).unwrap();
        fs::write(dst.join("a.md"), "old").unwrap();
        assert_eq!(copy_dir_files(&src, &dst).unwrap(), 1);
        assert_eq!(fs::read_to_string(dst.join("a.md")).unwrap(), "old");
        assert_eq!(fs::read_to_string(dst.join("b.md")).unwrap(), "new");
        let _ = fs::remove_dir_all(&base);
    }

    #[test]
    fn sanitize_name_replaces_path_separators() {
        assert_eq!(sanitize_name("a/b\\c"), "a_b_c");
        assert_eq!(sanitize_name("../evil"), ".._evil");
        assert_eq!(sanitize_name("note-abc123"), "note-abc123");
    }

    #[test]
    fn move_note_swaps_atomically_and_updates_content() {
        let base = std::env::temp_dir().join(format!("mdsn-move-{}", std::process::id()));
        let _ = fs::remove_dir_all(&base);
        let (a, b) = (base.join("a"), base.join("b"));
        fs::create_dir_all(&a).unwrap();
        fs::write(a.join("n1.md"), "old").unwrap();
        let mv = |from: &Path, to: &Path, id: &str, text: &str| {
            move_note(
                from.to_string_lossy().into_owned(),
                to.to_string_lossy().into_owned(),
                id.to_string(),
                text.to_string(),
            )
        };
        // 正常：换位 + 内容更新（目标目录不存在则内建）
        mv(&a, &b, "n1", "new").unwrap();
        assert!(!a.join("n1.md").exists());
        assert_eq!(fs::read_to_string(b.join("n1.md")).unwrap(), "new");
        // 源缺失退化：直写目标（云盘/他机已移走源不阻断回收站路径）
        mv(&a, &b, "n2", "fresh").unwrap();
        assert_eq!(fs::read_to_string(b.join("n2.md")).unwrap(), "fresh");
        // 目标已存在：覆盖（重复移入回收站幂等）
        fs::write(a.join("n3.md"), "src").unwrap();
        fs::write(b.join("n3.md"), "dst-old").unwrap();
        mv(&a, &b, "n3", "dst-new").unwrap();
        assert!(!a.join("n3.md").exists());
        assert_eq!(fs::read_to_string(b.join("n3.md")).unwrap(), "dst-new");
        // 源缺失且目标已存在：退化为 atomic_write 覆盖（.trash 已有副本时再次删除）
        fs::write(b.join("n4.md"), "stale").unwrap();
        mv(&a, &b, "n4", "again").unwrap();
        assert_eq!(fs::read_to_string(b.join("n4.md")).unwrap(), "again");
        let _ = fs::remove_dir_all(&base);
    }

    #[test]
    fn note_path_stays_inside_folder() {
        // 分隔符被替换后落在 folder 内，不构成路径穿越
        assert_eq!(
            note_path("/tmp/f", "../evil"),
            Path::new("/tmp/f/.._evil.md")
        );
        // id 为 ".." 时拼成字面名 "...md"，同样不越界
        assert_eq!(note_path("/tmp/f", ".."), Path::new("/tmp/f/...md"));
    }
}
