import React, { useEffect, useState } from 'react';
import { Star } from 'lucide-react';
import { resolveButtonStyle } from '../constants/themeDefaults';
import './ProductButton.css';

export function getDisplayName(product) {
  return product?.satisAdi && product.satisAdi.trim() !== '' ? product.satisAdi : product?.ad;
}

// YEMEKLER kategorisi için: İlk harfler büyük, (Adet) silinmiş, küçük harfli
function toTitleCase(str) {
  if (!str) return "";
  let cleaned = str.replace(/\s*\(Adet\)\s*/gi, '').trim();
  return cleaned.toLowerCase().replace(/(^|\s)\S/g, l => l.toUpperCase());
}

const svgCache = new Map();
const pendingFetches = new Map();

function useSvgIcon(fileName) {
  const [svg, setSvg] = useState(() => (fileName ? svgCache.get(fileName) || null : null));

  useEffect(() => {
    if (!fileName) return;
    if (svgCache.has(fileName)) { setSvg(svgCache.get(fileName)); return; }
    let cancelled = false;
    if (!pendingFetches.has(fileName)) {
      const promise = fetch(`/food-icons-color/${fileName}`)
        .then((res) => (res.ok ? res.text() : null))
        .then((text) => { if (text) svgCache.set(fileName, text); pendingFetches.delete(fileName); return text; })
        .catch(() => { pendingFetches.delete(fileName); return null; });
      pendingFetches.set(fileName, promise);
    }
    pendingFetches.get(fileName).then((text) => { if (!cancelled && text) setSvg(text); });
    return () => { cancelled = true; };
  }, [fileName]);

  return svg;
}

function ProductButton({ product, category, isFav, onAdd, pairPosition }) {
  const style = resolveButtonStyle(product, category);
  const isSvgIcon = typeof style.icon === 'string' && style.icon.endsWith('.svg');
  const svgMarkup = useSvgIcon(isSvgIcon ? style.icon : null);

  const isYemekler = product.kategori === 'YEMEKLER';
  
  // Yemekler sayfasında special kurallar
  const finalDisplayName = isYemekler ? toTitleCase(getDisplayName(product)) : getDisplayName(product);
  const hideSvg = isYemekler; // Yemeklerde SVG iptal

  const pairClass = pairPosition === 'main' ? 'pb-pair-main' : pairPosition === 'az' ? 'pb-pair-az' : '';
  
  // Fiyat gösterimi: Yemekler kategorisinde, Ana üründe ve Tekli üründe gösterilir
  const showPrice = isYemekler && pairPosition !== 'az' && product.fiyat > 0;

  // ==========================================
  // AZ VARYANTI (Sağ %25'lik Koyu Şerit)
  // ==========================================
  if (pairPosition === 'az') {
    return (
      <button
        className={`pb-card pb-pair-az`}
        style={{ background: style.backgroundColor }}
        onClick={() => onAdd(product)}
      >
        <div className="pb-az-content">
          <span className="pb-az-label">AZ</span>
          <span className="pb-az-price">{Math.round(product.fiyat).toLocaleString('tr-TR')} ₺</span>
        </div>
      </button>
    );
  }

  // ==========================================
  // ANA ÜRÜN VE TEKLİ ÜRÜNLER
  // ==========================================
  return (
    <button
      className={`pb-card ${isFav ? 'fav' : ''} ${pairClass}`}
      style={{ background: style.backgroundColor }}
      onClick={() => onAdd(product)}
    >
      {/* SVG İKONLAR (Yemekler kategorisinde gizlenir) */}
      {isSvgIcon && svgMarkup && !hideSvg && (
        <span
          className="pb-icon-watermark pb-icon-svg"
          style={{ color: style.textColor }}
          aria-hidden="true"
          dangerouslySetInnerHTML={{ __html: svgMarkup }}
        />
      )}
      {!isSvgIcon && style.icon && !hideSvg && (
        <span className="pb-icon-watermark" aria-hidden="true">{style.icon}</span>
      )}
      
      <div className="pb-text-box">
        <span
          className="pb-name"
          style={{
            color: style.textColor,
            fontStyle: style.italic ? 'italic' : 'normal',
          }}
        >
          {finalDisplayName}
        </span>
        {isFav && <Star size={11} className="pb-star" fill="currentColor" style={{ color: style.textColor }} />}
      </div>
      
      {/* FİYAT (Pilsiz, düz metin) */}
      {showPrice && (
        <span className="pb-price" style={{ color: style.textColor }}>
          {Math.round(product.fiyat).toLocaleString('tr-TR')} ₺
        </span>
      )}
    </button>
  );
}

export default React.memo(ProductButton);