import React, { useState, useRef, useMemo } from 'react';
import './GununMenusu.css';
import sablonUrl from '../../assets/gunun-menusu-sablon.png';
import { X, Plus, Search, Download, Image as ImageIcon, AlertTriangle } from 'lucide-react';

// ============================================================
// GÜNÜN MENÜSÜ — ÖNİZLEME SİSTEMİ
// Bu ekran SADECE önizleme üretir. Hiçbir yere otomatik yayınlamaz,
// hiçbir Supabase tablosuna yazmaz. Onay alınmadan otomasyon eklenmeyecek.
// Figma koordinatları BİREBİR bu dosyada sabit — şablon boyutu asla değişmez.
//
// SLOT YAPISI:
// Her bölüm bir "slot dizisi" tutar. Her slot 1 veya 2 ürün içerebilir.
// 2 ürünlü slot: fiyat aynı + format aynı olmalı → "Ad1 / Ad2  Fiyat" tek satır.
// Görsel satır sayısı = slot sayısı (max = SECTIONS[key].max).
// Seçilebilecek toplam ürün sayısı = max × 2.
// ============================================================

const CANVAS_W = 1080;
const CANVAS_H = 1920;
const FONT = 'Trocchi';

const SECTIONS = {
  corba:      { label: 'Günün Çorbası',     max: 1,  startX: 125, startY: 546,  priceRightX: 940, lineHeight: 0  },
  ana:        { label: 'Ana Yemekler',       max: 10, startX: 125, startY: 681,  priceRightX: 940, lineHeight: 51 },
  yardimci:   { label: 'Yardımcı Yemekler', max: 2,  startX: 125, startY: 1310, priceRightX: 940, lineHeight: 51 },
  zeytinyagli:{ label: 'Zeytinyağlılar',    max: 6,  startX: 125, startY: 1509, priceRightX: 940, lineHeight: 51 },
};
const DATE_X = 781;
const DATE_Y = 250;
const DATE_SIZE = 33.5;
const ITEM_FONT_SIZE = 39.5;
const MIN_FONT_SIZE = 22;
const PRICE_GAP = 14;

