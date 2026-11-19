// Supabase'e ulaşılamadığında Hippos'un çalışmaya devam etmesi için bilgisayardaki (tarayıcıdaki) yerel depo.
//  - "kuyruk": Supabase'e gönderilemeyen kayıt istekleri (sırasıyla saklanır, Supabase gelince aktarılır)
//  - "anlik":  son bilinen ekran verisi (ürünler, masalar, cariler, bugünün satışları...) — açılışta Supabase yoksa buradan açılır
// Hepsi IndexedDB'de durur: sayfa yenilense, bilgisayar kapanıp açılsa bile kaybolmaz.

const DB_AD = 'hippos-yerel';
const DB_SURUM = 1;
let dbSoz = null;

function dbAc() {
  if (dbSoz) return dbSoz;
  dbSoz = new Promise((coz, red) => {
    if (typeof indexedDB === 'undefined') return red(new Error('IndexedDB yok'));
    const istek = indexedDB.open(DB_AD, DB_SURUM);
    istek.onupgradeneeded = () => {
      const db = istek.result;
      if (!db.objectStoreNames.contains('kuyruk')) db.createObjectStore('kuyruk', { keyPath: 'sira', autoIncrement: true });
      if (!db.objectStoreNames.contains('anlik')) db.createObjectStore('anlik');
      if (!db.objectStoreNames.contains('basarisiz')) db.createObjectStore('basarisiz', { keyPath: 'sira', autoIncrement: true });
    };
    istek.onsuccess = () => coz(istek.result);
    istek.onerror = () => red(istek.error);
  });
  dbSoz.catch(() => { dbSoz = null; });
  return dbSoz;
}

function islem(depo, mod, fn) {
  return dbAc().then(
    (db) =>
      new Promise((coz, red) => {
        const tx = db.transaction(depo, mod);
        const st = tx.objectStore(depo);
        let sonuc;
        const r = fn(st);
        if (r) r.onsuccess = () => { sonuc = r.result; };
        tx.oncomplete = () => coz(sonuc);
        tx.onerror = () => red(tx.error);
        tx.onabort = () => red(tx.error);
      })
  );
}

// ---- Anlık kopya ----
export const anlikOku = (anahtar) => islem('anlik', 'readonly', (st) => st.get(anahtar)).catch(() => null);
export const anlikYaz = (anahtar, deger) => islem('anlik', 'readwrite', (st) => st.put(deger, anahtar)).catch((e) => console.error('yerel kopya yazılamadı:', e?.message));

// ---- Kuyruk ----
export const kuyrugaEkle = (kayit) => islem('kuyruk', 'readwrite', (st) => st.add(kayit));
export function kuyrukIlk() {
  return dbAc().then(
    (db) =>
      new Promise((coz, red) => {
        const tx = db.transaction('kuyruk', 'readonly');
        let deger = null;
        const r = tx.objectStore('kuyruk').openCursor();
        r.onsuccess = () => { deger = r.result ? r.result.value : null; };
        tx.oncomplete = () => coz(deger);
        tx.onerror = () => red(tx.error);
      })
  );
}
export const kuyrukSil = (sira) => islem('kuyruk', 'readwrite', (st) => st.delete(sira));
export const kuyrukGuncelle = (kayit) => islem('kuyruk', 'readwrite', (st) => st.put(kayit));
export const kuyrukSayisi = () => islem('kuyruk', 'readonly', (st) => st.count()).catch(() => 0);
export const basarisizaEkle = (kayit) => islem('basarisiz', 'readwrite', (st) => st.add({ ...kayit, ts: Date.now() })).catch(() => {});
