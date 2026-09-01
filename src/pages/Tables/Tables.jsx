import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import './Tables.css';
import { SALON_TABLES, ALT_TABLES, TABLE_PAIRS, QUICK_SALE, TL, getElapsedMinutes, getColorTier, EKMEK_TURLERI_STOK } from '../../hooks/useHipposData';

// Masa/paket kartlarında tutar küsuratsız gösterilir (menüde 0,50 ₺ gibi kuruşlu ürün yok) —
// genel TL() fonksiyonu (fişler, modallar, raporlar) olduğu gibi kalıyor, sadece kart
// görünümünde bu yerel biçimleyici kullanılıyor.
const TLKart = (n) => Math.round(n || 0).toLocaleString('tr-TR') + ' ₺';
import {
  MoreVertical, Plus, ClipboardPaste, ArrowLeftRight, Link2, XCircle,
  Undo2, Banknote, CreditCard, UtensilsCrossed, BookOpen, X, Check, Zap, Lock,
  StickyNote, MessageCircle, Trash2, Printer, Copy, PackageOpen,
} from 'lucide-react';

// Sipariş kartlarında ürün metninin sonuna eklenen marka etiketi — kaynak siparisMetni
// (useHipposData.js) değiştirilmedi, sadece görüntülemede ekleniyor.
const EKMEK_SIPARIS_MARKA = {
  buyukBeyaz: 'UNO',
  kucukBeyaz: 'LA LORRAINE',
  domatesli: 'LA LORRAINE',
  kucukKepek: 'UNO',
};

const PAIR_SECOND = new Set(TABLE_PAIRS.map((p) => p[1]));
const PAIR_FIRST = new Map(TABLE_PAIRS.map((p) => [p[0], p[1]]));

