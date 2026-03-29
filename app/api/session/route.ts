import { NextRequest, NextResponse } from 'next/server';
import { createFileSession, getFileSession, getSessionTTL, deleteFileSession, type FileSession, type SessionFile } from '../../../lib/redis';
import { nanoid } from 'nanoid';

// POST /api/session - Create a new multi-file session
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { files, textContent } = body;

    // Validate
    if ((!files || !Array.isArray(files) || files.length === 0) && !textContent) {
      return NextResponse.json(
        { error: 'Mohon unggah file atau masukkan teks' },
        { status: 400 }
      );
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
    };

    // Generate unique ID
    const uniqueId = nanoid(10);

    // Save to Redis with 30 min TTL
    await createFileSession(uniqueId, sessionData, 1800);

    return NextResponse.json({
      success: true,
      uniqueId,
      fileCount: sessionFiles.length,
      hasText: !!textContent,
    });
  } catch (error: any) {
    console.error('Error creating session:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create session' },
      { status: 500 }
    );
  }
}

// GET /api/session?id=uniqueId - Get file session data
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { error: 'Missing session ID' },
        { status: 400 }
      );
    }

    const sessionData = await getFileSession(id);

    if (!sessionData) {
      return NextResponse.json(
        { error: 'Session not found or expired' },
        { status: 404 }
      );
    }

    // Also get remaining TTL
    const ttl = await getSessionTTL(id);

    return NextResponse.json({
      success: true,
      data: sessionData,
      ttl,
    });
  } catch (error: any) {
    console.error('Error getting session:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to get session' },
      { status: 500 }
    );
  }
}

// DELETE /api/session?id=uniqueId - Delete a file session
export async function DELETE(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { error: 'Missing session ID' },
        { status: 400 }
      );
    }

    await deleteFileSession(id);

    return NextResponse.json({
      success: true,
      message: 'Session deleted successfully',
    });
  } catch (error: any) {
    console.error('Error deleting session:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to delete session' },
      { status: 500 }
    );
  }
}
