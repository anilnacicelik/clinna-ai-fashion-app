import * as ImageManipulator from 'expo-image-manipulator';

const MAX_DIMENSION = 1280;
const JPEG_QUALITY  = 0.75;

export async function compressForUpload(uri: string): Promise<string> {
  if (!uri) {
    console.error('[CLINNA] compressForUpload: uri is empty');
    throw new Error('Image URI is empty');
  }
  try {
    const result = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: MAX_DIMENSION } }],
      { compress: JPEG_QUALITY, format: ImageManipulator.SaveFormat.JPEG },
    );
    if (!result?.uri) throw new Error('Manipulator returned empty URI');
    return result.uri;
  } catch (err) {
    console.error('[CLINNA] compressForUpload failed, using original URI:', err);
    return uri;
  }
}
