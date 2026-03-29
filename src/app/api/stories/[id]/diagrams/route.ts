import { NextRequest, NextResponse } from 'next/server';
import { getStoryById, getStoryDiagrams, upsertStoryDiagram, clearStoryDiagrams } from '@/lib/db';
import { selectAndGenerateDiagrams } from '@/lib/claude';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const story = await getStoryById(id);
    if (!story) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const cached = await getStoryDiagrams(id);
    if (cached.length > 0) return NextResponse.json(cached);

    const diagrams = await selectAndGenerateDiagrams(story.title, story.content);
    for (const d of diagrams) await upsertStoryDiagram(id, d);

    return NextResponse.json(diagrams);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const story = await getStoryById(id);
    if (!story) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    await clearStoryDiagrams(id);
    const diagrams = await selectAndGenerateDiagrams(story.title, story.content);
    for (const d of diagrams) await upsertStoryDiagram(id, d);

    return NextResponse.json(diagrams);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
