// Online Sipariş — Supabase okuma/yazma (ol_malzemeler, ol_parametreler, ol_sandvicler). API fonksiyonu gerekmez.
import { supabase } from '../../services/supabase';

function kontrol(sonuc) {
  if (sonuc.error) throw new Error(sonuc.error.message);
  return sonuc.data;
}

function malzemeNormalle(r) {
  return { ...r, birim_gram: r.birim_gram === null ? null : Number(r.birim_gram), fiyat: Number(r.fiyat), sira: Number(r.sira) };
}
function parametreNormalle(r) {
  const o = { ...r };
  ['carpan', 'indirim', 'kom_iletim', 'kom_dagitim', 'kom_kdv', 'satis_kdv', 'ambalaj_normal', 'ambalaj_buyuk', 'ekmek_fiyat_kucuk', 'ekmek_fiyat_buyuk'].forEach((k) => {
    o[k] = Number(r[k]);
  });
  return o;
}
const BOS_BOY = { kalemler: [], dukkan_urunler: [], dukkan_fiyat: '', platform_fiyat: '', carpan: '', hedef_kar: '' };
export function boyNormalle(b) {
  const x = b || {};
  return {
    // secimli: müşteri seçimli kalem (örn. "Hangi ezmeyi istersiniz?"); secenekler = malzeme id'leri.
    kalemler: (x.kalemler || []).map((k) => ({
      malzeme_id: Number(k.malzeme_id),
      adet: k.adet === undefined || k.adet === null ? '' : String(k.adet),
      ...(k.secimli ? { secimli: true, soru: k.soru || '', secenekler: (k.secenekler || []).map(Number) } : {}),
    })),
    dukkan_fiyat: x.dukkan_fiyat === undefined || x.dukkan_fiyat === null ? '' : String(x.dukkan_fiyat),
    // Eski kayıtlarda tek ürün (dukkan_urun) vardı; liste olarak okunur.
    dukkan_urunler: Array.isArray(x.dukkan_urunler) ? x.dukkan_urunler.map(Number) : x.dukkan_urun ? [Number(x.dukkan_urun)] : [],
    platform_fiyat: x.platform_fiyat === undefined || x.platform_fiyat === null ? '' : String(x.platform_fiyat),
    carpan: x.carpan === undefined || x.carpan === null ? '' : String(x.carpan),
    hedef_kar: x.hedef_kar === undefined || x.hedef_kar === null ? '' : String(x.hedef_kar),
  };
}
export const bosBoy = () => ({ ...BOS_BOY, kalemler: [] });
function sandvicNormalle(r) {
  return { ...r, sira: Number(r.sira), normal: boyNormalle(r.normal), buyuk: boyNormalle(r.buyuk) };
}

export async function olYukle() {
  const [m, p, s, e, i] = await Promise.all([
    supabase.from('ol_malzemeler').select('*').order('sira').order('id'),
    supabase.from('ol_parametreler').select('*').eq('id', 1).maybeSingle(),
    supabase.from('ol_sandvicler').select('*').order('sira').order('id'),
    supabase.from('ol_ekstralar').select('*').order('sira').order('id'),
    supabase.from('ol_icecekler').select('*').order('sira').order('id'),
  ]);
  const par = kontrol(p);
  return {
    malzemeler: kontrol(m).map(malzemeNormalle),
    p: par ? parametreNormalle(par) : null,
    sandvicler: kontrol(s).map(sandvicNormalle),
    ekstralar: kontrol(e).map((r) => ({ ...r, sira: Number(r.sira), fiyat_kucuk: Number(r.fiyat_kucuk), fiyat_buyuk: Number(r.fiyat_buyuk), adet_kucuk: Number(r.adet_kucuk), adet_buyuk: Number(r.adet_buyuk) })),
    icecekler: kontrol(i).map((r) => ({ ...r, sira: Number(r.sira), fiyat: Number(r.fiyat) })),
  };
}

