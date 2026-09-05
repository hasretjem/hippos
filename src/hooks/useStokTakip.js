import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { supabase } from '../services/supabase';

// Stok Sipariş modülü — Gıda/Manav/Ambalaj/İçecek takip listeleri.
// Kasıtlı olarak useHipposData.js'in DIŞINDA, kendi kanalıyla: mevcut 'hippos-live'
// kanalına yeni bir tablo eklemek yerine ayrı bir kanal ('stok-takip-live') açılıyor.
//
// KOTA STRATEJİSİ (Ağustos 2026 realtime krizinden ders alınarak, minimum mesaj hedefiyle):
// - postgres_changes (satır bazlı, otomatik) KULLANILMIYOR. Onun yerine products/categories'te
//   zaten kanıtlanmış yöntem: BROADCAST. Bir cihaz bir şey değiştirdiğinde (tek karakter olsun,
//   tüm liste olsun fark etmez) SADECE "değişti" diye TEK bir broadcast mesajı gönderiyor; diğer
//   cihazlar bunu alınca normal (realtime OLMAYAN) bir sorguyla kendini tazeliyor.
// - HİÇBİR alan yazarken Supabase'e gitmiyor. Ne mutfak/paketçi tarafında ne yönetim panelinde.
//   Mobil taraf: sadece "Gönder"e basınca tek yazım. Yönetim paneli: sadece "Kaydet"e (veya
//   Paylaş'a) basınca tek yazım. Debounce YOK — gecikmeli yazım kullanıcının yazdığının üstüne
//   binebiliyordu, o risk tamamen ortadan kaldırıldı.
// - Sonuç: bir sayım gönderimi = 1 mesaj, bir kaydetme = 1 mesaj. Tuş başına mesaj YOK.

export const STOK_SEKMELERI = [
  { key: 'gida', label: 'Gıda Siparişi' },
  { key: 'manav', label: 'Manav Siparişi' },
  { key: 'ambalaj', label: 'Ambalaj Siparişi' },
  { key: 'icecek', label: 'İçecek Siparişi' },
];

// Hangi mobil rol hangi sekmeleri görür
export const STOK_SEKME_ROL = {
  mutfak: ['gida', 'manav'],
  paketci: ['ambalaj', 'icecek'],
};

function rowToUrun(r) {
  return {
    id: r.id,
    sekme: r.sekme,
    ad: r.urun_adi,
    birim: r.birim || '',
    sira: r.sira || 0,
    pazartesiHedef: r.pazartesi_hedef || '',
    persembeHedef: r.persembe_hedef || '',
    kendimAlacagim: !!r.kendim_alacagim,
    yeniMi: !!r.yeni_mi,
  };
}

function rowToSayim(r) {
  return {
    sekme: r.sekme,
    kalemler: Array.isArray(r.kalemler) ? r.kalemler : [],
    gonderen: r.gonderen || '',
    gonderimTarihi: r.gonderim_tarihi,
    sifirlamaTarihi: r.sifirlama_tarihi,
    okundu: r.okundu !== false,
    siparisVerildi: !!r.siparis_verildi,
  };
}

