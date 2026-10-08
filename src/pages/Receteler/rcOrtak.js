// Reçeteler ekranının ortak yardımcıları. Muhasebe2'nin m2Ortak'ındaki formatlar yeniden kullanılır.
export { TL, trNorm, tarihTR, bugunISO, sayi } from '../Muhasebe2/m2Ortak';

export const fmt = (n, k = 2) =>
  new Intl.NumberFormat('tr-TR', { minimumFractionDigits: k, maximumFractionDigits: k }).format(Number(n) || 0);

// Birim fiyatlar küçük olabildiği için (ör. 0,4 TL/g) 4 haneye kadar gösterilir, gereksiz sıfırlar atılır.
export const fiyatFmt = (n) =>
  n == null ? '—' : new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(Number(n));

// Malzeme birimi → reçetede yazılan birim
export const RECETE_BIRIMI = { kg: 'g', lt: 'ml', adet: 'adet' };
export const BIRIM_ETIKET = { kg: 'kg', lt: 'lt', adet: 'adet' };

export async function rcApi(resource, { method = 'GET', body, query } = {}) {
  const qs = new URLSearchParams({ resource, ...(query || {}) }).toString();
  const res = await fetch(`/api/recete?${qs}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify({ resource, ...body }) : undefined,
  });
  let j = {};
  try {
    j = await res.json();
  } catch {
    j = {};
  }
  if (!res.ok) throw new Error(j.error || `Sunucu hatası (${res.status})`);
  return j;
}

// Fatura birimi → malzeme birimi için önerilen çarpan (1 fatura birimi kaç malzeme birimi)
export function onerilenCarpan(birimKodu, malzemeBirimi) {
  const k = String(birimKodu || '').toUpperCase();
  if (malzemeBirimi === 'kg') return k === 'KGM' ? 1 : k === 'GRM' ? 0.001 : null;
  if (malzemeBirimi === 'lt') return k === 'LTR' ? 1 : k === 'MLT' ? 0.001 : null;
  if (malzemeBirimi === 'adet') return k === 'C62' || k === 'NIU' ? 1 : null;
  return null;
}

// Zip dosyasını base64'e çevirir (sunucu zip'i açar).
export async function dosyaBase64(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let ikili = '';
  const parca = 0x8000;
  for (let i = 0; i < bytes.length; i += parca) ikili += String.fromCharCode.apply(null, bytes.subarray(i, i + parca));
  return btoa(ikili);
}

// Seçilen XML/ZIP dosyalarını sunucuya gönderir; toplam sonuç döner.
export async function xmlDosyalariniYukle(dosyalar) {
  const sonuc = { okunan: 0, eklenen: 0, mukerrer: 0, satisAtlandi: 0, islenenFiyat: 0, hatalar: [] };
  const ekle = (j) => {
    sonuc.okunan += j.okunan || 0;
    sonuc.eklenen += j.eklenen || 0;
    sonuc.mukerrer += j.mukerrer || 0;
    sonuc.satisAtlandi += j.satisAtlandi || 0;
    sonuc.islenenFiyat += j.islenenFiyat || 0;
    sonuc.hatalar.push(...(j.hatalar || []));
  };
  const xmller = [];
  for (const f of dosyalar) {
    const ad = f.name.toLowerCase();
    if (ad.endsWith('.zip')) {
      // Büyük zip'ler Vercel gövde sınırına (≈4,5 MB) takılabilir: sunucu hatası kullanıcıya iletilir.
      ekle(await rcApi('xmlYukle', { method: 'POST', body: { zipBase64: await dosyaBase64(f) } }));
    } else if (ad.endsWith('.xml')) {
      xmller.push({ dosya: f.name, xml: await f.text() });
    }
  }
  // Tek tek XML'ler: gövde sınırını aşmamak için gruplar halinde
  let grup = [];
  let boyut = 0;
  const gonder = async () => {
    if (!grup.length) return;
    ekle(await rcApi('xmlYukle', { method: 'POST', body: { xmlMetinleri: grup } }));
    grup = [];
    boyut = 0;
  };
  for (const x of xmller) {
    if (boyut + x.xml.length > 2_500_000) await gonder();
    grup.push(x);
    boyut += x.xml.length;
  }
  await gonder();
  return sonuc;
}
