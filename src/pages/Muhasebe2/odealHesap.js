// Ödeal Kontrol — saf hesap mantığı (React'tan bağımsız; yalnız karşılaştırır, hiçbir kaydı değiştirmez).
// Girdi: Ödeal ekstresi satırları + muhasebe tarafındaki Ödeal hareketleri. Çıktı: eşleşme durumları, gün/firma kırılımları.

export const norm = (s) =>
  String(s ?? '')
    .toLocaleLowerCase('tr')
    .replace(/ı/g, 'i')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const AYNI = (a, b) => Math.abs(a - b) < 0.005;

export function gunEkle(iso, n) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export function gunFark(a, b) {
  return Math.round((new Date(`${a}T12:00:00Z`) - new Date(`${b}T12:00:00Z`)) / 86400000);
}

function tarihCoz(v) {
  if (typeof v === 'number' && v > 20000 && v < 80000) {
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000);
    return d.toISOString().slice(0, 10);
  }
  const s = String(v ?? '').trim();
  let m = /^(\d{1,2})[./](\d{1,2})[./](\d{4})/.exec(s);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

function tutarCoz(v) {
  if (typeof v === 'number') return r2(v);
  let s = String(v ?? '').trim().replace(/\s|₺|TL/gi, '');
  if (!s) return NaN;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? r2(n) : NaN;
}

// Ödeal'ın "Kart İşlemlerim" dosyası: İşlem Tarihi | İşlem Türü | Gelen-Giden | İşlem Tutarı | Açıklama | ...
export function odealSatirlari(rows) {
  const basIdx = rows.findIndex((r) => {
    const n = (r || []).map(norm);
    return n.some((h) => h.includes('islem tarihi')) && n.some((h) => h.includes('gelen')) && n.some((h) => h.includes('tutar'));
  });
  if (basIdx < 0) throw new Error('Bu dosya Ödeal "Kart İşlemlerim" dosyasına benzemiyor (başlık satırı bulunamadı)');
  const baslik = rows[basIdx].map(norm);
  const kol = (...adlar) => baslik.findIndex((h) => adlar.some((a) => h.includes(a)));
  const cTarih = kol('islem tarihi');
  const cTur = kol('islem turu');
  const cYon = kol('gelen');
  const cTutar = kol('islem tutari', 'tutar');
  const cAcik = kol('aciklama');
  const satirlar = [];
  const yoksayilan = [];
  for (let i = basIdx + 1; i < rows.length; i++) {
    const r = rows[i] || [];
    if (r.every((x) => x === '' || x === undefined)) continue;
    const tarih = tarihCoz(r[cTarih]);
    const tutar = tutarCoz(r[cTutar]);
    const yonN = norm(r[cYon]);
    const yon = yonN.includes('gelen') ? 'gelen' : yonN.includes('giden') ? 'giden' : null;
    const turN = norm(r[cTur]);
    const aciklama = String(r[cAcik] ?? '').replace(/\s+/g, ' ').trim();
    if (!tarih || !Number.isFinite(tutar) || !yon) {
      yoksayilan.push({ satir: i + 1, neden: 'Tarih, tutar ya da yön okunamadı' });
      continue;
    }
    let tur = 'basarili';
    if (turN.includes('provizyon')) tur = 'provizyon';
    else if (/iptal|basarisiz|red|hata/.test(turN)) tur = 'gecersiz';
    const kayit = { id: `o${i}`, satir: i + 1, tarih, tur, turYazi: String(r[cTur] ?? ''), yon, tutar, aciklama };
    if (tur === 'gecersiz') yoksayilan.push({ satir: i + 1, neden: `${kayit.turYazi} işlemi sayılmadı` });
    else satirlar.push(kayit);
  }
  if (!satirlar.length) throw new Error('Dosyada işlem satırı bulunamadı');
  return { satirlar, yoksayilan };
}

