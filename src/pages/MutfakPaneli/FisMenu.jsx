import React, { useState, useEffect } from 'react';
import { supabase } from '../../services/supabase';

// Türkçe karakter + büyük/küçük harf duyarsız normalize
function trNormalize(s) {
  return (s || '')
    .normalize('NFD')                 // combining işaretleri ayır (İ → I + ̇)
    .replace(/[\u0300-\u036f]/g, '')  // tüm combining işaretleri (nokta dahil) sil
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i')
    .replace(/ş/g, 's')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c');
}

// ── Sabitler ────────────────────────────────────────────────────────
const GREEN = '#25D366';

const CORBA_SABIT = [
  'Ezogelin Çorbası','Mercimek Çorbası','Yayla Çorbası',
  'Domates Çorbası','Şehriyeli Tavuk Suyu Çorbası','Ayran Çorbası',
];
const BAKLAGIL_SABIT = ['Kuru Fasülye','Nohut','Taze Fasülye'];
const FIRIN_SABIT   = ['Fırın Tavuk / Pirzola','Mücver'];
const PILAV_SABIT   = [
  'Pirinç Pilavı','Bulgur Pi̇lavi','Eri̇şte','Fırın Makarna','Arpa Şehri̇ye','Spagetti̇',
];

// Gönderime dahil edilmeyecek sabit ürün adları (Hippos'ta zaten sabit)
const HIPPOS_SABIT  = new Set(['Ev Köftesi','Şinitzel','Kadınbudu Köfte']);

// Best-seller sorgusundan çıkarılacaklar
const BEST_DISI = new Set([
  ...HIPPOS_SABIT,
  'Pirinç Pilavı','Cacık','Yaprak Sarma',
]);

// ── Benzersiz key üretici ───────────────────────────────────────────
let _uc = 0;
const uk = () => 'k' + (++_uc);

// ── Satır inline style sabitleri ───────────────────────────────────
const ROW_S  = { display:'flex', alignItems:'stretch', borderBottom:'1px solid #000', minHeight:48, background:'#fff', position:'relative' };
const NO_S   = { minWidth:34, display:'flex', alignItems:'center', justifyContent:'center', borderRight:'1px solid #000', fontSize:12, fontWeight:800, color:'#555', background:'#fff', flexShrink:0 };
const WRAP_S = { flex:1, position:'relative' };
const INP_S  = { width:'100%', border:'none', outline:'none', fontSize:16, fontWeight:800, background:'#fff', color:'#000', padding:'10px 10px', display:'block', fontFamily:"'Inter',sans-serif" };
const DD_S   = { position:'absolute', top:'100%', left:0, right:0, background:'#fff', border:'1.5px solid #000', borderTop:'none', zIndex:30, maxHeight:200, overflowY:'auto' };
const CHIP_S = { background:'#000', color:'#fff', padding:'5px 12px', fontSize:16, fontWeight:800, display:'inline-flex', alignItems:'center', gap:8, fontFamily:"'Inter',sans-serif" };
const SEC_S  = { textAlign:'center', fontSize:14, fontWeight:800, letterSpacing:'.08em', background:'#e0e0e0', padding:7, borderBottom:'1.5px solid #000', borderTop:'1.5px solid #000', color:'#000' };
const PLUS_BTN_S = { display:'flex', alignItems:'center', gap:6, background:GREEN, border:'1.5px solid #000', fontSize:14, fontWeight:800, padding:'8px 16px', cursor:'pointer', color:'#000', fontFamily:"'Inter',sans-serif" };
const REMOVE_BTN_S = { background:'#fff', border:'1.5px solid #000', fontSize:13, fontWeight:800, color:'#000', cursor:'pointer', padding:'3px 9px', marginLeft:'auto', flexShrink:0, fontFamily:"'Inter',sans-serif" };

