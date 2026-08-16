import React from 'react';
import * as MdiReactPkg from '@mdi/react';
import { Star } from 'lucide-react';
import * as mdiIcons from '@mdi/js';
import useFitText from '../hooks/useFitText';
import { resolveButtonStyle, resolveIconSize } from '../constants/themeDefaults';
import './ProductButton.css';

// @mdi/react CJS/ESM interop farklı bundler'larda farklı şekillerde export ediliyor
// (bazen module.default, bazen module.default.default). İkisini de güvenle dener.
const Icon = MdiReactPkg.default?.default || MdiReactPkg.default || MdiReactPkg.Icon;

// mdi ikon adını (örn. "mdi:cheese") @mdi/js export adına ("mdiCheese") çevirir.
function getMdiPath(mdiName) {
  if (!mdiName) return null;
  const key = 'mdi' + mdiName.replace(/^mdi:/, '').replace(/(^\w|-\w)/g, (s) => s.replace('-', '').toUpperCase());
  return mdiIcons[key] || null;
}

// Frontend'de buton yazısı basılırken product.sale_name kontrol edilir;
// boşsa (null/''), varsayılan olarak product.ad basılır.
export function getDisplayName(product) {
  return product?.satisAdi && product.satisAdi.trim() !== '' ? product.satisAdi : product?.ad;
}

export default function ProductButton({
  product,
  category,       // ilgili kategori objesi (fallback için)
  storeSettings,   // { global_font_size, global_icon_size }
  isFav,
  onClick,
}) {
  const style = resolveButtonStyle(product, category);
  const iconSize = resolveIconSize(category, storeSettings);
  const isCustomIcon = style.icon && style.icon.startsWith('custom:');
  const iconPath = isCustomIcon ? null : getMdiPath(style.icon);
  const customIconFile = isCustomIcon ? style.icon.replace('custom:', '') : null;
  const maxFontSize = storeSettings?.globalFontSize ?? 13;
  const displayName = getDisplayName(product);

  const { ref: nameRef, fontSize } = useFitText(displayName, maxFontSize);
  // 2 satır sabit kutu yüksekliği: her zaman TAVAN font boyutuna göre hesaplanır
  // (küçük font seçilse bile kutu küçülmez — böylece ölçüm referansı sabit kalır
  // ve büyüyebilen kısa isimler bu sabit alanı doldurabilir).
  const nameMaxHeight = Math.round(maxFontSize * 1.3 * 2);

  return (
    <button
      className={`pb-card ${isFav ? 'fav' : ''}`}
      style={{ background: style.backgroundColor }}
      onClick={onClick}
    >
      {(iconPath || customIconFile) && (
        <div className="pb-icon-box" style={{ width: iconSize + 16 }}>
          {iconPath ? (
            <Icon path={iconPath} size={iconSize / 24} color={style.textColor} />
          ) : (
            <span
              className="pb-custom-icon"
              style={{
                width: iconSize,
                height: iconSize,
                backgroundColor: style.textColor,
                WebkitMaskImage: `url(/food-icons/${customIconFile}.svg)`,
                maskImage: `url(/food-icons/${customIconFile}.svg)`,
              }}
            />
          )}
        </div>
      )}
      <div className="pb-text-box">
        <span
          ref={nameRef}
          className="pb-name"
          style={{
            color: style.textColor,
            fontStyle: style.italic ? 'italic' : 'normal',
            fontSize: fontSize + 'px',
            '--pb-name-max-h': nameMaxHeight + 'px',
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