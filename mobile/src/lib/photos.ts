import { launchImageLibraryAsync } from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { File } from 'expo-file-system';
import { backend } from './client';

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
  context.resize(
    asset.width >= asset.height
      ? { width: Math.min(asset.width, 1280) }
      : { height: Math.min(asset.height, 1280) },
  );
  const rendered = await context.renderAsync();
  const output = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.7 });
  rendered.release();
  context.release();
  const file = new File(output.uri);
  if (file.size <= 0 || file.size > 1048576) {
    file.delete();
    throw new Error('This image is too large after compression. Choose a smaller photo.');
  }
  return { uri: output.uri, size: file.size };
}
export function discardPhoto(photo: Photo | null) {
  if (photo) {
    const file = new File(photo.uri);
    if (file.exists) file.delete();
  }
}
export async function uploadPhoto(conversationId: string, photo: Photo) {
  const { data, error } = await backend().rpc('reserve_photo', { cid: conversationId }).single();
  if (error) throw error;
  const asset = data as { id: string; path: string };
  const bytes = await new File(photo.uri).arrayBuffer();
  if (bytes.byteLength <= 0 || bytes.byteLength > 1048576)
    throw new Error('Photo size is invalid.');
  const { error: uploadError } = await backend()
    .storage.from('chat-photos')
    .upload(asset.path, bytes, { contentType: 'image/jpeg', upsert: false, cacheControl: '0' });
  if (uploadError) throw uploadError;
  return asset.id;
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
