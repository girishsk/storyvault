import { NextRequest, NextResponse } from 'next/server';

function getBlobToken(): string | undefined {
  // Vercel prefixes storage env vars with the store name
  return process.env.BLOB_READ_WRITE_TOKEN || process.env.storyvault_BLOB_READ_WRITE_TOKEN;
}

// Proxies private Vercel Blob images through the server so the browser
// doesn't need direct blob credentials.
export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url');
  if (!url) return NextResponse.json({ error: 'Missing url' }, { status: 400 });

  const token = getBlobToken();
  if (!token) return NextResponse.json({ error: 'Blob not configured' }, { status: 503 });

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) return NextResponse.json({ error: 'Blob not found' }, { status: res.status });

  return new NextResponse(res.body, {
    headers: {
      'Content-Type': res.headers.get('Content-Type') || 'image/jpeg',
      'Cache-Control': 'private, max-age=3600',
    },
  });
}
