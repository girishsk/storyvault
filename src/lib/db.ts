import { createClient, Client, Row } from '@libsql/client';
import { Story, StoryLink } from '@/types/story';

let _client: Client | null = null;
let _schemaReady = false;

function getClient(): Client {
  if (!_client) {
    _client = createClient({
      url: process.env.TURSO_DATABASE_URL ?? 'file:data/stories.db',
      authToken: process.env.TURSO_AUTH_TOKEN,
    });
  }
  return _client;
}

async function getDb(): Promise<Client> {
  const db = getClient();
  if (!_schemaReady) {
    await db.executeMultiple(`
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
      );
      CREATE TABLE IF NOT EXISTS story_links (
        from_id TEXT NOT NULL,
        to_id TEXT NOT NULL,
        shared_topics TEXT NOT NULL DEFAULT '[]',
        similarity_score REAL NOT NULL DEFAULT 0,
        PRIMARY KEY (from_id, to_id)
      );
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS story_diagrams (
        story_id TEXT NOT NULL,
        type TEXT NOT NULL,
        label TEXT NOT NULL,
        code TEXT NOT NULL,
        PRIMARY KEY (story_id, type)
      );
    `);
    _schemaReady = true;
  }
  return db;
}

function rowToStory(row: Row): Story {
  return {
    id: row.id as string,
    title: row.title as string,
    content: row.content as string,
    bookTitle: row.book_title as string,
    author: row.author as string,
    topics: JSON.parse(row.topics as string),
    mermaidCode: row.mermaid_code as string,
    diagramImagePath: row.diagram_image_path as string | null,
    sourceImagePath: row.source_image_path as string | null,
    relatedStoryIds: JSON.parse(row.related_story_ids as string),
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    sheetsRowId: row.sheets_row_id as number | null,
  };
}

export async function getAllStories(): Promise<Story[]> {
  const db = await getDb();
  const result = await db.execute('SELECT * FROM stories ORDER BY created_at DESC');
  return result.rows.map(rowToStory);
}

export async function getStoryById(id: string): Promise<Story | null> {
  const db = await getDb();
  const result = await db.execute({ sql: 'SELECT * FROM stories WHERE id = ?', args: [id] });
  return result.rows[0] ? rowToStory(result.rows[0]) : null;
}

export async function getRandomStory(): Promise<Story | null> {
  const db = await getDb();
  const result = await db.execute('SELECT * FROM stories ORDER BY RANDOM() LIMIT 1');
  return result.rows[0] ? rowToStory(result.rows[0]) : null;
}

export async function createStory(story: Omit<Story, 'createdAt' | 'updatedAt'>): Promise<Story> {
  const db = await getDb();
  const now = new Date().toISOString();
  const full: Story = { ...story, createdAt: now, updatedAt: now };
  await db.execute({
    sql: `INSERT INTO stories (id, title, content, book_title, author, topics, mermaid_code,
      diagram_image_path, source_image_path, related_story_ids, created_at, updated_at, sheets_row_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      full.id, full.title, full.content, full.bookTitle, full.author,
      JSON.stringify(full.topics), full.mermaidCode,
      full.diagramImagePath, full.sourceImagePath,
      JSON.stringify(full.relatedStoryIds), full.createdAt, full.updatedAt, full.sheetsRowId,
    ],
  });
  return full;
}

export async function updateStory(id: string, updates: Partial<Story>): Promise<Story | null> {
  const existing = await getStoryById(id);
  if (!existing) return null;
  const db = await getDb();
  const updated = { ...existing, ...updates, updatedAt: new Date().toISOString() };
  await db.execute({
    sql: `UPDATE stories SET title=?, content=?, book_title=?, author=?, topics=?,
      mermaid_code=?, diagram_image_path=?, source_image_path=?, related_story_ids=?,
      updated_at=?, sheets_row_id=? WHERE id=?`,
    args: [
      updated.title, updated.content, updated.bookTitle, updated.author,
      JSON.stringify(updated.topics), updated.mermaidCode,
      updated.diagramImagePath, updated.sourceImagePath,
      JSON.stringify(updated.relatedStoryIds), updated.updatedAt, updated.sheetsRowId, id,
    ],
  });
  return updated;
}

export async function deleteStory(id: string): Promise<boolean> {
  const db = await getDb();
  const result = await db.execute({ sql: 'DELETE FROM stories WHERE id = ?', args: [id] });
  await db.execute({ sql: 'DELETE FROM story_links WHERE from_id = ? OR to_id = ?', args: [id, id] });
  return (result.rowsAffected ?? 0) > 0;
}

export async function upsertStoryLink(link: StoryLink): Promise<void> {
  const db = await getDb();
  await db.execute({
    sql: `INSERT OR REPLACE INTO story_links (from_id, to_id, shared_topics, similarity_score)
      VALUES (?, ?, ?, ?)`,
    args: [link.fromId, link.toId, JSON.stringify(link.sharedTopics), link.similarityScore],
  });
}

export async function getLinksForStory(id: string): Promise<StoryLink[]> {
  const db = await getDb();
  const result = await db.execute({
    sql: 'SELECT * FROM story_links WHERE from_id = ? OR to_id = ? ORDER BY similarity_score DESC',
    args: [id, id],
  });
  return result.rows.map(row => ({
    fromId: row.from_id as string,
    toId: row.to_id as string,
    sharedTopics: JSON.parse(row.shared_topics as string),
    similarityScore: row.similarity_score as number,
  }));
}

export async function getAllLinks(): Promise<StoryLink[]> {
  const db = await getDb();
  const result = await db.execute('SELECT * FROM story_links ORDER BY similarity_score DESC');
  return result.rows.map(row => ({
    fromId: row.from_id as string,
    toId: row.to_id as string,
    sharedTopics: JSON.parse(row.shared_topics as string),
    similarityScore: row.similarity_score as number,
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
  const db = await getDb();
  const result = await db.execute({
    sql: 'SELECT type, label, code FROM story_diagrams WHERE story_id = ? ORDER BY rowid',
    args: [storyId],
  });
  return result.rows.map(row => ({
    type: row.type as string,
    label: row.label as string,
    code: row.code as string,
  }));
}

export async function upsertStoryDiagram(storyId: string, diagram: StoryDiagram): Promise<void> {
  const db = await getDb();
  await db.execute({
    sql: 'INSERT OR REPLACE INTO story_diagrams (story_id, type, label, code) VALUES (?, ?, ?, ?)',
    args: [storyId, diagram.type, diagram.label, diagram.code],
  });
}

export async function clearStoryDiagrams(storyId: string): Promise<void> {
  const db = await getDb();
  await db.execute({ sql: 'DELETE FROM story_diagrams WHERE story_id = ?', args: [storyId] });
}

export async function getSetting(key: string): Promise<string | null> {
  const db = await getDb();
  const result = await db.execute({ sql: 'SELECT value FROM settings WHERE key = ?', args: [key] });
  return result.rows[0] ? (result.rows[0].value as string) : null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const db = await getDb();
  await db.execute({
    sql: 'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
    args: [key, value],
  });
}

export async function getAllSettings(): Promise<Record<string, string>> {
  const db = await getDb();
  const result = await db.execute('SELECT key, value FROM settings');
  return Object.fromEntries(result.rows.map(r => [r.key as string, r.value as string]));
}
