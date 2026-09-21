const openDB = () => new Promise((resolve, reject) => {
  const request = indexedDB.open('agenda-familiar-v1', 1);
  request.onupgradeneeded = () => request.result.createObjectStore('accounts');
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(new Error('Não foi possível abrir o armazenamento offline.'));
});
export async function readAccount(id) {
  const db = await openDB();
  try { return await new Promise((resolve, reject) => {
    const request = db.transaction('accounts').objectStore('accounts').get(id);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }); } finally { db.close(); }
}
export async function writeAccount(id, value) {
  const db = await openDB();
  try { await new Promise((resolve, reject) => {
    const tx = db.transaction('accounts', 'readwrite');
    const store = tx.objectStore('accounts');
    if (value === null) store.delete(id); else store.put(value, id);
    tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
  }); } finally { db.close(); }
}
