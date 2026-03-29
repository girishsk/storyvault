import { NextRequest, NextResponse } from 'next/server';
import { getAllStories, upsertStoryFromSheets } from '@/lib/db';
import { pushStoriesToSheets, pullStoriesFromSheets, getSpreadsheetId } from '@/lib/sheets';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { direction = 'bidirectional' } = body;

    const spreadsheetId = await getSpreadsheetId() || body.spreadsheetId;
    if (!spreadsheetId) {
      return NextResponse.json(
        { error: 'No Spreadsheet ID configured. Add it in Settings.' },
        { status: 400 }
      );
    }

    if (direction === 'push') {
      const stories = await getAllStories();
      await pushStoriesToSheets(stories, spreadsheetId);
      return NextResponse.json({ success: true, count: stories.length, direction: 'push' });
    }

    if (direction === 'pull') {
      const stories = await pullStoriesFromSheets(spreadsheetId);
      for (const story of stories) await upsertStoryFromSheets(story);
      return NextResponse.json({ success: true, count: stories.length, direction: 'pull' });
    }

    if (direction === 'bidirectional') {
      const remoteStories = await pullStoriesFromSheets(spreadsheetId);
      for (const story of remoteStories) await upsertStoryFromSheets(story);
      const allStories = await getAllStories();
      await pushStoriesToSheets(allStories, spreadsheetId);
      return NextResponse.json({ success: true, count: allStories.length, direction: 'bidirectional' });
    }

    return NextResponse.json({ error: 'Invalid direction' }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
