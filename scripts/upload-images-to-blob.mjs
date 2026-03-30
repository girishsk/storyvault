/**
 * Uploads local images to Vercel Blob and updates Neon DB with the new URLs.
 * Run with: node scripts/upload-images-to-blob.mjs
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname, basename } from 'path';
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
    const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[key]) process.env[key] = val;
  }
} catch {
  console.error('Could not read .env.local');
  process.exit(1);
}

const postgresUrl = process.env.POSTGRES_URL || process.env.storyvault_POSTGRES_URL;
const blobToken = process.env.BLOB_READ_WRITE_TOKEN || process.env.storyvault_BLOB_READ_WRITE_TOKEN;

if (!postgresUrl) { console.error('No POSTGRES_URL in .env.local'); process.exit(1); }
if (!blobToken) { console.error('No BLOB_READ_WRITE_TOKEN in .env.local'); process.exit(1); }

const { neon } = await import('@neondatabase/serverless');
const { put } = await import('@vercel/blob');
const sql = neon(postgresUrl);

// Fetch stories with local image paths
const rows = await sql`SELECT id, title, source_image_path FROM stories WHERE source_image_path IS NOT NULL AND source_image_path NOT LIKE 'https://%'`;

if (rows.length === 0) {
  console.log('No stories with local image paths found.');
  process.exit(0);
}

console.log(`Found ${rows.length} stories with local images to upload.\n`);

for (const row of rows) {
  // Map /images/filename.ext → data/images/filename.ext
  const filename = basename(row.source_image_path);
  const localPath = join(root, 'data', 'images', filename);

  if (!existsSync(localPath)) {
    console.log(`  ✗ ${row.title} — file not found: ${localPath}`);
    continue;
  }

  const buffer = readFileSync(localPath);
  const ext = filename.split('.').pop()?.toLowerCase() || 'jpg';
  const contentType = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';

  console.log(`  Uploading ${filename} for "${row.title}"...`);
  const blob = await put(`images/${filename}`, buffer, {
    access: 'private',
    token: blobToken,
    contentType,
  });

  await sql`UPDATE stories SET source_image_path = ${blob.url} WHERE id = ${row.id}`;
  console.log(`  ✓ Uploaded → ${blob.url}\n`);
}

console.log('Done! Images uploaded to Vercel Blob and DB updated.');
