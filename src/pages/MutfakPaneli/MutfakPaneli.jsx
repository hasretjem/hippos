import React, { useState, useMemo, useRef } from 'react';
import './MutfakPaneli.css';
import { Search, X, Send, ShoppingBag, ChevronDown } from 'lucide-react';
import { resolveButtonStyle } from '../../constants/themeDefaults';

// ────────────────────────────────────────────────────────────────────
// Grup tanımları — sıralama ve içerik burada
// Renk değiştirilmez, ürün kendi butonRengi'ni korur.
// ────────────────────────────────────────────────────────────────────

// Sihirbazda sorulacağı için ana listeden çıkan ürün adları
const CIKART_ADLAR = new Set([
  // Çorbalar
  'Ezogelin Çorbası','Mercimek Çorbası','Yayla Çorbası',
  'Domates Çorbası','Şehriyeli Tavuk Suyu Çorbası',
]);

// Grup 1 — Et / Kebap  (açık başlar)
// Balık ürünleri de burada
const ET_KEBAP_ADLAR = new Set([
  'Arnavut Ci̇ğeri̇','Bahçivan Kebabi','Çi̇ftli̇k Kebabi','Çoban Kavurma',
  'İslip Kebabı','Kağıt Kebabı','Manti','Orman Kebabi','Patlican Kebabi',
  'Püreli̇ Tas Kebabi','Sebzeli̇ Et Sote','Sebzeli̇ Kavurma','Tas Kebabi',
  // Balık
  'Hamsi Buğulama','Hamsi Tava',
]);

// Grup 2 — Kıyma / Köfte
const KIYMA_KOFTE_ADLAR = new Set([
  'Acem Köfte','Biber Dolması','Çanak Köfte','Dalyan Köfte','Ekşi̇li̇ Köfte',
  'Etli Lahana Sarması','Hasan Paşa Köfte','İçli̇ Köfte','İzmir Köfte',
  'Karniyarik','Kiymali Makarna','Kıymalı Patates Dolma','Mi̇sket Köfte',
  'Patates Mantısı','Patates Musakka','Sebzeli̇ Köfte',
  'Beğendi Köfte','Dizme Köfte','Pi̇yaz','Kiymali Arap Tava',
]);

// Grup 3 — Tavuk  (Mücver ve Fırın Tavuk/Pirzola da burada, kendi renkleriyle)
const TAVUK_ADLAR = new Set([
  'Ankara Tava','Bezelyeli̇ Tavuk','Çitir Tavuk','Fırın Baget Tavuk',
  'Kabak Sandal','Kalçalı Piliç But','Kanat','Kapuska','Kaşarlı Tavuk',
  'Keşkek','Kızartmış Tavuk Sarma','Köri̇ Soslu Tavuk','Krepli Tavuk',
  'Mantarli Tavuk','Piliç Topkapı','Soya Soslu Tavuk','Sultan Kebabı',
  'Susamlı Tavuk (.5.adet.)','Tavuk But','Tavuk Haşlama','Tavuk Sarma',
  'Tavuk Şiş','Tavuk Sote',
  // Fırın & Mücver — sihirbazda da sorulur ama listede de görünür
  'Fırın Tavuk / Pirzola','Mücver',
]);

// Grup 4 — Sebze  (Kuru Fasülye, Nohut, Taze Fasülye de burada)
const SEBZE_ADLAR = new Set([
  'Bamya','Karnabahar Yemeği̇','Kaşarli Ispanak','Sebze Graten',
  'Taze Fasülye','Yeşi̇l Merci̇mek Yemeği̇','Yumurtalı Ispanak',
  'Patlican Musakka','Türlü',
  // Baklagil — burada görünür, sihirbazda da sorulur
  'Kuru Fasülye','Nohut',
]);

// Grup 5 — Pilav / Makarna
const PILAV_MAKARNA_ADLAR = new Set([
  'Bulgur Pi̇lavi','Eri̇şte','Spagetti̇',
  // Fırın Makarna — burada
  'Fırın Makarna',
]);

// Grup 6 — Zeytinyağlı / Yoğurtlu / Salata
// Bu grup hem alt_kategori bazlı hem de yoğurtlular
// Kod içinde alt_kategori eşleşmesiyle bulunacak + ekstra adlar
const ZEYTINYAGLI_EK_ADLAR = new Set([
  'Arpa Şehri̇ye', // tek ürün bu gruba uyuyor
]);

