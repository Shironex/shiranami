//! Binary entry point. Everything else lives in the library so it can be
//! tested without launching a webview.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    shiranami_desktop_lib::run();
}
