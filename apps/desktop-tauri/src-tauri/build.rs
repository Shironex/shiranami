fn main() {
    let attributes = tauri_build::Attributes::new()
        .windows_attributes(tauri_build::WindowsAttributes::new_without_app_manifest());
    tauri_build::try_build(attributes).expect("tauri-build");

    embed_app_manifest();
}

/// `tauri_build` embeds its manifest into the app binary alone, so cargo test
/// binaries get none. `tauri-plugin-dialog` imports `TaskDialogIndirect`, which
/// only comctl32 v6 exports, so an unmanifested test binary binds System32's
/// v5.82 and dies at load with `STATUS_ENTRYPOINT_NOT_FOUND` before a single
/// test runs. Linux CI never sees it, which is how the whole desktop suite could
/// be unrunnable on Windows while the pipeline stayed green.
///
/// `app.manifest` holds what tauri would have embedded. Linking it here covers
/// every target, and tauri's own copy is switched off above so the two cannot
/// collide as a duplicate MANIFEST resource.
fn embed_app_manifest() {
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() != Ok("windows") {
        return;
    }
    let Ok(dir) = std::env::var("CARGO_MANIFEST_DIR") else {
        return;
    };
    let manifest = std::path::Path::new(&dir).join("app.manifest");

    println!("cargo::rerun-if-changed=app.manifest");
    println!("cargo::rustc-link-arg=/MANIFEST:EMBED");
    println!(
        "cargo::rustc-link-arg=/MANIFESTINPUT:{}",
        manifest.display()
    );
}
