import React, { useMemo, useState } from 'react';
import { X, Search } from 'lucide-react';
import Icon from '@mdi/react';
import * as mdiIcons from '@mdi/js';
import './IconPickerModal.css';

// @mdi/js'in export ettiği "mdiCheese" gibi adları "mdi:cheese" biçimine çevirir.
function toMdiName(exportKey) {
  // mdiCheese -> cheese, mdiArrowLeftBold -> arrow-left-bold
  const withoutPrefix = exportKey.replace(/^mdi/, '');
  const kebab = withoutPrefix.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
  return 'mdi:' + kebab;
}

// Tüm mdi ikon listesi bir kez, modül yüklenirken hazırlanır.
const ALL_ICONS = Object.keys(mdiIcons)
  .filter((k) => k.startsWith('mdi') && k.length > 3)
  .map((k) => ({ name: toMdiName(k), path: mdiIcons[k] }));

export default function IconPickerModal({ open, currentIcon, onSelect, onClose }) {
  const [query, setQuery] = useState('');

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ALL_ICONS.slice(0, 60);
    return ALL_ICONS.filter((ic) => ic.name.includes(q)).slice(0, 60);
  }, [query]);

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
              <Icon path={ic.path} size={1} />
              <span>{ic.name.replace('mdi:', '')}</span>
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