import { supabase } from './supabase';
import { compressForUpload } from './imageCompress';

/**
 * Shrink the archive photo before it goes to Storage. Only the uploaded copy
 * is compressed — the caller's local URI (what result screens show) is left
 * alone. Any failure falls back to the original so the scan still gets a photo.
 */
async function archiveCopyOf(localUri: string): Promise<string> {
  try {
    return await compressForUpload(localUri);
  } catch (err) {
    console.warn('[storageUpload] Compression failed, uploading original:', err);
    return localUri;
  }
}

export async function uploadScanImage(
  localUri: string,
  scanId:   string,
  userId:   string,
): Promise<string | null> {
  try {
    const uploadUri = await archiveCopyOf(localUri);
    // Derived from the file actually uploaded: .jpg after compression, the
    // original extension if compression fell back.
    const ext      = uploadUri.split('.').pop()?.toLowerCase() ?? 'jpg';
    const mimeType = ext === 'png' ? 'image/png' : 'image/jpeg';
    // Storage RLS ("scans_images_insert_own") requires the first path
    // segment to equal auth.uid() — see supabase/fix_storage_private.sql.
    const filePath = `${userId}/${scanId}/photo.${ext}`;

    // "fetch().blob()" is chronically broken in React Native.
    // Using FormData is the most reliable approach:
    const formData = new FormData();
    formData.append('file', {
      uri: uploadUri,
      name: `photo.${ext}`,
      type: mimeType,
    } as any);

    // 1. Upload to Storage (as FormData)
    const { error: uploadError } = await supabase.storage
      .from('scans_images')
      .upload(filePath, formData);

    if (uploadError) {
      console.error('[storageUpload] Upload error:', uploadError.message);
      return null;
    }

    // 2. Store the storage path, not a URL. The bucket is private — the
    //    archive signs this path on display (see scanImages.ts), which also
    //    still understands the full public URLs older rows carry.
    const { error: updateError } = await supabase
      .from('scans')
      .update({ image_url: filePath })
      .eq('id', scanId);

    if (updateError) {
      console.error('[storageUpload] DB update error:', updateError.message);
    }

    return filePath;

  } catch (err) {
    console.error('[storageUpload] Unexpected error:', err);
    return null;
  }
}