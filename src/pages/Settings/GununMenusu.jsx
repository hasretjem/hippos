import React, { useState, useRef, useMemo } from 'react';
import './GununMenusu.css';
import sablonUrl from '../../assets/gunun-menusu-sablon.png';
import { X, Plus, Search, Download, Image as ImageIcon } from 'lucide-react';

// ============================================================
// GÜNÜN MENÜSÜ — ÖNİZLEME SİSTEMİ
// Bu ekran SADECE önizleme üretir. Hiçbir yere otomatik yayınlamaz,
// hiçbir Supabase tablosuna yazmaz. Onay alınmadan otomasyon eklenmeyecek.
// Figma koordinatları BİREBİR bu dosyada sabit — şablon boyutu asla değişmez.
// ============================================================

const CANVAS_W = 1080;
const CANVAS_H = 1920;
const FONT = 'Trocchi';

const SECTIONS = {
  corba: { label: 'Günün Çorbası', max: 1, startX: 125, startY: 546, priceRightX: 835, lineHeight: 0 },
  ana: { label: 'Ana Yemekler', max: 10, startX: 125, startY: 681, priceRightX: 940, lineHeight: 51 },
  yardimci: { label: 'Yardımcı Yemekler', max: 2, startX: 125, startY: 1310, priceRightX: 940, lineHeight: 51 },
  zeytinyagli: { label: 'Zeytinyağlılar', max: 6, startX: 125, startY: 1509, priceRightX: 940, lineHeight: 51 },
};
const DATE_X = 781;
const DATE_Y = 250;
const DATE_SIZE = 33.5;
const ITEM_FONT_SIZE = 39.5;
const MIN_FONT_SIZE = 22; // taşma durumunda ürün adı en fazla buraya kadar küçülür
const PRICE_GAP = 14; // isim ile fiyat arasında en az boşluk

// Türkçe karakterleri doğru işleyen "ilk harfler büyük" dönüşümü.
// Ayrıca "01- ", "09-" gibi iç kullanım (menü sırası) önekleri VE isim içindeki
// "(Adet)" / "Adet" ibareleri (fiyat formatı zaten bunu otomatik gösteriyor,
// isimde tekrar yazılmasın diye) temizlenir.
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

