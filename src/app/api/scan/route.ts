import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { extractStoryFromImage, generateMermaidDiagram, extractTopics } from '@/lib/claude';
import { createStory } from '@/lib/db';
import { renderMermaidToImage } from '@/lib/mermaid-render';

// Formats Claude's vision API accepts
const CLAUDE_SUPPORTED = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);

// Convert any image to JPEG + resize to max 2000px using sharp
async function normalizeImage(input: Buffer): Promise<{ buffer: Buffer; mediaType: string }> {
  const sharp = (await import('sharp')).default;
  const converted = await sharp(input, { failOn: 'none' })
    .rotate() // auto-rotate based on EXIF orientation
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

    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
    const rawMediaType = file.type || (ext === 'heic' || ext === 'heif' ? 'image/heic' : 'image/jpeg');
    let buffer: Buffer = Buffer.from(await file.arrayBuffer());
    const imageId = uuidv4();

    // Convert to JPEG if not already a Claude-supported format, or resize if large
    let mediaType = rawMediaType;
    if (!CLAUDE_SUPPORTED.has(rawMediaType) || buffer.length > 3 * 1024 * 1024) {
      try {
        const normalized = await normalizeImage(buffer);
        buffer = normalized.buffer;
        mediaType = normalized.mediaType;
      } catch {
        // If sharp fails, proceed with original — Claude will return an error if unsupported
      }
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
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
