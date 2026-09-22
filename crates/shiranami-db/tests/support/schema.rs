//! Reading a schema back in a form two databases can be compared by.
//!
//! Two views, because they catch different mistakes. [`schema_objects`] is the
//! `sqlite_master` text, normalized — it says the two schemas were *written*
//! the same. [`table_shape`] is what SQLite parsed out of that text — it says
//! they *mean* the same, catching a dropped `NOT NULL` or a foreign key that
//! lost its `ON DELETE CASCADE` even where a text normalizer would shrug.
//!
//! `#[path]`-included rather than a `mod.rs`, because `mod.rs` is a manifest in
//! this workspace and this file is anything but.

#![allow(dead_code, reason = "each test file uses a different subset")]

use serde_json::{Value, json};
use sqlx::{AssertSqlSafe, Row, SqliteConnection};

/// The schema listing generated from v1's real migrations by
/// `pnpm verify:db-baseline`.
pub(crate) fn fixture() -> Value {
    serde_json::from_str(include_str!("../../fixtures/v1-schema.json"))
        .expect("the committed v1 schema fixture must be valid JSON")
}

// ── Reading a schema back ─────────────────────────────────────────────────────

/// Bookkeeping tables both ledgers own, excluded from every schema comparison.
///
/// The two migration systems necessarily disagree about these — that
/// disagreement is what adoption *is*. Their contents are asserted directly by
/// the adoption tests instead.
const LEDGERS: [&str; 2] = ["__drizzle_migrations", "_sqlx_migrations"];

/// One `sqlite_master` row, ready to be compared.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord)]
pub(crate) struct SchemaObject {
    /// `table` or `index`.
    pub(crate) kind: String,
    /// The object's own name.
    pub(crate) name: String,
    /// The table it belongs to.
    pub(crate) table: String,
    /// Its `CREATE` statement, normalized. `None` for the implicit indexes a
    /// `UNIQUE` or `PRIMARY KEY` constraint creates.
    pub(crate) sql: Option<String>,
}

/// Collapse the formatting differences SQLite does not care about.
///
/// Whitespace runs become one space, and spaces adjacent to `(`, `)` and `,`
/// go away. That last part is what lets the squash stay readable: a column
/// added by `ALTER TABLE` is spliced in as `\n, \`album_artist\` text)`, and no
/// hand-written `CREATE TABLE` is ever going to be laid out like that.
///
/// It is safe because SQLite's tokenizer treats those positions as
/// insignificant. It is *not* a general SQL formatter — it would happily change
/// a string literal containing a double space, which is why nothing in either
/// schema has one.
pub(crate) fn normalize_sql(sql: &str) -> String {
    let collapsed = sql.split_whitespace().collect::<Vec<_>>().join(" ");
    let mut out = String::with_capacity(collapsed.len());
    let mut characters = collapsed.chars().peekable();

    while let Some(character) = characters.next() {
        if character == ' ' && matches!(characters.peek(), Some(',' | ')')) {
            continue;
        }

        out.push(character);

        if character == '(' {
            while characters.peek() == Some(&' ') {
                characters.next();
            }
        }
    }

    out
}

/// Every schema object in the database, ledgers excluded, in a stable order.
pub(crate) async fn schema_objects(conn: &mut SqliteConnection) -> Vec<SchemaObject> {
    let rows = sqlx::query(
        "SELECT type, name, tbl_name, sql FROM sqlite_master
         WHERE name NOT LIKE 'sqlite\\_stat%' ESCAPE '\\'
         ORDER BY type, name",
    )
    .fetch_all(conn)
    .await
    .expect("sqlite_master must be readable");

    rows.into_iter()
        .map(|row| SchemaObject {
            kind: row.get("type"),
            name: row.get("name"),
            table: row.get("tbl_name"),
            sql: row
                .get::<Option<String>, _>("sql")
                .map(|sql| normalize_sql(&sql)),
        })
        .filter(|object| !LEDGERS.contains(&object.table.as_str()))
        .collect()
}

/// The same listing the fixture holds, built from a live database.
pub(crate) async fn schema_objects_as_json(conn: &mut SqliteConnection) -> Value {
    Value::Array(
        schema_objects(conn)
            .await
            .into_iter()
            .map(|object| {
                json!({
                    "type": object.kind,
                    "name": object.name,
                    "tableName": object.table,
                    "sql": object.sql,
                })
            })
            .collect(),
    )
}