// Fiyat formatı artık ELLE seçilmiyor — az porsiyonu OLMAYAN ürünler otomatik
// "X TL/ADET", az porsiyonu OLAN ürünler "X TL" olarak yazılır.
function formatPrice(fiyat, azPorsiyon) {
  const sayi = Math.round(fiyat);
  return azPorsiyon ? `${sayi} TL` : `${sayi} TL/ADET`;
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

async function renderMenuCanvas({ tarihText, corba, ana, yardimci, zeytinyagli }) {
  // Canvas'a yazmadan önce font GERÇEKTEN yüklenmiş olmalı — aksi halde
  // tarayıcı sistem fontuna geri düşer (istenmeyen bir durum).
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
  ctx.textBaseline = 'alphabetic';

  // ---- Tarih ----
  ctx.font = `${DATE_SIZE}px "${FONT}"`;
  ctx.textAlign = 'left';
  ctx.fillText(tarihText.toLocaleUpperCase('tr-TR'), DATE_X, DATE_Y);

  // ---- Bir ürün satırı çizer: isim taşarsa SADECE isim küçülür, fiyat sabit kalır ----
  function drawRow(item, x, y, priceRightX) {
    const name = turkishTitleCase(item.ad);
    const price = formatPrice(item.fiyat, item.azPorsiyon);

    ctx.textAlign = 'right';
    ctx.font = `${ITEM_FONT_SIZE}px "${FONT}"`;
    ctx.fillText(price, priceRightX, y);
    const priceWidth = ctx.measureText(price).width;

    const availableWidth = priceRightX - priceWidth - PRICE_GAP - x;
    let size = ITEM_FONT_SIZE;
    ctx.font = `${size}px "${FONT}"`;
    while (ctx.measureText(name).width > availableWidth && size > MIN_FONT_SIZE) {
      size -= 0.5;
      ctx.font = `${size}px "${FONT}"`;
    }
    ctx.textAlign = 'left';
    ctx.fillText(name, x, y);
  }

  if (corba) {
    drawRow(corba, SECTIONS.corba.startX, SECTIONS.corba.startY, SECTIONS.corba.priceRightX);
  }
  ana.forEach((item, i) => {
    drawRow(item, SECTIONS.ana.startX, SECTIONS.ana.startY + i * SECTIONS.ana.lineHeight, SECTIONS.ana.priceRightX);
  });
  yardimci.forEach((item, i) => {
    drawRow(item, SECTIONS.yardimci.startX, SECTIONS.yardimci.startY + i * SECTIONS.yardimci.lineHeight, SECTIONS.yardimci.priceRightX);
  });
  zeytinyagli.forEach((item, i) => {
    drawRow(item, SECTIONS.zeytinyagli.startX, SECTIONS.zeytinyagli.startY + i * SECTIONS.zeytinyagli.lineHeight, SECTIONS.zeytinyagli.priceRightX);
  });

  return canvas.toDataURL('image/png');
}

function todayTr() {
  return new Date().toLocaleDateString('tr-TR', { weekday: 'long' }).toLocaleUpperCase('tr-TR');
}

const GUNUN_MENUSU_ESLESME = { corba: 'corba', ana: 'ana_yemek', yardimci: 'yardimci_yemek', zeytinyagli: 'zeytinyagli' };

// Günün Menüsü'ne özel sıralama: her bölüm kendi içinde "Günün Menüsü Sıra No"na göre
// küçükten büyüğe sıralanır (boş/eşit olanlar alfabetik ilerler). Genel menü sırasından
// (Menü Düzenleme'deki) BAĞIMSIZDIR.
function sortByGununMenusuSira(list) {
  return [...list].sort((a, b) => {
    const sa = a.gununMenusuSira ?? Infinity;
    const sb = b.gununMenusuSira ?? Infinity;
    return sa - sb || a.ad.localeCompare(b.ad, 'tr');
  });
}

// Ürün Yönetimi'nde etiketlenmiş ve o an AKTİF olan ürünleri, ilgili bölüme otomatik doldurur.
function initialSelectionFor(products, sectionKey, max) {
  const etiket = GUNUN_MENUSU_ESLESME[sectionKey];
  const eslesenler = sortByGununMenusuSira(
    products.filter((p) => p.gununMenusuKategori === etiket && p.durum === 'AKTIF' && !p.isAzVariant)
  );
  return eslesenler.slice(0, max).map((p) => ({ id: p.id, ad: p.ad, fiyat: p.fiyat, azPorsiyon: p.azPorsiyon, gununMenusuSira: p.gununMenusuSira }));
}

export default function GununMenusu({ data, onClose }) {
  const { products } = data;
  const [tarihText, setTarihText] = useState(todayTr());
  const [corba, setCorba] = useState(() => initialSelectionFor(products, 'corba', 1)[0] || null);
  const [ana, setAna] = useState(() => initialSelectionFor(products, 'ana', 10));
  const [yardimci, setYardimci] = useState(() => initialSelectionFor(products, 'yardimci', 2));
  const [zeytinyagli, setZeytinyagli] = useState(() => initialSelectionFor(products, 'zeytinyagli', 6));
  const [pickerFor, setPickerFor] = useState(null); // 'corba' | 'ana' | 'yardimci' | 'zeytinyagli' | null
  const [pickerSearch, setPickerSearch] = useState('');
  const [previewUrl, setPreviewUrl] = useState(null);
  const [rendering, setRendering] = useState(false);
  const [renderError, setRenderError] = useState('');

  const sectionState = { corba, ana, yardimci, zeytinyagli };
  const sectionSetters = { corba: setCorba, ana: setAna, yardimci: setYardimci, zeytinyagli: setZeytinyagli };

  function addItem(section, product) {
    const withFlag = { id: product.id, ad: product.ad, fiyat: product.fiyat, azPorsiyon: product.azPorsiyon, gununMenusuSira: product.gununMenusuSira };
    if (section === 'corba') {
      setCorba(withFlag);
      setPickerFor(null);
      return;
    }
    const setter = sectionSetters[section];
    const max = SECTIONS[section].max;
    setter((prev) => (prev.length >= max ? prev : sortByGununMenusuSira([...prev, withFlag])));
  }

  function removeItem(section, index) {
    if (section === 'corba') {
      setCorba(null);
      return;
    }
    sectionSetters[section]((prev) => prev.filter((_, i) => i !== index));
  }

  const pickerResults = useMemo(() => {
    if (!pickerFor) return [];
    const q = pickerSearch.trim().toLocaleLowerCase('tr-TR');
    return products
      .filter((p) => !p.isAzVariant && p.durum !== 'PASIF')
      .filter((p) => !q || p.ad.toLocaleLowerCase('tr-TR').includes(q))
      .slice(0, 60);
  }, [products, pickerFor, pickerSearch]);

  async function handlePreview() {
    setRendering(true);
    setRenderError('');
    try {
      const url = await renderMenuCanvas({ tarihText, corba, ana, yardimci, zeytinyagli });
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

  const toplamSecili = (corba ? 1 : 0) + ana.length + yardimci.length + zeytinyagli.length;

  return (
    <div className="gm-overlay">
      <div className="gm-shell">
        <div className="gm-header">
          <h2><ImageIcon size={18} /> Günün Menüsü — Önizleme</h2>
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
              const items = key === 'corba' ? (corba ? [corba] : []) : sectionState[key];
              return (
                <div key={key} className="gm-section">
                  <div className="gm-section-head">
                    <h3>{cfg.label}</h3>
                    <span>{items.length}/{cfg.max}</span>
                  </div>
                  <div className="gm-item-list">
                    {items.map((it, i) => (
                      <div key={it.id} className="gm-item-chip">
                        <span className="gm-item-name">{turkishTitleCase(it.ad)}</span>
                        <span className="gm-adet-badge">{formatPrice(it.fiyat, it.azPorsiyon)}</span>
                        <button className="gm-item-remove" onClick={() => removeItem(key, i)}><X size={13} /></button>
                      </div>
                    ))}
                    {items.length < cfg.max && (
                      <button className="gm-add-btn" onClick={() => { setPickerFor(key); setPickerSearch(''); }}>
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
              <h3>{SECTIONS[pickerFor].label} — Ürün Seç</h3>
              <button onClick={() => setPickerFor(null)}><X size={18} /></button>
            </div>
            <div className="gm-picker-search">
              <Search size={14} />
              <input autoFocus placeholder="Ürün ara..." value={pickerSearch} onChange={(e) => setPickerSearch(e.target.value)} />
            </div>
            <div className="gm-picker-list">
              {pickerResults.map((p) => (
                <button key={p.id} className="gm-picker-item" onClick={() => addItem(pickerFor, p)}>
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