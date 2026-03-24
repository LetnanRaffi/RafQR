import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

const BUCKET = 'tempshare';

// Upload file to Supabase Storage
export const uploadFileToSupabase = async (
  file: File,
  onProgress?: (progress: number) => void
): Promise<{ downloadURL: string; storagePath: string }> => {
  const timestamp = Date.now();
  const safeFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
  const storagePath = `uploads/${timestamp}_${safeFileName}`;

  console.log('[Supabase] Starting upload:', storagePath);

  // Supabase JS v2 doesn't have built-in progress tracking for uploads,
  // so we simulate progress with XHR for better UX
  const downloadURL = await new Promise<string>((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable && onProgress) {
        const progress = (e.loaded / e.total) * 100;
        onProgress(progress);
      }
    });

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        // Get public URL
        const { data } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);
        console.log('[Supabase] Upload complete, public URL:', data.publicUrl);
        resolve(data.publicUrl);
      } else {
        let errorMsg = `Upload failed with status ${xhr.status}`;
        try {
          const resp = JSON.parse(xhr.responseText);
          errorMsg = resp.message || resp.error || errorMsg;
        } catch {}
        console.error('[Supabase] Upload error:', errorMsg);

        if (xhr.status === 404) {
          reject(new Error(
            'Storage bucket "tempshare" not found. Please create it in Supabase Dashboard → Storage → New Bucket (name: tempshare, Public: ON)'
          ));
        } else if (xhr.status === 403) {
          reject(new Error(
            'Upload blocked by Supabase Storage policy. Please make the bucket public in Supabase Dashboard.'
          ));
        } else {
          reject(new Error(errorMsg));
        }
      }
    });

    xhr.addEventListener('error', () => {
      reject(new Error('Network error during upload. Check your connection.'));
    });

    // Build the upload URL
    const uploadUrl = `${supabaseUrl}/storage/v1/object/${BUCKET}/${storagePath}`;

    xhr.open('POST', uploadUrl);
    xhr.setRequestHeader('Authorization', `Bearer ${supabaseAnonKey}`);
    xhr.setRequestHeader('apikey', supabaseAnonKey);
    xhr.setRequestHeader('x-upsert', 'true');

    // Send the file as binary
    xhr.send(file);
  });

  return { downloadURL, storagePath };
};

// Delete file from Supabase Storage
export const deleteFileFromSupabase = async (storagePath: string): Promise<void> => {
  const { error } = await supabase.storage.from(BUCKET).remove([storagePath]);
  if (error) {
    console.error('Error deleting file:', error);
    throw error;
  }
};