/// A table's columns, indexes and foreign keys as SQLite parsed them, in the
/// shape the fixture's `tables` section uses.
pub(crate) async fn table_shape(conn: &mut SqliteConnection, table: &str) -> Value {
    let columns = sqlx::query(
        "SELECT name, type, \"notnull\", dflt_value, pk FROM pragma_table_info(?1) ORDER BY cid",
    )
    .bind(table)
    .fetch_all(&mut *conn)
    .await
    .expect("pragma_table_info must be readable")
    .into_iter()
    .map(|row| {
        json!({
            "name": row.get::<String, _>("name"),
            "type": row.get::<String, _>("type"),
            "notNull": row.get::<i64, _>("notnull") == 1,
            "default": row.get::<Option<String>, _>("dflt_value"),
            "primaryKey": row.get::<i64, _>("pk"),
        })
    })
    .collect::<Vec<_>>();

    let listed = sqlx::query(
        "SELECT name, \"unique\", origin, partial FROM pragma_index_list(?1) ORDER BY name",
    )
    .bind(table)
    .fetch_all(&mut *conn)
    .await
    .expect("pragma_index_list must be readable");

    let mut indexes = Vec::with_capacity(listed.len());
    for row in listed {
        let name: String = row.get("name");
        let columns_in_index: Vec<String> =
            sqlx::query_scalar("SELECT name FROM pragma_index_info(?1) ORDER BY seqno")
                .bind(&name)
                .fetch_all(&mut *conn)
                .await
                .expect("pragma_index_info must be readable");

        indexes.push(json!({
            "name": name,
            "unique": row.get::<i64, _>("unique") == 1,
            "origin": row.get::<String, _>("origin"),
            "partial": row.get::<i64, _>("partial") == 1,
            "columns": columns_in_index,
        }));
    }

    let mut foreign_keys = sqlx::query(
        "SELECT \"table\", \"from\", \"to\", on_update, on_delete FROM pragma_foreign_key_list(?1)",
    )
    .bind(table)
    .fetch_all(&mut *conn)
    .await
    .expect("pragma_foreign_key_list must be readable")
    .into_iter()
    .map(|row| {
        json!({
            "table": row.get::<String, _>("table"),
            "from": row.get::<String, _>("from"),
            "to": row.get::<String, _>("to"),
            "onUpdate": row.get::<String, _>("on_update"),
            "onDelete": row.get::<String, _>("on_delete"),
        })
    })
    .collect::<Vec<_>>();

    foreign_keys.sort_by_key(|key| format!("{}.{}", key["table"], key["from"]));

    json!({ "columns": columns, "indexes": indexes, "foreignKeys": foreign_keys })
}

/// Table names, ledgers excluded.
pub(crate) async fn table_names(conn: &mut SqliteConnection) -> Vec<String> {
    schema_objects(conn)
        .await
        .into_iter()
        .filter(|object| object.kind == "table")
        .map(|object| object.name)
        .collect()
}

/// Explicitly created index names — the implicit constraint ones are omitted,
/// since they follow from the table definitions.
pub(crate) async fn index_names(conn: &mut SqliteConnection) -> Vec<String> {
    schema_objects(conn)
        .await
        .into_iter()
        .filter(|object| object.kind == "index" && object.sql.is_some())
        .map(|object| object.name)
        .collect()
}

/// A table's column names, sorted, so two column *sets* can be compared without
/// caring which order `ALTER TABLE` happened to append them in.
pub(crate) async fn column_names(conn: &mut SqliteConnection, table: &str) -> Vec<String> {
    let mut names: Vec<String> =
        sqlx::query_scalar("SELECT name FROM pragma_table_info(?1) ORDER BY name")
            .bind(table)
            .fetch_all(conn)
            .await
            .expect("pragma_table_info must be readable");
    names.sort();
    names
}

/// How many rows a table holds.
pub(crate) async fn count(conn: &mut SqliteConnection, table: &str) -> i64 {
    sqlx::query_scalar(AssertSqlSafe(format!("SELECT COUNT(*) FROM `{table}`")))
        .fetch_one(conn)
        .await
        .unwrap_or_else(|error| panic!("counting `{table}` failed: {error}"))
}

/// Row counts for every table that exists, as a sorted listing.
pub(crate) async fn row_counts(conn: &mut SqliteConnection) -> Vec<(String, i64)> {
    let mut counts = Vec::new();

    for table in table_names(&mut *conn).await {
        let rows = count(&mut *conn, &table).await;
        counts.push((table, rows));
    }

    counts.sort();
    counts
}

/// A single scalar, as text, for spot-checking a value survived.
pub(crate) async fn scalar(conn: &mut SqliteConnection, query: &str) -> Option<String> {
    sqlx::query_scalar(AssertSqlSafe(query.to_owned()))
        .fetch_one(conn)
        .await
        .unwrap_or_else(|error| panic!("`{query}` failed: {error}"))
}
