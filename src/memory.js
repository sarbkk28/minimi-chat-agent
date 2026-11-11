import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";

mkdirSync("data", { recursive: true });
const db = new DatabaseSync("data/agent.db");

db.exec(`
  CREATE TABLE IF NOT EXISTS messages (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    role       TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content    TEXT NOT NULL,
    sources    TEXT,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_messages_created ON messages (created_at);
`);

export function saveMessage({ role, content, sources = null, createdAt = new Date() }) {
  db.prepare(
    "INSERT INTO messages (role, content, sources, created_at) VALUES (?, ?, ?, ?)"
  ).run(role, content, sources ? JSON.stringify(sources) : null, createdAt.toISOString());
}

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

// All messages inside [start, end): used for "what did I ask on <date>?"
// ISO strings sort correctly as text, so a simple string comparison works.
export function messagesBetween(start, end, limit = 20) {
  return db
    .prepare(
      "SELECT role, content, created_at FROM messages WHERE created_at >= ? AND created_at < ? ORDER BY created_at LIMIT ?"
    )
    .all(start.toISOString(), end.toISOString(), limit);
}