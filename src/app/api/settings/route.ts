import { NextRequest, NextResponse } from 'next/server';
import { getAllSettings, setSetting } from '@/lib/db';

const ALLOWED_KEYS = ['ANTHROPIC_API_KEY', 'SPREADSHEET_ID', 'GOOGLE_CREDENTIALS_JSON'];

export async function GET() {
  try {
    const stored = await getAllSettings();
    const status: Record<string, boolean> = {};
    for (const key of ALLOWED_KEYS) {
      status[key] = !!(process.env[key] || stored[key]);
    }
    return NextResponse.json({
      status,
      SPREADSHEET_ID: process.env.SPREADSHEET_ID || stored.SPREADSHEET_ID || '',
      hasAnthropicKey: !!(process.env.ANTHROPIC_API_KEY || stored.ANTHROPIC_API_KEY),
      hasGoogleCreds: !!(process.env.GOOGLE_CREDENTIALS_JSON || stored.GOOGLE_CREDENTIALS_JSON),
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    for (const key of ALLOWED_KEYS) {
      if (key in body && body[key] !== undefined) {
        const val = String(body[key]).trim();
        if (val) await setSetting(key, val);
      }
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
