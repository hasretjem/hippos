import React, { useEffect, useMemo, useState } from 'react';
import { X, Search } from 'lucide-react';
import * as MdiReactPkg from '@mdi/react';
import * as mdiIcons from '@mdi/js';
import './IconPickerModal.css';

const Icon = MdiReactPkg.default?.default || MdiReactPkg.default || MdiReactPkg.Icon;

// @mdi/js'in export ettiği "mdiCheese" gibi adları "mdi:cheese" biçimine çevirir.
function toMdiName(exportKey) {
  // mdiCheese -> cheese, mdiArrowLeftBold -> arrow-left-bold
  const withoutPrefix = exportKey.replace(/^mdi/, '');
  const kebab = withoutPrefix.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
  return 'mdi:' + kebab;
}

// Tüm mdi ikon listesi bir kez, modül yüklenirken hazırlanır.
const MDI_ICONS = Object.keys(mdiIcons)
  .filter((k) => k.startsWith('mdi') && k.length > 3)
  .map((k) => ({ kind: 'mdi', name: toMdiName(k), label: toMdiName(k).replace('mdi:', ''), path: mdiIcons[k] }));

// Özel gıda/malzeme ikon seti — public/food-icons/index.json'dan runtime'da (bir kez) çekilir.
// İsimlendirme: "custom:dosya_adi" (uzantısız). SVG'ler CSS mask-image ile currentColor'a boyanır.
let customIconsCache = null;
function useCustomIcons() {
  const [icons, setIcons] = useState(customIconsCache || []);
  useEffect(() => {
    if (customIconsCache) return;
    fetch('/food-icons/index.json')
      .then((r) => r.json())
      .then((list) => {
        const mapped = list.map((it) => ({
          kind: 'custom',
          name: 'custom:' + it.file,
          label: it.label,
          file: it.file,
        }));
        customIconsCache = mapped;
        setIcons(mapped);
      })
      .catch(() => {});
  }, []);
  return icons;
}

export default function IconPickerModal({ open, currentIcon, onSelect, onClose }) {
  const [query, setQuery] = useState('');
  const customIcons = useCustomIcons();

  const allIcons = useMemo(() => [...customIcons, ...MDI_ICONS], [customIcons]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allIcons.slice(0, 60);
    return allIcons.filter((ic) => ic.label.includes(q) || ic.name.includes(q)).slice(0, 60);
  }, [query, allIcons]);

  if (!open) return null;

  return (
    <div className="ipm-overlay" onClick={onClose}>
      <div className="ipm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="ipm-header">
          <h3>İkon Seç</h3>
          <button className="ipm-close" onClick={onClose}><X size={20} /></button>
        </div>
        <div className="ipm-search">
          <Search size={16} />
          <input
            autoFocus
            type="text"
            placeholder="İkon ara (örn: cheese, coffee, pizza)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="ipm-grid">
          {currentIcon && (
            <button
              className="ipm-item ipm-clear"
              onClick={() => { onSelect(null); onClose(); }}
              title="İkonu kaldır"
            >
              <X size={22} />
              <span>Kaldır</span>
            </button>
          )}
          {results.map((ic) => (
            <button
              key={ic.name}
              className={`ipm-item ${ic.name === currentIcon ? 'active' : ''}`}
              onClick={() => { onSelect(ic.name); onClose(); }}
              title={ic.name}
            >
              {ic.kind === 'mdi' ? (
                <Icon path={ic.path} size={1} />
              ) : (
                <span
                  className="ipm-custom-icon"
                  style={{ WebkitMaskImage: `url(/food-icons/${ic.file}.svg)`, maskImage: `url(/food-icons/${ic.file}.svg)` }}
                />
              )}
              <span>{ic.label}</span>
            </button>
          ))}
          {results.length === 0 && (
            <div className="ipm-empty">Sonuç bulunamadı.</div>
          )}
        </div>
      </div>
    </div>
  );
}