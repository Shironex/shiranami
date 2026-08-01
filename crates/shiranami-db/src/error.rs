//! The database error enum and how it crosses the command boundary.
//!
//! Every variant here is a refusal to touch a database v2 cannot prove it
//! understands. That bias is deliberate: the failure mode this crate exists to
//! prevent is a silent one — adoption that "succeeds" against a schema nobody
//! verified, or a fresh empty library where the user's tracks used to be (risk
//! R6, architecture §3.1 step 7). Refusing to start is recoverable; the user
//! still has their file. Continuing is not.

use std::borrow::Cow;

use serde_json::json;
use shiranami_core::error::WireError;
use shiranami_core::error::codes;

/// Convenience alias for fallible database operations.
pub type Result<T, E = DbError> = std::result::Result<T, E>;

/// Failures raised by `shiranami-db`.
#[derive(Debug, thiserror::Error)]
pub enum DbError {
    /// A query or connection failed.
    ///
    /// `operation` is a verb phrase naming what was being attempted, so the
    /// rendered message reads as a sentence.
    #[error("could not {operation}: {source}")]
    Query {
        /// What was being attempted, e.g. `"read the drizzle migration ledger"`.
        operation: &'static str,
        /// The underlying failure.
        #[source]
        source: sqlx::Error,
    },

    /// The sqlx migrator refused to run or apply a migration.
    #[error("could not apply database migrations: {source}")]
    Migrate {
        /// The underlying failure.
        #[source]
        source: sqlx::migrate::MigrateError,
    },

    /// SQLite's `quick_check` reported structural damage.
    ///
    /// v1 only warned here and opened the file anyway, on the reasoning that a
    /// partially-readable database is still worth exporting from. v2 refuses,
    /// because the caller is first-run adoption: writing a migration ledger
    /// into a damaged file is how a recoverable database becomes an
    /// unrecoverable one.
    #[error("the database file is damaged: {report}")]
    Corrupt {
        /// The first line `PRAGMA quick_check` returned.
        report: String,
    },

    /// The database was written by a build newer than this one.
    ///
    /// The stamp is a compatibility *floor*, not a migration count, so this
    /// fires only when a genuinely breaking migration has been applied — see
    /// [`crate::compat`].
    #[error(
        "database schema version {found} is newer than this app supports ({supported}). \
         Please update Shiranami to open this library."
    )]
    SchemaTooNew {
        /// The `PRAGMA user_version` read from the file.
        found: i64,
        /// The floor this build understands.
        supported: i64,
    },

    /// The drizzle ledger names a migration this build has never heard of.
    ///
    /// Means v1 shipped a migration after v2 froze its copy of the chain. v2
    /// cannot know what that migration did, so it cannot claim the schema
    /// matches its baseline.
    #[error(
        "the database was migrated by a newer Shiranami: drizzle migration `{name}` is not one \
         of the {known} this build knows. Please update Shiranami to open this library."
    )]
    UnknownV1Migration {
        /// The ledger row that could not be matched.
        name: String,
        /// How many migrations this build knows about.
        known: usize,
    },

    /// The drizzle ledger exists in a shape this build cannot read.
    ///
    /// Only the 5-column (`id`, `hash`, `created_at`, `name`, `applied_at`)
    /// shape is supported. See [`crate::adopt::ledger`] for why no shipped
    /// Shiranami release can have written any other.
    #[error("the database's drizzle migration ledger is in an unrecognised shape: {reason}")]
    UnsupportedLedger {
        /// What about the ledger could not be read.
        reason: String,
    },

    /// The sqlx ledger disagrees with this build's migration set.
    ///
    /// Adoption is idempotent, so finding an existing `_sqlx_migrations` is
    /// normal — finding one that records a *different* baseline is not.
    #[error("the database's sqlx migration ledger does not match this build: {reason}")]
    LedgerConflict {
        /// What did not match.
        reason: String,
    },
}

impl WireError for DbError {
    fn code(&self) -> Cow<'static, str> {
        // As in `shiranami-net`: the four registries in `core::error::codes`
        // are a frozen vocabulary the renderer has translations for, and
        // minting `db.schema_too_new` here would hand it a code it cannot
        // translate. These failures are also all boot-path failures — Phase 17
        // turns them into a refuse-to-start dialog with the message below, not
        // into a renderer `switch`.
        Cow::Borrowed(codes::INTERNAL)
    }

    fn details(&self) -> Option<serde_json::Value> {
        // Only the version pair, and only because a "your database is too new"
        // dialog reads better with the numbers in it. Nothing here carries a
        // path or a query — `details` is the field that gets logged and
        // forwarded structurally, and a file path is user data.
        match self {
            Self::SchemaTooNew { found, supported } => {
                Some(json!({ "found": found, "supported": supported }))
            }
            _ => None,
        }
    }
}

#[cfg(test)]
mod tests {
    use shiranami_core::error::ErrorPayload;

    use super::*;

    #[test]
    fn schema_too_new_carries_the_version_pair() {
        let payload = ErrorPayload::of(&DbError::SchemaTooNew {
            found: 9,
            supported: 8,
        });

        assert_eq!(payload.code, codes::INTERNAL);
        assert!(payload.message.contains("9"), "{}", payload.message);
        assert_eq!(payload.details, Some(json!({ "found": 9, "supported": 8 })));
    }

    #[test]
    fn other_variants_carry_no_structured_details() {
        let payload = ErrorPayload::of(&DbError::Corrupt {
            report: "*** in database main ***".to_owned(),
        });

        assert_eq!(payload.details, None);
        assert!(payload.message.contains("damaged"), "{}", payload.message);
    }
}
