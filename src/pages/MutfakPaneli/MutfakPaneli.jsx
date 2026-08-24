import React, { useState, useMemo, useRef } from 'react';
import './MutfakPaneli.css';
import { Search, X, Send, ShoppingBag } from 'lucide-react';
import { resolveButtonStyle } from '../../constants/themeDefaults';

function isZeytinyagli(p) {
  const a = (p.altKategori || '').toLocaleLowerCase('tr-TR');
  return a === 'yoğurt - z.yağlı';
}
function isYemek(p) {
  if (isZeytinyagli(p)) return false;
  return (p.kategori || '').toLocaleLowerCase('tr-TR').includes('yemek');
}
function sortByMenu(list) {
  return [...list].sort((a, b) => a.menuSirasi - b.menuSirasi || a.ad.localeCompare(b.ad, 'tr'));
}

const WIZARD_STEPS = [
  {
    soru: 'Menüde hangi çorba var?',
    isimler: ['Ezogelin Çorbası', 'Mercimek Çorbası', 'Yayla Çorbası', 'Domates Çorbası', 'Şehriyeli Tavuk Suyu Çorbası'],
    yokButon: 'Hiçbiri',
    coklu: true,
  },
  {
    soru: 'Menüde hangi baklagil / ana yemek var?',
    isimler: ['Kuru Fasülye', 'Nohut', 'Taze Fasülye'],
    yokButon: 'Hiçbiri Yok',
    coklu: true,
  },
];

