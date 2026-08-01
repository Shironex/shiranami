//! Health check — the end-to-end proof that the invoke path is wired.
//!
//! Exists so the shell has one real command from Phase 1 onward: the renderer
//! can call it, the generated bindings cover it, and the E2E harness can use it
//! as a "backend is up" probe. It touches nothing, so it stays cheap enough to
//! answer during boot — and it is the one command in this crate deliberately
//! allowed to be trivial, since a health probe that needs the database is not a
//! health probe.
//!
//! **Not a v1 channel.** Every other module here ports one; this one has no
//! entry in `ALL_IPC_CHANNELS`, which is why `commands::COMMAND_COUNT` counts it
//! and the 135-channel parity ceiling does not.

use serde::Serialize;
use specta::Type;

/// Register this namespace's commands with [`crate::commands::registry`].
///
/// The shape every namespace module repeats: append paths to `collected`, then
/// call straight back into `gather!` with the shortened queue. See
/// [`crate::commands::registry`] for why the paths are spelled out absolutely
/// and why the accumulator is a token-tree sequence.
macro_rules! commands {
    (queue = [$($tail:ident,)*], collected = [$($collected:tt)*]) => {
        crate::commands::registry::gather! {
            queue = [$($tail,)*],
            collected = [$($collected)*
                crate::commands::health::health_check,
            ]
        }
    };
}
pub(crate) use commands;

/// What the shell reports about itself.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
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
#[specta::specta]
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