export default function useStokTakip(enabled = true) {
  const [urunler, setUrunler] = useState([]); // hepsi, tüm sekmeler
  const [sayimlar, setSayimlar] = useState({}); // { gida: {...}, manav: {...}, ... }
  const [loaded, setLoaded] = useState(false);
  const channelRef = useRef(null);
  const sayimlarRef = useRef({});
  useEffect(() => { sayimlarRef.current = sayimlar; }, [sayimlar]);
  // Yönetim panelinde kaydedilmemiş değişiklik var mı? Varsa dışarıdan gelen
  // broadcast tazelemesi kullanıcının yazdıklarını EZMESİN diye tazeleme atlanır.
  const kirliRef = useRef(false);

  const refetchUrunler = useCallback(async (zorla = false) => {
    if (kirliRef.current && !zorla) return;
    const { data, error } = await supabase
      .from('stok_takip_urunleri')
      .select('*')
      .order('sekme', { ascending: true })
      .order('sira', { ascending: true });
    if (!error) setUrunler((data || []).map(rowToUrun));
  }, []);

  const refetchSayimlar = useCallback(async (zorla = false) => {
    // Kaydedilmemiş düzenleme varken uzaktan gelen tazeleme uygulanmaz.
    if (kirliRef.current && !zorla) return;
    const { data, error } = await supabase.from('stok_sayimlari').select('*');
    if (!error) {
      const m = {};
      (data || []).forEach((r) => { m[r.sekme] = rowToSayim(r); });
      setSayimlar(m);
    }
  }, []);

  function bildir(event) {
    // Kendi yazdığımız değişikliği kendimiz zaten iyimser (optimistic) olarak
    // state'e yansıttığımız için, broadcast SADECE diğer cihazlara "sen de tazele"
    // demek amacıyla gönderiliyor.
    if (channelRef.current) {
      channelRef.current.send({ type: 'broadcast', event, payload: {} });
    }
  }

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    async function loadAll() {
      await Promise.all([refetchUrunler(true), refetchSayimlar(true)]);
      if (active) setLoaded(true);
    }
    loadAll();

    const channel = supabase
      .channel('stok-takip-live')
      .on('broadcast', { event: 'urunler_changed' }, () => refetchUrunler())
      .on('broadcast', { event: 'sayimlar_changed' }, () => refetchSayimlar())
      .subscribe();
    channelRef.current = channel;

    return () => {
      active = false;
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [enabled, refetchUrunler, refetchSayimlar]);

  // ── Ürün şablonu düzenleme (Yönetim Paneli + mobil satır ekleme) ──
  // Satır ekleme/silme seyrek olur, debounce gerekmez — direkt yazıp tek broadcast atar.
  const urunEkle = useCallback(async (sekme, ad) => {
    const mevcut = urunler.filter((u) => u.sekme === sekme);
    const maxSira = mevcut.reduce((m, u) => Math.max(m, u.sira), 0);
    await supabase.from('stok_takip_urunleri').insert({
      sekme,
      urun_adi: ad,
      birim: '',
      sira: maxSira + 1,
      yeni_mi: true,
    });
    await refetchUrunler();
    bildir('urunler_changed');
  }, [urunler, refetchUrunler]);

  const urunEkleMobil = urunEkle;

  // Ürün şablonu alanlarını (ad/birim/hedef/kendim-alacağım) SADECE EKRANDA değiştirir.
  // Supabase'e HİÇBİR ŞEY yazmaz — yazım yalnızca kaydet() ile, tek seferde olur.
  const urunGuncelleYerel = useCallback((id, patch) => {
    kirliRef.current = true;
    setUrunler((prev) => prev.map((u) => (u.id === id ? { ...u, ...patch } : u)));
  }, []);


  const urunSil = useCallback(async (id) => {
    setUrunler((prev) => prev.filter((u) => u.id !== id));
    await supabase.from('stok_takip_urunleri').delete().eq('id', id);
    bildir('urunler_changed');
  }, []);

  // ── Sayım gönderimi (Mutfak/Paketçi) ──
  // Tek seferlik eylem, debounce gerekmez: Gönder'e basılmadan hiçbir şey yazılmaz,
  // basınca tek upsert + tek broadcast.
  const sayimGonder = useCallback(async (sekme, kalemler, gonderen) => {
    const nowIso = new Date().toISOString();
    setSayimlar((prev) => ({
      ...prev,
      [sekme]: { sekme, kalemler, gonderen: gonderen || '', gonderimTarihi: nowIso, okundu: false, siparisVerildi: false },
    }));
    await supabase.from('stok_sayimlari').upsert({
      sekme,
      kalemler,
      gonderen: gonderen || '',
      gonderim_tarihi: nowIso,
      okundu: false,
      siparis_verildi: false,
    }, { onConflict: 'sekme' });
    bildir('sayimlar_changed');
  }, []);

  // ── Sıfırlama (her iki taraf da yapabilir) ── — tek seferlik, debounce gerekmez.
  const sayimSifirla = useCallback(async (sekme) => {
    kirliRef.current = false;
    setSayimlar((prev) => ({
      ...prev,
      [sekme]: { sekme, kalemler: [], gonderen: '', gonderimTarihi: null, okundu: true, siparisVerildi: false },
    }));
    await supabase.from('stok_sayimlari').upsert({
      sekme,
      kalemler: [],
      gonderen: '',
      gonderim_tarihi: null,
      sifirlama_tarihi: new Date().toISOString(),
      okundu: true,
      siparis_verildi: false,
    }, { onConflict: 'sekme' });

    // "Kendim Alacağım" tikleri de sıfırlanır — TEK toplu update, tek broadcast.
    const bunSekmeUrunIdleri = urunler.filter((u) => u.sekme === sekme && u.kendimAlacagim).map((u) => u.id);
    if (bunSekmeUrunIdleri.length > 0) {
      setUrunler((prev) => prev.map((u) => (bunSekmeUrunIdleri.includes(u.id) ? { ...u, kendimAlacagim: false } : u)));
      await supabase.from('stok_takip_urunleri').update({ kendim_alacagim: false }).in('id', bunSekmeUrunIdleri);
      bildir('urunler_changed');
    }
    bildir('sayimlar_changed');
  }, [urunler]);

  // Yönetim Paneli sekmeye girince "okunmadı" işaretini kaldırır.
  const sekmeOkundu = useCallback(async (sekme) => {
    const mevcut = sayimlarRef.current[sekme];
    if (!mevcut || mevcut.okundu) return;
    setSayimlar((prev) => ({ ...prev, [sekme]: { ...prev[sekme], okundu: true } }));
    await supabase.from('stok_sayimlari').update({ okundu: true }).eq('sekme', sekme);
    bildir('sayimlar_changed');
  }, []);

  // "YENİ" etiketi kapatma — seyrek, debounce gerekmez.
  const yeniGorundu = useCallback(async (id) => {
    setUrunler((prev) => prev.map((u) => (u.id === id ? { ...u, yeniMi: false } : u)));
    await supabase.from('stok_takip_urunleri').update({ yeni_mi: false }).eq('id', id);
    bildir('urunler_changed');
  }, []);

  // Sipariş/not/kendim-alacağım sütunlarını (kalemler JSONB) SADECE EKRANDA değiştirir.
  // Supabase'e HİÇBİR ŞEY yazmaz — yazım yalnızca kaydet() ile, tek seferde olur.
  const siparisGuncelleYerel = useCallback((sekme, urunId, patch) => {
    kirliRef.current = true;
    setSayimlar((prev) => {
      const mevcut = prev[sekme] || { sekme, kalemler: [], okundu: true, siparisVerildi: false };
      const kalemler = [...mevcut.kalemler];
      const idx = kalemler.findIndex((k) => k.urunId === urunId);
      if (idx >= 0) kalemler[idx] = { ...kalemler[idx], ...patch };
      else kalemler.push({ urunId, elimizde: '', not: '', siparis: '', kendimAlacagim: false, ...patch });
      return { ...prev, [sekme]: { ...mevcut, kalemler } };
    });
  }, []);

  // ── TEK KAYDETME NOKTASI (Yönetim Paneli "Kaydet" / "Paylaş") ──
  // Ekranda biriken tüm değişiklikleri TEK seferde yazar: kalemler için 1 update,
  // değişen ürün satırları için 1 upsert, ardından EN FAZLA 2 broadcast mesajı.
  // Kaç hücre değiştirilmiş olursa olsun mesaj sayısı sabit kalır.
  const kaydet = useCallback(async (sekme, degisenUrunler) => {
    const kalemler = sayimlarRef.current[sekme]?.kalemler || [];
    await supabase.from('stok_sayimlari').update({ kalemler }).eq('sekme', sekme);
    bildir('sayimlar_changed');

    if (degisenUrunler && degisenUrunler.length > 0) {
      const satirlar = degisenUrunler.map((u) => ({
        id: u.id,
        sekme: u.sekme,
        urun_adi: u.ad,
        birim: u.birim,
        sira: u.sira,
        pazartesi_hedef: u.pazartesiHedef,
        persembe_hedef: u.persembeHedef,
        kendim_alacagim: u.kendimAlacagim,
        yeni_mi: u.yeniMi,
      }));
      await supabase.from('stok_takip_urunleri').upsert(satirlar, { onConflict: 'id' });
      bildir('urunler_changed');
    }
    kirliRef.current = false;
  }, []);


  const siparisVerildiIsaretle = useCallback(async (sekme, deger) => {
    setSayimlar((prev) => ({ ...prev, [sekme]: { ...prev[sekme], siparisVerildi: deger } }));
    await supabase.from('stok_sayimlari').update({ siparis_verildi: deger }).eq('sekme', sekme);
    bildir('sayimlar_changed');
  }, []);

  const toplamOkunmadi = useMemo(
    () => Object.values(sayimlar).filter((s) => s && !s.okundu).length,
    [sayimlar],
  );

  return {
    urunler,
    sayimlar,
    loaded,
    toplamOkunmadi,
    urunEkle,
    urunEkleMobil,
    urunGuncelleYerel,
    urunSil,
    sayimGonder,
    sayimSifirla,
    sekmeOkundu,
    yeniGorundu,
    siparisGuncelleYerel,
    kaydet,
    kirliRef,
    siparisVerildiIsaretle,
  };
}