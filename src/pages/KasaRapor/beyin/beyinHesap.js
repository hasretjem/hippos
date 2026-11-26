// İşletmenin Beyni — saf hesaplar (ekrandan bağımsız, Node'da test edilebilir).
// Maliyetler Online Sipariş malzeme listesindeki kg fiyatı ve gramajlardan gelir; ürün → malzeme eşleştirmesi beyin_eslestirme'de.
// "Son 4 hafta" = son 4 TAMAMLANMIŞ hafta (Pazartesi–Pazar). Aylık rakamlar = son 4 hafta × 30/28.

export const AYLIK = 30 / 28;

const TLF = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 });
const TLF2 = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const tl = (n) => `${TLF.format(Math.round(Number(n) || 0)).replace(/^-/, '−')} ₺`;
export const tl2 = (n) => `${TLF2.format(Number(n) || 0).replace(/^-/, '−')} ₺`;
export const yuzde = (n) => (n === null || n === undefined || !Number.isFinite(n) ? '—' : `${n < 0 ? '−' : ''}%${(Math.round(Math.abs(n) * 1000) / 10).toLocaleString('tr-TR')}`);
export const isaretli = (n) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${tl(Math.abs(n))}`;

export function birimMaliyet(m) {
  if (!m) return 0;
  const f = Number(m.fiyat) || 0;
  if (m.fiyat_turu === 'kg') return ((Number(m.birim_gram) || 0) / 1000) * f;
  return f;
}

// ---------- tarih yardımcıları (yerel saat, 'YYYY-MM-DD' metinleri) ----------
export function gunEkle(iso, n) {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}
export function haftaBasi(iso) {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  const gun = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 pazar
  return gunEkle(iso, -((gun + 6) % 7));
}
const AYLAR = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
export function tarihKisa(iso) {
  const [, m, d] = iso.slice(0, 10).split('-').map(Number);
  return `${d} ${AYLAR[m - 1]}`;
}
export const GUNLER = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];

// ---------- maliyet haritası ----------
// Dönüş: Map ürün adı → { birim, kalemler: [{m, a}], kaynak }
export function maliyetHaritasi(eslestirme, malzemeler, sandvicler) {
  const mMap = new Map(malzemeler.map((m) => [Number(m.id), m]));
  const sMap = new Map(sandvicler.map((s) => [s.ad, s]));
  const sonuc = new Map();
  for (const e of eslestirme || []) {
    let kalemler = [];
    let kaynak = 'malzeme';
    if (e.hazir) {
      const [ad, boy] = String(e.hazir).split('|');
      const s = sMap.get(ad);
      const b = s ? s[boy === 'buyuk' ? 'buyuk' : 'normal'] : null;
      if (b && Array.isArray(b.kalemler)) {
        kalemler = b.kalemler
          .map((k) => ({ m: Number(k.malzeme_id), a: Number(k.adet) || 0 }))
          .filter((k) => mMap.get(k.m) && mMap.get(k.m).tur !== 'ambalaj');
        kaynak = 'reçete';
      }
    } else {
      kalemler = (Array.isArray(e.kalemler) ? e.kalemler : []).map((k) => ({ m: Number(k.m), a: Number(k.a) || 0 })).filter((k) => mMap.get(k.m));
    }
    const sabit = e.sabit_maliyet === null || e.sabit_maliyet === undefined || e.sabit_maliyet === '' ? null : Number(e.sabit_maliyet);
    if (!kalemler.length && sabit === null) continue;
    const birim = kalemler.reduce((t, k) => t + k.a * birimMaliyet(mMap.get(k.m)), 0) + (sabit || 0);
    sonuc.set(e.urun_ad, { birim, kalemler, kaynak: sabit !== null && !kalemler.length ? 'elle' : kaynak, sabit });
  }
  return sonuc;
}

// ---------- ana model ----------
export function modelKur(d) {
  const v = d.veri || {};
  const simdi = String(v.simdi || new Date().toISOString()).slice(0, 19);
  const bugun = simdi.slice(0, 10);
  const buHafta = haftaBasi(bugun);
  const maliyet = maliyetHaritasi(d.eslestirme, d.malzemeler, d.sandvicler);
  const malzMap = new Map(d.malzemeler.map((m) => [Number(m.id), m]));

  // Tamamlanmış haftalar (eskiden yeniye)
  const haftaSet = new Set((v.haftalik || []).map((r) => r.h));
  const haftalar = [...haftaSet].filter((h) => h < buHafta).sort();
  const son4 = haftalar.slice(-4);
  const onceki8 = haftalar.slice(-12, -4);

  // Ürün bazında haftalık seri
  const urunler = new Map(); // ad → { ad, k, hafta: Map h → {a,c,m} }
  for (const r of v.haftalik || []) {
    let u = urunler.get(r.u);
    if (!u) {
      u = { ad: r.u, k: r.k, hafta: new Map() };
      urunler.set(r.u, u);
    }
    u.hafta.set(r.h, { a: Number(r.a), c: Number(r.c), m: Number(r.m) });
  }
  const topla = (u, hs) => hs.reduce((t, h) => { const x = u.hafta.get(h); if (x) { t.a += x.a; t.c += x.c; } return t; }, { a: 0, c: 0 });

  // Ürün metrikleri (son 4 hafta)
  const urunListe = [];
  for (const u of urunler.values()) {
    const s = topla(u, son4);
    const o = topla(u, onceki8);
    const mal = maliyet.get(u.ad) || null;
    const fiyat = s.a ? s.c / s.a : null;
    const birim = mal ? mal.birim : null;
    const kar = mal ? s.c - s.a * birim : null;
    urunListe.push({
      ad: u.ad,
      k: u.k,
      adet: s.a,
      ciro: s.c,
      haftalikAdet: s.a / 4,
      oncekiHaftalikAdet: onceki8.length ? o.a / onceki8.length : 0,
      fiyat,
      birim,
      kar,
      marj: mal && s.c > 0 ? kar / s.c : null,
      birimKar: mal && fiyat !== null ? fiyat - birim : null,
      eslesti: !!mal,
      kaynak: mal ? mal.kaynak : null,
      seri: u.hafta,
    });
  }
  const urunMap = new Map(urunListe.map((u) => [u.ad, u]));

  // Kategori haftalık
  const kategoriler = new Map(); // k → { k, hafta: Map h → {c, mc, kar} }
  for (const r of v.haftalik || []) {
    let k = kategoriler.get(r.k);
    if (!k) {
      k = { k: r.k, hafta: new Map() };
      kategoriler.set(r.k, k);
    }
    const x = k.hafta.get(r.h) || { c: 0, mc: 0, kar: 0, a: 0 };
    const mal = maliyet.get(r.u);
    x.c += Number(r.c);
    x.a += Number(r.a);
    if (mal) {
      x.mc += Number(r.c);
      x.kar += Number(r.c) - Number(r.a) * mal.birim;
    }
    k.hafta.set(r.h, x);
  }
  // Kategori marjı (son 4 hafta, maliyeti bilinen ürünlerden) — tahmini kâr için
  let genelMc = 0;
  let genelKar = 0;
  for (const k of kategoriler.values()) {
    let mc = 0;
    let kar = 0;
    let c = 0;
    son4.forEach((h) => { const x = k.hafta.get(h); if (x) { mc += x.mc; kar += x.kar; c += x.c; } });
    k.marj = mc > 0 ? kar / mc : null;
    k.kapsama = c > 0 ? mc / c : 0;
    genelMc += mc;
    genelKar += kar;
  }
  const genelMarj = genelMc > 0 ? genelKar / genelMc : 0;
  // Kategori marjı: önce Ayarlar'da elle girilen tahmini marj, yoksa maliyeti bilinen ürünlerden (ciroyu en az %30 kapsıyorsa).
  const elleMarj = (d.ayarlar && d.ayarlar.kategori_marj) || {};
  const katMarj = (k) => {
    const e = elleMarj[k];
    if (e !== undefined && e !== null && e !== '' && Number.isFinite(Number(e))) return Number(e);
    const x = kategoriler.get(k);
    return x && x.marj !== null && x.kapsama >= 0.3 ? x.marj : null;
  };
  // Bir ciro parçasının tahmini kârı: maliyeti bilinen ürün → gerçek; bilinmeyen → kategorinin marjı (yoksa hesaba katılmaz)
  const tahminiKar = (u, k, a, c) => {
    const mal = maliyet.get(u);
    if (mal) return c - a * mal.birim;
    const m = katMarj(k);
    return m === null ? 0 : c * m;
  };

  // Kâr hesabının kapsadığı ciro (son 4 hafta): ürün maliyeti ya da kategori marjı bilinen ciro
  let k4Ciro = 0;
  let k4Bilinen = 0;
  const bilinmeyenKat = [];
  for (const k of kategoriler.values()) {
    let c = 0;
    let mc = 0;
    son4.forEach((h) => { const x = k.hafta.get(h); if (x) { c += x.c; mc += x.mc; } });
    k4Ciro += c;
    if (katMarj(k.k) !== null) k4Bilinen += c;
    else {
      k4Bilinen += mc;
      if (c - mc > 0) bilinmeyenKat.push({ k: k.k, ciro: c - mc });
    }
  }
  bilinmeyenKat.sort((a, b) => b.ciro - a.ciro);
  const kapsama = { oran: k4Ciro ? k4Bilinen / k4Ciro : 1, bilinmeyen: k4Ciro - k4Bilinen, kategoriler: bilinmeyenKat };

  // Haftalık toplamlar (tüm işletme)
  const haftaToplam = haftalar.concat(haftaSet.has(buHafta) ? [buHafta] : []).map((h) => {
    let c = 0;
    let kar = 0;
    for (const r of v.haftalik || []) if (r.h === h) { c += Number(r.c); kar += tahminiKar(r.u, r.k, Number(r.a), Number(r.c)); }
    return { h, c, kar };
  });

  // Bugün / geçen hafta aynı gün
  const bugunR = (v.bugun || []).filter((r) => r.t === 'b');
  const gecenR = (v.bugun || []).filter((r) => r.t === 'g');
  const gecenTumR = (v.bugun || []).filter((r) => r.t === 't');
  const sum = (l, f) => l.reduce((t, r) => t + f(r), 0);
  const nabiz = {
    ciro: sum(bugunR, (r) => Number(r.c)),
    kar: sum(bugunR, (r) => tahminiKar(r.u, r.k, Number(r.a), Number(r.c))),
    gecenCiro: sum(gecenR, (r) => Number(r.c)),
    gecenKar: sum(gecenR, (r) => tahminiKar(r.u, r.k, Number(r.a), Number(r.c))),
    gecenTumCiro: sum(gecenTumR, (r) => Number(r.c)),
    saat: simdi.slice(11, 16),
  };
  nabiz.fark = nabiz.gecenCiro > 0 ? (nabiz.ciro - nabiz.gecenCiro) / nabiz.gecenCiro : null;
  nabiz.gunSonuTahmin = nabiz.gecenCiro > 0 ? (nabiz.ciro / nabiz.gecenCiro) * nabiz.gecenTumCiro : null;

  // Bu ay (günlük kategori verisinden)
  const ayBas = bugun.slice(0, 8) + '01';
  const ayGun = new Date(Date.UTC(Number(bugun.slice(0, 4)), Number(bugun.slice(5, 7)), 0)).getUTCDate();
  const gecenGun = Number(bugun.slice(8, 10));
  let ayCiro = 0;
  let ayKar = 0;
  const gunlukKar = new Map();
  for (const r of v.gunluk || []) {
    const m = katMarj(r.k);
    const k = m === null ? 0 : Number(r.c) * m;
    gunlukKar.set(r.g, (gunlukKar.get(r.g) || 0) + k);
    if (r.g >= ayBas) {
      ayCiro += Number(r.c);
      ayKar += k;
    }
  }
  const ay = { ciro: ayCiro, kar: ayKar, ayGun, gecenGun, kalanGun: ayGun - gecenGun };

  return { simdi, bugun, buHafta, haftalar, son4, onceki8, maliyet, malzMap, urunListe, urunMap, kategoriler, katMarj, genelMarj, tahminiKar, haftaToplam, nabiz, ay, gunlukKar, kapsama, veri: v, d };
}

// ---------- hedef / başabaş ----------
export function hedefHesap(model, ayarlar) {
  const { ay } = model;
  const calisma = Number(ayarlar?.calisma_gunu) || 26;
  const isOrani = calisma / ay.ayGun; // takvim gününden iş gününe
  const hedef = Number(ayarlar?.aylik_hedef) || 0;
  const sabit = Number(ayarlar?.aylik_sabit_gider) || 0;
  const kalanIs = Math.max(1, Math.round(ay.kalanGun * isOrani));
  const beklenen = hedef ? (hedef * ay.gecenGun) / ay.ayGun : 0;
  return {
    hedef,
    sabit,
    kar: ay.kar,
    oran: hedef ? ay.kar / hedef : null,
    beklenenOran: ay.gecenGun / ay.ayGun,
    geride: hedef ? ay.kar < beklenen * 0.9 : false,
    gunlukGereken: hedef ? Math.max(0, (hedef - ay.kar) / kalanIs) : null,
    kalanIs,
    gunlukBasabas: sabit ? sabit / calisma : null,
    basabasOran: sabit ? ay.kar / ((sabit * ay.gecenGun) / ay.ayGun) : null,
  };
}

// ---------- tespitler ----------
const SEVIYE = { kirmizi: 0, turuncu: 1, sari: 2, yesil: 3, mavi: 4 };

function notBul(notlar, bas, bit) {
  return (notlar || []).filter((n) => n.tarih <= bit && (n.bitis || n.tarih) >= bas);
}

export function tespitUret(model, ek) {
  const { urunListe, son4, onceki8, haftalar, kategoriler, maliyet, malzMap, veri } = model;
  const { ayarlar, isaretler, notlar, alimlar, fiyatGecmisi, deneyler } = ek;
  const t = [];
  const son4Bit = son4.length ? gunEkle(son4[son4.length - 1], 6) : model.bugun;

  // 1) Zararına satılan ürünler
  for (const u of urunListe) {
    if (!u.eslesti || u.adet < 5 || u.birimKar === null || u.birimKar >= 0) continue;
    const hedefFiyat = Math.ceil(u.birim / 0.6);
    t.push({
      anahtar: `zarar:${u.ad}`,
      imza: `${Math.round(u.fiyat)}|${Math.round(u.birim)}`,
      seviye: 'kirmizi',
      tur: 'Zararına satış',
      baslik: u.ad,
      cumle: `Maliyetinin altında satılıyor: satış ${tl2(u.fiyat)}, maliyet ${tl2(u.birim)}. Son 4 haftada ${u.adet} adet.`,
      etki: u.kar * AYLIK,
      aksiyon: `Fiyatı en az ${tl(hedefFiyat)} yap (%40 marj) ya da porsiyonu küçült.`,
      urun: u.ad,
    });
  }
  // 2) Düşük marj (çok satan ama az kâr bırakan)
  for (const u of urunListe) {
    if (!u.eslesti || u.marj === null || u.marj < 0 || u.marj >= 0.25 || u.ciro < 800) continue;
    const hedefFiyat = Math.ceil(u.birim / 0.6);
    t.push({
      anahtar: `dusukmarj:${u.ad}`,
      imza: `${Math.round(u.fiyat)}|${Math.round(u.birim)}`,
      seviye: 'turuncu',
      tur: 'Düşük marj',
      baslik: u.ad,
      cumle: `Marjı sadece ${yuzde(u.marj)}: ${tl2(u.fiyat)} satış, ${tl2(u.birim)} maliyet. Ayda yaklaşık ${Math.round(u.adet * AYLIK)} adet satılıyor.`,
      etki: (hedefFiyat - u.fiyat) * u.adet * AYLIK,
      etkiFirsat: true,
      aksiyon: `Fiyat ${tl(hedefFiyat)} olursa (marj %40) ayda yaklaşık ${tl((hedefFiyat - u.fiyat) * u.adet * AYLIK)} fazla kâr.`,
      urun: u.ad,
    });
  }

  // 3) Şüpheli (yanlış girilmiş olabilecek) satışlar — tek kartta
  const dogru = new Set((isaretler || []).filter((i) => i.anahtar.startsWith('dogru:')).map((i) => i.anahtar.slice(6)));
  const supheli = (veri.supheli || []).filter((s) => !dogru.has(s.id));
  if (supheli.length) {
    const yeni = supheli.filter((s) => s.ts.slice(0, 10) >= gunEkle(model.bugun, -7));
    const fazla = supheli.reduce((x, s) => x + (Number(s.fiyat) - Number(s.medyan)), 0);
    const ilk = supheli[0];
    t.push({
      anahtar: 'supheli',
      imza: supheli.map((s) => s.id).sort().join(','),
      seviye: yeni.length ? 'kirmizi' : 'turuncu',
      tur: 'Yanlış giriş?',
      baslik: `${supheli.length} satış normal fiyatının çok üstünde`,
      cumle: `En sonuncusu: ${ilk.ts.slice(8, 10)}.${ilk.ts.slice(5, 7)} ${ilk.ts.slice(11)} · ${ilk.masa} · ${ilk.ad} ${tl(ilk.fiyat)} (normali ${tl(ilk.medyan)}).`,
      etki: fazla,
      etkiMetni: `${tl(fazla)} fazla görünüyor`,
      aksiyon: 'Bu satışlar hesaplara katılmıyor. Doğruysa "Doğru giriş" de; yanlışsa Veri sayfasından düzelt.',
      detay: { tip: 'supheli', liste: supheli },
    });
  }

  // 4) Fiyat değişiklikleri (son 6 hafta içinde %15+ değişen ürünler)
  for (const u of urunListe) {
    const hs = haftalar.filter((h) => { const x = u.seri.get(h); return x && x.a >= 3; });
    if (hs.length < 3) continue;
    for (let i = hs.length - 1; i >= 1; i--) {
      const h = hs[i];
      if (h < haftalar[haftalar.length - 6]) break;
      const yeni = u.seri.get(h).m;
      const eski = u.seri.get(hs[i - 1]).m;
      if (eski > 0 && Math.abs(yeni - eski) / eski >= 0.15 && Math.abs(yeni - eski) >= 2) {
        const sonFiyat = u.seri.get(hs[hs.length - 1]).m;
        if (Math.abs(sonFiyat - yeni) / yeni > 0.1) break; // değişiklik kalıcı değilse geç
        t.push({
          anahtar: `fiyat:${u.ad}`,
          imza: `${eski}|${yeni}`,
          seviye: 'sari',
          tur: yeni < eski ? 'Fiyat düştü' : 'Fiyat arttı',
          baslik: u.ad,
          cumle: `${tarihKisa(h)} haftasından beri ${tl2(eski)} yerine ${tl2(yeni)} satılıyor. Bilerek mi yapıldı?`,
          etki: (yeni - eski) * u.haftalikAdet * 4 * AYLIK,
          aksiyon: yeni < eski ? 'Bilerek değilse ürünün fiyatını Menü Düzenleme\'den düzelt.' : 'Bilgi: fiyat artışı satışları düşürdü mü, haftalık grafiğe bak.',
          urun: u.ad,
        });
        break;
      }
    }
  }

  // 5) Kategori trendi: son 4 hafta / önceki 8 hafta
  if (son4.length === 4 && onceki8.length >= 4) {
    for (const k of kategoriler.values()) {
      const s = son4.reduce((x, h) => x + (k.hafta.get(h)?.c || 0), 0) / 4;
      const o = onceki8.reduce((x, h) => x + (k.hafta.get(h)?.c || 0), 0) / onceki8.length;
      if (o <= 0) continue;
      const deg = (s - o) / o;
      if (Math.abs(deg) < 0.12 || Math.abs(s - o) < 500) continue;
      const marj = model.katMarj(k.k) ?? model.genelMarj;
      // En çok etkileyen ürünler
      const katki = urunListe
        .filter((u) => u.k === k.k)
        .map((u) => {
          const so = onceki8.reduce((x, h) => x + (u.seri.get(h)?.c || 0), 0) / onceki8.length;
          return { ad: u.ad, fark: u.ciro / 4 - so };
        })
        .sort((a, b) => (deg < 0 ? a.fark - b.fark : b.fark - a.fark))
        .slice(0, 3)
        .filter((x) => (deg < 0 ? x.fark < 0 : x.fark > 0));
      const ilgiliNot = notBul(notlar, onceki8[0], son4Bit);
      t.push({
        anahtar: `trend:${k.k}`,
        imza: `${Math.round(deg * 20)}`,
        seviye: deg < 0 ? 'turuncu' : 'yesil',
        tur: deg < 0 ? 'Düşüş' : 'Yükseliş',
        baslik: `${k.k} ${deg < 0 ? 'düşüşte' : 'yükselişte'} (${deg > 0 ? '+' : '−'}%${Math.round(Math.abs(deg) * 100)})`,
        cumle: `Son 4 haftada haftalık ${tl(s)}, önceki 8 haftada ${tl(o)}. ${katki.length ? `En çok etkileyen: ${katki.map((x) => `${x.ad} (${isaretli(x.fark)}/hafta)`).join(', ')}.` : ''}`,
        etki: (s - o) * (30 / 7) * marj,
        etkiMetni: `kârda ayda ${isaretli((s - o) * (30 / 7) * marj)}`,
        aksiyon: ilgiliNot.length ? `Not: ${ilgiliNot.map((n) => n.metin).join(' · ')}` : deg < 0 ? 'Sebebini biliyorsan not düş (örn. tatil, inşaat).' : 'Neyin işe yaradığını not düş, tekrarlayalım.',
        kategori: k.k,
      });
    }
  }

  // 6) Yükselen yıldızlar
  for (const u of urunListe) {
    if (!u.eslesti || u.marj === null || u.marj < 0.5 || u.adet < 8 || u.oncekiHaftalikAdet <= 0) continue;
    if (u.haftalikAdet < u.oncekiHaftalikAdet * 1.5) continue;
    t.push({
      anahtar: `yildiz:${u.ad}`,
      imza: `${Math.round(u.haftalikAdet)}`,
      seviye: 'yesil',
      tur: 'Yükselen yıldız',
      baslik: u.ad,
      cumle: `Haftada ${u.oncekiHaftalikAdet.toLocaleString('tr-TR', { maximumFractionDigits: 1 })} adetten ${u.haftalikAdet.toLocaleString('tr-TR', { maximumFractionDigits: 1 })} adede çıktı, marjı ${yuzde(u.marj)}.`,
      etki: (u.haftalikAdet - u.oncekiHaftalikAdet) * (u.birimKar || 0) * (30 / 7),
      aksiyon: 'Öne çıkar: vitrinde/menüde görünür yap, kasada öner.',
      urun: u.ad,
    });
  }

  // 7a) Kâr hesabının kapsamadığı büyük ciro (kategori bazında)
  if (model.kapsama.oran < 0.9 && model.kapsama.bilinmeyen > 2000) {
    const ks = model.kapsama.kategoriler.slice(0, 4);
    t.push({
      anahtar: 'kapsama',
      imza: ks.map((x) => x.k).join('|'),
      seviye: model.kapsama.oran < 0.6 ? 'turuncu' : 'mavi',
      tur: 'Kâr hesabı eksik',
      baslik: `Cironun %${Math.round((1 - model.kapsama.oran) * 100)} kadarının maliyeti bilinmiyor`,
      cumle: `Son 4 haftada ${tl(model.kapsama.bilinmeyen)} ciro kâra katılamadı: ${ks.map((x) => `${x.k} (${tl(x.ciro)})`).join(', ')}. Kâr, hedef ve başabaş rakamları bu yüzden olduğundan düşük görünür.`,
      etki: 0,
      etkiMetni: `${tl(model.kapsama.bilinmeyen)} ciro`,
      aksiyon: 'Hızlı çözüm: Ayarlar\'da bu kategoriler için tahmini marj gir (ör. yemekler %55). Kesin çözüm: ürünleri eşleştir.',
      detay: { tip: 'arac', arac: 'ayarlar' },
    });
  }

  // 7) Maliyeti tanımsız ürünler
  const elleKat = (ayarlar && ayarlar.kategori_marj) || {};
  const eksik = urunListe.filter((u) => !u.eslesti && u.ciro >= 500 && (elleKat[u.k] === undefined || elleKat[u.k] === null || elleKat[u.k] === '')).sort((a, b) => b.ciro - a.ciro);
  if (eksik.length) {
    const ciro = eksik.reduce((x, u) => x + u.ciro, 0);
    t.push({
      anahtar: 'eslestirme',
      imza: eksik.map((u) => u.ad).join('|'),
      seviye: 'mavi',
      tur: 'Maliyet eksik',
      baslik: `${eksik.length} ürünün maliyeti tanımlı değil`,
      cumle: `Son 4 haftada ${tl(ciro)} ciro yaptılar ama kârları hesaplanamıyor. En büyükleri: ${eksik.slice(0, 4).map((u) => u.ad).join(', ')}.`,
      etki: 0,
      etkiMetni: `${tl(ciro)} ciro`,
      aksiyon: 'Eşleştirme ekranından malzemelerini ya da elle maliyetini gir.',
      detay: { tip: 'arac', arac: 'eslestirme' },
    });
  }

  // 8) Hedef / başabaş
  const hd = hedefHesap(model, ayarlar);
  if (hd.hedef && hd.geride) {
    t.push({
      anahtar: 'hedef',
      imza: `${model.bugun.slice(0, 7)}|${Math.round((hd.oran || 0) * 10)}`,
      seviye: 'kirmizi',
      tur: 'Hedef',
      baslik: 'Aylık kâr hedefinin gerisindesin',
      cumle: `Ayın %${Math.round(hd.beklenenOran * 100)} kadarı geçti, hedefe ulaşma oranı %${Math.round((hd.oran || 0) * 100)} (${tl(hd.kar)} / ${tl(hd.hedef)}).`,
      etki: hd.kar - hd.hedef * hd.beklenenOran,
      aksiyon: `Kalan ${hd.kalanIs} iş gününde günde ${tl(hd.gunlukGereken)} kâr gerekiyor.`,
    });
  }
  if (hd.sabit && hd.basabasOran !== null && hd.basabasOran < 1 && model.ay.gecenGun >= 5) {
    t.push({
      anahtar: 'basabas',
      imza: `${model.bugun.slice(0, 7)}|${Math.round(hd.basabasOran * 10)}`,
      seviye: 'kirmizi',
      tur: 'Başabaş',
      baslik: 'Bu ay şimdilik sabit giderleri karşılamıyor',
      cumle: `Ay başından brüt kâr ${tl(hd.kar)}; aynı sürede sabit gider ${tl((hd.sabit * model.ay.gecenGun) / model.ay.ayGun)}.`,
      etki: hd.kar - (hd.sabit * model.ay.gecenGun) / model.ay.ayGun,
      aksiyon: `Başabaş için günde yaklaşık ${tl(hd.gunlukBasabas)} brüt kâr gerekiyor.`,
    });
  }

  // 9) Fiyat bekçisi: son 30 günde değişen malzeme fiyatları
  const kullanim = malzemeKullanimi(model); // malzeme → aylık birim kullanım
  const sinir = gunEkle(model.bugun, -30);
  const sonDegisim = new Map();
  for (const f of fiyatGecmisi || []) {
    if (String(f.zaman).slice(0, 10) < sinir) continue;
    const x = sonDegisim.get(f.malzeme_id);
    if (!x) sonDegisim.set(f.malzeme_id, { ilkEski: Number(f.eski_fiyat), yeni: Number(f.yeni_fiyat), zaman: f.zaman });
    else x.ilkEski = Number(f.eski_fiyat); // liste yeniden eskiye sıralı
  }
  for (const [mid, x] of sonDegisim) {
    const m = malzMap.get(Number(mid));
    if (!m || x.ilkEski === x.yeni) continue;
    const carp = m.fiyat_turu === 'kg' ? (Number(m.birim_gram) || 0) / 1000 : 1;
    const fark = (x.yeni - x.ilkEski) * carp * (kullanim.get(Number(mid)) || 0);
    const etkilenen = urunListe
      .filter((u) => (maliyet.get(u.ad)?.kalemler || []).some((k) => k.m === Number(mid)))
      .map((u) => ({ ad: u.ad, fark: (maliyet.get(u.ad).kalemler.find((k) => k.m === Number(mid)).a * (x.yeni - x.ilkEski) * carp) }))
      .sort((a, b) => Math.abs(b.fark) - Math.abs(a.fark));
    t.push({
      anahtar: `malzfiyat:${mid}`,
      imza: `${x.ilkEski}|${x.yeni}`,
      seviye: x.yeni > x.ilkEski ? 'sari' : 'yesil',
      tur: 'Fiyat bekçisi',
      baslik: `${m.ad}: ${tl2(x.ilkEski)} → ${tl2(x.yeni)}${m.fiyat_turu === 'kg' ? '/kg' : ''}`,
      cumle: `${etkilenen.length} ürünün maliyeti değişti${etkilenen.length ? `, en çok: ${etkilenen.slice(0, 3).map((e) => `${e.ad} (${isaretli(e.fark).replace(' ₺', '')} ₺/adet)`).join(', ')}` : ''}.`,
      etki: -fark,
      etkiMetni: `maliyette ayda ${isaretli(fark)}`,
      aksiyon: x.yeni > x.ilkEski ? 'Etkilenen ürünlerin fiyatlarını gözden geçir (Simülatör).' : 'Maliyet düştü, kâr arttı.',
    });
  }

  // 10) Fire ve alım fiyatı (alım girildiyse)
  for (const f of fireHesap(model, alimlar || [])) {
    if (f.fireOran !== null && f.fireOran > 0.15 && f.fireTutar > 200) {
      t.push({
        anahtar: `fire:${f.malzeme.id}`,
        imza: `${f.bas}|${Math.round(f.fireOran * 20)}`,
        seviye: 'turuncu',
        tur: 'Fire / kayıp',
        baslik: `${f.malzeme.ad}: alınanın %${Math.round(f.fireOran * 100)} kadarı satışlarda görünmüyor`,
        cumle: `${tarihKisa(f.bas)} tarihinden beri ${f.alinan.toLocaleString('tr-TR', { maximumFractionDigits: 1 })} ${f.birim} alındı, satışlara göre ${f.teorik.toLocaleString('tr-TR', { maximumFractionDigits: 1 })} ${f.birim} kullanılmış olmalı.`,
        etki: -f.fireTutar,
        etkiMetni: `${tl(f.fireTutar)} kayıp`,
        aksiyon: 'Porsiyon fazla mı konuyor, bozulan mal mı var, ikramlar mı? Gramajı kontrol et.',
      });
    }
    if (f.ortFiyat && f.malzeme.fiyat && Math.abs(f.ortFiyat - f.malzeme.fiyat) / f.malzeme.fiyat > 0.1) {
      t.push({
        anahtar: `alimfiyat:${f.malzeme.id}`,
        imza: `${Math.round(f.ortFiyat)}|${Math.round(f.malzeme.fiyat)}`,
        seviye: 'sari',
        tur: 'Fiyat güncel değil',
        baslik: `${f.malzeme.ad}: listede ${tl2(f.malzeme.fiyat)}, alımlarda ${tl2(f.ortFiyat)}`,
        cumle: 'Maliyet hesapları listedeki fiyatı kullanıyor; gerçek alım fiyatı farklı.',
        etki: 0,
        etkiMetni: `fark ${yuzde((f.ortFiyat - f.malzeme.fiyat) / f.malzeme.fiyat)}`,
        aksiyon: 'Online Sipariş > Malzemeler\'den fiyatı güncelle.',
      });
    }
  }

  // 11) Komisyon oranı tanımsız
  if (ayarlar && (ayarlar.kart_komisyon === null || ayarlar.kart_komisyon === undefined || ayarlar.yemek_komisyon === null || ayarlar.yemek_komisyon === undefined)) {
    t.push({
      anahtar: 'komisyon',
      imza: 'v1',
      seviye: 'mavi',
      tur: 'Ayar eksik',
      baslik: 'Kart ve yemek kartı komisyon oranları girilmemiş',
      cumle: 'Girersen ödeme yöntemlerinin sana aylık ne kadara mal olduğunu gösteririm.',
      etki: 0,
      aksiyon: 'Ayarlar\'dan oranları gir.',
      detay: { tip: 'arac', arac: 'ayarlar' },
    });
  }

  // 12) Deneyler
  for (const dn of deneyler || []) {
    const s = deneySonuc(model, dn);
    if (!s) continue;
    t.push({
      anahtar: `deney:${dn.id}`,
      imza: `${s.sonrakiHafta}|${s.karar}`,
      seviye: s.karar === 'arttı' ? 'yesil' : s.karar === 'azaldı' ? 'turuncu' : 'mavi',
      tur: 'Deney',
      baslik: `${dn.ad}: ${s.metin}`,
      cumle: s.cumle,
      etki: s.fark * (30 / 7),
      etkiMetni: s.sonrakiHafta ? `${s.alan}: ayda ${isaretli(s.fark * (30 / 7))}` : 'ölçülüyor',
      aksiyon: s.oneri,
    });
  }

  // Görüldü işaretlenenleri gizle (durum değişince imza değişir ve kart geri gelir)
  const gordum = new Map((isaretler || []).filter((i) => i.anahtar.startsWith('gordum:')).map((i) => [i.anahtar.slice(7), i.imza]));
  const sirali = t
    .map((x) => ({ ...x, gizli: gordum.has(x.anahtar) && gordum.get(x.anahtar) === x.imza }))
    .sort((a, b) => SEVIYE[a.seviye] - SEVIYE[b.seviye] || Math.abs(b.etki || 0) - Math.abs(a.etki || 0));
  return sirali;
}

// Malzeme başına aylık kullanım (birim: malzeme kaydındaki birim — dilim, adet, ölçek…)
export function malzemeKullanimi(model) {
  const k = new Map();
  for (const u of model.urunListe) {
    const mal = model.maliyet.get(u.ad);
    if (!mal) continue;
    for (const x of mal.kalemler) k.set(x.m, (k.get(x.m) || 0) + x.a * u.adet * AYLIK);
  }
  return k;
}

// ---------- haftanın özeti (3 cümle) ----------
export function ozetCumleler(model, tespitler) {
  const ht = model.haftaToplam.filter((h) => h.h < model.buHafta);
  const son = ht[ht.length - 1];
  const onceki = ht[ht.length - 2];
  const c = [];
  if (son && onceki) {
    const d = onceki.c ? (son.c - onceki.c) / onceki.c : 0;
    c.push(`Geçen hafta (${tarihKisa(son.h)}–${tarihKisa(gunEkle(son.h, 6))}) ciro ${tl(son.c)}, tahmini brüt kâr ${tl(son.kar)}; bir önceki haftaya göre ${Math.abs(d) < 0.01 ? 'aynı' : d > 0 ? '%' + Math.round(d * 100) + ' fazla' : '%' + Math.round(-d * 100) + ' az'}.`);
  }
  if (son) {
    const enKarli = model.urunListe
      .filter((u) => u.eslesti)
      .map((u) => { const x = u.seri.get(son.h); return x ? { ad: u.ad, kar: x.c - x.a * model.maliyet.get(u.ad).birim } : null; })
      .filter(Boolean)
      .sort((a, b) => b.kar - a.kar)[0];
    const trendler = tespitler.filter((x) => x.anahtar.startsWith('trend:'));
    const yukselen = trendler.find((x) => x.seviye === 'yesil');
    const dusen = trendler.find((x) => x.seviye === 'turuncu');
    let s = enKarli ? `En çok kâr bırakan ürün ${enKarli.ad} (${tl(enKarli.kar)}).` : '';
    if (dusen) s += ` ${dusen.kategori} düşüşte.`;
    else if (yukselen) s += ` ${yukselen.kategori} yükselişte.`;
    if (s) c.push(s.trim());
  }
  const ilk = tespitler.find((x) => !x.gizli && (x.seviye === 'kirmizi' || x.seviye === 'turuncu'));
  if (ilk) c.push(`Öncelik: ${ilk.baslik} — ${ilk.aksiyon}`);
  else c.push('Acil bir sorun görünmüyor.');
  return c;
}

// ---------- ürün haritası ----------
export function urunHaritasi(model) {
  const l = model.urunListe.filter((u) => u.eslesti && u.adet >= 4 && u.marj !== null);
  if (!l.length) return null;
  const med = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
  const adetSinir = med(l.map((u) => u.adet));
  const marjSinir = Math.min(0.5, med(l.map((u) => u.marj)));
  const kutu = { yildiz: [], at: [], bulmaca: [], tas: [] };
  for (const u of l) {
    const cok = u.adet >= adetSinir;
    const karli = u.marj >= marjSinir;
    kutu[cok && karli ? 'yildiz' : cok ? 'at' : karli ? 'bulmaca' : 'tas'].push(u);
  }
  Object.values(kutu).forEach((x) => x.sort((a, b) => b.kar - a.kar));
  return { kutu, adetSinir, marjSinir };
}

// ---------- kanal & ödeme ----------
export function kanalHesap(model) {
  const k = new Map();
  for (const r of model.veri.kanal || []) {
    const x = k.get(r.n) || { ad: r.n, ciro: 0, mc: 0, kar: 0, adet: 0 };
    x.ciro += Number(r.c);
    x.adet += Number(r.a);
    const mal = model.maliyet.get(r.u);
    if (mal) {
      x.mc += Number(r.c);
      x.kar += Number(r.c) - Number(r.a) * mal.birim;
    }
    k.set(r.n, x);
  }
  return [...k.values()].map((x) => ({ ...x, marj: x.mc ? x.kar / x.mc : null })).sort((a, b) => b.ciro - a.ciro);
}
export function odemeHesap(model, ayarlar) {
  const kart = Number(ayarlar?.kart_komisyon);
  const yemek = Number(ayarlar?.yemek_komisyon);
  return (model.veri.odeme || [])
    .map((o) => {
      const oran = o.tur === 'Kredi Kartı' ? kart : o.tur === 'Yemek Kartı' ? yemek : 0;
      const tanimli = o.tur === 'Kredi Kartı' ? ayarlar?.kart_komisyon !== null && ayarlar?.kart_komisyon !== undefined : o.tur === 'Yemek Kartı' ? ayarlar?.yemek_komisyon !== null && ayarlar?.yemek_komisyon !== undefined : true;
      return { tur: o.tur, tutar: Number(o.tutar), oran: Number.isFinite(oran) ? oran : 0, maliyet: Number(o.tutar) * (Number.isFinite(oran) ? oran : 0), tanimli };
    })
    .sort((a, b) => b.tutar - a.tutar);
}

// ---------- saat haritası ----------
export function saatHaritasi(model) {
  const h = new Map();
  let max = 0;
  let enAz = 24;
  let enCok = 0;
  for (const r of model.veri.saat || []) {
    const c = Number(r.c) / 8; // 8 haftanın ortalaması
    h.set(`${r.d}-${r.s}`, c);
    if (c > max) max = c;
    if (c > 20) { enAz = Math.min(enAz, r.s); enCok = Math.max(enCok, r.s); }
  }
  const saatler = [];
  for (let s = enAz; s <= enCok; s++) saatler.push(s);
  return { h, max, saatler };
}

// ---------- birlikte satılanlar ----------
export function sepetHesap(model) {
  const sp = model.veri.sepet || {};
  const fis = Number(sp.fis) || 0;
  const tek = new Map((sp.tek || []).map((x) => [x.u, Number(x.n)]));
  return (sp.cift || [])
    .map((c) => {
      const na = tek.get(c.a) || 0;
      const nb = tek.get(c.b) || 0;
      const n = Number(c.n);
      return { a: c.a, b: c.b, n, aIle: na ? n / na : 0, bIle: nb ? n / nb : 0, lift: na && nb ? (n * fis) / (na * nb) : 0 };
    })
    .filter((x) => x.n >= 10)
    .sort((x, y) => Math.max(y.aIle, y.bIle) * Math.min(y.lift, 4) - Math.max(x.aIle, x.bIle) * Math.min(x.lift, 4));
}

// ---------- fire ----------
export function fireHesap(model, alimlar) {
  const sinir = gunEkle(model.bugun, -56);
  const grup = new Map();
  for (const a of alimlar) {
    if (a.tarih < sinir) continue;
    const g = grup.get(a.malzeme_id) || { miktar: 0, tutar: 0, bas: a.tarih };
    g.miktar += Number(a.miktar);
    g.tutar += Number(a.tutar);
    if (a.tarih < g.bas) g.bas = a.tarih;
    grup.set(a.malzeme_id, g);
  }
  const sonuc = [];
  for (const [mid, g] of grup) {
    const m = model.malzMap.get(Number(mid));
    if (!m) continue;
    // Teorik kullanım: alım başlangıcının haftasından bugüne kadar satılan ürünler × porsiyon
    const basH = haftaBasi(g.bas);
    let birimKullanim = 0;
    for (const u of model.urunListe) {
      const mal = model.maliyet.get(u.ad);
      const k = mal?.kalemler.find((x) => x.m === Number(mid));
      if (!k) continue;
      for (const [h, x] of u.seri) if (h >= basH) birimKullanim += x.a * k.a;
    }
    const kg = m.fiyat_turu === 'kg';
    const teorik = kg ? (birimKullanim * (Number(m.birim_gram) || 0)) / 1000 : birimKullanim;
    const ortFiyat = g.miktar ? g.tutar / g.miktar : null;
    const fireMiktar = g.miktar - teorik;
    sonuc.push({
      malzeme: m,
      bas: g.bas,
      birim: kg ? 'kg' : 'adet',
      alinan: g.miktar,
      tutar: g.tutar,
      teorik,
      ortFiyat,
      fireOran: g.miktar > 0 ? fireMiktar / g.miktar : null,
      fireTutar: Math.max(0, fireMiktar) * (ortFiyat || m.fiyat),
    });
  }
  return sonuc.sort((a, b) => b.fireTutar - a.fireTutar);
}

// ---------- deney ----------
export function deneySonuc(model, dn) {
  const basH = haftaBasi(dn.baslangic);
  const hs = model.haftaToplam.filter((h) => h.h < model.buHafta);
  // Kategorinin kârı hesaplanamıyorsa (maliyet yok) ciro karşılaştırılır.
  const ciroIle = dn.kategori ? model.katMarj(dn.kategori) === null && !(model.kategoriler.get(dn.kategori)?.hafta.size && [...model.kategoriler.get(dn.kategori).hafta.values()].some((x) => x.mc > 0)) : false;
  const katKar = (h) => {
    if (!dn.kategori) return hs.find((x) => x.h === h)?.kar || 0;
    let k = 0;
    for (const r of model.veri.haftalik || []) if (r.h === h && r.k === dn.kategori) k += ciroIle ? Number(r.c) : model.tahminiKar(r.u, r.k, Number(r.a), Number(r.c));
    return k;
  };
  const once = hs.filter((h) => h.h < basH).slice(-4).map((h) => katKar(h.h));
  const sonra = hs.filter((h) => h.h > basH || (h.h === basH && dn.baslangic === basH)).slice(0, 8).map((h) => katKar(h.h));
  const ort = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
  const urunAdet = (dn.urunler || []).reduce((t, ad) => {
    const u = model.urunMap.get(ad);
    if (!u) return t;
    let a = 0;
    for (const [h, x] of u.seri) if (h >= basH) a += x.a;
    return t + a;
  }, 0);
  const alan = dn.kategori ? `${dn.kategori} ${ciroIle ? 'cirosu' : 'kârı'}` : 'toplam kâr';
  if (!sonra.length) {
    return { alan, karar: 'bekliyor', metin: 'ölçülüyor', sonrakiHafta: 0, fark: 0, cumle: `${tarihKisa(dn.baslangic)} tarihinde başladı. İlk tam hafta bitince ${alan} öncesiyle karşılaştırılacak.${urunAdet ? ` Şimdiye kadar ${urunAdet} adet satıldı.` : ''}`, oneri: 'Bir hafta bekle.' };
  }
  const o = ort(once);
  const s = ort(sonra);
  const fark = s - o;
  const oran = o ? fark / Math.abs(o) : 0;
  const karar = oran > 0.05 ? 'arttı' : oran < -0.05 ? 'azaldı' : 'değişmedi';
  return {
    alan,
    karar,
    sonrakiHafta: sonra.length,
    fark,
    metin: `${alan} ${karar}`,
    cumle: `Önceki 4 hafta ortalaması ${tl(o)}/hafta, başladıktan sonraki ${sonra.length} hafta ${tl(s)}/hafta (${oran >= 0 ? '+' : ''}${yuzde(oran)}).${urunAdet ? ` Deney ürünlerinden ${urunAdet} adet satıldı.` : ''}`,
    oneri: karar === 'arttı' ? 'İşe yarıyor, devam et.' : karar === 'azaldı' ? 'Düştü: mevcut satışların yerine geçiyor olabilir, fiyatı/içeriği gözden geçir.' : sonra.length < 3 ? 'Henüz net değil, birkaç hafta daha bekle.' : 'Fark yaratmadı; ya geliştir ya bırak.',
  };
}

// ---------- simülatör ----------
export function urunSimulasyon(u, { yeniFiyat, porsiyon = 1, adetDegisim = 0 }) {
  const aylikAdet = u.adet * AYLIK;
  const once = (u.fiyat - u.birim) * aylikAdet;
  const yb = u.birim * porsiyon;
  const ya = aylikAdet * (1 + adetDegisim);
  const sonra = (yeniFiyat - yb) * ya;
  return { aylikAdet, once, sonra, fark: sonra - once, yeniMarj: yeniFiyat > 0 ? (yeniFiyat - yb) / yeniFiyat : null, yeniBirim: yb };
}
export function malzemeSimulasyon(model, malzemeId, yeniFiyat) {
  const m = model.malzMap.get(Number(malzemeId));
  if (!m) return null;
  const carp = m.fiyat_turu === 'kg' ? (Number(m.birim_gram) || 0) / 1000 : 1;
  const birimFark = (Number(yeniFiyat) - m.fiyat) * carp;
  const etkilenen = [];
  for (const u of model.urunListe) {
    const k = model.maliyet.get(u.ad)?.kalemler.find((x) => x.m === Number(malzemeId));
    if (!k) continue;
    const adetFark = k.a * birimFark;
    const yeniBirim = u.birim + adetFark;
    etkilenen.push({ ad: u.ad, adetFark, aylik: adetFark * u.adet * AYLIK, eskiMarj: u.marj, yeniMarj: u.fiyat ? (u.fiyat - yeniBirim) / u.fiyat : null });
  }
  etkilenen.sort((a, b) => Math.abs(b.aylik) - Math.abs(a.aylik));
  return { malzeme: m, etkilenen, aylik: etkilenen.reduce((t, e) => t + e.aylik, 0) };
}
export function yeniUrunHesap(model, kalemler, ekMaliyet, fiyat, gunlukHedefKar) {
  const maliyet = kalemler.reduce((t, k) => t + (Number(k.a) || 0) * birimMaliyet(model.malzMap.get(Number(k.m))), 0) + (Number(ekMaliyet) || 0);
  const kar = (Number(fiyat) || 0) - maliyet;
  return { maliyet, kar, marj: fiyat > 0 ? kar / fiyat : null, gunlukAdet: gunlukHedefKar && kar > 0 ? gunlukHedefKar / kar : null };
}
