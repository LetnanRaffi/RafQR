import { initializeApp, getApps, getApp } from 'firebase/app';
import { getStorage, ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Initialize Firebase
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
const storage = getStorage(app);

// Upload file to Firebase Storage
export const uploadFileToFirebase = async (
  file: File,
  onProgress?: (progress: number) => void
): Promise<{ downloadURL: string; storageRef: string }> => {
  return new Promise((resolve, reject) => {
    const timestamp = Date.now();
    const safeFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const storagePath = `uploads/${timestamp}_${safeFileName}`;
    const storageRefInstance = ref(storage, storagePath);

    console.log('[Firebase] Starting upload:', storagePath);
    console.log('[Firebase] Storage bucket:', firebaseConfig.storageBucket);

    const uploadTask = uploadBytesResumable(storageRefInstance, file);

    uploadTask.on(
      'state_changed',
      (snapshot) => {
        const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
        console.log(`[Firebase] Progress: ${progress.toFixed(1)}%`);
        if (onProgress) {
          onProgress(progress);
        }
      },
      (error) => {
        console.error('[Firebase] Upload error:', error.code, error.message);
        
        // Give user-friendly error messages
        let message = error.message;
        if (error.code === 'storage/unauthorized') {
          message = 'Upload blocked by Firebase Storage rules. Please update your Firebase Storage rules to allow uploads. Go to Firebase Console → Storage → Rules and set: allow read, write: if true;';
        } else if (error.code === 'storage/canceled') {
          message = 'Upload was cancelled.';
        } else if (error.code === 'storage/unknown') {
          message = 'Unknown error occurred. Check browser console for details.';
        }
        
        reject(new Error(message));
      },
      async () => {
        try {
          console.log('[Firebase] Upload complete, getting download URL...');
          const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
          console.log('[Firebase] Download URL obtained');
          resolve({
            downloadURL,
            storageRef: storagePath,
          });
        } catch (error) {
          console.error('[Firebase] Error getting download URL:', error);
          reject(error);
        }
      }
    );
  });
};

// Delete file from Firebase Storage
export const deleteFileFromFirebase = async (storagePath: string): Promise<void> => {
  try {
    const fileRef = ref(storage, storagePath);
    await deleteObject(fileRef);
  } catch (error) {
    console.error('Error deleting file:', error);
    throw error;
  }
};

export { storage };