function turkishTitleCase(raw) {
  const cleaned = raw
    .replace(/^\s*\d{1,3}\s*[-–]\s*/, '')
    .replace(/\(\s*adet\s*\)/gi, '')
    .replace(/\badet\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return cleaned
    .toLocaleLowerCase('tr-TR')
    .split(' ')
    .map((w) => (w.length > 0 ? w.charAt(0).toLocaleUpperCase('tr-TR') + w.slice(1) : w))
    .join(' ');
}

function formatPrice(fiyat, azPorsiyon) {
  const sayi = Math.round(fiyat);
  return azPorsiyon ? `${sayi} TL` : `${sayi} TL/ADET`;
}

// İki ürünün aynı slota girmesi için fiyat ve format ikisi de eşit olmalı.
function birlesebilirMi(a, b) {
  return Math.round(a.fiyat) === Math.round(b.fiyat) && !!a.azPorsiyon === !!b.azPorsiyon;
}

// İlk max ürünü tekli slotlara koy.
// max'ı aşan her ürün için: birleşebileceği tekli slotlar arasından adı en kısa olanı seç.
// Uygun tekli slot yoksa (fiyat/format uyumsuz veya hepsi dolu) → sığmayan sayısına ekle.
function urundenleriSlotlara(urunler, max) {
  const slots = urunler.slice(0, max).map((u) => ({ items: [u], zorla: false }));
  let sigmayanSayisi = 0;
  const sigmayanlar = [];

  for (let i = max; i < urunler.length; i++) {
    const yeni = urunler[i];

    // 1. Yeni ürünle doğrudan birleşebilecek tekli slot var mı?
    const tekliAdaylar = slots
      .map((slot, idx) => ({ slot, idx }))
      .filter(({ slot }) => slot.items.length === 1 && birlesebilirMi(slot.items[0], yeni));

    if (tekliAdaylar.length > 0) {
      tekliAdaylar.sort((a, b) =>
        turkishTitleCase(a.slot.items[0].ad).length - turkishTitleCase(b.slot.items[0].ad).length
      );
      slots[tekliAdaylar[0].idx].items.push(yeni);
      continue;
    }

    // 2. Doğrudan eşleşme yok — tekli slotlar arasında toplam ad uzunluğu en kısa çifti bul.
    const tekliSlotlar = slots
      .map((slot, idx) => ({ slot, idx }))
      .filter(({ slot }) => slot.items.length === 1);

    let enIyiCift = null;
    let enIyiUzunluk = Infinity;
    for (let a = 0; a < tekliSlotlar.length; a++) {
      for (let b = a + 1; b < tekliSlotlar.length; b++) {
        const sa = tekliSlotlar[a];
        const sb = tekliSlotlar[b];
        if (birlesebilirMi(sa.slot.items[0], sb.slot.items[0])) {
          const toplam =
            turkishTitleCase(sa.slot.items[0].ad).length +
            turkishTitleCase(sb.slot.items[0].ad).length;
          if (toplam < enIyiUzunluk) { enIyiUzunluk = toplam; enIyiCift = [sa, sb]; }
        }
      }
    }

    if (enIyiCift) {
      const [sa, sb] = enIyiCift;
      const [kisa, uzun] =
        turkishTitleCase(sa.slot.items[0].ad).length <= turkishTitleCase(sb.slot.items[0].ad).length
          ? [sa, sb] : [sb, sa];
      slots[kisa.idx].items.push(uzun.slot.items[0]);
      slots[uzun.idx] = { items: [yeni], zorla: true };
    } else {
      sigmayanSayisi++;
      sigmayanlar.push(yeni);
    }
  }

  // Zorla yerleştirilen slotları en alta taşı, items dizisine dönüştür
  const normal       = slots.filter((s) => !s.zorla).map((s) => s.items);
  const zorlaGirenler = slots.filter((s) =>  s.zorla).map((s) => s.items);
  return { slots: [...normal, ...zorlaGirenler], sigmayanSayisi, sigmayanlar };
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

async function renderMenuCanvas({ tarihText, corbaSlots, anaSlots, yardimciSlots, zeytinyagliSlots }) {
  await Promise.all([
    document.fonts.load(`${ITEM_FONT_SIZE}px "${FONT}"`),
    document.fonts.load(`${DATE_SIZE}px "${FONT}"`),
    document.fonts.load(`bold ${ITEM_FONT_SIZE}px "${FONT}"`),
  ]);
  await document.fonts.ready;

  const canvas = document.createElement('canvas');
  canvas.width = CANVAS_W;
  canvas.height = CANVAS_H;
  const ctx = canvas.getContext('2d');

  const sablon = await loadImage(sablonUrl);
  ctx.drawImage(sablon, 0, 0, CANVAS_W, CANVAS_H);

  ctx.fillStyle = '#000000';
  ctx.textBaseline = 'top';

  // Tarih
  ctx.font = `${DATE_SIZE}px "${FONT}"`;
  ctx.textAlign = 'left';
  ctx.fillText(tarihText.toLocaleUpperCase('tr-TR'), DATE_X, DATE_Y);

  // Bir slot çizer: tek ürünse normal, çiftse "Ad1 / Ad2" sol, fiyat sağ.
  function drawSlot(slot, x, y, priceRightX) {
    const price = formatPrice(slot[0].fiyat, slot[0].azPorsiyon);
    const nameRaw = slot.length === 2
      ? `${turkishTitleCase(slot[0].gorunumAdi || slot[0].ad)} / ${turkishTitleCase(slot[1].gorunumAdi || slot[1].ad)}`
      : turkishTitleCase(slot[0].gorunumAdi || slot[0].ad);

    // Önce isim için gereken puntoyu hesapla (fiyat genişliğini sabit tutarak)
    ctx.font = `${ITEM_FONT_SIZE}px "${FONT}"`;
    ctx.textAlign = 'right';
    const priceWidthRef = ctx.measureText(price).width;

    const availableWidth = priceRightX - priceWidthRef - PRICE_GAP - x;
    let size = ITEM_FONT_SIZE;
    ctx.font = `${size}px "${FONT}"`;
    while (ctx.measureText(nameRaw).width > availableWidth && size > MIN_FONT_SIZE) {
      size -= 0.5;
      ctx.font = `${size}px "${FONT}"`;
    }

    // İsim ve fiyat aynı nihai puntoyla çizilir
    ctx.font = `${size}px "${FONT}"`;
    ctx.textAlign = 'left';
    ctx.fillText(nameRaw, x, y);
    ctx.textAlign = 'right';
    ctx.fillText(price, priceRightX, y);
  }

  const pairs = [
    { slots: corbaSlots,      sec: SECTIONS.corba       },
    { slots: anaSlots,        sec: SECTIONS.ana          },
    { slots: yardimciSlots,   sec: SECTIONS.yardimci     },
    { slots: zeytinyagliSlots,sec: SECTIONS.zeytinyagli  },
  ];
  for (const { slots, sec } of pairs) {
    slots.forEach((slot, i) => {
      drawSlot(slot, sec.startX, sec.startY + i * sec.lineHeight, sec.priceRightX);
    });
  }

  return canvas.toDataURL('image/png');
}

function todayTr() {
  return new Date().toLocaleDateString('tr-TR', { weekday: 'long' }).toLocaleUpperCase('tr-TR');
}

const GUNUN_MENUSU_ESLESME = { corba: 'corba', ana: 'ana_yemek', yardimci: 'yardimci_yemek', zeytinyagli: 'zeytinyagli' };

function sortByGununMenusuSira(list) {
  return [...list].sort((a, b) => {
    const sa = a.gununMenusuSira ?? Infinity;
    const sb = b.gununMenusuSira ?? Infinity;
    return sa - sb || a.ad.localeCompare(b.ad, 'tr');
  });
}

// Aktif + etiketli ürünleri alır, sıralar, slot dizisine çevirir.
function initialSlotsFor(products, sectionKey) {
  const max = SECTIONS[sectionKey].max;
  const etiket = GUNUN_MENUSU_ESLESME[sectionKey];
  const eslesenler = sortByGununMenusuSira(
    products.filter((p) => p.gununMenusuKategori === etiket && p.durum === 'AKTIF' && !p.isAzVariant)
  ).map((p) => ({ ...p, gorunumAdi: p.satisAdi || p.ad }));
  // Tümünü ver — urundenleriSlotlara kendi içinde max kontrolü yapar
  return urundenleriSlotlara(eslesenler, max);
}

export default function GununMenusu({ data, onClose }) {
  const { products } = data;

  const [tarihText, setTarihText] = useState(todayTr());

  // Her bölüm için slot dizisi + kaç ürün sığmadı (uyarı için)
  const [corbaSlots,      setCorbaSlots]      = useState(() => initialSlotsFor(products, 'corba').slots);
  const [anaSlots,        setAnaSlots]        = useState(() => initialSlotsFor(products, 'ana').slots);
  const [yardimciSlots,   setYardimciSlots]   = useState(() => initialSlotsFor(products, 'yardimci').slots);
  const [zeytinyagliSlots,setZeytinyagliSlots]= useState(() => initialSlotsFor(products, 'zeytinyagli').slots);

  // Başlangıçta sığmayan ürün sayısı (uyarı)
  const [corbaAtlanan,       setCorbaAtlanan]       = useState(() => initialSlotsFor(products, 'corba').sigmayanSayisi);
  const [anaAtlanan,         setAnaAtlanan]         = useState(() => initialSlotsFor(products, 'ana').sigmayanSayisi);
  const [yardimciAtlanan,    setYardimciAtlanan]    = useState(() => initialSlotsFor(products, 'yardimci').sigmayanSayisi);
  const [zeytinyagliAtlanan, setZeytinyagliAtlanan] = useState(() => initialSlotsFor(products, 'zeytinyagli').sigmayanSayisi);

  const [corbaAtlananList,       setCorbaAtlananList]       = useState(() => initialSlotsFor(products, 'corba').sigmayanlar);
  const [anaAtlananList,         setAnaAtlananList]         = useState(() => initialSlotsFor(products, 'ana').sigmayanlar);
  const [yardimciAtlananList,    setYardimciAtlananList]    = useState(() => initialSlotsFor(products, 'yardimci').sigmayanlar);
  const [zeytinyagliAtlananList, setZeytinyagliAtlananList] = useState(() => initialSlotsFor(products, 'zeytinyagli').sigmayanlar);

  const [pickerFor,    setPickerFor]    = useState(null); // { section, slotIdx, pozisyon: 0|1 } | null
  const [pickerSearch, setPickerSearch] = useState('');
  const [previewUrl,   setPreviewUrl]   = useState(null);
  const [rendering,    setRendering]    = useState(false);
  const [renderError,  setRenderError]  = useState('');

  const sectionSlots   = { corba: corbaSlots, ana: anaSlots, yardimci: yardimciSlots, zeytinyagli: zeytinyagliSlots };
  const sectionSetters = { corba: setCorbaSlots, ana: setAnaSlots, yardimci: setYardimciSlots, zeytinyagli: setZeytinyagliSlots };
  const atlananSetters     = { corba: setCorbaAtlanan, ana: setAnaAtlanan, yardimci: setYardimciAtlanan, zeytinyagli: setZeytinyagliAtlanan };
  const atlananListSetters = { corba: setCorbaAtlananList, ana: setAnaAtlananList, yardimci: setYardimciAtlananList, zeytinyagli: setZeytinyagliAtlananList };
  const toplamAtlananList  = [...corbaAtlananList, ...anaAtlananList, ...yardimciAtlananList, ...zeytinyagliAtlananList];
  const atlananDeger   = { corba: corbaAtlanan, ana: anaAtlanan, yardimci: yardimciAtlanan, zeytinyagli: zeytinyagliAtlanan };

  const toplamAtlanan = corbaAtlanan + anaAtlanan + yardimciAtlanan + zeytinyagliAtlanan;

  // Slot sayısını hesapla (picker başlığı için)
  function slotSayisi(key) { return sectionSlots[key].length; }

  // Bir slottan ikinci ürünü çıkar (slot tekli kalır)
  function removeSecond(section, slotIdx) {
    sectionSetters[section]((prev) => {
      const next = prev.map((slot, i) => i === slotIdx ? [slot[0]] : slot);
      return next;
    });
  }

  // Slotu tamamen kaldır
  function removeSlot(section, slotIdx) {
    sectionSetters[section]((prev) => prev.filter((_, i) => i !== slotIdx));
    atlananSetters[section](0);
    atlananListSetters[section]([]);
  }

  // Picker'dan ürün seç
  // pickerFor.pozisyon === 0 → yeni slot ekle (en sona)
  // pickerFor.pozisyon === 1 → mevcut slota ikinci ürün ekle
  function addItem(product) {
    if (!pickerFor) return;
    const { section, slotIdx, pozisyon } = pickerFor;
    const max = SECTIONS[section].max;
    const urun = { id: product.id, ad: product.ad, gorunumAdi: product.satisAdi || product.ad, fiyat: product.fiyat, azPorsiyon: product.azPorsiyon, gununMenusuSira: product.gununMenusuSira };

    sectionSetters[section]((prev) => {
      let next = [...prev];
      if (pozisyon === 1) {
        // Mevcut slota ikinci ürün ekle
        const eskiSlot = next[slotIdx];
        next[slotIdx] = [eskiSlot[0], urun];
      } else {
        // Yeni slot olarak ekle (kapasite doluysa ekleme)
        if (next.length < max) {
          next = [...next, [urun]];
        }
      }
      return next;
    });
    setPickerFor(null);
    setPickerSearch('');
    atlananSetters[section](0);
    atlananListSetters[section]([]);
  }

  // Picker için: seçilebilecek ürünler (az varinat değil, aktif, arama eşleşmesi)
  // Eğer ikinci ürün ekliyorsak (pozisyon===1), sadece birleşebilir olanları göster
  const pickerResults = useMemo(() => {
    if (!pickerFor) return [];
    const q = pickerSearch.trim().toLocaleLowerCase('tr-TR');
    let liste = products
      .filter((p) => !p.isAzVariant && p.durum !== 'PASIF')
      .filter((p) => !q || p.ad.toLocaleLowerCase('tr-TR').includes(q));

    if (pickerFor.pozisyon === 1) {
      const mevcutSlot = sectionSlots[pickerFor.section][pickerFor.slotIdx];
      if (mevcutSlot && mevcutSlot[0]) {
        liste = liste.filter((p) => birlesebilirMi(mevcutSlot[0], p));
      }
    }
    return liste.slice(0, 60);
  }, [products, pickerFor, pickerSearch, sectionSlots]);

  async function handlePreview() {
    setRendering(true);
    setRenderError('');
    try {
      const url = await renderMenuCanvas({
        tarihText,
        corbaSlots, anaSlots, yardimciSlots, zeytinyagliSlots,
      });
      setPreviewUrl(url);
    } catch (err) {
      setRenderError('Önizleme oluşturulamadı: ' + (err?.message || 'bilinmeyen hata'));
    }
    setRendering(false);
  }

  function handleDownload() {
    if (!previewUrl) return;
    const a = document.createElement('a');
    a.href = previewUrl;
    a.download = `gunun-menusu-${new Date().toISOString().slice(0, 10)}.png`;
    a.click();
  }

  const toplamSecili = [corbaSlots, anaSlots, yardimciSlots, zeytinyagliSlots]
    .reduce((acc, slots) => acc + slots.reduce((a, s) => a + s.length, 0), 0);

  return (
    <div className="gm-overlay">
      <div className="gm-shell">
        <div className="gm-header">
          <h2 style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <ImageIcon size={18} /> Günün Menüsü — Önizleme
            {toplamAtlanan > 0 && (
              <span className="gm-uyari-badge">
                <AlertTriangle size={24} />
                <span>
                  Hata — Bütün Ürünler Açılamadı! Kontrol Ediniz.
                  <span className="gm-uyari-urunler">
                    {toplamAtlananList.map((u) => turkishTitleCase(u.gorunumAdi || u.ad)).join(', ')}
                  </span>
                </span>
              </span>
            )}
          </h2>
          <button className="gm-close" onClick={onClose}><X size={20} /></button>
        </div>
        <p className="gm-warning">
          Bu ekran SADECE önizleme üretir — hiçbir yere otomatik paylaşılmaz, hiçbir kayıt oluşturmaz.
          Onayladıktan sonra otomasyon adımını birlikte ekleriz.
        </p>

        <div className="gm-body">
          <div className="gm-form">
            <div className="gm-field">
              <label>Gün (görselde büyük harfle yazılır — örn. PAZARTESİ)</label>
              <input value={tarihText} onChange={(e) => setTarihText(e.target.value)} />
            </div>

            {Object.entries(SECTIONS).map(([key, cfg]) => {
              const slots = sectionSlots[key];
              const slotDolu = slots.length;
              const urunsayisi = slots.reduce((a, s) => a + s.length, 0);
              return (
                <div key={key} className="gm-section">
                  <div className="gm-section-head">
                    <h3>{cfg.label}</h3>
                    <span>{slotDolu}/{cfg.max} satır · {urunsayisi} ürün</span>
                  </div>
                  <div className="gm-item-list">
                    {slots.map((slot, slotIdx) => (
                      <div key={slotIdx} className="gm-item-chip">
                        <div className="gm-slot-names">
                          {slot.length === 2 ? (
                            <>
                              <span className="gm-item-name">
                                {turkishTitleCase(slot[0].gorunumAdi || slot[0].ad)}
                                <span className="gm-slash"> / </span>
                                {turkishTitleCase(slot[1].gorunumAdi || slot[1].ad)}
                              </span>
                              {/* İkinci ürünü çıkar (slot tekli kalır) */}
                              <button
                                className="gm-item-remove gm-remove-second"
                                title="İkinci ürünü çıkar"
                                onClick={() => removeSecond(key, slotIdx)}
                              >
                                <X size={11} />
                              </button>
                            </>
                          ) : (
                            <>
                              <span className="gm-item-name">{turkishTitleCase(slot[0].gorunumAdi || slot[0].ad)}</span>
                              {/* Tekli slota ikinci ürün ekle */}
                              <button
                                className="gm-add-second"
                                title="Bu satıra ikinci ürün ekle"
                                onClick={() => { setPickerFor({ section: key, slotIdx, pozisyon: 1 }); setPickerSearch(''); }}
                              >
                                <Plus size={11} />
                              </button>
                            </>
                          )}
                        </div>
                        <span className="gm-adet-badge">{formatPrice(slot[0].fiyat, slot[0].azPorsiyon)}</span>
                        {/* Slotu tamamen kaldır */}
                        <button className="gm-item-remove" onClick={() => removeSlot(key, slotIdx)}><X size={13} /></button>
                      </div>
                    ))}
                    {slotDolu < cfg.max && (
                      <button
                        className="gm-add-btn"
                        onClick={() => { setPickerFor({ section: key, slotIdx: null, pozisyon: 0 }); setPickerSearch(''); }}
                      >
                        <Plus size={13} /> Ürün Ekle
                      </button>
                    )}
                  </div>
                </div>
              );
            })}

            <button className="gm-preview-btn" onClick={handlePreview} disabled={rendering || toplamSecili === 0}>
              {rendering ? 'Oluşturuluyor...' : 'Günün Menüsü Önizle'}
            </button>
            {renderError && <p className="gm-error">{renderError}</p>}
          </div>

          <div className="gm-preview-pane">
            {!previewUrl && !rendering && (
              <div className="gm-preview-empty">
                <ImageIcon size={28} />
                <p>Ürünleri seç, sonra "Günün Menüsü Önizle"ye bas.</p>
              </div>
            )}
            {rendering && <div className="gm-preview-empty"><p>Görsel oluşturuluyor...</p></div>}
            {previewUrl && !rendering && (
              <>
                <img src={previewUrl} alt="Günün menüsü önizleme" className="gm-preview-img" />
                <button className="gm-download-btn" onClick={handleDownload}><Download size={14} /> Görseli İndir</button>
              </>
            )}
          </div>
        </div>
      </div>

      {pickerFor && (
        <div className="gm-picker-overlay" onClick={() => setPickerFor(null)}>
          <div className="gm-picker" onClick={(e) => e.stopPropagation()}>
            <div className="gm-picker-head">
              <h3>
                {pickerFor.pozisyon === 1
                  ? `${SECTIONS[pickerFor.section].label} — İkinci Ürün Seç`
                  : `${SECTIONS[pickerFor.section].label} — Ürün Seç`}
              </h3>
              <button onClick={() => setPickerFor(null)}><X size={18} /></button>
            </div>
            {pickerFor.pozisyon === 1 && (
              <p className="gm-picker-hint">Sadece aynı fiyat ve formattaki ürünler gösterilir.</p>
            )}
            <div className="gm-picker-search">
              <Search size={14} />
              <input autoFocus placeholder="Ürün ara..." value={pickerSearch} onChange={(e) => setPickerSearch(e.target.value)} />
            </div>
            <div className="gm-picker-list">
              {pickerResults.map((p) => (
                <button key={p.id} className="gm-picker-item" onClick={() => addItem(p)}>
                  <span>{turkishTitleCase(p.ad)}</span>
                  <span className="gm-picker-price">{formatPrice(p.fiyat, p.azPorsiyon)}</span>
                </button>
              ))}
              {pickerResults.length === 0 && <p className="gm-empty">Ürün bulunamadı.</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}