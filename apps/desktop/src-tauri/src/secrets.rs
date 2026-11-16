//! Refresh-token storage in the OS keychain (PRD §4): Windows Credential Manager,
//! macOS Keychain, Linux Secret Service. The webview never persists the token itself.

use keyring::Entry;

const SERVICE: &str = "com.nexustask.desktop";
/// Only these accounts may be touched from the frontend.
const ALLOWED_ACCOUNTS: &[&str] = &["refresh-token"];

fn entry(account: &str) -> Result<Entry, String> {
    if !ALLOWED_ACCOUNTS.contains(&account) {
        return Err("unknown secret".into());
    }
    Entry::new(SERVICE, account).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn secret_get(account: String) -> Result<Option<String>, String> {
    match entry(&account)?.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn secret_set(account: String, value: String) -> Result<(), String> {
    if value.len() > 1024 {
        return Err("secret too long".into());
    }
    entry(&account)?.set_password(&value).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn secret_delete(account: String) -> Result<(), String> {
    match entry(&account)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}
