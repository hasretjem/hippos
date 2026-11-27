// İşletmenin Beyni — Supabase okuma/yazma. Satış, cari ve muhasebe tablolarına HİÇ yazmaz:
// yazdığı tek yerler bu sayfanın kendi beyin_* tablolarıdır.
import { supabase } from '../../../services/supabase';

function kontrol(s) {
  if (s.error) throw new Error(s.error.message);
  return s.data;
}

// Tek seferde sayfanın ihtiyaç duyduğu her şey.
export async function beyinYukle() {
  const [veri, malz, sand, par, esl, ayar, isaret, notlar, deney, alim, fiyatGec, sandvic, urunler] = await Promise.all([
    supabase.rpc('beyin_veri', { p_hafta: 17 }),
    supabase.from('ol_malzemeler').select('id, ad, birim_adi, birim_gram, fiyat_turu, fiyat, tur').order('sira'),
    supabase.from('ol_sandvicler').select('id, ad, normal, buyuk'),
    supabase.from('ol_parametreler').select('*').eq('id', 1).maybeSingle(),
    supabase.from('beyin_eslestirme').select('*'),
    supabase.from('beyin_ayarlar').select('*').eq('id', 1).maybeSingle(),
    supabase.from('beyin_isaretler').select('*'),
    supabase.from('beyin_notlar').select('*').order('tarih', { ascending: false }),
    supabase.from('beyin_deneyler').select('*').order('baslangic', { ascending: false }),
    supabase.from('beyin_alimlar').select('*').order('tarih', { ascending: false }),
    supabase.from('beyin_fiyat_gecmisi').select('*').order('zaman', { ascending: false }).limit(200),
    supabase.rpc('beyin_sandvic', { p_hafta: 17 }),
    supabase.from('products').select('ad, fiyat, kategori'),
  ]);
  return {
    veri: kontrol(veri),
    malzemeler: (kontrol(malz) || []).map((m) => ({ ...m, birim_gram: m.birim_gram === null ? null : Number(m.birim_gram), fiyat: Number(m.fiyat) })),
    sandvicler: kontrol(sand) || [],
    parametre: kontrol(par) || {},
    eslestirme: kontrol(esl) || [],
    ayarlar: kontrol(ayar) || { id: 1, calisma_gunu: 26 },
    isaretler: kontrol(isaret) || [],
    notlar: kontrol(notlar) || [],
    deneyler: kontrol(deney) || [],
    alimlar: kontrol(alim) || [],
    fiyatGecmisi: kontrol(fiyatGec) || [],
    sandvic: kontrol(sandvic) || { fis: [], kalem: [] },
    urunler: kontrol(urunler) || [],
  };
}

export async function isaretKoy(anahtar, imza) {
  kontrol(await supabase.from('beyin_isaretler').upsert({ anahtar, imza: imza ?? null, zaman: new Date().toISOString() }));
}
export async function isaretSil(anahtar) {
  kontrol(await supabase.from('beyin_isaretler').delete().eq('anahtar', anahtar));
}

export async function ayarKaydet(alanlar) {
  kontrol(await supabase.from('beyin_ayarlar').upsert({ id: 1, ...alanlar, guncelleme: new Date().toISOString() }));
}

export async function eslestirmeKaydet(satir) {
  kontrol(
    await supabase.from('beyin_eslestirme').upsert({
      urun_ad: satir.urun_ad,
      kalemler: satir.kalemler || [],
      hazir: satir.hazir || null,
      grup: satir.grup || null,
      birlesik_ad: satir.birlesik_ad ? String(satir.birlesik_ad).trim() || null : null,
      sabit_maliyet: satir.sabit_maliyet === '' || satir.sabit_maliyet === null || satir.sabit_maliyet === undefined ? null : Number(satir.sabit_maliyet),
      guncelleme: new Date().toISOString(),
    }),
  );
}
export async function eslestirmeSil(urunAd) {
  kontrol(await supabase.from('beyin_eslestirme').delete().eq('urun_ad', urunAd));
}

export async function notEkle(n) {
  kontrol(await supabase.from('beyin_notlar').insert({ tarih: n.tarih, bitis: n.bitis || null, metin: n.metin }));
}
export async function notSil(id) {
  kontrol(await supabase.from('beyin_notlar').delete().eq('id', id));
}

export async function deneyEkle(d) {
  kontrol(await supabase.from('beyin_deneyler').insert({ ad: d.ad, baslangic: d.baslangic, kategori: d.kategori || null, urunler: d.urunler || [], notu: d.notu || null }));
}
export async function deneySil(id) {
  kontrol(await supabase.from('beyin_deneyler').delete().eq('id', id));
}

export async function alimEkle(a) {
  kontrol(await supabase.from('beyin_alimlar').insert({ tarih: a.tarih, malzeme_id: Number(a.malzeme_id), miktar: Number(a.miktar), tutar: Number(a.tutar), notu: a.notu || null }));
}
export async function alimSil(id) {
  kontrol(await supabase.from('beyin_alimlar').delete().eq('id', id));
}

// Kategori sayfası için fiş bazlı istatistikler (kategori açılınca çekilir).
export async function kategoriYukle(kategori) {
  return kontrol(await supabase.rpc('beyin_kategori', { p_kategori: kategori }));
}