export default function Tables({ data, setSelectedTable, onNavigate }) {
  const {
    orders,
    tableNotes,
    setTableNotes,
    tableOpenedAt,
    getTableTotal,
    packages,
    openPackage,
    transferTable,
    mergeTable,
    closeTableWithPayment,
    actionHistory,
    undoLastAction,
    isTableOccupiedElsewhere,
    paketTeslimatlari,
    cariler,
    cariHareketler,
    updateCari,
    mutfakHazirNotlar,
    addMutfakHazirNot,
    deleteMutfakHazirNot,
    ekmekStok,
    ekmekStoktanDus,
    bosvarKayitlari,
    paketciBosvarAldi,
    paketciBosvarAlamadi,
    submitBosvarKaydi,
    bosvarBildirimleri,
  } = data;

  // Renk-zaman kademesi her 30 dk'da bir değişsin diye periyodik yeniden çizim
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((t) => t + 1), 30000);
    return () => clearInterval(id);
  }, []);

  const [menuFor, setMenuFor] = useState(null);
  const [menuPos, setMenuPos] = useState(null); // { top, left } — portal ile document.body'de konumlanır
  const [editingNoteFor, setEditingNoteFor] = useState(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [pickModal, setPickModal] = useState(null); // { title, options, onPick }
  const [confirmModal, setConfirmModal] = useState(null); // { title, onConfirm }
  const [closeModalFor, setCloseModalFor] = useState(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  // ---- Cari Uyarı paneli: gün sonu firmalara toplu WhatsApp + numarası eksik bireysel uyarısı ----
  const [cariUyariOpen, setCariUyariOpen] = useState(false);
  const [cariUyariTab, setCariUyariTab] = useState('firma'); // 'firma' | 'bireysel'
  const [bosvarAlamadiFormFor, setBosvarAlamadiFormFor] = useState(null); // hangi bosvar kaydının "Alamadım" notu açık
  const [bosvarAlamadiNotu, setBosvarAlamadiNotu] = useState('');
  const [bosvarPromptOpen, setBosvarPromptOpen] = useState(false);
  const [bosvarPromptAdres, setBosvarPromptAdres] = useState('');
  const [bosvarPromptNot, setBosvarPromptNot] = useState('');
  const bosvarKayitListesi = useMemo(
    () => (bosvarKayitlari || []).filter((b) => b.durum === 'bekliyor').sort((a, b) => b.ts - a.ts),
    [bosvarKayitlari]
  );
  const [cariUyariEditId, setCariUyariEditId] = useState(null);
  const [cariUyariPhoneDraft, setCariUyariPhoneDraft] = useState('');

  function normalizeTrPhone(phone) {
    let digits = (phone || '').replace(/[^0-9]/g, '');
    if (digits.startsWith('0')) digits = digits.slice(1);
    if (!digits.startsWith('90')) digits = '90' + digits;
    return digits;
  }
  function waShare(text, phone) {
    const digits = normalizeTrPhone(phone);
    if (!digits || digits === '90') return;
    const win = window.open(`https://wa.me/${digits}?text=${encodeURIComponent(text)}`, '_blank');
    if (!win) alert('Tarayıcı pencereyi engelledi — popup iznini kontrol et');
  }

  const bugunFirmaListesi = useMemo(() => {
    const gunBaslangic = new Date();
    gunBaslangic.setHours(0, 0, 0, 0);
    const gunBaslangicTs = gunBaslangic.getTime();
    return (cariler || [])
      .filter((c) => c.tip === 'firma')
      .map((c) => {
        const tutar = (cariHareketler || [])
          .filter((h) => h.cariId === c.id && h.ts >= gunBaslangicTs)
          .reduce((s, h) => s + h.toplam, 0);
        return { cari: c, tutar };
      })
      .filter((x) => x.tutar > 0)
      .sort((a, b) => b.tutar - a.tutar);
  }, [cariler, cariHareketler]);

  const bireyselNumarasizListesi = useMemo(
    () => (cariler || []).filter((c) => c.tip === 'bireysel' && !c.telefon),
    [cariler]
  );

  function openCariOzetiFromUyari(cari, tutar) {
    const text = `${cari.ad}\n\nBugünkü Sipariş Tutarı: ${TL(tutar)}\n\nBu tutar cari hesabınıza işlenmiştir.`;
    waShare(text, cari.telefon);
  }

  function saveBireyselPhoneFromUyari(cariId) {
    if (!cariUyariPhoneDraft.trim()) return;
    updateCari(cariId, { telefon: cariUyariPhoneDraft.trim() });
    setCariUyariEditId(null);
    setCariUyariPhoneDraft('');
  }

  // ---- Mutfağa Not — büyük yazıp yazdırıp mutfağa gönderme + tüm cihazlarda görünen hazır notlar ----
  const [mutfakNotOpen, setMutfakNotOpen] = useState(false);
  const [mutfakNotText, setMutfakNotText] = useState('');
  const [mutfakNotYeniHazir, setMutfakNotYeniHazir] = useState('');
  const [mutfakNotPrintData, setMutfakNotPrintData] = useState(null);

  function openMutfakNot() {
    setMutfakNotText('');
    setMutfakNotOpen(true);
    fetchEkmekKayitlar();
  }
  function printMutfakNot() {
    if (!mutfakNotText.trim()) return;
    setMutfakNotPrintData(mutfakNotText.trim());
    setTimeout(() => window.print(), 150);
  }
  function addHazirNotAndUse() {
    if (!mutfakNotYeniHazir.trim()) return;
    addMutfakHazirNot(mutfakNotYeniHazir.trim());
    setMutfakNotYeniHazir('');
  }

  // ---- Ekmek Gönderme — Mutfağa Not'un yanında açılır. 4 sabit ekmek türü + adet,
  // yazdırınca aynı zamanda Sheets'e ("Ekmek Kayıtları" sekmesi) kaydediyor VE
  // Yönetim Paneli'ndeki ortak ekmek stoğundan bu adetleri düşüyor.
  const EKMEK_TURLERI = [
    { key: 'buyukBeyaz', label: 'Büyük Beyaz Ekmeği' },
    { key: 'kucukBeyaz', label: 'Küçük Beyaz Ekmeği' },
    { key: 'domatesli', label: 'Domatesli/Fesleğenli Ekmeği' },
    { key: 'kucukKepek', label: 'Küçük Kepek Ekmeği' },
  ];
  const [ekmekMiktar, setEkmekMiktar] = useState({ buyukBeyaz: '', kucukBeyaz: '', domatesli: '', kucukKepek: '' });
  const [ekmekKayitlar, setEkmekKayitlar] = useState([]);
  const [ekmekLoading, setEkmekLoading] = useState(false);
  const [ekmekEditId, setEkmekEditId] = useState(null);
  const [ekmekEditDraft, setEkmekEditDraft] = useState({ buyukBeyaz: '', kucukBeyaz: '', domatesli: '', kucukKepek: '' });
  const [ekmekPrintData, setEkmekPrintData] = useState(null);
  const [ekmekKopyalananKod, setEkmekKopyalananKod] = useState(null);
  const ekmekInputRefs = useRef({});

  // Bu panelde de aynı eşik mantığı — Ayarlar'daki Ekmek Stok Ekleme ile aynı kaynak
  // (EKMEK_TURLERI_STOK), stok her değiştiğinde otomatik yeniden hesaplanır.
  const ekmekDusukStoklar = useMemo(
    () => EKMEK_TURLERI_STOK.filter((t) => (ekmekStok[t.key] || 0) < t.esik),
    [ekmekStok]
  );

  async function ekmekKopyalaSiparis(metin, kod) {
    try {
      await navigator.clipboard.writeText(metin);
      setEkmekKopyalananKod(kod);
      setTimeout(() => setEkmekKopyalananKod(null), 1500);
    } catch {
      /* pano izni yoksa sessizce geç */
    }
  }

  async function fetchEkmekKayitlar() {
    try {
      const res = await fetch('/api/ekmek');
      const json = await res.json();
      setEkmekKayitlar(json.records || []);
    } catch {
      /* sessizce geç, panel açıkken tekrar denenebilir */
    }
  }

  function ekmekEnterNext(key) {
    const idx = EKMEK_TURLERI.findIndex((t) => t.key === key);
    if (idx === -1 || idx === EKMEK_TURLERI.length - 1) return; // son alanda Enter hiçbir şey yapmasın
    const nextKey = EKMEK_TURLERI[idx + 1].key;
    ekmekInputRefs.current[nextKey]?.focus();
  }

  async function printEkmekVeKaydet() {
    // Boş bırakılan alanlar da "0" olarak, aynı sırayla fişte gösterilsin diye artık
    // filtrelenmiyor — hiç girilmemiş bir ekmek türü fişte "0" yazarak yine de görünür.
    const satirlar = EKMEK_TURLERI.map((t) => ({ ...t, adet: parseInt(ekmekMiktar[t.key], 10) || 0 }));
    const enAzBirGirildi = satirlar.some((t) => t.adet > 0);
    if (!enAzBirGirildi) return;
    setEkmekPrintData(satirlar);
    setTimeout(() => window.print(), 150);

    // Mutfağa fiilen giden ekmek — ortak stoktan düşülüyor (Yönetim Paneli'ndeki
    // "Ekmek Stok Ekleme" ile aynı sayaç). Sheets kaydı ile paralel, birbirini beklemiyor.
    ekmekStoktanDus({
      buyukBeyaz: parseInt(ekmekMiktar.buyukBeyaz, 10) || 0,
      kucukBeyaz: parseInt(ekmekMiktar.kucukBeyaz, 10) || 0,
      domatesli: parseInt(ekmekMiktar.domatesli, 10) || 0,
      kucukKepek: parseInt(ekmekMiktar.kucukKepek, 10) || 0,
    });

    setEkmekLoading(true);
    try {
      const res = await fetch('/api/ekmek', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          buyukBeyaz: parseInt(ekmekMiktar.buyukBeyaz, 10) || 0,
          kucukBeyaz: parseInt(ekmekMiktar.kucukBeyaz, 10) || 0,
          domatesli: parseInt(ekmekMiktar.domatesli, 10) || 0,
          kucukKepek: parseInt(ekmekMiktar.kucukKepek, 10) || 0,
        }),
      });
      const json = await res.json();
      if (json.record) setEkmekKayitlar((prev) => [json.record, ...prev]);
      setEkmekMiktar({ buyukBeyaz: '', kucukBeyaz: '', domatesli: '', kucukKepek: '' });
      ekmekInputRefs.current.buyukBeyaz?.focus();
    } catch {
      alert('Ekmek kaydı Sheets\'e yazılamadı — bağlantıyı kontrol et');
    } finally {
      setEkmekLoading(false);
    }
  }

  function openEkmekEdit(rec) {
    setEkmekEditId(rec.id);
    setEkmekEditDraft({ buyukBeyaz: rec.buyukBeyaz, kucukBeyaz: rec.kucukBeyaz, domatesli: rec.domatesli, kucukKepek: rec.kucukKepek });
  }
  async function saveEkmekEdit() {
    try {
      const res = await fetch('/api/ekmek', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: ekmekEditId, ...ekmekEditDraft }),
      });
      const json = await res.json();
      if (json.record) {
        setEkmekKayitlar((prev) => prev.map((r) => (r.id === ekmekEditId ? json.record : r)));
      }
      setEkmekEditId(null);
    } catch {
      alert('Kayıt güncellenemedi — bağlantıyı kontrol et');
    }
  }

  const [dragFrom, setDragFrom] = useState(null);
  const [dragOverTable, setDragOverTable] = useState(null);

  // Menü dışına tıklayınca kapansın (v9'un kendi demo'sundaki mantıkla aynı)
  useEffect(() => {
    if (!menuFor) return;
    const close = () => setMenuFor(null);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [menuFor]);

  function toggleMenu(e, table) {
    e.stopPropagation();
    if (menuFor === table) {
      setMenuFor(null);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    setMenuPos({
      top: window.scrollY + rect.bottom + 6,
      left: Math.min(window.scrollX + rect.left - 100, window.innerWidth - 176),
    });
    setMenuFor(table);
  }

  const allDynamicTargets = [...SALON_TABLES, ...ALT_TABLES, ...packages.map((p) => p.name)];

  const [occupiedConfirmTable, setOccupiedConfirmTable] = useState(null);

  function openTable(table) {
    if (isTableOccupiedElsewhere(table)) {
      setOccupiedConfirmTable(table);
      return;
    }
    setSelectedTable(table);
    onNavigate('pos');
  }

  function confirmOpenOccupiedTable() {
    setSelectedTable(occupiedConfirmTable);
    onNavigate('pos');
    setOccupiedConfirmTable(null);
  }

  function startEditNote(e, table) {
    e.stopPropagation();
    setMenuFor(null);
    setEditingNoteFor(table);
    setNoteDraft(tableNotes[table] || '');
  }
  function saveNote(e, table) {
    if (e) e.stopPropagation();
    setTableNotes((prev) => ({ ...prev, [table]: noteDraft }));
    setEditingNoteFor(null);
  }
  async function pasteIntoNoteDraft(e) {
    e.stopPropagation();
    try {
      const text = await navigator.clipboard.readText();
      if (text) setNoteDraft((prev) => (prev ? `${prev} ${text}` : text));
    } catch {
      /* pano izni yoksa sessizce geç */
    }
  }
  // Görünüm modundayken yapıştır'a basılırsa: önce düzenleme moduna geçer, sonra pano
  // içeriğini mevcut nota ekler — eskiden bu buton görünüm modunda görünmüyordu (v9
  // referansında vardı), ekleyince önce bu işlevsel hale getirilmesi gerekiyordu.
  async function pasteAndEdit(e, table) {
    e.stopPropagation();
    setMenuFor(null);
    setEditingNoteFor(table);
    const current = tableNotes[table] || '';
    try {
      const text = await navigator.clipboard.readText();
      setNoteDraft(text ? (current ? `${current} ${text}` : text) : current);
    } catch {
      setNoteDraft(current);
    }
  }

  function askTransfer(e, table) {
    e.stopPropagation();
    setMenuFor(null);
    if (isTableOccupiedElsewhere(table)) {
      return;
    }
    const targets = allDynamicTargets.filter((t) => t !== table && (!orders[t] || orders[t].length === 0) && !isTableOccupiedElsewhere(t));
    if (targets.length === 0) return;
    setPickModal({
      title: `${table} nereye taşınsın?`,
      options: targets,
      onPick: (target) => {
        if (isTableOccupiedElsewhere(table) || isTableOccupiedElsewhere(target)) {
          setPickModal(null);
          return;
        }
        transferTable(table, target);
        setPickModal(null);
      },
    });
  }

  function askMerge(e, table) {
    e.stopPropagation();
    setMenuFor(null);
    if (isTableOccupiedElsewhere(table)) {
      return;
    }
    const targets = allDynamicTargets.filter((t) => t !== table && orders[t] && orders[t].length > 0 && !isTableOccupiedElsewhere(t));
    if (targets.length === 0) return;
    setPickModal({
      title: `${table} hangi masayla birleştirilsin?`,
      options: targets,
      onPick: (target) => {
        if (isTableOccupiedElsewhere(table) || isTableOccupiedElsewhere(target)) {
          setPickModal(null);
          return;
        }
        mergeTable(table, target);
        setPickModal(null);
      },
    });
  }

  function askClose(e, table) {
    e.stopPropagation();
    setMenuFor(null);
    setCloseModalFor(table);
  }

  function handlePayClose(method) {
    closeTableWithPayment(closeModalFor, method);
    setCloseModalFor(null);
  }

  function handleDragStart(e, table) {
    if (isTableOccupiedElsewhere(table)) {
      e.preventDefault();
      return;
    }
    setDragFrom(table);
    e.dataTransfer.effectAllowed = 'move';
  }
  function handleDragOver(e, table) {
    e.preventDefault();
    setDragOverTable(table);
  }
  function handleDrop(e, table) {
    e.preventDefault();
    setDragOverTable(null);
    if (!dragFrom || dragFrom === table) {
      setDragFrom(null);
      return;
    }
    if (isTableOccupiedElsewhere(dragFrom) || isTableOccupiedElsewhere(table)) {
      setDragFrom(null);
      return;
    }
    const from = dragFrom;
    const targetHasOrder = (orders[table] || []).length > 0;
    setConfirmModal({
      title: targetHasOrder ? `${from} → ${table} ile birleştirilsin mi?` : `${from}, ${table}'e taşınsın mı?`,
      onConfirm: () => {
        if (targetHasOrder) mergeTable(from, table);
        else transferTable(from, table);
        setConfirmModal(null);
      },
    });
    setDragFrom(null);
  }

  // Zaman kademesini (0-2) sıvı dolum yüzdesi + rengine çevirir. Kullanıcının istediği gibi
  // 3 net kademe: 0-30dk yeşil, 30-60dk turuncu, 60dk+ kırmızı (getColorTier ile birebir uyumlu).
  const TIER_VISUAL = {
    0: { fill: 35, cssVar: '--tier1' },
    1: { fill: 70, cssVar: '--tier2' },
    2: { fill: 100, cssVar: '--tier3' },
  };

  function renderTableCard(table, key, compact, extraClass = '') {
    const items = orders[table] || [];
    const isEmpty = items.length === 0;
    const openedAt = tableOpenedAt[table];
    const elapsed = getElapsedMinutes(openedAt);
    const tier = getColorTier(openedAt);
    const total = getTableTotal(table);
    const note = tableNotes[table] || '';
    const isEditing = editingNoteFor === table;
    const isMenuOpen = menuFor === table;
    const occupiedElsewhere = isTableOccupiedElsewhere(table);
    const visual = TIER_VISUAL[tier] || TIER_VISUAL[0];
    // Paketçi mobil panelinden gelen SON teslimat bildirimi (varsa) — sadece bilgi amaçlı,
    // satış durumunu etkilemez.
    const sonTeslimat = paketTeslimatlari
      .filter((h) => h.paketAdi === table)
      .sort((a, b) => b.ts - a.ts)[0];
    // Paketçinin "Boşu Aldım" dediği son bildirim (varsa) — kartta ayrı bir etiket olarak gösterilir.
    const sonBosvarBildirim = bosvarBildirimleri
      .filter((b) => b.paketAdi === table)
      .sort((a, b) => b.ts - a.ts)[0];

    const noteEditRow = isEditing && (
      <div className="tb-note-edit" onClick={(e) => e.stopPropagation()}>
        <input
          autoFocus
          value={noteDraft}
          onChange={(e) => setNoteDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && saveNote(e, table)}
          placeholder="Not yaz..."
        />
        <button className="tb-note-paste" onClick={pasteIntoNoteDraft} title="Panodan yapıştır"><ClipboardPaste size={13} /></button>
        <button className="tb-note-save" onClick={(e) => saveNote(e, table)}><Check size={13} /></button>
      </div>
    );

    const menu = isMenuOpen && menuPos && createPortal(
      <div className="tb-menu" style={{ top: menuPos.top, left: menuPos.left }} onClick={(e) => e.stopPropagation()}>
        <button onClick={(e) => askTransfer(e, table)} disabled={isEmpty}><ArrowLeftRight size={13} /> Taşı</button>
        <button onClick={(e) => askMerge(e, table)} disabled={isEmpty}><Link2 size={13} /> Birleştir</button>
        <button className="danger" onClick={(e) => askClose(e, table)} disabled={isEmpty}><XCircle size={13} /> Masayı Kapat</button>
      </div>,
      document.body
    );

    const deliveryTag = sonTeslimat && (
      <div className={`tb-delivery-tag ${sonTeslimat.durum}`}>
        {sonTeslimat.tip === 'teslim_edildi'
          ? sonTeslimat.durum === 'onaylandi' ? '✓ Teslim edildi'
          : sonTeslimat.durum === 'reddedildi' ? '✕ Teslimat reddedildi'
          : 'Teslim edildi (paketçi bildirdi)'
          : sonTeslimat.durum === 'onaylandi' ? `✓ Kısmi ödeme onaylandı`
          : sonTeslimat.durum === 'reddedildi' ? '✕ Kısmi ödeme reddedildi'
          : 'Kısmi ödeme bildirildi'}
      </div>
    );
    const bosvarTag = sonBosvarBildirim && (
      <div className="tb-bosvar-alindi-tag">
        📦 {sonBosvarBildirim.paketciAdi} — Boşu Aldım
      </div>
    );

    const lockedOverlay = occupiedElsewhere && (
      <div className="tb-locked-overlay">
        <Lock />
        <div className="tb-locked-text">Başka cihazda<br />açık</div>
      </div>
    );

    const cardClass = `tb-card tier-${isEmpty ? 'empty' : tier} ${dragOverTable === table ? 'drag-over' : ''} ${isMenuOpen ? 'menu-open' : ''} ${compact ? 'tb-card-compact' : ''} ${occupiedElsewhere ? 'locked' : ''} ${tier === 2 ? 'full' : ''} ${extraClass}`;
    const dragProps = {
      draggable: !isEmpty,
      onDragStart: (e) => handleDragStart(e, table),
      onDragOver: (e) => handleDragOver(e, table),
      onDragLeave: () => setDragOverTable((t) => (t === table ? null : t)),
      onDrop: (e) => handleDrop(e, table),
      onClick: () => openTable(table),
    };

    // ---- Boş masa: v9'daki "dokun ve aç" kartı — kesikli çerçeve + parlayan (+) ----
    if (isEmpty && !compact) {
      return (
        <div key={key || table} className={`tb-card tier-empty ${occupiedElsewhere ? 'locked' : ''} ${extraClass}`} {...dragProps}>
          <div className="tb-empty-plus-wrap">
            <div className="tb-empty-plus"><Plus size={20} /></div>
          </div>
          <div className="tb-empty-label">{table}</div>
          <div className="tb-empty-tag">Boş · dokun ve aç</div>
          {lockedOverlay}
        </div>
      );
    }

    if (compact) {
      return (
        <div key={key || table} className={cardClass} {...dragProps}>
          {!isEmpty && <div className="tb-liquid" style={{ '--fill': `${visual.fill}%`, '--fill-color': `var(${visual.cssVar})` }} />}
          <div className="tb-card-top">
            <span className="tb-card-name">
              {table}
            </span>
            {!isEmpty && <span className="tb-card-total-inline">{TLKart(total)}</span>}
            {/* Paketlerde taşıma/birleştirme yapılmıyor — direkt kapatma butonu yeterli */}
            <button
              className="tb-close-btn"
              onClick={(e) => askClose(e, table)}
              disabled={isEmpty}
              title="Paketi Kapat"
            >
              <XCircle size={16} />
            </button>
          </div>
          {isEditing ? (
            noteEditRow
          ) : (
            !isEmpty && (
              <div className="tb-card-subline" onClick={(e) => startEditNote(e, table)}>
                {elapsed} dk{note ? ` · ${note}` : ' · not ekle'}
              </div>
            )
          )}
          {deliveryTag}
          {bosvarTag}
          {lockedOverlay}
        </div>
      );
    }

    return (
      <div key={key || table} className={cardClass} {...dragProps}>
        {!isEmpty && <div className="tb-liquid" style={{ '--fill': `${visual.fill}%`, '--fill-color': `var(${visual.cssVar})` }} />}
        <div className="tb-card-top">
          <span className="tb-card-name">{table}</span>
          <button className="tb-menu-btn" onClick={(e) => toggleMenu(e, table)}>
            <MoreVertical size={15} />
          </button>
          {menu}
        </div>

        {!isEmpty && (
          <>
            <div className="tb-badges">
              <span className="tb-badge">
                {elapsed} dk · {new Date(openedAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
            <div className="tb-card-amount">{TLKart(total)}</div>
          </>
        )}

        {!isEmpty && (
          isEditing ? (
            noteEditRow
          ) : (
            <div className="tb-card-note" onClick={(e) => startEditNote(e, table)}>
              {note ? <span className="txt">{note}</span> : <span className="txt placeholder">not ekle</span>}
              <button className="tb-note-paste" onClick={(e) => pasteAndEdit(e, table)} title="Panodan yapıştır"><ClipboardPaste size={12} /></button>
            </div>
          )
        )}

        {deliveryTag}
        {bosvarTag}
        {lockedOverlay}
      </div>
    );
  }

  function renderSalonGrid() {
    return (
      <div className="tb-salon-grid">
        <div style={{ gridArea: 'm9' }}>{renderTableCard('Masa 9')}</div>
        <div style={{ gridArea: 'm8' }}>{renderTableCard('Masa 8')}</div>
        <div style={{ gridArea: 'm7' }}>{renderTableCard('Masa 7')}</div>
        <div style={{ gridArea: 'm6' }}>{renderTableCard('Masa 6')}</div>
        <div style={{ gridArea: 'm5' }}>{renderTableCard('Masa 5')}</div>
        {/* 10-11 yapışık çift — p1 alanı 2 sütun kaplıyor */}
        <div className="tb-salon-pair" style={{ gridArea: 'p1' }}>
          {renderTableCard('Masa 10', null, false, 'tb-pair-left')}
          {renderTableCard('Masa 11', null, false, 'tb-pair-right')}
        </div>
        {/* 4-3 yapışık çift — p2 alanı 2 sütun kaplıyor */}
        <div className="tb-salon-pair" style={{ gridArea: 'p2' }}>
          {renderTableCard('Masa 4', null, false, 'tb-pair-left')}
          {renderTableCard('Masa 3', null, false, 'tb-pair-right')}
        </div>
      </div>
    );
  }

  return (
    <div className="tb-shell">
      <div className="tb-top-row">
        <div className="tb-logo-capsule">
          <img src="/hippos-logo.gif" alt="Hippos" className="tb-logo-gif" />
          <div className="tb-logo-text-col">
            <span className="tb-logo-title">Hippos</span>
            <span className="tb-logo-sub">homemade pos</span>
          </div>
        </div>

        <button className="tb-quicksale" onClick={() => openTable(QUICK_SALE)}>
          <div className="tb-quicksale-track">
            {Array.from({ length: 8 }).map((_, i) => (
              <span className="tb-qs-item" key={i}>
                <svg className="tb-qs-bolt" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <defs>
                    <linearGradient id={`boltGrad${i}`} x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0%" stopColor="#FFE873" />
                      <stop offset="55%" stopColor="#F7B733" />
                      <stop offset="100%" stopColor="#D97B1E" />
                    </linearGradient>
                  </defs>
                  <path fill={`url(#boltGrad${i})`} d="M14.615 1.595a.75.75 0 01.359.852L12.982 9.75h7.268a.75.75 0 01.548 1.262l-10.5 11.25a.75.75 0 01-1.272-.71l1.992-7.302H3.75a.75.75 0 01-.548-1.262l10.5-11.25a.75.75 0 01.913-.143z" />
                </svg>
                <span className="tb-qs-text">Hızlı Satış</span>
              </span>
            ))}
          </div>
          {(orders[QUICK_SALE] || []).length > 0 && (
            <span className="tb-quicksale-amount">{TLKart(getTableTotal(QUICK_SALE))}</span>
          )}
        </button>

        <button className="tb-mutfak-not-btn" onClick={openMutfakNot}>
          <StickyNote size={20} />
          <span>Mutfağa Not</span>
        </button>
      </div>

      <div className="tb-columns">
        <div className="tb-left">
          <section className="tb-section">
            <h2 className="tb-section-title">Salon</h2>
            {renderSalonGrid()}
          </section>
          <section className="tb-section">
            <h2 className="tb-section-title">Alt Kat</h2>
            <div className="tb-flow">{ALT_TABLES.map((t) => renderTableCard(t))}</div>
          </section>
        </div>

        <aside className="tb-packages">
          <div className="tb-packages-header">
            <h2 className="tb-section-title">Paketler</h2>
            <div className="tb-packages-header-btns">
              <button
                className="tb-add-package tb-add-package-narrow"
                onClick={() => {
                  const name = openPackage();
                  openTable(name);
                }}
              >
                <div className="tb-add-package-plus-wrap">
                  <div className="tb-add-package-plus"><Plus size={18} /></div>
                </div>
                <span>Yeni Paket</span>
              </button>
              <button className="tb-bosvar-header-btn" onClick={() => { setBosvarPromptOpen(true); setBosvarPromptAdres(''); setBosvarPromptNot(''); }}>
                <PackageOpen size={16} /> Boş Var!
              </button>
            </div>
          </div>
          {bosvarPromptOpen && (
            <div className="tb-bosvar-prompt-overlay" onClick={() => setBosvarPromptOpen(false)}>
              <div className="tb-bosvar-prompt-modal" onClick={(e) => e.stopPropagation()}>
                <h3>Boş Var</h3>
                <textarea
                  autoFocus
                  rows={2}
                  placeholder="Adres..."
                  value={bosvarPromptAdres}
                  onChange={(e) => setBosvarPromptAdres(e.target.value)}
                />
                <textarea
                  rows={2}
                  placeholder="Not (opsiyonel)..."
                  value={bosvarPromptNot}
                  onChange={(e) => setBosvarPromptNot(e.target.value)}
                />
                <div className="tb-bosvar-prompt-actions">
                  <button onClick={() => setBosvarPromptOpen(false)}>Vazgeç</button>
                  <button
                    className="primary"
                    disabled={!bosvarPromptAdres.trim()}
                    onClick={async () => {
                      const adres = bosvarPromptAdres.trim();
                      const not = bosvarPromptNot.trim();
                      const adresNot = not ? `${adres} — ${not}` : adres;
                      await submitBosvarKaydi(adresNot);
                      setBosvarPromptOpen(false);
                    }}
                  >
                    Kaydet
                  </button>
                </div>
              </div>
            </div>
          )}
          <div className={`tb-package-list ${packages.length > 8 ? 'ultra-compact' : packages.length > 4 ? 'compact' : ''}`}>
            {packages.map((p) => renderTableCard(p.name, p.name, true))}
            {bosvarKayitListesi.map((b) => (
              <div key={`bv-${b.id}`} className="tb-bosvar-package-card">
                <div className="tb-bosvar-package-top">
                  <PackageOpen size={12} /> <span>{b.adresNot}</span>
                </div>
                {b.paketciNotu && (
                  <div className="tb-bosvar-package-not">
                    "{b.paketciNotu}"
                    {b.updatedTs && <span className="tb-bosvar-package-not-time"> — {new Date(b.updatedTs).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>}
                  </div>
                )}
                {bosvarAlamadiFormFor === b.id ? (
                  <div className="tb-bosvar-package-form" onClick={(e) => e.stopPropagation()}>
                    <textarea
                      autoFocus
                      rows={2}
                      placeholder="Neden alamadı, ne zaman alacak?"
                      value={bosvarAlamadiNotu}
                      onChange={(e) => setBosvarAlamadiNotu(e.target.value)}
                    />
                    <div className="tb-bosvar-package-form-row">
                      <button onClick={() => setBosvarAlamadiFormFor(null)}>Vazgeç</button>
                      <button
                        className="primary"
                        disabled={!bosvarAlamadiNotu.trim()}
                        onClick={() => {
                          paketciBosvarAlamadi(b.id, bosvarAlamadiNotu.trim());
                          setBosvarAlamadiFormFor(null);
                          setBosvarAlamadiNotu('');
                        }}
                      >
                        Gönder
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="tb-bosvar-package-row">
                    <button className="tb-bosvar-package-aldi" onClick={() => paketciBosvarAldi(b.id)}>Alındı</button>
                    <button className="tb-bosvar-package-alamadi" onClick={() => { setBosvarAlamadiFormFor(b.id); setBosvarAlamadiNotu(''); }}>Alınamadı</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </aside>
      </div>

      {/* Cari Uyarı — gün sonu firmalara toplu WhatsApp + numarası eksik bireysel uyarısı */}
      <div className="tb-cari-uyari-wrap">
        {cariUyariOpen && (
          <div className="tb-cari-uyari-panel">
            <div className="tb-history-head">
              <span>Cari Uyarı</span>
              <button onClick={() => setCariUyariOpen(false)}><X size={14} /></button>
            </div>
            <div className="tb-cari-uyari-tabs">
              <button className={cariUyariTab === 'firma' ? 'active' : ''} onClick={() => setCariUyariTab('firma')}>Firmalar</button>
              <button className={cariUyariTab === 'bireysel' ? 'active' : ''} onClick={() => setCariUyariTab('bireysel')}>Bireysel (Numara Eksik)</button>
            </div>

            {cariUyariTab === 'firma' ? (
              <div className="tb-cari-uyari-list">
                {bugunFirmaListesi.length === 0 && <p className="tb-history-empty">Bugün cariye giden firma siparişi yok</p>}
                {bugunFirmaListesi.map(({ cari, tutar }) => (
                  <div key={cari.id} className="tb-cari-uyari-row">
                    <div className="info">
                      <span className="ad">{cari.ad}</span>
                      <span className="tutar">{TL(tutar)}</span>
                    </div>
                    <button className="tb-cari-uyari-wa" onClick={() => openCariOzetiFromUyari(cari, tutar)} disabled={!cari.telefon}>
                      <MessageCircle size={13} /> {cari.telefon ? 'Cari Özeti Gönder' : 'Numara Yok'}
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="tb-cari-uyari-list">
                <p className="tb-cari-uyari-warn">⚠️ {bireyselNumarasizListesi.length} bireysel müşteride telefon eksik</p>
                {bireyselNumarasizListesi.length === 0 && <p className="tb-history-empty">Hepsinde numara kayıtlı 🎉</p>}
                {bireyselNumarasizListesi.map((c) => (
                  <div key={c.id} className="tb-cari-uyari-row">
                    {cariUyariEditId === c.id ? (
                      <div className="tb-cari-uyari-edit">
                        <input
                          autoFocus
                          placeholder="0532 123 45 67"
                          value={cariUyariPhoneDraft}
                          onChange={(e) => setCariUyariPhoneDraft(e.target.value)}
                        />
                        <button onClick={() => setCariUyariEditId(null)}>Vazgeç</button>
                        <button className="save" onClick={() => saveBireyselPhoneFromUyari(c.id)}>Kaydet</button>
                      </div>
                    ) : (
                      <>
                        <div className="info"><span className="ad">{c.ad}</span></div>
                        <button className="tb-cari-uyari-edit-btn" onClick={() => { setCariUyariEditId(c.id); setCariUyariPhoneDraft(''); }}>
                          Düzenle
                        </button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        <button
          className={`tb-cari-uyari-fab ${bireyselNumarasizListesi.length > 0 ? 'warn' : 'ok'}`}
          onClick={() => { setCariUyariTab('bireysel'); setCariUyariOpen((v) => !v); }}
        >
          <MessageCircle size={19} />
          {bireyselNumarasizListesi.length > 0 && <span className="tb-history-badge">{bireyselNumarasizListesi.length}</span>}
        </button>
      </div>

      {/* Son işlemler / geri al */}
      <div className="tb-history-wrap">
        {historyOpen && (
          <div className="tb-history-panel">
            <div className="tb-history-head">
              <span>Son İşlemler</span>
              <button onClick={() => setHistoryOpen(false)}><X size={14} /></button>
            </div>
            {actionHistory.length === 0 && <p className="tb-history-empty">Henüz işlem yok</p>}
            {actionHistory.map((h, idx) => (
              <div key={h.id} className={`tb-history-item ${idx === 0 ? 'latest' : ''}`}>
                <div>
                  <p className="desc">{h.description}</p>
                  <p className="time">{h.time}</p>
                </div>
                {idx === 0 && (
                  <button className="tb-undo-btn" onClick={undoLastAction}>
                    <Undo2 size={12} /> Geri Al
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
        <button className="tb-history-fab" onClick={() => setHistoryOpen((v) => !v)}>
          <Undo2 size={19} />
          {actionHistory.length > 0 && <span className="tb-history-badge">{actionHistory.length}</span>}
        </button>
      </div>

      {/* Taşı / Birleştir — hedef masa seçimi */}
      {pickModal && (
        <div className="tb-modal-overlay" onClick={() => setPickModal(null)}>
          <div className="tb-modal" onClick={(e) => e.stopPropagation()}>
            <h3>{pickModal.title}</h3>
            <div className="tb-modal-options">
              {pickModal.options.map((t) => (
                <button key={t} onClick={() => pickModal.onPick(t)}>{t}</button>
              ))}
            </div>
            <button className="tb-cancel-link" onClick={() => setPickModal(null)}>Vazgeç</button>
          </div>
        </div>
      )}

      {/* Sürükle-bırak onayı */}
      {confirmModal && (
        <div className="tb-modal-overlay" onClick={() => setConfirmModal(null)}>
          <div className="tb-modal" onClick={(e) => e.stopPropagation()}>
            <h3>{confirmModal.title}</h3>
            <div className="tb-modal-footer">
              <button className="tb-secondary" onClick={() => setConfirmModal(null)}>Vazgeç</button>
              <button className="tb-primary" onClick={confirmModal.onConfirm}>Onayla</button>
            </div>
          </div>
        </div>
      )}

      {/* Başka cihazda açık masa uyarısı */}
      {occupiedConfirmTable && (
        <div className="tb-modal-overlay" onClick={() => setOccupiedConfirmTable(null)}>
          <div className="tb-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Dikkat</h3>
            <p style={{ fontSize: '13px', color: 'var(--ink-muted)', lineHeight: 1.5, margin: '0 0 16px' }}>
              <strong>{occupiedConfirmTable}</strong> şu an başka bir cihazda açık görünüyor. Aynı anda iki cihazdan
              düzenlemek çakışmaya yol açabilir. Yine de girmek istiyor musun?
            </p>
            <div className="tb-modal-footer">
              <button className="tb-secondary" onClick={() => setOccupiedConfirmTable(null)}>Vazgeç</button>
              <button className="tb-primary" onClick={confirmOpenOccupiedTable}>Yine de Gir</button>
            </div>
          </div>
        </div>
      )}

      {/* Masayı kapat — ödeme yöntemi */}
      {closeModalFor && (
        <div className="tb-modal-overlay" onClick={() => setCloseModalFor(null)}>
          <div className="tb-modal" onClick={(e) => e.stopPropagation()}>
            <h3>{closeModalFor} <span className="tb-modal-amount">{TL(getTableTotal(closeModalFor))}</span></h3>
            <p className="tb-modal-hint">Ödeme yöntemini seç:</p>
            <div className="tb-pay-options">
              <button className="cash" onClick={() => handlePayClose('NAKİT')}><Banknote size={18} /> Nakit</button>
              <button className="card" onClick={() => handlePayClose('KREDİ KARTI')}><CreditCard size={18} /> Kredi K.</button>
              <button className="meal" onClick={() => handlePayClose('YEMEK KARTI')}><UtensilsCrossed size={18} /> Yemek K.</button>
              <button className="credit" onClick={() => handlePayClose('CARİ')}><BookOpen size={18} /> Cari</button>
            </div>
            <button className="tb-cancel-link" onClick={() => setCloseModalFor(null)}>İptal</button>
          </div>
        </div>
      )}

      {/* Mutfağa Not — büyük yazıp yazdırma + tüm cihazlarda görünen hazır notlar */}
      {mutfakNotOpen && (
        <div className="tb-modal-overlay" onClick={() => setMutfakNotOpen(false)}>
          <div className="tb-mutfak-ekmek-row" onClick={(e) => e.stopPropagation()}>
            <div className="tb-modal tb-mutfak-not-modal">
              <h3><StickyNote size={16} /> Mutfağa Not</h3>
              <textarea
                autoFocus
                className="tb-mutfak-not-textarea"
                placeholder="Örn: Tereyağlı Sade Omlet"
                value={mutfakNotText}
                onChange={(e) => setMutfakNotText(e.target.value)}
              />
              <div className="tb-modal-footer">
                <button className="tb-secondary" onClick={() => setMutfakNotOpen(false)}><Undo2 size={14} /> Geri</button>
                <button className="tb-primary" disabled={!mutfakNotText.trim()} onClick={printMutfakNot}><Printer size={14} /> Yazdır</button>
              </div>

              <div className="tb-hazir-notlar-section">
                <span className="tb-hazir-notlar-label">Hızlı Notlar</span>
                <div className="tb-hazir-notlar-list">
                  {mutfakHazirNotlar.map((n) => (
                    <div key={n.id} className="tb-hazir-not-chip">
                      <button className="text" onClick={() => setMutfakNotText((prev) => (prev ? `${prev}\n${n.metin}` : n.metin))}>
                        {n.metin}
                      </button>
                      <button className="del" onClick={() => deleteMutfakHazirNot(n.id)}><X size={11} /></button>
                    </div>
                  ))}
                  {mutfakHazirNotlar.length === 0 && <p className="tb-history-empty">Henüz hazır not yok</p>}
                </div>
                <div className="tb-hazir-not-add">
                  <input
                    placeholder="Yeni hazır not ekle..."
                    value={mutfakNotYeniHazir}
                    onChange={(e) => setMutfakNotYeniHazir(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addHazirNotAndUse()}
                  />
                  <button onClick={addHazirNotAndUse}><Plus size={14} /></button>
                </div>
              </div>
            </div>

            {/* Ekmek Gönderme — stok+ikaz artık ilgili ekmek satırının yanında, sipariş kartları yan yana grid */}
            <div className="tb-modal tb-ekmek-modal">
              <h3 className="tb-ekmek-modal-title"><UtensilsCrossed size={16} /> Ekmek Gönderme</h3>

              <div className="tb-ekmek-col-left">
                  <div className="tb-ekmek-form">
                    {EKMEK_TURLERI.map((t) => {
                      const stokBilgi = EKMEK_TURLERI_STOK.find((s) => s.key === t.key);
                      const dusuk = stokBilgi && (ekmekStok[t.key] || 0) < stokBilgi.esik;
                      return (
                        <React.Fragment key={t.key}>
                          <span className="tb-ekmek-label">{t.label}:</span>
                          <input
                            ref={(el) => { ekmekInputRefs.current[t.key] = el; }}
                            type="number"
                            min={0}
                            inputMode="numeric"
                            className="tb-ekmek-input"
                            value={ekmekMiktar[t.key]}
                            onChange={(e) => setEkmekMiktar((prev) => ({ ...prev, [t.key]: e.target.value }))}
                            onKeyDown={(e) => e.key === 'Enter' && ekmekEnterNext(t.key)}
                          />
                          <span className="tb-ekmek-stok-cell">Stok: {ekmekStok[t.key] ?? 0}</span>
                          <span className={dusuk ? 'tb-ekmek-uyari-cell dusuk' : 'tb-ekmek-uyari-cell'}>
                            {dusuk && <>⚠️ {stokBilgi.uyariMesaji}</>}
                          </span>
                        </React.Fragment>
                      );
                    })}
                  </div>

                  <button
                    className="tb-primary tb-ekmek-print-btn"
                    disabled={ekmekLoading || EKMEK_TURLERI.every((t) => !(parseInt(ekmekMiktar[t.key], 10) > 0))}
                    onClick={printEkmekVeKaydet}
                  >
                    <Printer size={14} /> Yazdır
                  </button>

                  {ekmekDusukStoklar.length > 0 && (
                    <div className="tb-ekmek-siparis-section">
                      <span className="tb-ekmek-siparis-baslik">Sipariş Edilecekler</span>
                      <div className="tb-ekmek-siparis-grid">
                        {ekmekDusukStoklar.map((t) => (
                          <div key={t.key} className="tb-ekmek-siparis-kart">
                            <span className="tb-ekmek-siparis-kart-text">
                              {t.siparisMetni} <span className="tb-ekmek-siparis-marka">{EKMEK_SIPARIS_MARKA[t.key]}</span>
                            </span>
                            <button
                              className="tb-ekmek-siparis-kopyala-btn"
                              title="Kopyala"
                              onClick={() => ekmekKopyalaSiparis(t.siparisMetni, t.key)}
                            >
                              {ekmekKopyalananKod === t.key ? <Check size={13} /> : <Copy size={13} />}
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="tb-ekmek-kayitlar">
                    <span className="tb-hazir-notlar-label">Bugünkü Kayıtlar</span>
                    {ekmekKayitlar.length === 0 && <p className="tb-history-empty">Bugün henüz kayıt yok</p>}
                    <div className="tb-ekmek-kayit-grid">
                      {ekmekKayitlar.map((rec) => (
                        <div key={rec.id} className="tb-ekmek-kayit-row">
                          {ekmekEditId === rec.id ? (
                            <div className="tb-ekmek-edit">
                              <span className="saat">{rec.saat}</span>
                              {EKMEK_TURLERI.map((t) => (
                                <input
                                  key={t.key}
                                  type="number"
                                  min={0}
                                  title={t.label}
                                  value={ekmekEditDraft[t.key]}
                                  onChange={(e) => setEkmekEditDraft((d) => ({ ...d, [t.key]: e.target.value }))}
                                />
                              ))}
                              <button className="vazgec" onClick={() => setEkmekEditId(null)}>Vazgeç</button>
                              <button className="kaydet" onClick={saveEkmekEdit}>Kaydet</button>
                            </div>
                          ) : (
                            <>
                              <span className="saat">{rec.saat}</span>
                              <div className="ozet-liste">
                                {EKMEK_TURLERI.filter((t) => rec[t.key] > 0).map((t) => (
                                  <span key={t.key} className="ozet-satir">
                                    {t.label.replace(' Ekmeği', '')}: {rec[t.key]}
                                  </span>
                                ))}
                              </div>
                              <button className="tb-ekmek-duzenle-btn" onClick={() => openEkmekEdit(rec)}>Düzenle</button>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Mutfağa Not — yazdırma şablonu (sadece @media print'te görünür) */}
      {mutfakNotPrintData && (
        <div id="tb-print-mutfak-not">
          <div className="tb-print-mutfak-not-text">{mutfakNotPrintData}</div>
        </div>
      )}

      {/* Ekmek Gönderme — yazdırma şablonu */}
      {ekmekPrintData && (
        <div id="tb-print-ekmek">
          <h2>Ekmek Siparişi</h2>
          {ekmekPrintData.map((t) => (
            <div key={t.key} className="tb-print-ekmek-row">
              <span>{t.label}</span>
              <span>{t.adet}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}