// Açıklama -> eşleme anahtarı (şehir/ülke kuyruğu atılır): "KOFTECI YUSUF IST SISLI B ISTANBUL TR" -> "kofteci yusuf ist sisli b"
export function anahtarUret(aciklama) {
  return norm(aciklama)
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\s+(istanbul|ankara|izmir|bursa|antalya)?\s*tr$/, '')
    .trim()
    .slice(0, 120);
}

const DURAK = new Set(['ltd', 'sti', 'as', 'san', 'tic', 've', 'ist', 'istanbul', 'tr', 'com', 'sirketi', 'limited', 'anonim', 'ticaret', 'sanayi']);
const kelimeler = (s) =>
  norm(s)
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((k) => k.length > 1 && !DURAK.has(k));

// Önce elle yapılan eşleme, sonra otomatik: firma adının TÜM kelimeleri Ödeal açıklamasında geçiyorsa (en çok kelimeli firma kazanır).
export function firmaBulOdeal(firmalar, aciklama, eslemeMap) {
  const anahtar = anahtarUret(aciklama);
  const elle = eslemeMap.get(anahtar);
  if (elle) {
    const f = firmalar.find((x) => x.id === elle);
    if (f) return { firmaId: f.id, firmaAdi: f.ad, kaynak: 'elle' };
  }
  const hedef = new Set(kelimeler(aciklama));
  let en = null;
  let enPuan = 0;
  for (const f of firmalar) {
    const k = kelimeler(f.ad);
    if (!k.length || !k.every((x) => hedef.has(x))) continue;
    const puan = k.length * 100 + k.join('').length;
    if (puan > enPuan) {
      en = f;
      enPuan = puan;
    }
  }
  return en ? { firmaId: en.id, firmaAdi: en.ad, kaynak: 'otomatik' } : null;
}

// items içinden toplamı hedefe eşit olan en az 2, en çok maks elemanlı alt küme (indeks dizisi) ya da null.
function altKume(items, hedef, maks = 4) {
  const cents = items.map((x) => Math.round(x.tutar * 100));
  const h = Math.round(hedef * 100);
  const sec = [];
  function git(baslangic, kalan) {
    if (sec.length >= 2 && kalan === 0) return true;
    if (sec.length >= maks) return false;
    for (let i = baslangic; i < cents.length; i++) {
      if (cents[i] > kalan) continue;
      sec.push(i);
      if (git(i + 1, kalan - cents[i])) return true;
      sec.pop();
    }
    return false;
  }
  return git(0, h) ? [...sec] : null;
}

const PENCERE = 3; // Ödeal tarihi ile muhasebe kayıt tarihi arasında kabul edilen gün farkı

