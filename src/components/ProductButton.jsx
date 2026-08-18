import React, { useEffect, useState } from 'react';
import { Star } from 'lucide-react';
import { resolveButtonStyle } from '../constants/themeDefaults';
import './ProductButton.css';

// Frontend'de buton yazısı basılırken product.sale_name kontrol edilir;
// boşsa (null/''), varsayılan olarak product.ad basılır.
export function getDisplayName(product) {
  return product?.satisAdi && product.satisAdi.trim() !== '' ? product.satisAdi : product?.ad;
}

// public/food-icons-color/*.svg dosyalarını bir kez indirip modül seviyesinde (component'ler
// arası paylaşılan) bir cache'te tutar — aynı ikon birden fazla buton için tekrar
// indirilmez, eski/yavaş PC'lerde bile ağ isteği minimumda kalır.
const svgCache = new Map();
const svgListeners = new Map();

function useSvgIcon(fileName) {
  const [svg, setSvg] = useState(() => svgCache.get(fileName) || null);

  useEffect(() => {
    if (!fileName) return;
    if (svgCache.has(fileName)) {
      setSvg(svgCache.get(fileName));
      return;
    }
    let cancelled = false;
    if (!svgListeners.has(fileName)) svgListeners.set(fileName, []);
    svgListeners.get(fileName).push(setSvg);

    fetch(`/food-icons-color/${fileName}`)
      .then((res) => (res.ok ? res.text() : null))
      .then((text) => {
        if (!text) return;
        svgCache.set(fileName, text);
        (svgListeners.get(fileName) || []).forEach((fn) => fn(text));
        svgListeners.delete(fileName);
      })
      .catch(() => {});

    return () => {
      if (cancelled) return;
      cancelled = true;
    };
  }, [fileName]);

  return svg;
}

// React.memo: props (product/category/isFav referansları) değişmediği sürece
// bu buton yeniden render edilmez — satış sayfasında onlarca butonun aynı anda
// gereksiz re-render olmasını (donma/kasma hissi) engeller.
function ProductButton({ product, category, isFav, onClick }) {
  const style = resolveButtonStyle(product, category);
  const displayName = getDisplayName(product);
  const isSvgIcon = typeof style.icon === 'string' && style.icon.endsWith('.svg');
  const svgMarkup = useSvgIcon(isSvgIcon ? style.icon : null);

  return (
    <button
      className={`pb-card ${isFav ? 'fav' : ''}`}
      style={{ background: style.backgroundColor }}
      onClick={onClick}
    >
      {isSvgIcon && svgMarkup && (
        <span
          className="pb-icon-watermark pb-icon-svg"
          style={{ color: style.textColor }}
          aria-hidden="true"
          dangerouslySetInnerHTML={{ __html: svgMarkup }}
        />
      )}
      {!isSvgIcon && style.icon && (
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
          {displayName}
        </span>
        {isFav && <Star size={11} className="pb-star" fill="currentColor" style={{ color: style.textColor }} />}
      </div>
      {product.isAzVariant && <span className="ds-az-badge">AZ</span>}
      </button>
  );
}

export default React.memo(ProductButton);