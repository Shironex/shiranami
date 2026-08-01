//! One-shot takeover of a drizzle-managed database by the sqlx ledger.
//!
//! Architecture §3.2 and decision D14. [`run`] holds the state machine; the
//! rest is what it needs: [`v1`] freezes the drizzle chain, [`ledger`] reads
//! and writes `__drizzle_migrations`, and [`heal`] replays what a database is
//! behind by.

pub(crate) mod heal;
pub(crate) mod ledger;
pub(crate) mod run;
pub(crate) mod v1;

pub use run::{Adoption, adopt};