// Ekstralar / İçecekler (satış ekranındaki Online sipariş kategorisinin listeleri)
const sayiYap = (v) => (v === '' || v === null || v === undefined ? 0 : Number(String(v).replace(',', '.')) || 0);
export async function ekstraKaydet(x) {
  const satir = {
    ad: x.ad.trim(), sira: sayiYap(x.sira), fiyat_kucuk: sayiYap(x.fiyat_kucuk), fiyat_buyuk: sayiYap(x.fiyat_buyuk),
    adet_kucuk: sayiYap(x.adet_kucuk) || 1, adet_buyuk: sayiYap(x.adet_buyuk) || 1, surulebilir: !!x.surulebilir, aktif: x.aktif !== false,
  };
  if (x.id) kontrol(await supabase.from('ol_ekstralar').update(satir).eq('id', x.id));
  else kontrol(await supabase.from('ol_ekstralar').insert(satir));
}
export async function ekstraSil(id) {
  kontrol(await supabase.from('ol_ekstralar').delete().eq('id', id));
}
export async function icecekKaydet(x) {
  const satir = { ad: x.ad.trim(), sira: sayiYap(x.sira), fiyat: sayiYap(x.fiyat), aktif: x.aktif !== false };
  if (x.id) kontrol(await supabase.from('ol_icecekler').update(satir).eq('id', x.id));
  else kontrol(await supabase.from('ol_icecekler').insert(satir));
}
export async function icecekSil(id) {
  kontrol(await supabase.from('ol_icecekler').delete().eq('id', id));
}

// Kayda yazılacak boy: sayılar gerçek sayıya, boş alanlar null'a çevrilir.
function boyTemizle(b) {
  const n = (v) => (v === '' || v === null || v === undefined ? null : Number(String(v).replace(',', '.')));
  return {
    kalemler: (b.kalemler || [])
      .filter((k) => k.malzeme_id)
      .map((k) => ({
        malzeme_id: Number(k.malzeme_id),
        adet: n(k.adet) || 0,
        ...(k.secimli ? { secimli: true, soru: (k.soru || '').trim(), secenekler: [...new Set((k.secenekler || []).map(Number).filter(Boolean))] } : {}),
      })),
    dukkan_urunler: (b.dukkan_urunler || []).map(Number),
    dukkan_fiyat: (b.dukkan_urunler || []).length ? null : n(b.dukkan_fiyat),
    platform_fiyat: n(b.platform_fiyat),
    carpan: n(b.carpan),
    hedef_kar: n(b.hedef_kar),
  };
}

export async function sandvicKaydet(s) {
  const satir = { ad: s.ad.trim(), normal: boyTemizle(s.normal), buyuk: boyTemizle(s.buyuk), updated_at: new Date().toISOString() };
  if (s.id) kontrol(await supabase.from('ol_sandvicler').update(satir).eq('id', s.id));
  else kontrol(await supabase.from('ol_sandvicler').insert({ ...satir, sira: s.sira || 0 }));
}
export async function sandvicSil(id) {
  kontrol(await supabase.from('ol_sandvicler').delete().eq('id', id));
}

export async function malzemeKaydet(m) {
  const sayiDegeri = (v) => (v === '' || v === null || v === undefined ? null : Number(String(v).replace(',', '.')));
  const satir = {
    ad: m.ad.trim(),
    birim_adi: (m.birim_adi || '').trim(),
    birim_gram: sayiDegeri(m.birim_gram),
    fiyat_turu: m.fiyat_turu,
    fiyat: sayiDegeri(m.fiyat) || 0,
    kontrol: !!m.kontrol,
    notu: m.notu || '',
    surulebilir: !!m.surulebilir,
    tur: m.tur || 'malzeme',
  };
  if (m.id) kontrol(await supabase.from('ol_malzemeler').update(satir).eq('id', m.id));
  else kontrol(await supabase.from('ol_malzemeler').insert({ ...satir, sira: m.sira || 0 }));
}
export async function malzemeSil(id) {
  kontrol(await supabase.from('ol_malzemeler').delete().eq('id', id));
}

export async function parametreKaydet(p) {
  const { id: _id, ...alanlar } = p;
  kontrol(await supabase.from('ol_parametreler').update({ ...alanlar, updated_at: new Date().toISOString() }).eq('id', 1));
}
