import { neon } from '@neondatabase/serverless';
import { Story, StoryLink } from '@/types/story';

function getDb() {
  const url = process.env.POSTGRES_URL || process.env.storyvault_POSTGRES_URL;
  if (!url) throw new Error('No Postgres URL configured (POSTGRES_URL or storyvault_POSTGRES_URL)');
  return neon(url);
}

let _schemaReady = false;

async function ensureSchema() {
  if (_schemaReady) return;
  const sql = getDb();
  await sql`
    CREATE TABLE IF NOT EXISTS stories (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      book_title TEXT NOT NULL DEFAULT '',
      author TEXT NOT NULL DEFAULT '',
      topics TEXT NOT NULL DEFAULT '[]',
      mermaid_code TEXT NOT NULL DEFAULT '',
      diagram_image_path TEXT,
      source_image_path TEXT,
      related_story_ids TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      sheets_row_id INTEGER
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS story_links (
      from_id TEXT NOT NULL,
      to_id TEXT NOT NULL,
      shared_topics TEXT NOT NULL DEFAULT '[]',
      similarity_score REAL NOT NULL DEFAULT 0,
      PRIMARY KEY (from_id, to_id)
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS story_diagrams (
      story_id TEXT NOT NULL,
      type TEXT NOT NULL,
      label TEXT NOT NULL,
      code TEXT NOT NULL,
      PRIMARY KEY (story_id, type)
    )
  `;
  _schemaReady = true;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToStory(row: any): Story {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    bookTitle: row.book_title,
    author: row.author,
    topics: JSON.parse(row.topics),
    mermaidCode: row.mermaid_code,
    diagramImagePath: row.diagram_image_path ?? null,
    sourceImagePath: row.source_image_path ?? null,
    relatedStoryIds: JSON.parse(row.related_story_ids),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    sheetsRowId: row.sheets_row_id ?? null,
  };
}

export async function getAllStories(): Promise<Story[]> {
  await ensureSchema();
  const sql = getDb();
  const rows = await sql`SELECT * FROM stories ORDER BY created_at DESC`;
  return rows.map(rowToStory);
}

export async function getStoryById(id: string): Promise<Story | null> {
  await ensureSchema();
  const sql = getDb();
  const rows = await sql`SELECT * FROM stories WHERE id = ${id}`;
  return rows[0] ? rowToStory(rows[0]) : null;
}

export async function getRandomStory(): Promise<Story | null> {
  await ensureSchema();
  const sql = getDb();
  const rows = await sql`SELECT * FROM stories ORDER BY RANDOM() LIMIT 1`;
  return rows[0] ? rowToStory(rows[0]) : null;
}

export async function createStory(story: Omit<Story, 'createdAt' | 'updatedAt'>): Promise<Story> {
  await ensureSchema();
  const sql = getDb();
  const now = new Date().toISOString();
  const full: Story = { ...story, createdAt: now, updatedAt: now };
  await sql`
    INSERT INTO stories (id, title, content, book_title, author, topics, mermaid_code,
      diagram_image_path, source_image_path, related_story_ids, created_at, updated_at, sheets_row_id)
    VALUES (
      ${full.id}, ${full.title}, ${full.content}, ${full.bookTitle}, ${full.author},
      ${JSON.stringify(full.topics)}, ${full.mermaidCode},
      ${full.diagramImagePath}, ${full.sourceImagePath},
      ${JSON.stringify(full.relatedStoryIds)}, ${full.createdAt}, ${full.updatedAt}, ${full.sheetsRowId}
    )
  `;
  return full;
}

export async function updateStory(id: string, updates: Partial<Story>): Promise<Story | null> {
  const existing = await getStoryById(id);
  if (!existing) return null;
  const sql = getDb();
  const updated = { ...existing, ...updates, updatedAt: new Date().toISOString() };
  await sql`
    UPDATE stories SET
      title = ${updated.title},
      content = ${updated.content},
      book_title = ${updated.bookTitle},
      author = ${updated.author},
      topics = ${JSON.stringify(updated.topics)},
      mermaid_code = ${updated.mermaidCode},
      diagram_image_path = ${updated.diagramImagePath},
      source_image_path = ${updated.sourceImagePath},
      related_story_ids = ${JSON.stringify(updated.relatedStoryIds)},
      updated_at = ${updated.updatedAt},
      sheets_row_id = ${updated.sheetsRowId}
    WHERE id = ${id}
  `;
  return updated;
}

