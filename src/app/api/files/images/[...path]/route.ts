import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';

const MIME: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
  gif: 'image/gif', webp: 'image/webp',
};

export async function GET(_req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path: pathParts } = await params;
  const filePath = path.join(process.cwd(), 'data', 'images', ...pathParts);
  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const ext = filePath.split('.').pop()?.toLowerCase() || 'jpg';
  const file = fs.readFileSync(filePath);
  return new NextResponse(file, {
    headers: { 'Content-Type': MIME[ext] || 'image/jpeg', 'Cache-Control': 'public, max-age=3600' },
  });
}
