// Hippos Cariler <-> Muhasebe2 köprüsü (api/muhasebe2.js "musteri*" kaynakları).
// Müşteri faturası, havale tahsilatı, geri al ve ad değişikliği Muhasebe2'ye buradan iletilir.
export async function m2Cagri(resource, { method = 'POST', body } = {}) {
  const res = await fetch(`/api/muhasebe2?${new URLSearchParams({ resource }).toString()}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  let j = {};
  try {
    j = await res.json();
  } catch {
    j = {};
  }
  if (!res.ok) throw new Error(j.error || `Muhasebe2 hatası (${res.status})`);
  return j;
}

// 'YYYY-MM-DD' -> 'GG.AA.YYYY'
function trTarih(s) {
  const [y, m, d] = String(s || '').split('-');
  return y && m && d ? `${d}.${m}.${y}` : '';
}

export function faturaDonemYazi(f) {
  return f && f.donemBaslangic && f.donemBitis ? `${trTarih(f.donemBaslangic)} – ${trTarih(f.donemBitis)}` : '';
}

// Hippos faturasının Muhasebe2'ye gidecek hali. tutar: Muhasebe2'de borç olarak yazılacak (kalan) tutar.
export function musteriFaturaVeri(f, cariAd, tutar) {
  return {
    faturaId: f.id,
    cariId: f.cariId,
    cariAd,
    tutar,
    tarih: f.tarih,
    faturaNo: f.faturaNo || '',
    donem: faturaDonemYazi(f),
  };
}
