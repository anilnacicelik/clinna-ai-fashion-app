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
    // Storage RLS ("Users upload own images") requires the first path
    // segment to equal auth.uid() — see fix_rls_permissions.sql.
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

    // 2. Public URL al
    const { data: urlData } = supabase.storage
      .from('scans_images')
      .getPublicUrl(filePath);

    const publicUrl = urlData?.publicUrl ?? null;

    if (!publicUrl) return null;

    // 3. Update the image_url for this row in the scans table
    const { error: updateError } = await supabase
      .from('scans')
      .update({ image_url: publicUrl })
      .eq('id', scanId);

    if (updateError) {
      console.error('[storageUpload] DB update error:', updateError.message);
    }

    return publicUrl;

  } catch (err) {
    console.error('[storageUpload] Unexpected error:', err);
    return null;
  }
}