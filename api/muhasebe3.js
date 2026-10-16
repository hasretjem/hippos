// Muhasebe3 API — BAĞIMSIZ deneme (sandbox) muhasebesi. Hippos'un hiçbir verisine bağlı DEĞİL.
// Tablolar: m3_hesaplar (cariler: firma, gider, gelir, kasa, banka, kart, ortak), m3_defter (çift taraflı satırlar), m3_islem_no.
//
// Defter kuralı (Bakiye = Borç - Alacak):
//  - Alış Fişi/Faturası  : firma ALACAK, gider hesabı BORÇ. Cari dışı ödemede otomatik Ödeme Makbuzu: firma BORÇ, ödeme yöntemi ALACAK.
//  - Satış/İade Faturası : firma BORÇ, gelir (veya gider) hesabı ALACAK. Cari dışı ödemede otomatik Tahsilat Makbuzu: firma ALACAK, yöntem BORÇ.
//  - Tahsilat Makbuzu    : cari ALACAK, ödeme yöntemi BORÇ.
//  - Ödeme Makbuzu       : cari BORÇ, ödeme yöntemi ALACAK.
// KDV yok. Her evrak bir grup (grup_id + işlem no) oluşturur; grup toplam borç = toplam alacak olmalıdır (mizan).
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

const ODEME_TURLERI = { Nakit: 'kasa', 'Kredi Kartı': 'kart', 'Banka Havalesi': 'banka', Ortaklar: 'ortak' };
const HESAP_TURLERI = ['firma', 'gider', 'gelir', 'kasa', 'banka', 'kart', 'ortak'];
const CARI_TURLERI = ['firma', 'ortak'];
const SAYFA = 1000;
const MAKS_SAYFA = 20;

class HataMesaji extends Error {
  constructor(durum, mesaj) {
    super(mesaj);
    this.durum = durum;
  }
}

function dbAl() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new HataMesaji(500, 'SUPABASE_URL / SUPABASE_ANON_KEY tanımlı değil');
  return createClient(url, key, { auth: { persistSession: false } });
}

function kontrol(error) {
  if (!error) return;
  if (error.code === '23505') throw new HataMesaji(409, 'Bu isimde bir hesap zaten var');
  if (error.code === '23514') throw new HataMesaji(400, 'Kayıt kurallara uymuyor (eksik veya geçersiz alan)');
  if (error.code === '23503') throw new HataMesaji(400, 'Bağlı kayıt bulunamadı');
  if (error.code === '22007' || error.code === '22008') throw new HataMesaji(400, 'Tarih geçersiz');
  throw new HataMesaji(500, error.message || 'Veritabanı hatası');
}

const bugunIstanbul = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Istanbul' });
const kurus = (v) => Math.round((Number(v) || 0) * 100);
const metin = (v) => {
  const s = String(v ?? '').trim();
  return s || null;
};
function tutarCoz(v) {
  const n = Number(String(v ?? '').trim().replace(',', '.'));
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}
function tarihKontrol(t) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(t || ''))) throw new HataMesaji(400, 'Tarih geçersiz');
  return t;
}

async function tumSatirlar(sorgu) {
  const hepsi = [];
  let sinirli = false;
  for (let s = 0; s < MAKS_SAYFA; s += 1) {
    const { data, error } = await sorgu().range(s * SAYFA, s * SAYFA + SAYFA - 1);
    kontrol(error);
    hepsi.push(...(data || []));
    if (!data || data.length < SAYFA) return { satirlar: hepsi, sinirli };
  }
  sinirli = true;
  return { satirlar: hepsi, sinirli };
}

async function hesapGetir(db, id, izinli, etiket) {
  if (!id) throw new HataMesaji(400, `${etiket} seçin`);
  const { data, error } = await db.from('m3_hesaplar').select('id,ad,tur,gider_hesabi_id').eq('id', id).maybeSingle();
  kontrol(error);
  if (!data) throw new HataMesaji(400, `${etiket} bulunamadı`);
  if (izinli && !izinli.includes(data.tur)) throw new HataMesaji(400, `${etiket} türü uygun değil`);
  return data;
}

