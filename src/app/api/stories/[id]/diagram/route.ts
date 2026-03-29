import { NextRequest, NextResponse } from 'next/server';
import { getStoryById, updateStory } from '@/lib/db';
import { generateMermaidDiagram } from '@/lib/claude';
import { renderMermaidToImage } from '@/lib/mermaid-render';

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const story = await getStoryById(id);
    if (!story) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const mermaidCode = await generateMermaidDiagram(story.title, story.content);
    let diagramImagePath: string | null = null;
    try {
      diagramImagePath = await renderMermaidToImage(mermaidCode, id);
    } catch {
      // non-blocking
    }

    const updated = await updateStory(id, { mermaidCode, diagramImagePath });
    return NextResponse.json({ mermaidCode, diagramImagePath, story: updated });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
