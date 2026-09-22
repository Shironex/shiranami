//! The atomic JSON settings store: file primitives, the key space, the
//! dot-path document model, and the change bus over it.

pub mod atomic;
pub mod bus;
pub mod document;
pub mod keys;
pub mod settings;

pub use atomic::{create_owner_only, quarantine_corrupt, write_atomic};
pub use bus::{ChangeBus, ChangeEvent, SubscriptionId};
pub use keys::{MainStoreKey, RendererStoreKey};
pub use settings::{ScrobbleSettings, SettingsStore};
