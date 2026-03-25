import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

const BUCKET = 'tempshare';

// Upload file to Supabase Storage with better mobile support
export const uploadFileToSupabase = async (
  file: File,
  onProgress?: (progress: number) => void
): Promise<{ downloadURL: string; storagePath: string }> => {
  const timestamp = Date.now();
  const safeFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
  const storagePath = `uploads/${timestamp}_${safeFileName}`;

  console.log('[Supabase] Starting upload:', storagePath);

  // Use fetch API with progress tracking for better mobile compatibility
  const downloadURL = await new Promise<string>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    
    // Set timeout for mobile networks (60 seconds)
    xhr.timeout = 60000;

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable && onProgress) {
        const progress = (e.loaded / e.total) * 100;
        onProgress(Math.round(progress));
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
        console.error('[Supabase] Upload error:', errorMsg, 'Status:', xhr.status);

        if (xhr.status === 404) {
          reject(new Error(
            'Storage bucket "tempshare" not found. Please create it in Supabase Dashboard → Storage → New Bucket (name: tempshare, Public: ON)'
          ));
        } else if (xhr.status === 403) {
          reject(new Error(
            'Upload blocked by Supabase Storage policy. Please make the bucket public in Supabase Dashboard → Storage → Policies → Add policy for "public" access'
          ));
        } else if (xhr.status === 0) {
          reject(new Error(
            'Cannot connect to server. Please check:\n1. Your internet connection\n2. NEXT_PUBLIC_SUPABASE_URL is correct\n3. CORS is enabled on Supabase'
          ));
        } else {
          reject(new Error(errorMsg));
        }
      }
    });

    xhr.addEventListener('error', (e) => {
      console.error('[Supabase] XHR error:', e);
      reject(new Error(
        'Network error during upload. Please check:\n1. Your internet connection is stable\n2. Try switching between WiFi and mobile data\n3. Make sure NEXT_PUBLIC_SUPABASE_URL is correct'
      ));
    });

    xhr.addEventListener('abort', () => {
      reject(new Error('Upload was cancelled'));
    });

    xhr.addEventListener('timeout', () => {
      reject(new Error(
        'Upload timeout. The file might be too large or connection is too slow. Please try again with a smaller file or better connection.'
      ));
    });

    // Build the upload URL - ensure proper URL format
    const baseUrl = supabaseUrl.replace(/\/$/, ''); // Remove trailing slash
    const uploadUrl = `${baseUrl}/storage/v1/object/${BUCKET}/${storagePath}`;

    console.log('[Supabase] Upload URL:', uploadUrl);

    xhr.open('POST', uploadUrl);
    xhr.setRequestHeader('Authorization', `Bearer ${supabaseAnonKey}`);
    xhr.setRequestHeader('apikey', supabaseAnonKey);
    xhr.setRequestHeader('x-upsert', 'true');
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');

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
