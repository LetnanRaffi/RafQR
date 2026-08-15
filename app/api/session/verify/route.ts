import { NextRequest, NextResponse } from 'next/server';
import { getFileSession, rateLimit } from '../../../../lib/redis';
import { withSignedUrls } from '../../../../lib/r2';

const getIp = (req: NextRequest): string =>
  req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
  req.headers.get('x-real-ip') ||
  'unknown';

// POST /api/session/verify  { id, pin }
// Server-side PIN gate: only returns file URLs / text when the PIN matches.
export async function POST(request: NextRequest) {
  try {
    const { id, pin } = await request.json();
    if (!id) return NextResponse.json({ error: 'Missing session ID' }, { status: 400 });

    // Throttle PIN attempts to blunt brute force (4-digit space).
    if (!(await rateLimit(`verify:${id}:${getIp(request)}`, 10, 60))) {
      return NextResponse.json({ error: 'Terlalu banyak percobaan. Coba lagi sebentar.' }, { status: 429 });
    }

    const sessionData = await getFileSession(id);
    if (!sessionData) return NextResponse.json({ error: 'Session not found/expired' }, { status: 404 });

    if (sessionData.pin && sessionData.pin !== pin) {
      return NextResponse.json({ error: 'PIN salah.' }, { status: 401 });
    }

    // Return the payload without leaking the PIN itself; sign file URLs.
    const { pin: _pin, files, ...rest } = sessionData;
    return NextResponse.json({ success: true, data: { ...rest, files: await withSignedUrls(files) } });
  } catch (error: any) {
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