export function kontrolHesapla({ satirlar, muhasebe, posGunleri, eslemeler, firmalar, bas, bit }) {
  const eslemeMap = new Map((eslemeler || []).map((e) => [e.anahtar, e.firmaId]));
  const G = satirlar
    .filter((s) => s.yon === 'giden')
    .map((s) => ({ ...s, f: firmaBulOdeal(firmalar, s.aciklama, eslemeMap), m: [] }))
    .sort((a, b) => (a.tarih === b.tarih ? b.tutar - a.tutar : a.tarih < b.tarih ? -1 : 1));
  const M = (muhasebe || []).map((m) => ({ ...m, g: null }));
  const serbestM = () => M.filter((m) => !m.g);
  const serbestG = () => G.filter((g) => !g.m.length);
  const baglaGM = (g, ms) => {
    ms.forEach((m) => {
      m.g = g;
      g.m.push(m);
    });
  };

  // 1) Birebir tutar eşleşmesi: önce aynı firma, sonra firma fark etmez
  for (const firmaSart of [true, false]) {
    for (const g of G) {
      if (g.m.length) continue;
      const adaylar = serbestM().filter(
        (m) => AYNI(m.tutar, g.tutar) && Math.abs(gunFark(m.tarih, g.tarih)) <= PENCERE && (!firmaSart || (g.f && m.firmaId === g.f.firmaId)),
      );
      if (!adaylar.length) continue;
      adaylar.sort((a, b) => Math.abs(gunFark(a.tarih, g.tarih)) - Math.abs(gunFark(b.tarih, g.tarih)));
      baglaGM(g, [adaylar[0]]);
    }
  }

  // 2) Parçalı eşleşme (aynı firma): Ödeal'da 2+ satır = muhasebede 1 kayıt, ya da tersi
  const firmaIdleri = new Set(G.filter((g) => g.f).map((g) => g.f.firmaId));
  for (const fid of firmaIdleri) {
    for (const m of M.filter((x) => !x.g && x.firmaId === fid)) {
      const gs = serbestG().filter((g) => g.f && g.f.firmaId === fid && Math.abs(gunFark(m.tarih, g.tarih)) <= PENCERE);
      const idx = altKume(gs, m.tutar);
      if (idx) idx.forEach((i) => baglaGM(gs[i], [m]));
    }
    for (const g of serbestG().filter((x) => x.f && x.f.firmaId === fid)) {
      const ms = serbestM().filter((m) => m.firmaId === fid && Math.abs(gunFark(m.tarih, g.tarih)) <= PENCERE);
      const idx = altKume(ms, g.tutar);
      if (idx) baglaGM(g, idx.map((i) => ms[i]));
    }
  }

  // Giderler tablosu
  const giderler = G.map((g) => {
    const eslesti = g.m.length > 0;
    const m0 = g.m[0];
    const firma = eslesti ? { firmaId: m0.firmaId, firmaAdi: m0.firmaAdi } : g.f ? { firmaId: g.f.firmaId, firmaAdi: g.f.firmaAdi } : { firmaId: null, firmaAdi: null };
    return {
      tip: 'odeal',
      id: g.id,
      tarih: g.tarih,
      tutar: g.tutar,
      aciklama: g.aciklama,
      anahtar: anahtarUret(g.aciklama),
      provizyon: g.tur === 'provizyon',
      durum: eslesti ? 'eslesti' : 'kayit_yok',
      firmaId: firma.firmaId,
      firmaAdi: firma.firmaAdi,
      firmaKaynak: eslesti ? (g.f && g.f.firmaId === m0.firmaId ? g.f.kaynak : 'kayittan') : g.f ? g.f.kaynak : null,
      // Ödeal açıklamasından firma bulunamadı ama tutarla bir muhasebe kaydına bağlandı: tek tıkla bağlama önerisi
      oneri: eslesti && !(g.f && g.f.firmaId === m0.firmaId) ? { firmaId: m0.firmaId, firmaAdi: m0.firmaAdi } : null,
      kayitlar: g.m.map((m) => ({ id: m.id, tarih: m.tarih, tutar: m.tutar, firmaAdi: m.firmaAdi })),
    };
  });
  const aralikta = (t) => t >= bas && t <= bit;
  const kayitlar = M.filter((m) => !m.g && aralikta(m.tarih)).map((m) => ({
    tip: 'kayit',
    id: m.id,
    tarih: m.tarih,
    tutar: m.tutar,
    aciklama: m.aciklama,
    provizyon: false,
    durum: 'odealda_yok',
    firmaId: m.firmaId,
    firmaAdi: m.firmaAdi,
    firmaKaynak: 'kayittan',
    oneri: null,
    kayitlar: [],
  }));
  const tumGiderler = [...giderler, ...kayitlar].sort((a, b) => (a.tarih === b.tarih ? b.tutar - a.tutar : a.tarih < b.tarih ? 1 : -1));

  // Firma kırılımı
  const gruplar = new Map();
  const grup = (firmaId, firmaAdi) => {
    const k = firmaId || '__yok';
    if (!gruplar.has(k)) gruplar.set(k, { firmaId: firmaId || null, firmaAdi: firmaAdi || 'Firma bulunamadı', odeal: 0, odealProvizyon: 0, kayit: 0, satirlar: [] });
    return gruplar.get(k);
  };
  for (const g of giderler) {
    const gr = grup(g.firmaId, g.firmaAdi);
    if (g.provizyon) gr.odealProvizyon = r2(gr.odealProvizyon + g.tutar);
    else gr.odeal = r2(gr.odeal + g.tutar);
    gr.satirlar.push(g);
  }
  const sayilanM = new Set();
  for (const g of G) g.m.forEach((m) => {
    if (sayilanM.has(m.id)) return;
    sayilanM.add(m.id);
    const gr = grup(m.firmaId, m.firmaAdi);
    gr.kayit = r2(gr.kayit + m.tutar);
  });
  for (const k of kayitlar) {
    const gr = grup(k.firmaId, k.firmaAdi);
    gr.kayit = r2(gr.kayit + k.tutar);
    gr.satirlar.push(k);
  }
  const firmaGruplari = [...gruplar.values()]
    .map((g) => ({ ...g, fark: r2(g.odeal + g.odealProvizyon - g.kayit) }))
    .sort((a, b) => (a.firmaId === null ? -1 : b.firmaId === null ? 1 : Math.abs(b.fark) - Math.abs(a.fark) || a.firmaAdi.localeCompare(b.firmaAdi, 'tr')));

  // Gelenler: Ödeal'a düşen tutar = bir önceki günün günsonu POS kartı toplamı olmalı (komisyon yok)
  const posMap = new Map((posGunleri || []).map((p) => [p.tarih, p.tutar]));
  const gelenGunler = new Map();
  satirlar.filter((s) => s.yon === 'gelen').forEach((s) => {
    if (!gelenGunler.has(s.tarih)) gelenGunler.set(s.tarih, []);
    gelenGunler.get(s.tarih).push(s.tutar);
  });
  const gelenler = [];
  for (const [t, parcalar] of gelenGunler) {
    const odeal = r2(parcalar.reduce((a, b) => a + b, 0));
    const beklenen = gunEkle(t, -1);
    const hippos = r2(posMap.get(beklenen) || 0);
    gelenler.push({ tarih: t, parcalar, odeal, posTarihi: beklenen, hippos, fark: r2(odeal - hippos), durum: AYNI(odeal, hippos) ? 'tamam' : hippos === 0 ? 'gunsonu_yok' : 'fark' });
  }
  for (const [g, tutar] of posMap) {
    const t = gunEkle(g, 1);
    if (g < gunEkle(bas, -1) || g > bit || gelenGunler.has(t) || !tutar) continue;
    gelenler.push({ tarih: t, parcalar: [], odeal: 0, posTarihi: g, hippos: r2(tutar), fark: r2(-tutar), durum: t > bit ? 'bekleniyor' : 'gelmedi' });
  }
  gelenler.sort((a, b) => (a.tarih < b.tarih ? 1 : -1));

  const topla = (liste, f) => r2(liste.filter(f).reduce((a, s) => a + s.tutar, 0));
  const ozet = {
    gelen: topla(satirlar, (s) => s.yon === 'gelen'),
    gidenBasarili: topla(satirlar, (s) => s.yon === 'giden' && s.tur === 'basarili'),
    gidenProvizyon: topla(satirlar, (s) => s.yon === 'giden' && s.tur === 'provizyon'),
    eslesen: giderler.filter((g) => g.durum === 'eslesti').length,
    kayitYok: giderler.filter((g) => g.durum === 'kayit_yok').length,
    kayitYokTutar: topla(giderler, (g) => g.durum === 'kayit_yok'),
    odealdaYok: kayitlar.length,
    odealdaYokTutar: topla(kayitlar, () => true),
    gelenFark: gelenler.filter((g) => g.durum === 'fark' || g.durum === 'gelmedi' || g.durum === 'gunsonu_yok').length,
    firmaBulunamayan: giderler.filter((g) => !g.firmaId).length,
  };
  ozet.net = r2(ozet.gelen - ozet.gidenBasarili - ozet.gidenProvizyon);
  ozet.sorun = ozet.kayitYok + ozet.odealdaYok + ozet.gelenFark;
  return { giderler: tumGiderler, firmaGruplari, gelenler, ozet };
}

export function tarihAraligi(satirlar) {
  const t = satirlar.map((s) => s.tarih).sort();
  return { bas: t[0], bit: t[t.length - 1] };
}
