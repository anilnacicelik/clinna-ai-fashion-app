import { supabase } from './supabase';

export async function uploadScanImage(
  localUri: string,
  scanId:   string,
): Promise<string | null> {
  try {
    const ext      = localUri.split('.').pop()?.toLowerCase() ?? 'jpg';
    const mimeType = ext === 'png' ? 'image/png' : 'image/jpeg';
    const filePath = `scans/${scanId}/photo.${ext}`;

    // "fetch().blob()" is chronically broken in React Native.
    // Using FormData is the most reliable approach:
    const formData = new FormData();
    formData.append('file', {
      uri: localUri,
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