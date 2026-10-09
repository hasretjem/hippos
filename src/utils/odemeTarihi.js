// Ödeme tarihi yardımcıları — tarih her yerde 'YYYY-MM-DD' (yerel/İstanbul günü) metni olarak tutulur.

export function bugunAnahtar() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Istanbul' });
}

export function tarihAnahtari(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const g = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${g}`;
}

// 'YYYY-MM-DD' -> 'GG.AA.YYYY'
export function trTarih(s) {
  if (!s) return '';
  const [y, m, d] = String(s).split('-');
  return `${d}.${m}.${y}`;
}

// İki 'YYYY-MM-DD' arasındaki gün farkı (b - a)
export function gunFarki(a, b) {
  const [ya, ma, da] = a.split('-').map(Number);
  const [yb, mb, db] = b.split('-').map(Number);
  return Math.round((Date.UTC(yb, mb - 1, db) - Date.UTC(ya, ma - 1, da)) / 86400000);
}

// Bir bireysel carinin ödeme günü durumu. Bakiyesi kapanmış (<= 0) cari için uyarı yok.
// Dönüş: null | { tip: 'bugun' | 'gecikti', gun: gecikme günü }
export function odemeGunuDurumu(cari, bakiye) {
  if (!cari || cari.tip !== 'bireysel') return null;
  if (!cari.odemeTarihi || cari.odemeTarihiBelirsiz) return null;
  if (!(bakiye > 0)) return null;
  const fark = gunFarki(cari.odemeTarihi, bugunAnahtar());
  if (fark === 0) return { tip: 'bugun', gun: 0 };
  if (fark > 0) return { tip: 'gecikti', gun: fark };
  return null;
}

// Seçici değeri geçerli mi: tarih VE belirsiz aynı anda seçilemez, ikisinden biri şart.
export function odemeSecimiGecerli(v) {
  if (!v) return false;
  return !!v.tarih !== !!v.belirsiz;
}

// İş günü anahtarı: gece 02:00'ye kadar önceki gün sayılır (günsonu mantığıyla aynı).
export function isGunuAnahtarMs(ms) {
  return new Date(ms - 2 * 3600 * 1000).toLocaleDateString('en-CA', { timeZone: 'Europe/Istanbul' });
}
