export async function putTemporaryAudio(storageKey: string, _bytes: Uint8Array) {
  return { storageKey, stored: true };
}

export async function deleteTemporaryAudio(storageKey: string) {
  return { storageKey, deleted: true };
}
