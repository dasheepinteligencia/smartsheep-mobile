import * as FileSystem from 'expo-file-system/legacy';
import { api } from './api';

const DEBUG_MOBILE_AWS_UPLOAD = true;

const logUpload = (step: string, data?: any) => {
  if (!DEBUG_MOBILE_AWS_UPLOAD) return;
  console.log(`[MOBILE AWS UPLOAD][${step}]`, data || {});
};

const VISIT_PHOTOS_DIR = `${FileSystem.documentDirectory || ''}visit-photos/`;

export const isLocalFileUri = (value?: any) => {
  const uri = String(value || '').trim();

  return uri.startsWith('file://') || uri.startsWith('content://');
};

const sanitizeFileName = (value: string) => {
  const clean = String(value || 'foto')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);

  return clean || 'foto';
};

const getExtensionFromUri = (uri: string) => {
  const cleanUri = String(uri || '').split('?')[0].split('#')[0];
  const match = cleanUri.match(/\.([a-zA-Z0-9]+)$/);
  const ext = String(match?.[1] || 'jpg').toLowerCase();

  if (ext === 'jpeg') return 'jpg';
  if (['jpg', 'png', 'webp', 'heic', 'heif'].includes(ext)) return ext;

  return 'jpg';
};

const getMimeTypeFromExtension = (extension: string) => {
  switch (String(extension || '').toLowerCase()) {
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
    case 'heic':
      return 'image/heic';
    case 'heif':
      return 'image/heif';
    case 'jpg':
    case 'jpeg':
    default:
      return 'image/jpeg';
  }
};

export const ensureVisitPhotosDirectory = async () => {
  if (!FileSystem.documentDirectory) return;

  const info = await FileSystem.getInfoAsync(VISIT_PHOTOS_DIR);

  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(VISIT_PHOTOS_DIR, { intermediates: true });
  }
};

export const persistVisitPhotoLocally = async (
  sourceUri: string,
  visitId: string,
  action: 'CHECKIN' | 'CHECKOUT' | 'JUSTIFICAR'
) => {
  if (!sourceUri || !isLocalFileUri(sourceUri)) return sourceUri;
  if (!FileSystem.documentDirectory) return sourceUri;

  await ensureVisitPhotosDirectory();

  const extension = getExtensionFromUri(sourceUri);
  const fileName = sanitizeFileName(
    `${String(action || 'FOTO').toLowerCase()}_${String(visitId || 'visita')}_${Date.now()}.${extension}`
  );

  const destinationUri = `${VISIT_PHOTOS_DIR}${fileName}`;

  try {
    await FileSystem.copyAsync({
      from: sourceUri,
      to: destinationUri,
    });

    logUpload('photo-persisted-locally', {
      sourceUri,
      destinationUri,
      action,
      visitId,
    });

    return destinationUri;
  } catch (error) {
    logUpload('photo-persist-local-failed-using-original', {
      sourceUri,
      action,
      visitId,
      error: String((error as any)?.message || error),
    });

    return sourceUri;
  }
};

export type UploadVisitPhotoParams = {
  localUri: string;
  projectId?: string | null;
  visitId?: string | null;
  lojaId?: string | null;
  action?: 'CHECKIN' | 'CHECKOUT' | 'JUSTIFICAR' | string;
};

export const uploadLocalVisitPhotoToAws = async ({
  localUri,
  projectId,
  visitId,
  lojaId,
  action = 'VISITA',
}: UploadVisitPhotoParams): Promise<string> => {
  if (!isLocalFileUri(localUri)) return String(localUri || '');

  logUpload('start', {
    localUri,
    projectId,
    visitId,
    lojaId,
    action,
  });

  const info = await FileSystem.getInfoAsync(localUri);

  logUpload('local-file-info', info);

  if (!info.exists) {
    throw new Error(`Arquivo local da foto não encontrado para sincronização: ${localUri}`);
  }

  const extension = getExtensionFromUri(localUri);
  const fileType = getMimeTypeFromExtension(extension);
  const safeAction = sanitizeFileName(String(action || 'VISITA').toLowerCase());
  const safeVisitId = sanitizeFileName(String(visitId || 'visita'));
  const fileName = `${safeAction}_${safeVisitId}_${Date.now()}.${extension}`;

  const folder = [
    'mobile',
    'visitas',
    projectId ? sanitizeFileName(String(projectId)) : 'sem-projeto',
    lojaId ? sanitizeFileName(String(lojaId)) : 'sem-loja',
  ].join('/');

  logUpload('request-presigned-url', {
    folder,
    fileName,
    fileType,
  });

  const presignedResponse = await api('/upload/aws-presigned-url', {
    method: 'POST',
    body: JSON.stringify({
      folder,
      fileName,
      originalFileName: fileName,
      displayName: fileName,
      fileType,
      uploadKind: 'visita-foto',
      preserveFileName: false,
    }),
  });

  if (!presignedResponse.ok) {
    const errorText = await presignedResponse.text().catch(() => '');
    throw new Error(`Falha ao gerar URL de upload da foto. HTTP ${presignedResponse.status} ${errorText}`.trim());
  }

  const data = await presignedResponse.json();
  const uploadUrl = data?.uploadUrl;
  const fileUrl = data?.fileUrl;

  logUpload('presigned-response', {
    ok: presignedResponse.ok,
    fileUrl,
    uploadUrlPreview: uploadUrl ? `${String(uploadUrl).slice(0, 120)}...` : null,
  });

  if (!uploadUrl || !fileUrl) {
    throw new Error('Resposta inválida ao gerar URL de upload da foto.');
  }

  const uploadResult = await FileSystem.uploadAsync(uploadUrl, localUri, {
    httpMethod: 'PUT',
    uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    headers: {
      'Content-Type': fileType,
    },
  });

  logUpload('s3-put-result', {
    status: uploadResult.status,
    bodyPreview: String(uploadResult.body || '').slice(0, 250),
    fileUrl,
  });

  if (uploadResult.status < 200 || uploadResult.status >= 300) {
    throw new Error(`AWS rejeitou upload da foto. HTTP ${uploadResult.status} ${String(uploadResult.body || '').slice(0, 250)}`);
  }

  return String(fileUrl);
};
