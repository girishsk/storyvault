/**
 * Migrates all data from local stories.db (SQLite) to Neon (Postgres).
 * Run with: node scripts/migrate-to-neon.mjs
 *
 * Requires POSTGRES_URL or storyvault_POSTGRES_URL in .env.local
 */

import Database from 'better-sqlite3';
import { neon } from '@neondatabase/serverless';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

// Load .env.local
const envPath = join(root, '.env.local');
try {
  const env = readFileSync(envPath, 'utf8');
  for (const line of env.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
} catch {
  console.error('Could not read .env.local');
  process.exit(1);
}

const postgresUrl = process.env.POSTGRES_URL || process.env.storyvault_POSTGRES_URL;
if (!postgresUrl) {
  console.error('No POSTGRES_URL found in .env.local');
  process.exit(1);
}

const dbPath = join(root, 'data', 'stories.db');
const sqlite = new Database(dbPath, { readonly: true });
const sql = neon(postgresUrl);

async function ensureSchema() {
  await sql`CREATE TABLE IF NOT EXISTS stories (
    id TEXT PRIMARY KEY, title TEXT NOT NULL, content TEXT NOT NULL,
    book_title TEXT NOT NULL DEFAULT '', author TEXT NOT NULL DEFAULT '',
    topics TEXT NOT NULL DEFAULT '[]', mermaid_code TEXT NOT NULL DEFAULT '',
    diagram_image_path TEXT, source_image_path TEXT,
    related_story_ids TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL, sheets_row_id INTEGER
  )`;
  await sql`CREATE TABLE IF NOT EXISTS story_links (
    from_id TEXT NOT NULL, to_id TEXT NOT NULL,
    shared_topics TEXT NOT NULL DEFAULT '[]', similarity_score REAL NOT NULL DEFAULT 0,
    PRIMARY KEY (from_id, to_id)
  )`;
  await sql`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`;
  await sql`CREATE TABLE IF NOT EXISTS story_diagrams (
    story_id TEXT NOT NULL, type TEXT NOT NULL, label TEXT NOT NULL, code TEXT NOT NULL,
    PRIMARY KEY (story_id, type)
  )`;
}

async function migrate() {
  console.log('Connecting to Neon...');
  await ensureSchema();

  // Stories
  const stories = sqlite.prepare('SELECT * FROM stories').all();
  console.log(`Migrating ${stories.length} stories...`);
  for (const s of stories) {
    await sql`
      INSERT INTO stories (id, title, content, book_title, author, topics, mermaid_code,
        diagram_image_path, source_image_path, related_story_ids, created_at, updated_at, sheets_row_id)
      VALUES (${s.id}, ${s.title}, ${s.content}, ${s.book_title}, ${s.author}, ${s.topics},
        ${s.mermaid_code}, ${s.diagram_image_path}, ${s.source_image_path}, ${s.related_story_ids},
        ${s.created_at}, ${s.updated_at}, ${s.sheets_row_id})
      ON CONFLICT (id) DO UPDATE SET
        title = EXCLUDED.title, content = EXCLUDED.content,
        book_title = EXCLUDED.book_title, author = EXCLUDED.author,
        topics = EXCLUDED.topics, mermaid_code = EXCLUDED.mermaid_code,
        diagram_image_path = EXCLUDED.diagram_image_path,
        source_image_path = EXCLUDED.source_image_path,
        related_story_ids = EXCLUDED.related_story_ids,
        updated_at = EXCLUDED.updated_at, sheets_row_id = EXCLUDED.sheets_row_id
    `;
    console.log(`  ✓ ${s.title}`);
  }

  // Story links
  const links = sqlite.prepare('SELECT * FROM story_links').all();
  console.log(`Migrating ${links.length} story links...`);
  for (const l of links) {
    await sql`
      INSERT INTO story_links (from_id, to_id, shared_topics, similarity_score)
      VALUES (${l.from_id}, ${l.to_id}, ${l.shared_topics}, ${l.similarity_score})
      ON CONFLICT (from_id, to_id) DO UPDATE SET
        shared_topics = EXCLUDED.shared_topics, similarity_score = EXCLUDED.similarity_score
    `;
  }

  // Story diagrams
  const diagrams = sqlite.prepare('SELECT * FROM story_diagrams').all();
  console.log(`Migrating ${diagrams.length} cached diagrams...`);
  for (const d of diagrams) {
    await sql`
      INSERT INTO story_diagrams (story_id, type, label, code)
      VALUES (${d.story_id}, ${d.type}, ${d.label}, ${d.code})
      ON CONFLICT (story_id, type) DO UPDATE SET label = EXCLUDED.label, code = EXCLUDED.code
    `;
  }

  // Settings
  const settings = sqlite.prepare('SELECT * FROM settings').all();
  console.log(`Migrating ${settings.length} settings...`);
  for (const s of settings) {
    await sql`
      INSERT INTO settings (key, value) VALUES (${s.key}, ${s.value})
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
    `;
  }

  sqlite.close();
  console.log('\nDone! All data migrated to Neon.');
}

migrate().catch(err => { console.error(err); process.exit(1); });
