import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { getAllStories, createStory } from '@/lib/db';
import { generateMermaidDiagram, extractTopics } from '@/lib/claude';
import { renderMermaidToImage } from '@/lib/mermaid-render';
import { appendStoryToSheets, getSpreadsheetId } from '@/lib/sheets';

export async function GET(req: NextRequest) {
  try {
    const topic = req.nextUrl.searchParams.get('topic');
    let stories = await getAllStories();
    if (topic) {
      const lower = topic.toLowerCase();
      stories = stories.filter(s => s.topics.some(t => t.toLowerCase() === lower));
    }
    return NextResponse.json(stories);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { title, content, bookTitle = '', author = '' } = body;

    if (!title || !content) {
      return NextResponse.json({ error: 'title and content are required' }, { status: 400 });
    }

    const id = uuidv4();

    const [topics, mermaidCode] = await Promise.all([
      extractTopics(title, content),
      generateMermaidDiagram(title, content),
    ]);

    let diagramImagePath: string | null = null;
    try {
      diagramImagePath = await renderMermaidToImage(mermaidCode, id);
    } catch {
      // non-blocking
    }

    const story = await createStory({
      id,
      title,
      content,
      bookTitle,
      author,
      topics,
      mermaidCode,
      diagramImagePath,
      sourceImagePath: null,
      sourceImageRotation: 0,
      relatedStoryIds: [],
      sheetsRowId: null,
    });

    const sheetId = await getSpreadsheetId();
    if (sheetId) appendStoryToSheets(story, sheetId).catch(() => {});

    return NextResponse.json(story, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
