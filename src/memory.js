import { DatabaseSync } from "node:sqlite"; // built into Node 22.13+, nothing to compile
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

// DB_PATH lets tests use a throwaway database instead of your real chat history
const DB_PATH = process.env.DB_PATH || "data/agent.db";
mkdirSync(dirname(DB_PATH), { recursive: true });
const db = new DatabaseSync(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS messages (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    role       TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content    TEXT NOT NULL,
    sources    TEXT,              -- JSON array of {title, url}, assistant only
    created_at TEXT NOT NULL      -- ISO timestamp in UTC
  );
  CREATE INDEX IF NOT EXISTS idx_messages_created ON messages (created_at);

  -- Structured snapshots of checkable facts (prices, versions, plans), with when we saw them
  CREATE TABLE IF NOT EXISTS facts (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    entity      TEXT NOT NULL,
    attribute   TEXT NOT NULL,
    value       TEXT NOT NULL,
    source_url  TEXT,
    observed_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_facts_observed ON facts (observed_at);
`);

// ---------- messages ----------

export function saveMessage({ role, content, sources = null, createdAt = new Date() }) {
  db.prepare(
    "INSERT INTO messages (role, content, sources, created_at) VALUES (?, ?, ?, ?)"
  ).run(role, content, sources ? JSON.stringify(sources) : null, createdAt.toISOString());
}

// Ordered by time, not id: seeded past messages get newer ids but older timestamps
export function recentMessages(limit = 6) {
  return db
    .prepare("SELECT role, content, created_at FROM messages ORDER BY created_at DESC LIMIT ?")
    .all(limit)
    .reverse();
}

export function allMessages() {
  return db
    .prepare("SELECT role, content, sources, created_at FROM messages ORDER BY created_at")
    .all()
    .map((m) => ({ ...m, sources: m.sources ? JSON.parse(m.sources) : [] }));
}

// ISO strings sort correctly as text, so a string range comparison works
export function messagesBetween(start, end, limit = 20) {
  return db
    .prepare(
      "SELECT role, content, created_at FROM messages WHERE created_at >= ? AND created_at < ? ORDER BY created_at LIMIT ?"
    )
    .all(start.toISOString(), end.toISOString(), limit);
}

// ---------- facts ----------

export function saveFacts(facts, observedAt = new Date()) {
  const insert = db.prepare(
    "INSERT INTO facts (entity, attribute, value, source_url, observed_at) VALUES (?, ?, ?, ?, ?)"
  );
  for (const f of facts) {
    insert.run(f.entity, f.attribute, f.value, f.source_url ?? null, observedAt.toISOString());
  }
}

export function factsBetween(start, end) {
  return db
    .prepare(
      "SELECT entity, attribute, value, source_url, observed_at FROM facts WHERE observed_at >= ? AND observed_at < ? ORDER BY entity"
    )
    .all(start.toISOString(), end.toISOString());
}