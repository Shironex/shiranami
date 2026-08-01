//! Health check — the end-to-end proof that the invoke path is wired.
//!
//! Exists so the shell has one real command from Phase 1 onward: the renderer
//! can call it, the generated bindings will cover it, and the E2E harness can
//! use it as a "backend is up" probe. It touches nothing, so it stays cheap
//! enough to answer during boot.

use serde::Serialize;

/// What the shell reports about itself.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HealthReport {
    /// Always `"ok"`. A shell that cannot answer does not answer at all.
    pub status: String,
    /// The shell's own crate version, which is also the app version.
    pub version: String,
}

/// Builds the report. Kept separate from the command so it is testable without
/// a Tauri runtime.
pub(crate) fn health_report() -> HealthReport {
    HealthReport {
        status: "ok".to_owned(),
        version: env!("CARGO_PKG_VERSION").to_owned(),
    }
}

/// Reports that the Rust side is alive and which version is running.
#[tauri::command]
pub async fn health_check() -> HealthReport {
    health_report()
}

#[cfg(test)]
mod tests {
    use super::{HealthReport, health_report};

    #[test]
    fn reports_ok_with_the_shell_version() {
        assert_eq!(
            health_report(),
            HealthReport {
                status: "ok".to_owned(),
                version: env!("CARGO_PKG_VERSION").to_owned(),
            }
        );
    }

    #[test]
    fn serializes_to_the_camel_case_wire_shape() {
        let json = serde_json::to_value(health_report()).expect("report is serializable");
        assert_eq!(json["status"], "ok");
        assert!(json["version"].is_string());
    }
}