async function yontemCoz(db, islem, yontemId) {
  if (islem === 'Cari') return null;
  const tur = ODEME_TURLERI[islem];
  if (!tur) throw new HataMesaji(400, 'Ödeme türü geçersiz');
  return hesapGetir(db, yontemId, [tur], 'Ödeme yöntemi');
}

async function grupSatirlari(db, grupId) {
  const { data, error } = await db.from('m3_defter').select('*').eq('grup_id', grupId).order('sira');
  kontrol(error);
  return data || [];
}

async function grupYaz(db, grupId, satirlar) {
  const g = await db.from('m3_islem_no').select('no').eq('grup_id', grupId).maybeSingle();
  kontrol(g.error);
  if (!g.data) {
    const e = await db.from('m3_islem_no').insert({ grup_id: grupId });
    kontrol(e.error);
  }
  const { error } = await db.from('m3_defter').insert(satirlar);
  kontrol(error);
}

// Bir evrakın satırlarını üretir: parts = [{ hesapId, borc, alacak, rol, otomatik, evrakTuru }]
function satirKur({ grupId, tarih, evrakTuru, evrakNo, aciklama, islem, parts }) {
  return parts.map((p, i) => ({
    id: randomUUID(),
    grup_id: grupId,
    sira: i,
    tarih,
    evrak_turu: p.evrakTuru || evrakTuru,
    evrak_no: evrakNo,
    hesap_id: p.hesapId,
    aciklama,
    islem,
    islem_turu: null,
    borc: p.borc || 0,
    alacak: p.alacak || 0,
    otomatik: !!p.otomatik,
    rol: p.rol,
  }));
}

function mizanHesapla(satirlar) {
  let borc = 0;
  let alacak = 0;
  const gruplar = new Map();
  satirlar.forEach((r) => {
    borc += kurus(r.borc);
    alacak += kurus(r.alacak);
    const g = gruplar.get(r.grup_id || r.grupId) || { fark: 0, no: r.islemNo ?? null };
    g.fark += kurus(r.borc) - kurus(r.alacak);
    gruplar.set(r.grup_id || r.grupId, g);
  });
  const bozuk = [...gruplar.entries()].filter(([, g]) => g.fark !== 0).map(([grupId, g]) => ({ grupId, no: g.no, fark: g.fark / 100 }));
  return { toplamBorc: borc / 100, toplamAlacak: alacak / 100, dengeli: borc === alacak && bozuk.length === 0, bozukGruplar: bozuk };
}

async function hesapHaritasi(db) {
  const { data, error } = await db.from('m3_hesaplar').select('id,ad,tur,gider_hesabi_id');
  kontrol(error);
  return new Map((data || []).map((h) => [h.id, h]));
}

async function islemNoHaritasi(db) {
  const { satirlar } = await tumSatirlar(() => db.from('m3_islem_no').select('grup_id,no').order('no'));
  return new Map(satirlar.map((x) => [x.grup_id, Number(x.no)]));
}