export default function MutfakPaneli({ data }) {
  const { products, categories, applyMutfakMenusu } = data;

  const yemekler = useMemo(
    () => sortByMenu(products.filter((p) => isYemek(p) && !p.sabit && !p.isAzVariant)),
    [products],
  );
  const zeytinyaglilar = useMemo(
    () => sortByMenu(products.filter((p) => isZeytinyagli(p) && !p.sabit && !p.isAzVariant)),
    [products],
  );

  // parentId → az varyant ID eşlemesi — gönderimde otomatik eklenir
  const azVariantMap = useMemo(() => {
    const m = {};
    products.forEach((p) => { if (p.isAzVariant && p.parentId) m[p.parentId] = p.id; });
    return m;
  }, [products]);

  // applyMutfakMenusu'nun yönettiği ID'ler: ana ürünler + az varyantları
  const relevantProductIds = useMemo(() => {
    const ids = [...yemekler, ...zeytinyaglilar].map((p) => p.id);
    ids.forEach((id) => { if (azVariantMap[id]) ids.push(azVariantMap[id]); });
    return ids;
  }, [yemekler, zeytinyaglilar, azVariantMap]);

  const categoryMap = useMemo(() => {
    const m = {};
    (categories || []).forEach((c) => { m[c.ad] = c; });
    return m;
  }, [categories]);

  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [search, setSearch] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [toast, setToast] = useState('');
  const searchRef = useRef(null);
  const listRef = useRef(null);

  const [phase, setPhase] = useState('idle');
  const [wizardStep, setWizardStep] = useState(0);
  const [wizardSeçimler, setWizardSeçimler] = useState([new Set(), new Set()]);
  const [wizardEkIds, setWizardEkIds] = useState(new Set());

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(''), 2000);
  }

  function toggleSelect(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function removeSelected(id) {
    setSelectedIds((prev) => { const n = new Set(prev); n.delete(id); return n; });
  }

  // Arama dropdown'ından seçim: metni sil, klavye açık kalsın
  function handleSearchSelect(p) {
    toggleSelect(p.id);
    setSearch('');
    searchRef.current?.focus();
  }

  const q = search.trim().toLocaleLowerCase('tr-TR');
  const filteredYemekler = q
    ? yemekler.filter((p) => p.ad.toLocaleLowerCase('tr-TR').includes(q))
    : yemekler;
  const filteredZeytinyagli = q
    ? zeytinyaglilar.filter((p) => p.ad.toLocaleLowerCase('tr-TR').includes(q))
    : zeytinyaglilar;

  const selectedYemekler = sortByMenu(yemekler.filter((p) => selectedIds.has(p.id)));
  const selectedZeytinyagli = sortByMenu(zeytinyaglilar.filter((p) => selectedIds.has(p.id)));
  const toplamSecili = selectedIds.size;

  function handleGonderClick() {
    setWizardStep(0);
    setWizardSeçimler([new Set(), new Set()]);
    setWizardEkIds(new Set());
    setPhase('wizard');
    setDrawerOpen(false);
  }

  function wizardToggleIsim(stepIdx, isim) {
    setWizardSeçimler((prev) => {
      const next = prev.map((s) => new Set(s));
      if (next[stepIdx].has(isim)) next[stepIdx].delete(isim); else next[stepIdx].add(isim);
      return next;
    });
  }

  function wizardIleri() {
    if (wizardStep < WIZARD_STEPS.length - 1) {
      setWizardStep((s) => s + 1);
    } else {
      const isimler = new Set();
      wizardSeçimler.forEach((set) => set.forEach((isim) => isimler.add(isim)));
      const ek = products.filter((p) => isimler.has(p.ad) && !selectedIds.has(p.id));
      setWizardEkIds(new Set(ek.map((p) => p.id)));
      setPhase('confirm');
    }
  }

  function wizardHicbiri() {
    if (wizardStep < WIZARD_STEPS.length - 1) {
      setWizardStep((s) => s + 1);
    } else {
      const isimler = new Set();
      wizardSeçimler.slice(0, -1).forEach((set) => set.forEach((isim) => isimler.add(isim)));
      const ek = products.filter((p) => isimler.has(p.ad) && !selectedIds.has(p.id));
      setWizardEkIds(new Set(ek.map((p) => p.id)));
      setPhase('confirm');
    }
  }

  // Manuel seçimler + sihirbaz + az varyantları
  const finalIds = useMemo(() => {
    const s = new Set(selectedIds);
    wizardEkIds.forEach((id) => s.add(id));
    s.forEach((id) => { if (azVariantMap[id]) s.add(azVariantMap[id]); });
    return s;
  }, [selectedIds, wizardEkIds, azVariantMap]);

  const finalYemekler = sortByMenu(yemekler.filter((p) => finalIds.has(p.id)));
  const finalZeytinyagli = sortByMenu(zeytinyaglilar.filter((p) => finalIds.has(p.id)));

  function handleFinalGonder() {
    applyMutfakMenusu([...finalIds], relevantProductIds);
    setPhase('done');
    showToast('Menü gönderildi ✓');
    setTimeout(() => setPhase('idle'), 1500);
  }

  function handleIptal() { setPhase('idle'); }

  function chipStyle(p, seçili) {
    if (seçili) return { background: '#ffffff', color: '#111111', borderColor: '#111111' };
    const cat = categoryMap[p.kategori] || {};
    const style = resolveButtonStyle(p, cat);
    return { background: style.backgroundColor, color: style.textColor, borderColor: style.backgroundColor };
  }

  return (
    <div className="mp-shell">
      <div className="mp-list" ref={listRef}>
        {filteredYemekler.length > 0 && (
          <div className="mp-section">
            <h2>Yemekler</h2>
            <div className="mp-chips">
              {filteredYemekler.map((p) => {
                const seçili = selectedIds.has(p.id);
                return (
                  <button
                    key={p.id}
                    className={`mp-chip ${seçili ? 'selected' : ''}`}
                    style={chipStyle(p, seçili)}
                    onClick={() => q ? handleSearchSelect(p) : toggleSelect(p.id)}
                  >{p.ad}</button>
                );
              })}
            </div>
          </div>
        )}

        {filteredZeytinyagli.length > 0 && (
          <div className="mp-section">
            <h2>Zeytinyağlılar</h2>
            <div className="mp-chips">
              {filteredZeytinyagli.map((p) => {
                const seçili = selectedIds.has(p.id);
                return (
                  <button
                    key={p.id}
                    className={`mp-chip ${seçili ? 'selected' : ''}`}
                    style={chipStyle(p, seçili)}
                    onClick={() => q ? handleSearchSelect(p) : toggleSelect(p.id)}
                  >{p.ad}</button>
                );
              })}
            </div>
          </div>
        )}

        {filteredYemekler.length === 0 && filteredZeytinyagli.length === 0 && (
          <div className="mp-empty">
            {q ? 'Aramanla eşleşen ürün yok.' : 'Bu kategorilerde değişken ürün bulunamadı.'}
          </div>
        )}
      </div>

      <div className="mp-search-bar">
        <Search size={16} className="mp-search-icon" />
        <input
          ref={searchRef}
          placeholder="Hızlı ara..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {search && (
          <button className="mp-search-clear" onClick={() => { setSearch(''); searchRef.current?.focus(); }}>
            <X size={14} />
          </button>
        )}
        <button
          className={`mp-drawer-trigger ${drawerOpen ? 'active' : ''}`}
          onClick={() => setDrawerOpen((o) => !o)}
          aria-label="Seçilenler"
        >
          <ShoppingBag size={20} />
          {toplamSecili > 0 && <span className="mp-badge">{toplamSecili}</span>}
        </button>

        {/* Arama sonuçları — klavye açıkken arama çubuğunun hemen üstünde */}
        {q && (
          <div className="mp-search-dropdown">
            {filteredYemekler.length === 0 && filteredZeytinyagli.length === 0 && (
              <div className="mp-search-empty">Sonuç yok</div>
            )}
            {filteredYemekler.map((p) => {
              const seçili = selectedIds.has(p.id);
              return (
                <button
                  key={p.id}
                  className={`mp-search-row ${seçili ? 'selected' : ''}`}
                  onPointerDown={(e) => { e.preventDefault(); handleSearchSelect(p); }}
                >
                  <span>{p.ad}</span>
                  {seçili && <span className="mp-search-check">✓</span>}
                </button>
              );
            })}
            {filteredZeytinyagli.map((p) => {
              const seçili = selectedIds.has(p.id);
              return (
                <button
                  key={p.id}
                  className={`mp-search-row ${seçili ? 'selected' : ''}`}
                  onPointerDown={(e) => { e.preventDefault(); handleSearchSelect(p); }}
                >
                  <span>{p.ad}</span>
                  {seçili && <span className="mp-search-check">✓</span>}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {drawerOpen && (
        <div className="mp-drawer-overlay" onClick={() => setDrawerOpen(false)}>
          <div className="mp-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="mp-drawer-header">
              <span>Seçilenler ({toplamSecili})</span>
              <button onClick={() => setDrawerOpen(false)}><X size={18} /></button>
            </div>
            <div className="mp-drawer-scroll">
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
            <div className="mp-drawer-footer">
              <button className="mp-send-btn" onClick={handleGonderClick}>
                <Send size={17} /> MENÜYÜ GÖNDER
              </button>
            </div>
          </div>
        </div>
      )}

      {phase === 'wizard' && (
        <div className="mp-modal-overlay">
          <div className="mp-modal mp-wizard">
            <p className="mp-wizard-soru">{WIZARD_STEPS[wizardStep].soru}</p>
            <div className="mp-wizard-secenekler">
              {WIZARD_STEPS[wizardStep].isimler.map((isim) => {
                const seçili = wizardSeçimler[wizardStep].has(isim);
                return (
                  <button
                    key={isim}
                    className={`mp-wizard-btn ${seçili ? 'selected' : ''}`}
                    onClick={() => wizardToggleIsim(wizardStep, isim)}
                  >{isim}</button>
                );
              })}
            </div>
            <div className="mp-wizard-actions">
              <button className="mp-modal-cancel" onClick={() => setPhase('idle')}>İptal</button>
              <button className="mp-modal-cancel mp-wizard-hicbiri" onClick={wizardHicbiri}>
                {WIZARD_STEPS[wizardStep].yokButon}
              </button>
              <button className="mp-modal-confirm" onClick={wizardIleri}>
                {wizardStep < WIZARD_STEPS.length - 1 ? 'İleri →' : 'Devam →'}
              </button>
            </div>
          </div>
        </div>
      )}

      {phase === 'confirm' && (
        <div className="mp-modal-overlay">
          <div className="mp-modal mp-confirm">
            <h3>Menü Özeti</h3>
            <div className="mp-confirm-scroll">
              {finalYemekler.length > 0 && (
                <div className="mp-preview-group">
                  <h3>YEMEKLER</h3>
                  {finalYemekler.map((p) => (
                    <div key={p.id} className="mp-preview-row">
                      <span>{p.ad}</span>
                      {wizardEkIds.has(p.id) && <span className="mp-new-badge">sihirbaz</span>}
                    </div>
                  ))}
                </div>
              )}
              {finalZeytinyagli.length > 0 && (
                <div className="mp-preview-group">
                  <h3>ZEYTİNYAĞLILAR</h3>
                  {finalZeytinyagli.map((p) => (
                    <div key={p.id} className="mp-preview-row">
                      <span>{p.ad}</span>
                      {wizardEkIds.has(p.id) && <span className="mp-new-badge">sihirbaz</span>}
                    </div>
                  ))}
                </div>
              )}
              {finalYemekler.length === 0 && finalZeytinyagli.length === 0 && (
                <p className="mp-preview-empty">Seçili ürün yok.</p>
              )}
            </div>
            <div className="mp-modal-actions">
              <button className="mp-modal-cancel" onClick={handleIptal}>İptal</button>
              <button className="mp-modal-confirm" onClick={handleFinalGonder}>
                <Send size={15} /> Gönder
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="mp-toast">{toast}</div>}
    </div>
  );
}