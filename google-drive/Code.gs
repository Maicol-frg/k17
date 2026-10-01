// K17 Google Drive bridge. The web app runs as the Drive owner and accepts
// requests only when their shared secret matches the K17_DRIVE_KEY Worker secret.
const K17_FOLDER_ID = '10hrg8z9lpgMW7KllqxAMl1AaLa5Ok75z';
const K17_MAX_BYTES = 2_000_000;

// Run once from the editor to let Google ask for Drive permission.
function authorizeK17Drive() {
  return DriveApp.getFolderById(K17_FOLDER_ID).getName();
}

function doPost(e) {
  try {
    const body = JSON.parse(e?.postData?.contents || '{}');
    const expected = PropertiesService.getScriptProperties().getProperty('K17_SECRET') || '';
    if (!expected || !constantTimeEqual(String(body.key || ''), expected)) {
      return output({ ok: false, error: 'No autorizado.' });
    }

    if (body.action === 'upload') return uploadImage(body);
    if (body.action === 'download') return downloadImage(body);
    if (body.action === 'delete') return deleteImage(body);
    return output({ ok: false, error: 'Acción no válida.' });
  } catch (error) {
    return output({ ok: false, error: String(error?.message || 'Error de Google Drive.') });
  }
}

function uploadImage(body) {
  const mime = String(body.mime || '');
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(mime)) {
    return output({ ok: false, error: 'Formato de imagen no permitido.' });
  }
  const encoded = String(body.data || '');
  if (!encoded || encoded.length > Math.ceil(K17_MAX_BYTES * 4 / 3) + 8) {
    return output({ ok: false, error: 'La imagen supera el máximo de 2 MB.' });
  }
  const bytes = Utilities.base64Decode(encoded);
  if (!bytes.length || bytes.length > K17_MAX_BYTES) {
    return output({ ok: false, error: 'La imagen supera el máximo de 2 MB.' });
  }
  const safeName = String(body.name || 'prenda').replace(/[^\w.-]/g, '_').slice(0, 100);
  const blob = Utilities.newBlob(bytes, mime, safeName);
  const file = DriveApp.getFolderById(K17_FOLDER_ID).createFile(blob);
  return output({ ok: true, id: file.getId() });
}

function downloadImage(body) {
  const file = getK17File(body.id);
  const blob = file.getBlob();
  const mime = blob.getContentType();
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(mime)) {
    return output({ ok: false, error: 'El archivo no es una imagen permitida.' });
  }
  const bytes = blob.getBytes();
  if (bytes.length > K17_MAX_BYTES) {
    return output({ ok: false, error: 'La imagen supera el máximo permitido.' });
  }
  return output({ ok: true, mime: mime, data: Utilities.base64Encode(bytes) });
}

function deleteImage(body) {
  getK17File(body.id).setTrashed(true);
  return output({ ok: true });
}

function getK17File(id) {
  id = String(id || '');
  if (!/^[\w-]{10,100}$/.test(id)) throw new Error('Imagen no encontrada.');
  const file = DriveApp.getFileById(id);
  const parents = file.getParents();
  let inK17Folder = false;
  while (parents.hasNext()) if (parents.next().getId() === K17_FOLDER_ID) inK17Folder = true;
  if (!inK17Folder) throw new Error('Imagen no encontrada.');
  return file;
}

function constantTimeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function output(value) {
  return ContentService.createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}
