import React, { useState, useMemo } from 'react';
import './MutfakPaneli.css';
import { TL } from '../../hooks/useHipposData';
import { Search, X, Send, ChefHat, Check } from 'lucide-react';

// Kategori eşleştirmesi büyük/küçük harf ve Türkçe karakter duyarlı yapılıyor —
// mevcut ürün verisinde kategoriler genelde BÜYÜK HARF ("YEMEKLER") tutuluyor.
function isYemek(p) {
  return (p.kategori || '').toLocaleLowerCase('tr-TR').includes('yemek');
}
function isZeytinyagli(p) {
  const a = (p.altKategori || '').toLocaleLowerCase('tr-TR');
  return a === 'yoğurt - z.yağlı';
}

function sortByMenu(list) {
  return [...list].sort((a, b) => a.menuSirasi - b.menuSirasi || a.ad.localeCompare(b.ad, 'tr'));
}

export default function MutfakPaneli({ data }) {
  const { products, applyMutfakMenusu } = data;

  const yemekler = useMemo(() => sortByMenu(products.filter((p) => isYemek(p) && !p.sabit && !p.isAzVariant)), [products]);
  const zeytinyaglilar = useMemo(() => sortByMenu(products.filter((p) => isZeytinyagli(p) && !p.sabit && !p.isAzVariant)), [products]);
  const relevantProductIds = useMemo(() => [...yemekler, ...zeytinyaglilar].map((p) => p.id), [yemekler, zeytinyaglilar]);

  // Sayfa her zaman TAMAMEN BOŞ (hepsi kapalı) başlar — personel sadece bugün açık olanı
  // işaretler, dünden kalanı kapatmakla hiç uğraşmaz.
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [search, setSearch] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [toast, setToast] = useState('');

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(''), 2000);
  }

  function toggleSelect(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function removeSelected(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  const q = search.trim().toLocaleLowerCase('tr-TR');
  const filteredYemekler = q ? yemekler.filter((p) => p.ad.toLocaleLowerCase('tr-TR').includes(q)) : yemekler;
  const filteredZeytinyagli = q ? zeytinyaglilar.filter((p) => p.ad.toLocaleLowerCase('tr-TR').includes(q)) : zeytinyaglilar;

  const selectedYemekler = sortByMenu(yemekler.filter((p) => selectedIds.has(p.id)));
  const selectedZeytinyagli = sortByMenu(zeytinyaglilar.filter((p) => selectedIds.has(p.id)));
  const toplamSecili = selectedYemekler.length + selectedZeytinyagli.length;
  const toplamDegisecek = relevantProductIds.filter((id) => {
    const p = products.find((x) => x.id === id);
    const willBeActive = selectedIds.has(id);
    return p && !p.sabit && (willBeActive ? p.durum !== 'AKTIF' : p.durum !== 'PASIF');
  }).length;

  function handleSend() {
    applyMutfakMenusu([...selectedIds], relevantProductIds);
    setConfirmOpen(false);
    showToast('Menü gönderildi');
  }

  return (
    <div className="mp-shell">
      <header className="mp-header">
        <ChefHat size={20} />
        <h1>Mutfak Paneli</h1>
      </header>

      <div className="mp-search">
        <Search size={18} />
        <input
          autoFocus
          placeholder="Ürün ara..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {search && <button onClick={() => setSearch('')}><X size={16} /></button>}
      </div>

      <div className="mp-list">
        {filteredYemekler.length > 0 && (
          <div className="mp-section">
            <h2>Yemekler</h2>
            <div className="mp-grid">
              {filteredYemekler.map((p) => (
                <button
                  key={p.id}
                  className={`mp-card ${selectedIds.has(p.id) ? 'selected' : ''}`}
                  onClick={() => toggleSelect(p.id)}
                >
                  {selectedIds.has(p.id) && <span className="mp-check"><Check size={13} /></span>}
                  <span className="mp-card-name">{p.ad}</span>
                  <span className="mp-card-price">{TL(p.fiyat)}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {filteredZeytinyagli.length > 0 && (
          <div className="mp-section">
            <h2>Zeytinyağlılar</h2>
            <div className="mp-grid">
              {filteredZeytinyagli.map((p) => (
                <button
                  key={p.id}
                  className={`mp-card ${selectedIds.has(p.id) ? 'selected' : ''}`}
                  onClick={() => toggleSelect(p.id)}
                >
                  {selectedIds.has(p.id) && <span className="mp-check"><Check size={13} /></span>}
                  <span className="mp-card-name">{p.ad}</span>
                  <span className="mp-card-price">{TL(p.fiyat)}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {filteredYemekler.length === 0 && filteredZeytinyagli.length === 0 && (
          <div className="mp-empty">
            {q ? 'Aramanla eşleşen ürün yok.' : 'Bu kategorilerde değişken ürün bulunamadı.'}
          </div>
        )}
      </div>

      <div className="mp-preview">
        <div className="mp-preview-scroll">
          {toplamSecili === 0 && <p className="mp-preview-empty">Henüz ürün seçilmedi.</p>}
          {selectedYemekler.length > 0 && (
            <div className="mp-preview-group">
              <h3>YEMEKLER</h3>
              {selectedYemekler.map((p) => (
                <div key={p.id} className="mp-preview-row">
                  <span>{p.ad}</span>
                  <button onClick={() => removeSelected(p.id)}><X size={14} /> Çıkart</button>
                </div>
              ))}
            </div>
          )}
          {selectedZeytinyagli.length > 0 && (
            <div className="mp-preview-group">
              <h3>ZEYTİNYAĞLILAR</h3>
              {selectedZeytinyagli.map((p) => (
                <div key={p.id} className="mp-preview-row">
                  <span>{p.ad}</span>
                  <button onClick={() => removeSelected(p.id)}><X size={14} /> Çıkart</button>
                </div>
              ))}
            </div>
          )}
        </div>
        <button className="mp-send-btn" onClick={() => setConfirmOpen(true)}>
          <Send size={18} /> MENÜYÜ GÖNDER
        </button>
      </div>

      {toast && <div className="mp-toast">{toast}</div>}

      {confirmOpen && (
        <div className="mp-modal-overlay" onClick={() => setConfirmOpen(false)}>
          <div className="mp-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Menüyü gönder?</h3>
            <p>
              {toplamSecili} ürün <strong>AKTİF</strong> olacak, bu kategorilerdeki seçilmeyen ürünler
              <strong> PASİF</strong> olacak. Hippos menüsü anında güncellenecek.
              {toplamDegisecek > 0 && ` (${toplamDegisecek} üründe değişiklik var)`}
            </p>
            <div className="mp-modal-actions">
              <button className="mp-modal-cancel" onClick={() => setConfirmOpen(false)}>Vazgeç</button>
              <button className="mp-modal-confirm" onClick={handleSend}>Evet, Gönder</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}