// Grup 7 — Tatlı
const TATLI_ADLAR = new Set([
  'Un Helvası',
]);

// ────────────────────────────────────────────────────────────────────
// Sihirbaz adımları — 3 soru, aynı format
// ────────────────────────────────────────────────────────────────────
const WIZARD_STEPS = [
  {
    soru: 'Menüde hangi çorba var?',
    isimler: ['Ezogelin Çorbası','Mercimek Çorbası','Yayla Çorbası','Domates Çorbası','Şehriyeli Tavuk Suyu Çorbası'],
    yokButon: 'Hiçbiri',
  },
  {
    soru: 'Menüde hangi baklagil var?',
    isimler: ['Kuru Fasülye','Nohut','Taze Fasülye'],
    yokButon: 'Hiçbiri Yok',
  },
  {
    soru: 'Menüde başka ne var?',
    isimler: ['Mücver','Fırın Tavuk / Pirzola'],
    yokButon: 'Hiçbiri',
  },
];

function sortByAd(list) {
  return [...list].sort((a, b) => a.ad.localeCompare(b.ad, 'tr'));
}

// ────────────────────────────────────────────────────────────────────
export default function MutfakPaneli({ data }) {
  const { products, categories, applyMutfakMenusu } = data;

  // Tüm değişken ürünler (az varyant hariç)
  const tumUrunler = useMemo(
    () => products.filter((p) => !p.sabit && !p.isAzVariant),
    [products],
  );

  // ── Grup filtreleme fonksiyonu ──
  // Bir ürün birden fazla gruba düşmemeli; öncelik sırası yukarıdaki tanım sırasıyla
  function grupla(urunler) {
    const etKebap     = [];
    const kiymaKofte  = [];
    const tavuk       = [];
    const sebze       = [];
    const pilavMakarna = [];
    const zeytinyagli = [];
    const tatli       = [];

    urunler.forEach((p) => {
      const ad  = p.ad;
      const alt = (p.altKategori || '').toLocaleLowerCase('tr-TR');
      const kat = (p.kategori   || '').toLocaleLowerCase('tr-TR');

      // Çorbalar zaten WIZARD_STEPS[0]'da — listede yok
      if (CIKART_ADLAR.has(ad)) return;

      if (ET_KEBAP_ADLAR.has(ad))         { etKebap.push(p); return; }
      if (KIYMA_KOFTE_ADLAR.has(ad))      { kiymaKofte.push(p); return; }
      if (TAVUK_ADLAR.has(ad))            { tavuk.push(p); return; }
      if (SEBZE_ADLAR.has(ad))            { sebze.push(p); return; }
      if (PILAV_MAKARNA_ADLAR.has(ad))    { pilavMakarna.push(p); return; }
      if (TATLI_ADLAR.has(ad))            { tatli.push(p); return; }

      // Zeytinyağlı / Yoğurtlu / Salata — alt_kategori bazlı
      if (alt === 'yoğurt - z.yağlı')    { zeytinyagli.push(p); return; }
      if (ZEYTINYAGLI_EK_ADLAR.has(ad))  { zeytinyagli.push(p); return; }

      // Geri kalan yemekler — yemek kategorisindeyse sebze grubuna at
      if (kat.includes('yemek'))          { sebze.push(p); }
    });

    return [
      { id: 'et',     label: 'Et / Kebap',                    liste: sortByAd(etKebap),      acik: true  },
      { id: 'kiyma',  label: 'Kıyma / Köfte',                 liste: sortByAd(kiymaKofte),   acik: false },
      { id: 'tavuk',  label: 'Tavuk',                          liste: sortByAd(tavuk),        acik: false },
      { id: 'sebze',  label: 'Sebze',                          liste: sortByAd(sebze),        acik: false },
      { id: 'pilav',  label: 'Pilav / Makarna',                liste: sortByAd(pilavMakarna), acik: false },
      { id: 'zeyt',   label: 'Zeytinyağlı / Yoğurtlu / Salata', liste: sortByAd(zeytinyagli), acik: false },
      { id: 'tatli',  label: 'Tatlı',                          liste: sortByAd(tatli),        acik: false },
    ];
  }

  const gruplar = useMemo(() => grupla(tumUrunler), [tumUrunler]);

  // Az varyant haritası
  const azVariantMap = useMemo(() => {
    const m = {};
    products.forEach((p) => { if (p.isAzVariant && p.parentId) m[p.parentId] = p.id; });
    return m;
  }, [products]);

  // applyMutfakMenusu için yönetilecek ID'ler —
  // SADECE yemek kategorisi + zeytinyağlı/yoğurtlu alt kategorisi.
  // Diğer kategoriler dokunulmaz.
  const relevantProductIds = useMemo(() => {
    const ids = products
      .filter((p) => {
        if (p.sabit) return false;
        const kat = (p.kategori    || '').toLocaleLowerCase('tr-TR');
        const alt = (p.altKategori || '').toLocaleLowerCase('tr-TR');
        return kat.includes('yemek') || alt === 'yoğurt - z.yağlı';
      })
      .map((p) => p.id);
    ids.forEach((id) => { if (azVariantMap[id]) ids.push(azVariantMap[id]); });
    return ids;
  }, [products, azVariantMap]);

  const categoryMap = useMemo(() => {
    const m = {};
    (categories || []).forEach((c) => { m[c.ad] = c; });
    return m;
  }, [categories]);

  // ── State ──
  const [selectedIds, setSelectedIds]     = useState(() => new Set());
  const [openGroups, setOpenGroups]       = useState(() => {
    // Sadece "et" grubu açık başlar
    const s = new Set(); s.add('et'); return s;
  });
  const [search, setSearch]               = useState('');
  const [drawerOpen, setDrawerOpen]       = useState(false);
  const [toast, setToast]                 = useState('');
  const searchRef                         = useRef(null);

  // Sihirbaz
  const [phase, setPhase]                 = useState('idle');
  const [wizardStep, setWizardStep]       = useState(0);
  const [wizardSeçimler, setWizardSeçimler] = useState(() => WIZARD_STEPS.map(() => new Set()));
  const [wizardEkIds, setWizardEkIds]     = useState(new Set());

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
  function toggleGroup(id) {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function handleSearchSelect(p) {
    toggleSelect(p.id);
    setSearch('');
    searchRef.current?.focus();
  }

  // Arama filtresi — tüm ürünlerde
  const q = search.trim().toLocaleLowerCase('tr-TR');
  const filteredAll = q
    ? tumUrunler.filter((p) => p.ad.toLocaleLowerCase('tr-TR').includes(q))
    : [];

  const toplamSecili = selectedIds.size;

  // Çekmece için seçili ürünler
  const secilenler = useMemo(
    () => sortByAd(tumUrunler.filter((p) => selectedIds.has(p.id))),
    [tumUrunler, selectedIds],
  );

  // Sihirbaz
  function handleGonderClick() {
    setWizardStep(0);
    setWizardSeçimler(WIZARD_STEPS.map(() => new Set()));
    setWizardEkIds(new Set());
    setPhase('wizard');
    setDrawerOpen(false);
  }
  function wizardToggleIsim(stepIdx, isim) {
    setWizardSeçimler((prev) => {
      const next = prev.map((s) => new Set(s));
      if (next[stepIdx].has(isim)) next[stepIdx].delete(isim);
      else next[stepIdx].add(isim);
      return next;
    });
  }
  function wizardIleri() {
    if (wizardStep < WIZARD_STEPS.length - 1) {
      setWizardStep((s) => s + 1);
    } else {
      buildWizardResult([...wizardSeçimler]);
    }
  }
  function wizardHicbiri() {
    // Bu adımı boş geç
    const kopyalar = wizardSeçimler.map((s, i) => i === wizardStep ? new Set() : new Set(s));
    if (wizardStep < WIZARD_STEPS.length - 1) {
      setWizardSeçimler(kopyalar);
      setWizardStep((s) => s + 1);
    } else {
      buildWizardResult(kopyalar);
    }
  }
  function buildWizardResult(secimler) {
    const isimler = new Set();
    secimler.forEach((set) => set.forEach((isim) => isimler.add(isim)));
    const ek = products.filter((p) => isimler.has(p.ad) && !selectedIds.has(p.id));
    setWizardEkIds(new Set(ek.map((p) => p.id)));
    setPhase('confirm');
  }

  // Final ID seti
  const finalIds = useMemo(() => {
    const s = new Set(selectedIds);
    wizardEkIds.forEach((id) => s.add(id));
    s.forEach((id) => { if (azVariantMap[id]) s.add(azVariantMap[id]); });
    return s;
  }, [selectedIds, wizardEkIds, azVariantMap]);

  const finalSecilenler = useMemo(
    () => sortByAd(tumUrunler.filter((p) => finalIds.has(p.id))),
    [tumUrunler, finalIds],
  );

  function handleFinalGonder() {
    applyMutfakMenusu([...finalIds], relevantProductIds);
    setPhase('done');
    showToast('Menü gönderildi ✓');
    setTimeout(() => setPhase('idle'), 1500);
  }
  function handleIptal() { setPhase('idle'); }

  // Chip / buton rengi
  function chipStyle(p, seçili) {
    if (seçili) return { background: '#ffffff', color: '#111111', borderColor: '#111111' };
    const cat = categoryMap[p.kategori] || {};
    const style = resolveButtonStyle(p, cat);
    return { background: style.backgroundColor, color: style.textColor, borderColor: style.backgroundColor };
  }

  // ── JSX ──
  return (
    <div className="mp-shell">
      {/* ── AKORDIYON LİSTE ── */}
      <div className="mp-list">
        {gruplar.map((grup) => {
          if (grup.liste.length === 0) return null;
          const açık = openGroups.has(grup.id);
          const seçiliSayısı = grup.liste.filter((p) => selectedIds.has(p.id)).length;
          return (
            <div key={grup.id} className="mp-accordion">
              <button
                className={`mp-accordion-header ${açık ? 'open' : ''}`}
                onClick={() => toggleGroup(grup.id)}
              >
                <span className="mp-accordion-label">
                  {grup.label}
                  {seçiliSayısı > 0 && (
                    <span className="mp-accordion-badge">{seçiliSayısı}</span>
                  )}
                </span>
                <ChevronDown size={18} className={`mp-accordion-icon ${açık ? 'rotated' : ''}`} />
              </button>
              {açık && (
                <div className="mp-accordion-body">
                  <div className="mp-chips">
                    {grup.liste.map((p) => {
                      const seçili = selectedIds.has(p.id);
                      return (
                        <button
                          key={p.id}
                          className={`mp-chip ${seçili ? 'selected' : ''}`}
                          style={chipStyle(p, seçili)}
                          onClick={() => toggleSelect(p.id)}
                        >{p.ad}</button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── ARAMA ÇUBUĞU (ALTTA) ── */}
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

        {/* Arama dropdown */}
        {q && (
          <div className="mp-search-dropdown">
            {filteredAll.length === 0 && <div className="mp-search-empty">Sonuç yok</div>}
            {filteredAll.map((p) => {
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

      {/* ── ÇEKMECE ── */}
      {drawerOpen && (
        <div className="mp-drawer-overlay" onClick={() => setDrawerOpen(false)}>
          <div className="mp-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="mp-drawer-header">
              <span>Seçilenler ({toplamSecili})</span>
              <button onClick={() => setDrawerOpen(false)}><X size={18} /></button>
            </div>
            <div className="mp-drawer-scroll">
              {toplamSecili === 0 && <p className="mp-preview-empty">Henüz ürün seçilmedi.</p>}
              {secilenler.map((p) => (
                <div key={p.id} className="mp-preview-row">
                  <span>{p.ad}</span>
                  <button onClick={() => removeSelected(p.id)}><X size={14} /> Çıkart</button>
                </div>
              ))}
            </div>
            <div className="mp-drawer-footer">
              <button className="mp-send-btn" onClick={handleGonderClick}>
                <Send size={17} /> MENÜYÜ GÖNDER
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── SİHİRBAZ ── */}
      {phase === 'wizard' && (
        <div className="mp-modal-overlay">
          <div className="mp-modal mp-wizard">
            <div className="mp-wizard-progress">
              {WIZARD_STEPS.map((_, i) => (
                <div key={i} className={`mp-wizard-dot ${i <= wizardStep ? 'active' : ''}`} />
              ))}
            </div>
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

      {/* ── ONAY ── */}
      {phase === 'confirm' && (
        <div className="mp-modal-overlay">
          <div className="mp-modal mp-confirm">
            <h3>Menü Özeti — {finalIds.size} ürün</h3>
            <div className="mp-confirm-scroll">
              {finalSecilenler.length === 0 && (
                <p className="mp-preview-empty">Seçili ürün yok.</p>
              )}
              {finalSecilenler.map((p) => (
                <div key={p.id} className="mp-preview-row">
                  <span>{p.ad}</span>
                  {wizardEkIds.has(p.id) && <span className="mp-new-badge">+eklendi</span>}
                </div>
              ))}
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