export async function deleteStory(id: string): Promise<boolean> {
  await ensureSchema();
  const sql = getDb();
  const result = await sql`DELETE FROM stories WHERE id = ${id} RETURNING id`;
  await sql`DELETE FROM story_links WHERE from_id = ${id} OR to_id = ${id}`;
  return result.length > 0;
}

export async function upsertStoryLink(link: StoryLink): Promise<void> {
  await ensureSchema();
  const sql = getDb();
  await sql`
    INSERT INTO story_links (from_id, to_id, shared_topics, similarity_score)
    VALUES (${link.fromId}, ${link.toId}, ${JSON.stringify(link.sharedTopics)}, ${link.similarityScore})
    ON CONFLICT (from_id, to_id) DO UPDATE SET
      shared_topics = EXCLUDED.shared_topics,
      similarity_score = EXCLUDED.similarity_score
  `;
}

export async function getLinksForStory(id: string): Promise<StoryLink[]> {
  await ensureSchema();
  const sql = getDb();
  const rows = await sql`
    SELECT * FROM story_links WHERE from_id = ${id} OR to_id = ${id}
    ORDER BY similarity_score DESC
  `;
  return rows.map(row => ({
    fromId: row.from_id,
    toId: row.to_id,
    sharedTopics: JSON.parse(row.shared_topics),
    similarityScore: row.similarity_score,
  }));
}

export async function getAllLinks(): Promise<StoryLink[]> {
  await ensureSchema();
  const sql = getDb();
  const rows = await sql`SELECT * FROM story_links ORDER BY similarity_score DESC`;
  return rows.map(row => ({
    fromId: row.from_id,
    toId: row.to_id,
    sharedTopics: JSON.parse(row.shared_topics),
    similarityScore: row.similarity_score,
  }));
}

export async function upsertStoryFromSheets(story: Story): Promise<void> {
  const existing = await getStoryById(story.id);
  if (existing) {
    await updateStory(story.id, story);
  } else {
    await createStory(story);
  }
}

export interface StoryDiagram {
  type: string;
  label: string;
  code: string;
}

export async function getStoryDiagrams(storyId: string): Promise<StoryDiagram[]> {
  await ensureSchema();
  const sql = getDb();
  const rows = await sql`
    SELECT type, label, code FROM story_diagrams
    WHERE story_id = ${storyId}
    ORDER BY ctid
  `;
  return rows.map(row => ({ type: row.type, label: row.label, code: row.code }));
}

export async function upsertStoryDiagram(storyId: string, diagram: StoryDiagram): Promise<void> {
  await ensureSchema();
  const sql = getDb();
  await sql`
    INSERT INTO story_diagrams (story_id, type, label, code)
    VALUES (${storyId}, ${diagram.type}, ${diagram.label}, ${diagram.code})
    ON CONFLICT (story_id, type) DO UPDATE SET
      label = EXCLUDED.label,
      code = EXCLUDED.code
  `;
}

export async function clearStoryDiagrams(storyId: string): Promise<void> {
  await ensureSchema();
  const sql = getDb();
  await sql`DELETE FROM story_diagrams WHERE story_id = ${storyId}`;
}

export async function getSetting(key: string): Promise<string | null> {
  await ensureSchema();
  const sql = getDb();
  const rows = await sql`SELECT value FROM settings WHERE key = ${key}`;
  return rows[0] ? rows[0].value : null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  await ensureSchema();
  const sql = getDb();
  await sql`
    INSERT INTO settings (key, value) VALUES (${key}, ${value})
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
  `;
}

export async function getAllSettings(): Promise<Record<string, string>> {
  await ensureSchema();
  const sql = getDb();
  const rows = await sql`SELECT key, value FROM settings`;
  return Object.fromEntries(rows.map(r => [r.key, r.value]));
}
