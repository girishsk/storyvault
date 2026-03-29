import { NextResponse } from 'next/server';
import { getAllStories, getAllLinks } from '@/lib/db';
import { StoryGraph } from '@/types/story';

export async function GET() {
  try {
    const [stories, links] = await Promise.all([getAllStories(), getAllLinks()]);

    const graph: StoryGraph = {
      nodes: stories.map(s => ({
        id: s.id,
        title: s.title,
        bookTitle: s.bookTitle,
        topics: s.topics,
      })),
      edges: links.map(l => ({
        from: l.fromId,
        to: l.toId,
        topics: l.sharedTopics,
        score: l.similarityScore,
      })),
    };

    return NextResponse.json(graph);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
