import { NextRequest, NextResponse } from 'next/server';
import { createFileSession, claimFileSession, getFileSession, getSessionTTL, deleteFileSession, rateLimit, type FileSession, type SessionFile, redis } from '../../../lib/redis';
import { withSignedUrls, removeStorageObjects, isValidKey } from '../../../lib/r2';
import { nanoid } from 'nanoid';

const MAX_FILE_BYTES = 50 * 1024 * 1024; // 50 MB/file (matches UI)
const MAX_TOTAL_BYTES = 250 * 1024 * 1024; // 250 MB/session

const getIp = (req: NextRequest): string =>
  req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
  req.headers.get('x-real-ip') ||
  'unknown';

// POST /api/session - Create a new multi-file session
export async function POST(request: NextRequest) {
  try {
    // Rate limit: 30 session writes / minute / IP
    if (!(await rateLimit(`session:${getIp(request)}`, 30, 60))) {
      return NextResponse.json({ error: 'Terlalu banyak permintaan. Coba lagi sebentar.' }, { status: 429 });
    }

    const body = await request.json();
    const { files, textContent, id: existingId, ghost, pin, e2ee } = body;

    // Validate
    if ((!files || !Array.isArray(files) || files.length === 0) && !textContent) {
      if (!existingId || textContent !== 'WAITING_FOR_UPLOAD') {
         return NextResponse.json({ error: 'Mohon unggah file atau masukkan teks' }, { status: 400 });
      }
    }

    // Validate uploaded file descriptors: size limits + URL must be our own storage.
    if (Array.isArray(files) && files.length > 0) {
      let running = 0;
      for (const f of files) {
        const size = Number(f?.fileSize) || 0;
        if (size > MAX_FILE_BYTES) {
          return NextResponse.json({ error: 'File melebihi batas 50 MB.' }, { status: 413 });
        }
        running += size;
        if (!isValidKey(f?.storageRef)) {
          return NextResponse.json({ error: 'Referensi file tidak valid.' }, { status: 400 });
        }
      }
      if (running > MAX_TOTAL_BYTES) {
        return NextResponse.json({ error: 'Total ukuran melebihi batas.' }, { status: 413 });
      }
    }

    // Build session
    const sessionFiles: SessionFile[] = (files || []).map((f: any) => ({
      fileName: f.fileName,
      fileSize: f.fileSize,
      fileType: f.fileType || 'application/octet-stream',
      firebaseUrl: f.firebaseUrl,
      storageRef: f.storageRef,
    }));

    const totalFileSize = sessionFiles.reduce((sum, f) => sum + f.fileSize, 0);
    const textSize = textContent ? new Blob([textContent]).size : 0;

    const sessionData: FileSession = {
      files: sessionFiles.length > 0 ? sessionFiles : undefined,
      textContent: textContent || undefined,
      createdAt: Date.now(),
      totalSize: totalFileSize + textSize,
      fileCount: sessionFiles.length,
      ghost: ghost || false,
      pin: pin || undefined,
      e2ee: e2ee || false,
      isDownloaded: false,
    };

    let uniqueId = existingId || nanoid(10);

    if (existingId) {
      const existingSession = await getFileSession(existingId);
      if (existingSession) {
        // RECEIVE (WAITING_FOR_UPLOAD) on an id already in use.
        if (textContent === 'WAITING_FOR_UPLOAD') {
          return NextResponse.json({ error: 'ID ini sedang aktif digunakan oleh pengguna lain.' }, { status: 409 });
        }
        // SEND onto an id that already holds real data (not a WAITING placeholder).
        if ((files?.length || textContent) && existingSession.textContent !== 'WAITING_FOR_UPLOAD') {
           return NextResponse.json({ error: 'ID ini sudah berisi data / terkunci oleh pengirim lain.' }, { status: 409 });
        }
        // Legit: overwrite the WAITING placeholder with the real upload.
        await createFileSession(uniqueId, sessionData, 1800);
      } else {
        // Fresh custom id: claim atomically to avoid TOCTOU races.
        if (!(await claimFileSession(uniqueId, sessionData, 1800))) {
          return NextResponse.json({ error: 'ID ini sedang aktif digunakan oleh pengguna lain.' }, { status: 409 });
        }
      }
    } else {
      // Auto id: claim atomically, retry on the (astronomically rare) collision.
      let claimed = false;
      for (let attempt = 0; attempt < 3 && !claimed; attempt++) {
        if (attempt > 0) uniqueId = nanoid(10);
        claimed = await claimFileSession(uniqueId, sessionData, 1800);
      }
      if (!claimed) {
        return NextResponse.json({ error: 'Gagal membuat sesi, coba lagi.' }, { status: 500 });
      }
    }

    return NextResponse.json({
      success: true,
      uniqueId,
      fileCount: sessionFiles.length,
      hasText: !!textContent,
    });
  } catch (error: any) {
    console.error('Error creating session:', error);
    return NextResponse.json({ error: error.message || 'Failed' }, { status: 500 });
  }
}

// GET /api/session?id=uniqueId - Get file session data
// SECURITY: never returns `pin`. When a session is PIN-locked, file URLs and
// text are withheld until verified via POST /api/session/verify.
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const id = searchParams.get('id');

    if (!id) return NextResponse.json({ error: 'Missing session ID' }, { status: 400 });

    const sessionData = await getFileSession(id);
    if (!sessionData) return NextResponse.json({ error: 'Session not found/expired' }, { status: 404 });

    const ttl = await getSessionTTL(id);
    const locked = !!sessionData.pin;

    // Strip secrets/payload from the public view.
    const { pin, files, textContent, ...meta } = sessionData;
    const publicData = locked
      ? { ...meta, locked: true, hasText: !!textContent }
      : { ...meta, locked: false, files: await withSignedUrls(files), textContent };

    return NextResponse.json({
      success: true,
      data: publicData,
      ttl,
    });
  } catch (error: any) {
    console.error('Error getting session:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

// PATCH /api/session?id=id - Update download status (for notifications)
export async function PATCH(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Missing ID' }, { status: 400 });

    const sessionData = await getFileSession(id);
    if (!sessionData) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // Mark as downloaded
    sessionData.isDownloaded = true;
    await redis.set(`file:${id}`, sessionData, { keepTtl: true });

    // Handle Ghost Mode: Delete session instantly after first access
    if (sessionData.ghost) {
      await removeStorageObjects(sessionData.files); // purge blobs too
      await deleteFileSession(id);
      return NextResponse.json({ success: true, message: 'GHOST_MODE_ACTIVATED: Session purged.' });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

// DELETE ...
export async function DELETE(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Missing ID' }, { status: 400 });
    const sessionData = await getFileSession(id);
    if (sessionData) await removeStorageObjects(sessionData.files);
    await deleteFileSession(id);
    return NextResponse.json({ success: true });
}
