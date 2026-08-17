import React from 'react';
import { Star } from 'lucide-react';
import { resolveButtonStyle } from '../constants/themeDefaults';
import './ProductButton.css';

// Frontend'de buton yazısı basılırken product.sale_name kontrol edilir;
// boşsa (null/''), varsayılan olarak product.ad basılır.
export function getDisplayName(product) {
  return product?.satisAdi && product.satisAdi.trim() !== '' ? product.satisAdi : product?.ad;
}

// React.memo: props (product/category/isFav referansları) değişmediği sürece
// bu buton yeniden render edilmez — satış sayfasında onlarca butonun aynı anda
// gereksiz re-render olmasını (donma/kasma hissi) engeller.
function ProductButton({ product, category, isFav, onClick }) {
  const style = resolveButtonStyle(product, category);
  const displayName = getDisplayName(product);

  return (
    <button
      className={`pb-card ${isFav ? 'fav' : ''}`}
      style={{ background: style.backgroundColor }}
     onClick={onClick}
    >
      {style.icon && <span className="pb-icon-watermark" aria-hidden="true">{style.icon}</span>}
      <div className="pb-text-box">
        <span
          className="pb-name"
          style={{
            color: style.textColor,
            fontStyle: style.italic ? 'italic' : 'normal',
          }}
        >
          {product.bicakGerekli && <span className="ds-bicak-mark" title="Bıçak gerekli">🔪</span>}
          {product.ekmekGerekli && <span className="ds-ekmek-mark" title="Ekmek gerekli">🥖</span>}
          {displayName}
        </span>
        {isFav && <Star size={11} className="pb-star" fill="currentColor" style={{ color: style.textColor }} />}
      </div>
      {product.isAzVariant && <span className="ds-az-badge">AZ</span>}
    </button>
  );
}

export default React.memo(ProductButton);