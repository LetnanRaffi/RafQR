import { NextRequest, NextResponse } from 'next/server';
import { rateLimit, redis } from '../../../lib/redis';

const events = new Set(['session_created', 'connected', 'verified', 'connect_failed', 'fallback_chosen']);

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin');
  if (origin && origin !== request.nextUrl.origin) return new NextResponse(null, { status: 403 });
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (!(await rateLimit(`p2p-metric:${ip}`, 120, 60))) return new NextResponse(null, { status: 429 });
  const body = await request.json().catch(() => null) as { event?: unknown } | null;
  if (!body || typeof body.event !== 'string' || !events.has(body.event)) {
    return NextResponse.json({ error: 'Metrik tidak valid.' }, { status: 400 });
  }
  const day = new Date().toISOString().slice(0, 10);
  const key = `p2p:metric:${day}:${body.event}`;
  try {
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, 30 * 24 * 60 * 60);
  } catch {
    // Metrics should never interrupt a transfer.
  }
  return new NextResponse(null, { status: 204 });
}
