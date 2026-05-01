import { NextRequest, NextResponse } from 'next/server';
import { createFileSession, getFileSession, getSessionTTL, deleteFileSession, type FileSession, type SessionFile, redis } from '../../../lib/redis';
import { nanoid } from 'nanoid';

// POST /api/session - Create a new multi-file session
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { files, textContent, id: existingId, ghost, pin, broadcast, e2ee } = body;

    // Validate
    if ((!files || !Array.isArray(files) || files.length === 0) && !textContent) {
      if (!existingId || textContent !== 'WAITING_FOR_UPLOAD') {
         return NextResponse.json({ error: 'Mohon unggah file atau masukkan teks' }, { status: 400 });
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
      broadcast: broadcast || false,
      e2ee: e2ee || false,
      isDownloaded: false,
    };

    const uniqueId = existingId || nanoid(10);
    
    // Safety Collision Check
    if (existingId) {
      const existingSession = await getFileSession(existingId);
      if (existingSession) {
        // If someone tries to RECEIVE (WAITING_FOR_UPLOAD) on an ID that's already in use
        if (textContent === 'WAITING_FOR_UPLOAD') {
          return NextResponse.json({ error: 'ID ini sedang aktif digunakan oleh pengguna lain.' }, { status: 409 });
        }
        
        // If someone tries to SEND data but the session already has active files/text
        // We only allow overwrite if the existing session is purely 'WAITING_FOR_UPLOAD'
        if ((files?.length || textContent) && existingSession.textContent !== 'WAITING_FOR_UPLOAD') {
           return NextResponse.json({ error: 'ID ini sudah berisi data / terkunci oleh pengirim lain.' }, { status: 409 });
        }
      }
    }

    await createFileSession(uniqueId, sessionData, 1800);

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
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const id = searchParams.get('id');

    if (!id) return NextResponse.json({ error: 'Missing session ID' }, { status: 400 });

    const sessionData = await getFileSession(id);
    if (!sessionData) return NextResponse.json({ error: 'Session not found/expired' }, { status: 404 });

    const ttl = await getSessionTTL(id);

    return NextResponse.json({
      success: true,
      data: sessionData, // Keep it for now, PIN check happens on client
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
    await deleteFileSession(id);
    return NextResponse.json({ success: true });
}
