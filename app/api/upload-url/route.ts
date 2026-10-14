import { NextRequest, NextResponse } from 'next/server';
import { nanoid } from 'nanoid';
import { presignPut, isR2Configured } from '../../../lib/r2';
import { rateLimit } from '../../../lib/redis';
import { MAX_FILE_BYTES, formatLimit } from '../../../lib/limits';

const getIp = (req: NextRequest): string =>
  req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
  req.headers.get('x-real-ip') ||
  'unknown';

// POST /api/upload-url  { fileName, contentType, fileSize }
// Returns a presigned PUT URL so the browser can upload directly to R2.
export async function POST(request: NextRequest) {
  try {
    if (!isR2Configured()) {
      return NextResponse.json({ error: 'Storage belum dikonfigurasi.' }, { status: 500 });
    }
    // Rate limit: 60 upload grants / minute / IP
    if (!(await rateLimit(`upload:${getIp(request)}`, 60, 60))) {
      return NextResponse.json({ error: 'Terlalu banyak permintaan. Coba lagi sebentar.' }, { status: 429 });
    }

    const { fileName, contentType, fileSize } = await request.json();
    if (Number(fileSize) > MAX_FILE_BYTES) {
      return NextResponse.json({ error: `File melebihi batas ${formatLimit(MAX_FILE_BYTES)}.` }, { status: 413 });
    }

    const safeName = String(fileName || 'blob').replace(/[^a-zA-Z0-9.-]/g, '_').slice(0, 100);
    const key = `uploads/${Date.now()}_${nanoid(8)}_${safeName}`;

    const uploadUrl = await presignPut(key, contentType);
    if (!uploadUrl) return NextResponse.json({ error: 'Gagal membuat URL upload.' }, { status: 500 });

    return NextResponse.json({ uploadUrl, key });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed' }, { status: 500 });
  }
}