// ---------------------------------------------------------------------------
export default async function handler(req, res) {
  try {
    const db = dbAl();
    const resource = req.query?.resource;
    const body = req.body || {};

    // ---------- Okuma ----------
    if (req.method === 'GET' && (resource === 'baslangic' || resource === 'hesapOzetleri')) {
      const [h, b] = await Promise.all([
        db.from('m3_hesaplar').select('id,ad,tur,gider_hesabi_id,sira,kayit_zamani').order('sira').order('kayit_zamani'),
        db.from('m3_hesap_bakiye').select('hesap_id,bakiye,toplam_borc,toplam_alacak,son_islem'),
      ]);
      kontrol(h.error);
      kontrol(b.error);
      const bak = new Map((b.data || []).map((x) => [x.hesap_id, x]));
      const ad = new Map((h.data || []).map((x) => [x.id, x.ad]));
      const hesaplar = (h.data || [])
        .map((x) => ({
          id: x.id,
          ad: x.ad,
          tur: x.tur,
          giderHesabiId: x.gider_hesabi_id,
          giderHesabiAd: x.gider_hesabi_id ? ad.get(x.gider_hesabi_id) || '' : '',
          bakiye: Number(bak.get(x.id)?.bakiye || 0),
          sonIslem: bak.get(x.id)?.son_islem || null,
        }))
        .sort((a, c) => a.ad.localeCompare(c.ad, 'tr'));
      const toplamBorc = (b.data || []).reduce((t, x) => t + kurus(x.toplam_borc), 0) / 100;
      const toplamAlacak = (b.data || []).reduce((t, x) => t + kurus(x.toplam_alacak), 0) / 100;
      return res.status(200).json({
        hesaplar,
        bugun: bugunIstanbul(),
        mizan: { toplamBorc, toplamAlacak, dengeli: kurus(toplamBorc) === kurus(toplamAlacak) },
      });
    }

    if (req.method === 'GET' && resource === 'datalar') {
      const [hm, nm, ds] = await Promise.all([
        hesapHaritasi(db),
        islemNoHaritasi(db),
        tumSatirlar(() => db.from('m3_defter').select('*').order('tarih', { ascending: false }).order('kayit_zamani', { ascending: false })),
      ]);
      const yontemAdi = new Map();
      ds.satirlar.forEach((r) => {
        if (r.rol === 'yontem') yontemAdi.set(r.grup_id, hm.get(r.hesap_id)?.ad || '');
      });
      const kayitlar = ds.satirlar.map((r) => ({
        id: r.id,
        grupId: r.grup_id,
        islemNo: nm.get(r.grup_id) ?? null,
        sira: r.sira,
        tarih: r.tarih,
        evrakTuru: r.evrak_turu,
        evrakNo: r.evrak_no || '',
        hesapId: r.hesap_id,
        hesapAdi: hm.get(r.hesap_id)?.ad || '',
        hesapTuru: hm.get(r.hesap_id)?.tur || '',
        aciklama: r.aciklama || '',
        islem: r.islem || '',
        islemTuru: yontemAdi.get(r.grup_id) || '',
        borc: Number(r.borc) || 0,
        alacak: Number(r.alacak) || 0,
        otomatik: !!r.otomatik,
        rol: r.rol,
      }));
      // En yeni işlem üstte; aynı işlemin satırları yan yana ve kendi sırasında kalır.
      kayitlar.sort((a, b) => {
        if (a.tarih !== b.tarih) return a.tarih < b.tarih ? 1 : -1;
        if ((a.islemNo || 0) !== (b.islemNo || 0)) return (b.islemNo || 0) - (a.islemNo || 0);
        return a.sira - b.sira;
      });
      const mizan = mizanHesapla(kayitlar.map((r) => ({ grup_id: r.grupId, borc: r.borc, alacak: r.alacak, islemNo: r.islemNo })));
      return res.status(200).json({ kayitlar, sinirli: ds.sinirli, mizan });
    }

    if (req.method === 'GET' && resource === 'ekstre') {
      const hesapId = req.query?.hesapId;
      const hesap = await hesapGetir(db, hesapId, null, 'Hesap');
      const [hm, nm, ds] = await Promise.all([
        hesapHaritasi(db),
        islemNoHaritasi(db),
        tumSatirlar(() => db.from('m3_defter').select('*').eq('hesap_id', hesapId).order('tarih').order('kayit_zamani')),
      ]);
      const yontem = new Map();
      if (ds.satirlar.length) {
        const gruplar = [...new Set(ds.satirlar.map((r) => r.grup_id))];
        for (let i = 0; i < gruplar.length; i += 200) {
          const { data, error } = await db.from('m3_defter').select('grup_id,hesap_id').eq('rol', 'yontem').in('grup_id', gruplar.slice(i, i + 200));
          kontrol(error);
          (data || []).forEach((x) => yontem.set(x.grup_id, hm.get(x.hesap_id)?.ad || ''));
        }
      }
      const sirali = ds.satirlar
        .map((r) => ({ ...r, islemNo: nm.get(r.grup_id) ?? null }))
        .sort((a, b) => {
          if (a.tarih !== b.tarih) return a.tarih < b.tarih ? -1 : 1;
          if ((a.islemNo || 0) !== (b.islemNo || 0)) return (a.islemNo || 0) - (b.islemNo || 0);
          return a.sira - b.sira;
        });
      let yurur = 0;
      const satirlar = sirali.map((r) => {
        yurur += kurus(r.borc) - kurus(r.alacak);
        const y = yontem.get(r.grup_id);
        return {
          id: r.id,
          grupId: r.grup_id,
          islemNo: r.islemNo,
          tarih: r.tarih,
          evrakTuru: r.evrak_turu,
          belgeNo: r.evrak_no || '',
          aciklama: r.aciklama || '',
          odemeSekli: r.islem === 'Cari' || !r.islem ? r.islem || '' : `${r.islem}${y ? ` / ${y}` : ''}`,
          borc: Number(r.borc) || 0,
          alacak: Number(r.alacak) || 0,
          bakiye: yurur / 100,
          otomatik: !!r.otomatik,
        };
      });
      return res.status(200).json({ firma: { id: hesap.id, ad: hesap.ad, tur: hesap.tur }, satirlar });
    }

    // ---------- Hesap (cari) tanımları ----------
    if (req.method === 'POST' && resource === 'hesapEkle') {
      const ad = metin(body.ad);
      const tur = String(body.tur || '');
      if (!ad) throw new HataMesaji(400, 'Hesap adı gerekli');
      if (!HESAP_TURLERI.includes(tur)) throw new HataMesaji(400, 'Hesap türü geçersiz');
      let giderHesabiId = null;
      if (tur === 'firma') {
        const g = await hesapGetir(db, body.giderHesabiId, ['gider'], 'Gider hesabı');
        giderHesabiId = g.id;
      } else if (body.giderHesabiId && !['gider', 'gelir'].includes(tur)) {
        const g = await hesapGetir(db, body.giderHesabiId, ['gider'], 'Gider hesabı');
        giderHesabiId = g.id;
      }
      const { data, error } = await db.from('m3_hesaplar').insert({ ad, tur, gider_hesabi_id: giderHesabiId }).select('id,ad,tur,gider_hesabi_id').single();
      kontrol(error);
      return res.status(200).json({ hesap: { id: data.id, ad: data.ad, tur: data.tur, giderHesabiId: data.gider_hesabi_id, bakiye: 0 } });
    }

    if (req.method === 'POST' && resource === 'hesapGuncelle') {
      const mevcut = await hesapGetir(db, body.id, null, 'Hesap');
      const guncelle = {};
      if (body.ad !== undefined) {
        const ad = metin(body.ad);
        if (!ad) throw new HataMesaji(400, 'Hesap adı boş olamaz');
        guncelle.ad = ad;
      }
      if (body.giderHesabiId !== undefined && !['gider', 'gelir'].includes(mevcut.tur)) {
        if (!body.giderHesabiId) {
          if (mevcut.tur === 'firma') throw new HataMesaji(400, 'Firma carileri için gider hesabı zorunlu');
          guncelle.gider_hesabi_id = null;
        } else {
          const g = await hesapGetir(db, body.giderHesabiId, ['gider'], 'Gider hesabı');
          guncelle.gider_hesabi_id = g.id;
        }
      }
      if (!Object.keys(guncelle).length) return res.status(200).json({ ok: true });
      const { error } = await db.from('m3_hesaplar').update(guncelle).eq('id', mevcut.id);
      kontrol(error);
      return res.status(200).json({ ok: true });
    }

    // ---------- Evrak girişi ----------
    if (req.method === 'POST' && resource === 'evrakKaydet') {
      const satis = body.evrak === 'satis';
      const tarih = tarihKontrol(body.tarih);
      const tutar = tutarCoz(body.tutar);
      if (!(tutar > 0)) throw new HataMesaji(400, 'Tutarı girin');
      const islem = body.islem === 'Cari' ? 'Cari' : String(body.islem || '');
      if (islem !== 'Cari' && !ODEME_TURLERI[islem]) throw new HataMesaji(400, 'Ödeme türünü seçin');
      const cari = await hesapGetir(db, body.firmaId, CARI_TURLERI, 'Firma');
      const hesap = await hesapGetir(db, body.hesapId, satis ? ['gider', 'gelir'] : ['gider'], satis ? 'Gelir/Gider hesabı' : 'Gider hesabı');
      const yontem = await yontemCoz(db, islem, body.yontemId);
      const aciklama = metin(body.aciklama) || hesap.ad;
      const evrakTuru = satis ? 'Satış/İade Faturası' : 'Alış Fişi/Faturası';
      const parts = satis
        ? [
            { hesapId: cari.id, borc: tutar, rol: 'cari' },
            { hesapId: hesap.id, alacak: tutar, rol: 'hesap' },
          ]
        : [
            { hesapId: cari.id, alacak: tutar, rol: 'cari' },
            { hesapId: hesap.id, borc: tutar, rol: 'hesap' },
          ];
      if (yontem) {
        const mt = satis ? 'Tahsilat Makbuzu' : 'Ödeme Makbuzu';
        parts.push(
          satis
            ? { hesapId: cari.id, alacak: tutar, rol: 'cari', otomatik: true, evrakTuru: mt }
            : { hesapId: cari.id, borc: tutar, rol: 'cari', otomatik: true, evrakTuru: mt },
          satis
            ? { hesapId: yontem.id, borc: tutar, rol: 'yontem', otomatik: true, evrakTuru: mt }
            : { hesapId: yontem.id, alacak: tutar, rol: 'yontem', otomatik: true, evrakTuru: mt },
        );
      }
      const grupId = randomUUID();
      const satirlar = satirKur({ grupId, tarih, evrakTuru, evrakNo: metin(body.evrakNo), aciklama, islem, parts });
      await grupYaz(db, grupId, satirlar);
      return res.status(200).json({ ok: true, grupId, oncesi: [], sonrasi: satirlar });
    }

    if (req.method === 'POST' && resource === 'makbuzKaydet') {
      const tahsilat = body.makbuzTuru === 'Tahsilat';
      if (!tahsilat && body.makbuzTuru !== 'Ödeme') throw new HataMesaji(400, 'Makbuz türü geçersiz');
      const tarih = tarihKontrol(body.tarih);
      const tutar = tutarCoz(body.tutar);
      if (!(tutar > 0)) throw new HataMesaji(400, 'Tutarı girin');
      const islem = String(body.islem || '');
      if (!ODEME_TURLERI[islem]) throw new HataMesaji(400, 'Ödeme türünü seçin');
      const cari = await hesapGetir(db, body.firmaId, CARI_TURLERI, 'Firma');
      const yontem = await yontemCoz(db, islem, body.yontemId);
      let giderAd = null;
      const gid = body.hesapId || cari.gider_hesabi_id;
      if (gid) {
        const g = await hesapGetir(db, gid, ['gider'], 'Gider hesabı');
        giderAd = g.ad;
      }
      const aciklama = metin(body.aciklama) || giderAd;
      const evrakTuru = tahsilat ? 'Tahsilat Makbuzu' : 'Ödeme Makbuzu';
      const parts = tahsilat
        ? [
            { hesapId: cari.id, alacak: tutar, rol: 'cari' },
            { hesapId: yontem.id, borc: tutar, rol: 'yontem', otomatik: true },
          ]
        : [
            { hesapId: cari.id, borc: tutar, rol: 'cari' },
            { hesapId: yontem.id, alacak: tutar, rol: 'yontem', otomatik: true },
          ];
      const grupId = randomUUID();
      const satirlar = satirKur({ grupId, tarih, evrakTuru, evrakNo: metin(body.evrakNo), aciklama, islem, parts });
      await grupYaz(db, grupId, satirlar);
      return res.status(200).json({ ok: true, grupId, oncesi: [], sonrasi: satirlar });
    }

    // ---------- Düzenleme / silme / geri al (Datalar) ----------
    if (req.method === 'POST' && ['kayitAlan', 'kayitDuzenle', 'kayitSil', 'kayitGeriYaz'].includes(resource)) {
      const grupId = body.grupId;
      if (!grupId) throw new HataMesaji(400, 'Kayıt bulunamadı');
      const oncesi = await grupSatirlari(db, grupId);

      if (resource === 'kayitGeriYaz') {
        const yazilacak = Array.isArray(body.yazilacak) ? body.yazilacak : [];
        const d = await db.from('m3_defter').delete().eq('grup_id', grupId);
        kontrol(d.error);
        if (yazilacak.length) await grupYaz(db, grupId, yazilacak);
        return res.status(200).json({ ok: true });
      }
      if (!oncesi.length) throw new HataMesaji(404, 'Kayıt bulunamadı');

      if (resource === 'kayitSil') {
        const d = await db.from('m3_defter').delete().eq('grup_id', grupId);
        kontrol(d.error);
        return res.status(200).json({ ok: true, grupId, oncesi, sonrasi: [] });
      }

      // kayitAlan: tek alan {alan, deger}; kayitDuzenle: {tarih, evrakNo, aciklama, tutar, cariId, hesapId, yontemId}
      const degisimler = resource === 'kayitAlan' ? { [body.alan]: body.deger } : body;
      const guncelle = {};
      if (degisimler.tarih !== undefined) guncelle.tarih = tarihKontrol(degisimler.tarih);
      if (degisimler.evrakNo !== undefined) guncelle.evrak_no = metin(degisimler.evrakNo);
      if (degisimler.aciklama !== undefined) guncelle.aciklama = metin(degisimler.aciklama);
      if (Object.keys(guncelle).length) {
        const u = await db.from('m3_defter').update(guncelle).eq('grup_id', grupId);
        kontrol(u.error);
      }
      if (degisimler.tutar !== undefined) {
        const t = tutarCoz(degisimler.tutar);
        if (!(t > 0)) throw new HataMesaji(400, 'Tutar sıfırdan büyük olmalı');
        for (const r of oncesi) {
          const u = await db.from('m3_defter').update(Number(r.borc) > 0 ? { borc: t } : { alacak: t }).eq('id', r.id);
          kontrol(u.error);
        }
      }
      const hesapDegis = [
        ['cariId', 'cari', CARI_TURLERI, 'Firma'],
        ['hesapId', 'hesap', ['gider', 'gelir'], 'Gelir/Gider hesabı'],
        ['yontemId', 'yontem', Object.values(ODEME_TURLERI), 'Ödeme yöntemi'],
      ];
      for (const [alan, rol, izinli, etiket] of hesapDegis) {
        if (!degisimler[alan]) continue;
        const hedef = await hesapGetir(db, degisimler[alan], izinli, etiket);
        const eski = oncesi.find((r) => r.rol === rol);
        if (!eski || eski.hesap_id === hedef.id) continue;
        const u = await db.from('m3_defter').update({ hesap_id: hedef.id }).eq('grup_id', grupId).eq('rol', rol).eq('hesap_id', eski.hesap_id);
        kontrol(u.error);
      }
      const sonrasi = await grupSatirlari(db, grupId);
      return res.status(200).json({ ok: true, grupId, oncesi, sonrasi });
    }

    return res.status(404).json({ error: 'Bilinmeyen istek' });
  } catch (e) {
    const durum = e instanceof HataMesaji ? e.durum : 500;
    if (durum >= 500) console.error('muhasebe3 hata:', e);
    return res.status(durum).json({ error: e.message || 'Sunucu hatası' });
  }
}
