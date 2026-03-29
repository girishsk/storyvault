import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { extractStoryFromImage, generateMermaidDiagram, extractTopics } from '@/lib/claude';
import { createStory } from '@/lib/db';
import { renderMermaidToImage } from '@/lib/mermaid-render';

const MEDIA_TYPES: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
  gif: 'image/gif', webp: 'image/webp',
};

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
    const mediaType = MEDIA_TYPES[ext] || 'image/jpeg';
    const buffer = Buffer.from(await file.arrayBuffer());
    const imageId = uuidv4();
    const imageName = `${imageId}.${ext}`;

    // Store image — Vercel Blob in production, local filesystem in dev
    let sourceImagePath: string;
    if (process.env.BLOB_READ_WRITE_TOKEN) {
      const { put } = await import('@vercel/blob');
      const blob = await put(`images/${imageName}`, buffer, { access: 'public' });
      sourceImagePath = blob.url;
    } else {
      const { default: fs } = await import('fs');
      const { default: path } = await import('path');
      const imagesDir = path.join(process.cwd(), 'data', 'images');
      if (!fs.existsSync(imagesDir)) fs.mkdirSync(imagesDir, { recursive: true });
      fs.writeFileSync(path.join(imagesDir, imageName), buffer);
      sourceImagePath = `/api/files/images/${imageName}`;
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
      relatedStoryIds: [],
      sheetsRowId: null,
    });

    return NextResponse.json(story, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
