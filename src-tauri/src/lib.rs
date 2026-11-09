use tauri::{ipc::Response, AppHandle, Manager};

/// Lit un fichier local et renvoie ses octets bruts (sans passer par du JSON).
#[tauri::command]
fn read_file(path: String) -> Result<Response, String> {
    std::fs::read(&path)
        .map(Response::new)
        .map_err(|e| format!("Impossible de lire {path} : {e}"))
}

/// Autorise le protocole `asset:` à servir le dossier d'un fichier HTML local,
/// pour que ses images / CSS relatifs s'affichent (et uniquement ce dossier).
#[tauri::command]
fn allow_dir(app: AppHandle, path: String) -> Result<(), String> {
    let dir = std::path::Path::new(&path)
        .parent()
        .ok_or_else(|| "chemin invalide".to_string())?;
    app.asset_protocol_scope()
        .allow_directory(dir, true)
        .map_err(|e| e.to_string())
}

/// Fichier passé en argument au lancement (double-clic sur un .pdf / .html).
#[tauri::command]
fn initial_file() -> Option<String> {
    std::env::args().skip(1).find(|a| {
        let a = a.to_lowercase();
        a.ends_with(".pdf") || a.ends_with(".html") || a.ends_with(".htm")
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![read_file, initial_file, allow_dir])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
