import { NextResponse } from 'next/server';
import { getRandomStory } from '@/lib/db';

export async function GET() {
  try {
    const story = await getRandomStory();
    if (!story) {
      return NextResponse.json({ error: 'No stories found' }, { status: 404 });
    }
    return NextResponse.json(story);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
