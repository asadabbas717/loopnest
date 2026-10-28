import { launchImageLibraryAsync } from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { File, Paths } from 'expo-file-system';
import { backend } from './client';
import { createPhotoUploadApi } from './photo-upload-api';

export type Photo = { uri: string; size: number };
export async function choosePhoto(): Promise<Photo | null> {
  const result = await launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: false,
    exif: false,
    quality: 1,
  });
  const asset = result.assets?.[0];
  if (result.canceled || !asset) return null;
  if (
    !asset.width ||
    !asset.height ||
    asset.width * asset.height > 40000000 ||
    (asset.fileSize ?? 0) > 20 * 1024 * 1024
  )
    throw new Error('Choose an image smaller than 20 MB and 40 megapixels.');
  const context = ImageManipulator.manipulate(asset.uri);
  let rendered: Awaited<ReturnType<typeof context.renderAsync>> | undefined;
  try {
    context.resize(
      asset.width >= asset.height
        ? { width: Math.min(asset.width, 1280) }
        : { height: Math.min(asset.height, 1280) },
    );
    rendered = await context.renderAsync();
    const output = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.7 });
    const file = new File(output.uri);
    if (file.size <= 0 || file.size > 1048576) {
      file.delete();
      throw new Error('This image is too large after compression. Choose a smaller photo.');
    }
    return { uri: output.uri, size: file.size };
  } finally {
    rendered?.release();
    context.release();
    // Only discard the picker's app-cache copy, never the user's library source.
    if (asset.uri.startsWith(Paths.cache.uri)) discardPhoto({ uri: asset.uri, size: 0 });
  }
}
export function discardPhoto(photo: Photo | null) {
  if (photo) {
    try {
      const file = new File(photo.uri);
      if (file.exists) file.delete();
    } catch {
      // Native cleanup can fail; hide content anyway and never log its location.
    }
  }
}
export async function uploadPhoto(
  conversationId: string,
  photo: Photo,
  expectedActor: string,
  oneTime = false,
) {
  const bytes = await new File(photo.uri).arrayBuffer();
  if (bytes.byteLength <= 0 || bytes.byteLength > 1048576)
    throw new Error('Photo size is invalid.');
  return createPhotoUploadApi(backend).upload(conversationId, bytes, expectedActor, oneTime);
}
export async function photoPath(id: string): Promise<string | null> {
  const { data, error } = await backend()
    .from('photo_assets')
    .select('path')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data?.path ?? null;
}