// ── AramaSlot bileşeni ──────────────────────────────────────────────
// sel: { id, name } | null
// suggestions: [{ id, name }]
// allProducts: [{ id, name }]
function AramaSlot({ placeholder, suggestions, allProducts, sel, onPick, onClear }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);

  const items = q.trim()
    ? allProducts
        .filter(p => trNormalize(p.name).includes(trNormalize(q)))
        .slice(0, 10)
    : suggestions.slice(0, 10);

  if (sel) {
    return (
      <div style={{ padding:'8px 10px', display:'flex', alignItems:'center' }}>
        <span style={CHIP_S}>
          {sel.name}
          <span
            onMouseDown={e => { e.preventDefault(); onClear(); }}
            style={{ cursor:'pointer', opacity:0.7, fontWeight:400, fontSize:17 }}
          >×</span>
        </span>
      </div>
    );
  }

  return (
    <div style={WRAP_S}>
      <input
        value={q}
        placeholder={placeholder}
        style={INP_S}
        onChange={e => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 160)}
      />
      {open && items.length > 0 && (
        <div style={DD_S}>
          {items.map((item, i) => (
            <div
              key={item.id || i}
              onMouseDown={e => { e.preventDefault(); onPick(item); setQ(''); setOpen(false); }}
              style={{ padding:'10px 14px', fontSize:16, fontWeight:800, cursor:'pointer', borderBottom:'.5px solid #ccc', background:'#fff', color:'#000', fontFamily:"'Inter',sans-serif" }}
              onMouseOver={e => e.currentTarget.style.background = '#f0f0f0'}
              onMouseOut={e => e.currentTarget.style.background = '#fff'}
            >
              {item.name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── FisRow wrapper ──────────────────────────────────────────────────
function FisRow({ no = '—', children }) {
  return (
    <div style={ROW_S}>
      <div style={NO_S}>{no}</div>
      {children}
    </div>
  );
}

// ── PlusSection ─────────────────────────────────────────────────────
function PlusSection({ label, onClick }) {
  return (
    <div style={{ borderBottom:'1px solid #000', background:'#fff' }}>
      <div style={{ fontSize:11, fontWeight:400, color:'#666', padding:'6px 12px 2px', fontStyle:'italic' }}>{label}</div>
      <div style={{ padding:'4px 8px 8px' }}>
        <button style={PLUS_BTN_S} onClick={onClick}>+ Satır ekle</button>
      </div>
    </div>
  );
}

// ── SwappableRow ────────────────────────────────────────────────────
// Başlangıçta sabit ürün gösterir, × Çıkart'a basınca arama barına döner
function SwappableRow({ defaultName, placeholder, suggestions, allProducts, onSelChange }) {
  const [fixed, setFixed] = useState(true);
  const [sel, setSel] = useState(null);

  function pick(item) { setSel(item); onSelChange(item); }
  function clear() { setSel(null); onSelChange(null); }
  function remove() { setFixed(false); setSel(null); onSelChange(null); }

  if (fixed) {
    return (
      <div style={ROW_S}>
        <div style={NO_S}>—</div>
        <div style={{ flex:1, display:'flex', alignItems:'center', padding:'6px 12px', fontSize:17, fontWeight:800, color:'#000', background:'#fff' }}>
          {defaultName}
          <button
            style={REMOVE_BTN_S}
            onMouseOver={e => { e.currentTarget.style.background='#000'; e.currentTarget.style.color='#fff'; }}
            onMouseOut={e => { e.currentTarget.style.background='#fff'; e.currentTarget.style.color='#000'; }}
            onClick={remove}
          >× Çıkart</button>
        </div>
      </div>
    );
  }

  return (
    <FisRow>
      <AramaSlot
        placeholder={placeholder}
        suggestions={suggestions}
        allProducts={allProducts}
        sel={sel}
        onPick={pick}
        onClear={clear}
      />
    </FisRow>
  );
}

// ── Ana bileşen ─────────────────────────────────────────────────────
export default function FisMenü({ data }) {
  const { products, applyMutfakMenusu } = data;

  // ── Ürün listeleri (az varyant ve sabit hariç) ──
  const yemekler = products.filter(p =>
    !p.sabit && !p.isAzVariant &&
    (p.kategori || '').toLocaleLowerCase('tr-TR').includes('yemek'),
  );
  const anaYemekler = yemekler.filter(p =>
    (p.altKategori || '').toLocaleLowerCase('tr-TR').includes('ana'),
  );
  const zeytYemekler = yemekler.filter(p =>
    (p.altKategori || '').toLocaleLowerCase('tr-TR').includes('z.ya'),
  );
  const corbaYemekler = yemekler.filter(p => CORBA_SABIT.includes(p.ad));

  // ── Az varyant haritası (gönderimde otomatik eklenecek) ──
  const azVariantMap = {};
  products.forEach(p => { if (p.isAzVariant && p.parentId) azVariantMap[p.parentId] = p.id; });

  // ── Öneri verileri (isim → { id, name }) ──
  function toSug(names, pool) {
    return names.map(name => {
      const p = pool.find(x => trNormalize(x.ad) === trNormalize(name));
      return { id: p ? p.id : null, name: p ? p.ad : name };
    }).filter(x => x.id);
  }

  const corbaSug = products
    .filter(p => p.gununMenusuKategori === 'corba' && !p.isAzVariant)
    .sort((a, b) => (a.gununMenusuSira || 99) - (b.gununMenusuSira || 99))
    .map(p => ({ id: p.id, name: p.ad }));

  const yardimciSug = products
    .filter(p => p.gununMenusuKategori === 'yardimci_yemek' && !p.isAzVariant)
    .sort((a, b) => (a.gununMenusuSira || 99) - (b.gununMenusuSira || 99))
    .map(p => ({ id: p.id, name: p.ad }));
  const bakSug    = toSug(BAKLAGIL_SABIT, yemekler);
  const firinSug  = toSug(FIRIN_SABIT, yemekler);
  const pilavSug  = toSug(PILAV_SABIT, yemekler);

  // ── Best-seller state ──
  const [bestAna,  setBestAna]  = useState([]);
  const [bestZeyt, setBestZeyt] = useState([]);

  useEffect(() => {
    const dow = new Date().getDay(); // 0=Paz, 1=Pzt …
    // Son 4 hafta aynı gün — örn. bugün Salı ise son 4 Salı
    const since = Date.now() - 4 * 7 * 24 * 60 * 60 * 1000;

    supabase
      .from('sold_items')
      .select('ad, ts, alt_kategori')
      .eq('kategori', 'YEMEKLER')
      .gte('ts', since)
      .then(({ data: rows }) => {
        if (!rows) return;

        const forDay = rows.filter(r => new Date(r.ts).getDay() === dow);

        function topN(filtered, n) {
          const cnt = {};
          filtered.forEach(r => {
            if (!r.ad.startsWith('Az ') && !r.ad.includes('(') && !BEST_DISI.has(r.ad)) {
              cnt[r.ad] = (cnt[r.ad] || 0) + 1;
            }
          });
          return Object.entries(cnt)
            .sort((a, b) => b[1] - a[1])
            .slice(0, n)
            .map(([name]) => {
              const p = products.find(x => x.ad === name);
              return p ? { id: p.id, name: p.ad } : null;
            })
            .filter(Boolean);
        }

        const ana = topN(forDay.filter(r => (r.alt_kategori || '').includes('Ana')), 6);
        const zeyt = topN(forDay.filter(r => (r.alt_kategori || '').toLowerCase().includes('ya')), 6);
        if (ana.length)  setBestAna(ana);
        if (zeyt.length) setBestZeyt(zeyt);
      });
  }, []); // eslint-disable-line

  // ── Slot state yönetimi ──
  const newSlot = (initSel = null) => ({ key: uk(), sel: initSel });

  const [corbaSlots, setCorbaSlots] = useState(() => [newSlot()]);
  const [anaSlots,   setAnaSlots]   = useState(() => Array.from({ length: 5 }, () => newSlot()));
  const [pilavSlots, setPilavSlots] = useState(() => [newSlot()]);
  const [zeytSlots,  setZeytSlots]  = useState(() => Array.from({ length: 5 }, () => newSlot()));

  const [bakSel,    setBakSel]    = useState(null);
  const [firinSel,  setFireSel]   = useState(null);
  const [pirincSel, setPirincSel] = useState(null);  // swappable
  const [cacikSel,  setCacikSel]  = useState(null);  // swappable
  const [yaprakSel, setYaprakSel] = useState(null);  // swappable

  function updSlot(setFn, key, sel) {
    setFn(prev => prev.map(s => s.key === key ? { ...s, sel } : s));
  }

  // ── Yardımcı: ürün ID'si bul ──
  function pid(name) {
    const p = products.find(x => x.ad === name);
    return p ? p.id : null;
  }
  function selId(sel) {
    if (!sel) return null;
    return sel.id || pid(sel.name);
  }

  // ── Toast ──
  const [toast, setToast] = useState('');
  const [onay, setOnay] = useState(null); // null=kapalı, {ids,relevant}=açık
  function showToast(msg) { setToast(msg); setTimeout(() => setToast(''), 2200); }

  // ── Gönder ──
  function handleGonder() {
    const ids = new Set();

    const add = sel => { const id = selId(sel); if (id) ids.add(id); };

    corbaSlots.forEach(s => add(s.sel));
    add(bakSel);
    anaSlots.forEach(s => add(s.sel));
    add(firinSel);

    // Pirinç Pilavı — pirincSel null ise varsayılan ürün eklenir
    const pirincId = pirincSel ? selId(pirincSel) : pid('Pirinç Pilavı');
    if (pirincId) ids.add(pirincId);
    pilavSlots.forEach(s => add(s.sel));

    zeytSlots.forEach(s => add(s.sel));
    const cacikId = cacikSel ? selId(cacikSel) : pid('Cacık');
    if (cacikId) ids.add(cacikId);
    const yaprakId = yaprakSel ? selId(yaprakSel) : pid('Yaprak Sarma');
    if (yaprakId) ids.add(yaprakId);

    // Az varyantları otomatik ekle
    [...ids].forEach(id => { if (azVariantMap[id]) ids.add(azVariantMap[id]); });

    // relevantProductIds: SADECE mutfak panelinde seçilebilir olan ürünler.
    // Hep-açık-kalması-gereken ürünler (Mevsim Salata, Pirinç Pilavı, Meze,
    // Yoğurt, Cacık, Yaprak Sarma, Tatlı, Ev Köftesi, Kadınbudu Köfte,
    // Şinitsel) buraya HİÇ girmez, dolayısıyla applyMutfakMenusu onlara
    // dokunmaz — az porsiyon durumları da dahil hiçbir alanları değişmez.
    const KORUNAN_ADLAR = new Set(
      ['Mevsim Salata','Pirinç Pilavı','Meze','Yoğurt','Cacık','Yaprak Sarma',
       'Tatlı','Ev Köftesi','Kadınbudu Köfte','Şinitsel','Şinitzel']
        .map(trNormalize)
    );
    const relevant = yemekler
      .filter(p => !KORUNAN_ADLAR.has(trNormalize(p.ad)) && !p.sabit)
      .map(p => p.id);
    [...Object.values(azVariantMap)]
      .filter(id => {
        const parent = products.find(x => x.id === id);
        return parent && !KORUNAN_ADLAR.has(trNormalize(products.find(pp => pp.id === parent.parentId)?.ad || ''));
      })
      .forEach(id => relevant.push(id));

    setOnay({ ids: [...ids], relevant });
  }

  function handleEvet() {
    if (!onay) return;
    applyMutfakMenusu(onay.ids, onay.relevant);
    setOnay(null);
    showToast('Menü gönderildi ✓');
  }

  // ── Render yardımcıları ──
  function anaSlotProps(slot) {
    return {
      placeholder: 'Ana yemek ara...',
      suggestions: bestAna,
      allProducts: anaYemekler.map(p => ({ id: p.id, name: p.ad })),
      sel: slot.sel,
      onPick: item => updSlot(setAnaSlots, slot.key, item),
      onClear: () => updSlot(setAnaSlots, slot.key, null),
    };
  }
  function zeytSlotProps(slot) {
    return {
      placeholder: 'Zeytinyağlı / yoğurtlu ara...',
      suggestions: bestZeyt,
      allProducts: zeytYemekler.map(p => ({ id: p.id, name: p.ad })),
      sel: slot.sel,
      onPick: item => updSlot(setZeytSlots, slot.key, item),
      onClear: () => updSlot(setZeytSlots, slot.key, null),
    };
  }
  function pilavSlotProps(slot) {
    return {
      placeholder: 'Pilav / makarna ara...',
      suggestions: yardimciSug.length > 0 ? yardimciSug : pilavSug,
      allProducts: yemekler.map(p => ({ id: p.id, name: p.ad })),
      sel: slot.sel,
      onPick: item => updSlot(setPilavSlots, slot.key, item),
      onClear: () => updSlot(setPilavSlots, slot.key, null),
    };
  }
  function corbaSlotProps(slot) {
    return {
      placeholder: 'Çorba ara veya seç...',
      suggestions: corbaSug.length > 0 ? corbaSug : toSug(CORBA_SABIT, yemekler),
      allProducts: yemekler.map(p => ({ id: p.id, name: p.ad })),
      sel: slot.sel,
      onPick: item => updSlot(setCorbaSlots, slot.key, item),
      onClear: () => updSlot(setCorbaSlots, slot.key, null),
    };
  }

  // ── JSX ────────────────────────────────────────────────────────────
  return (
    <div style={{ overflowY:'auto', height:'100%', paddingBottom:80, background:'#f5f5f5' }}>
      <div style={{ background:'#fff', border:'2.5px solid #000', maxWidth:500, margin:'0 auto', fontFamily:"'Inter',sans-serif" }}>

        <div style={{ textAlign:'center', fontWeight:800, fontSize:18, padding:10, borderBottom:'2.5px solid #000', background:'#fff', color:'#000' }}>
          GÜNLÜK MENÜ
        </div>

        {/* ── ÇORBA ── */}
        <div style={SEC_S}>ÇORBA</div>
        {corbaSlots.map(slot => (
          <FisRow key={slot.key}>
            <AramaSlot {...corbaSlotProps(slot)} />
          </FisRow>
        ))}
        <PlusSection
          label="Ekstra çorba satırı eklemek için:"
          onClick={() => setCorbaSlots(p => [...p, newSlot()])}
        />

        {/* ── ANA YEMEKLER ── */}
        <div style={SEC_S}>ANA YEMEKLER</div>

        {/* Baklagil satırı */}
        <FisRow>
          <AramaSlot
            placeholder="Baklagil: Kuru Fasülye, Nohut, Taze Fasülye..."
            suggestions={bakSug}
            allProducts={yemekler.map(p => ({ id:p.id, name:p.ad }))}
            sel={bakSel}
            onPick={setBakSel}
            onClear={() => setBakSel(null)}
          />
        </FisRow>

        {/* Best-seller satırları */}
        {anaSlots.map(slot => (
          <FisRow key={slot.key}>
            <AramaSlot {...anaSlotProps(slot)} />
          </FisRow>
        ))}
        <PlusSection
          label="Ekstra ana yemek satırı eklemek için:"
          onClick={() => setAnaSlots(p => [...p, newSlot()])}
        />

        {/* Hipposta sabit ürünler — sadece gösterim, gönderilmez */}
        {['Ev Köftesi','Şinitzel','Kadınbudu Köfte'].map(name => (
          <div key={name} style={ROW_S}>
            <div style={NO_S}>—</div>
            <div style={{ flex:1, display:'flex', alignItems:'center', padding:'6px 12px', fontSize:17, fontWeight:800, color:'#000', background:'#fff' }}>
              {name}
              <span style={{ fontSize:10, border:'1px solid #888', color:'#666', padding:'1px 6px', marginLeft:8, fontWeight:400 }}>hipposta sabit</span>
            </div>
          </div>
        ))}

        {/* Fırın Tavuk / Mücver */}
        <FisRow>
          <AramaSlot
            placeholder="Fırın Tavuk / Pirzola veya Mücver..."
            suggestions={firinSug}
            allProducts={yemekler.map(p => ({ id:p.id, name:p.ad }))}
            sel={firinSel}
            onPick={setFireSel}
            onClear={() => setFireSel(null)}
          />
        </FisRow>

        {/* ── YARDIMCI YEMEKLER ── */}
        <div style={SEC_S}>YARDIMCI YEMEKLER</div>

        {/* Pirinç Pilavı — swappable */}
        <SwappableRow
          defaultName="Pirinç Pilavı"
          placeholder="Pilav / makarna ara..."
          suggestions={pilavSug}
          allProducts={yemekler.map(p => ({ id:p.id, name:p.ad }))}
          onSelChange={sel => setPirincSel(sel)}
        />

        {/* Pilav ek satırı */}
        {pilavSlots.map(slot => (
          <FisRow key={slot.key}>
            <AramaSlot {...pilavSlotProps(slot)} />
          </FisRow>
        ))}
        <PlusSection
          label="Ekstra pilav / makarna satırı eklemek için:"
          onClick={() => setPilavSlots(p => [...p, newSlot()])}
        />

        {/* ── ZEYTİNYAĞLILAR ── */}
        <div style={SEC_S}>ZEYTİNYAĞLILAR</div>

        {zeytSlots.map(slot => (
          <FisRow key={slot.key}>
            <AramaSlot {...zeytSlotProps(slot)} />
          </FisRow>
        ))}
        <PlusSection
          label="Ekstra zeytinyağlı satırı eklemek için:"
          onClick={() => setZeytSlots(p => [...p, newSlot()])}
        />

        {/* Cacık — swappable */}
        <SwappableRow
          defaultName="Cacık"
          placeholder="Zeytinyağlı / yoğurtlu ara..."
          suggestions={bestZeyt.length ? bestZeyt : pilavSug}
          allProducts={zeytYemekler.map(p => ({ id:p.id, name:p.ad }))}
          onSelChange={sel => setCacikSel(sel)}
        />

        {/* Yaprak Sarma — swappable */}
        <SwappableRow
          defaultName="Yaprak Sarma"
          placeholder="Zeytinyağlı / yoğurtlu ara..."
          suggestions={bestZeyt.length ? bestZeyt : pilavSug}
          allProducts={zeytYemekler.map(p => ({ id:p.id, name:p.ad }))}
          onSelChange={sel => setYaprakSel(sel)}
        />

        {/* ── GÖNDER ── */}
        <div style={{ padding:12, borderTop:'2.5px solid #000', background:'#fff', display:'flex', gap:8 }}>
          <button
            onClick={() => {
              setCorbaSlots([newSlot()]);
              setAnaSlots(Array.from({length:5}, () => newSlot()));
              setPilavSlots([newSlot()]);
              setZeytSlots(Array.from({length:5}, () => newSlot()));
              setBakSel(null);
              setFireSel(null);
              setPirincSel(null);
              setPirincFixed(true);
              setCacikSel(null);
              setCacikFixed(true);
              setYaprakSel(null);
              setYaprakFixed(true);
            }}
            style={{ padding:14, fontSize:14, fontWeight:800, background:'#fff', color:'#000', border:'1.5px solid #000', cursor:'pointer', whiteSpace:'nowrap', fontFamily:"'Inter',sans-serif" }}
            onMouseOver={e => { e.currentTarget.style.background='#000'; e.currentTarget.style.color='#fff'; }}
            onMouseOut={e => { e.currentTarget.style.background='#fff'; e.currentTarget.style.color='#000'; }}
          >↺ Sıfırla</button>
          <button
            onClick={handleGonder}
            style={{ width:'100%', padding:14, fontSize:17, fontWeight:800, background:GREEN, color:'#000', border:'1.5px solid #000', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:8, fontFamily:"'Inter',sans-serif" }}
            onMouseOver={e => { e.currentTarget.style.background='#000'; e.currentTarget.style.color=GREEN; }}
            onMouseOut={e => { e.currentTarget.style.background=GREEN; e.currentTarget.style.color='#000'; }}
          >
            {/* WhatsApp paylaş ikonu */}
            <svg viewBox="0 0 24 24" style={{ width:'1.1em', height:'1.1em', fill:'currentColor', flexShrink:0 }}>
              <path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92 1.61 0 2.92-1.31 2.92-2.92s-1.31-2.92-2.92-2.92z"/>
            </svg>
            MENÜYÜ GÖNDER
          </button>
        </div>

      </div>

      {onay && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center',padding:20}}>
          <div style={{background:'#fff',border:'2.5px solid #000',padding:24,maxWidth:320,width:'100%',fontFamily:"'Inter',sans-serif",textAlign:'center'}}>
            <p style={{fontSize:16,fontWeight:800,color:'#000',marginBottom:20}}>Göndermek istediğinize emin misiniz?</p>
            <div style={{display:'flex',gap:8}}>
              <button onClick={() => setOnay(null)} style={{flex:1,padding:12,fontSize:14,fontWeight:800,background:'#fff',color:'#000',border:'1.5px solid #000',cursor:'pointer'}}>İptal</button>
              <button onClick={handleEvet} style={{flex:1,padding:12,fontSize:14,fontWeight:800,background:'#25D366',color:'#000',border:'1.5px solid #000',cursor:'pointer'}}>Evet</button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div style={{ position:'fixed', bottom:80, left:'50%', transform:'translateX(-50%)', background:'#000', color:'#fff', padding:'10px 20px', borderRadius:999, fontSize:14, fontWeight:600, zIndex:400, whiteSpace:'nowrap' }}>
          {toast}
        </div>
      )}
    </div>
  );
}