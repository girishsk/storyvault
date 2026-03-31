import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { extractStoryFromImage, generateMermaidDiagram, extractTopics } from '@/lib/claude';
import { createStory } from '@/lib/db';
import { renderMermaidToImage } from '@/lib/mermaid-render';

// Formats Claude's vision API accepts
const CLAUDE_SUPPORTED = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);

const MAX_UPLOAD_BYTES = 4.5 * 1024 * 1024; // Vercel hard limit
const MAX_MEGAPIXELS = 100;                  // guard against decompression bombs

// Validate it's a real image and not a bomb, then convert to JPEG
async function normalizeImage(input: Buffer): Promise<{ buffer: Buffer; mediaType: string }> {
  const sharp = (await import('sharp')).default;
  // Read metadata first — cheap, no full decode
  const meta = await sharp(input, { failOn: 'none' }).metadata();
  if (!meta.width || !meta.height) throw new Error('Not a valid image');
  if ((meta.width * meta.height) > MAX_MEGAPIXELS * 1_000_000) {
    throw new Error('Image resolution too large');
  }
  const converted = await sharp(input, { failOn: 'none' })
    .rotate()  // auto-rotate from EXIF
    .resize({ width: 2000, height: 2000, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 88 })
    .toBuffer();
  return { buffer: Buffer.from(converted), mediaType: 'image/jpeg' };
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('image') as File;
    const overrideBookTitle = (formData.get('bookTitle') as string | null)?.trim() || '';
    const overrideAuthor = (formData.get('author') as string | null)?.trim() || '';

    if (!file) {
      return NextResponse.json({ error: 'No image provided' }, { status: 400 });
    }

    // Server-side size guard (client can be bypassed)
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: 'Image too large (max 4.5 MB)' }, { status: 413 });
    }

    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
    const rawMediaType = file.type || (ext === 'heic' || ext === 'heif' ? 'image/heic' : 'image/jpeg');
    let buffer: Buffer = Buffer.from(await file.arrayBuffer());
    const imageId = uuidv4();

    // Always normalize: validates it's a real image, guards against bombs, converts HEIC→JPEG
    let mediaType = rawMediaType;
    try {
      const normalized = await normalizeImage(buffer);
      buffer = normalized.buffer;
      mediaType = normalized.mediaType;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Invalid image';
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    const imageName = `${imageId}.jpg`;

    // Store the normalized JPEG image
    let sourceImagePath: string | null = null;
    try {
      const blobToken = process.env.BLOB_READ_WRITE_TOKEN || process.env.storyvault_BLOB_READ_WRITE_TOKEN;
      if (blobToken) {
        const { put } = await import('@vercel/blob');
        const blob = await put(`images/${imageName}`, buffer, { access: 'private', token: blobToken });
        sourceImagePath = blob.url;
      } else {
        const { default: fs } = await import('fs');
        const { default: path } = await import('path');
        const imagesDir = process.env.VERCEL
          ? path.join('/tmp', 'images')
          : path.join(process.cwd(), 'data', 'images');
        if (!fs.existsSync(imagesDir)) fs.mkdirSync(imagesDir, { recursive: true });
        fs.writeFileSync(path.join(imagesDir, imageName), buffer);
        sourceImagePath = process.env.VERCEL ? null : `/api/files/images/${imageName}`;
      }
    } catch {
      // Image storage is non-critical — story still gets created
    }

    // Extract story from image using Claude
    const extracted = await extractStoryFromImage(buffer, mediaType);

    const [topics, mermaidCode] = await Promise.all([
      extractTopics(extracted.title, extracted.content),
      generateMermaidDiagram(extracted.title, extracted.content),
    ]);

    const storyId = uuidv4();
    let diagramImagePath: string | null = null;
    try {
      diagramImagePath = await renderMermaidToImage(mermaidCode, storyId);
    } catch {
      // non-blocking
    }

    const story = await createStory({
      id: storyId,
      title: extracted.title,
      content: extracted.content,
      bookTitle: overrideBookTitle || extracted.bookTitle,
      author: overrideAuthor || extracted.author,
      topics,
      mermaidCode,
      diagramImagePath,
      sourceImagePath,
      sourceImageRotation: 0,
      relatedStoryIds: [],
      sheetsRowId: null,
    });

    return NextResponse.json(story, { status: 201 });
  } catch (err) {
    console.error('[scan]', err);
    return NextResponse.json({ error: 'Something went wrong — please try again' }, { status: 500 });
  }
}
