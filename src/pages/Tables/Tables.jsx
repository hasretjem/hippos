import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import './Tables.css';
import { SALON_TABLES, ALT_TABLES, TABLE_PAIRS, QUICK_SALE, TL, getElapsedMinutes, getColorTier } from '../../hooks/useHipposData';

// Masa/paket kartlarında tutar küsuratsız gösterilir (menüde 0,50 ₺ gibi kuruşlu ürün yok) —
// genel TL() fonksiyonu (fişler, modallar, raporlar) olduğu gibi kalıyor, sadece kart
// görünümünde bu yerel biçimleyici kullanılıyor.
const TLKart = (n) => Math.round(n || 0).toLocaleString('tr-TR') + ' ₺';
import {
  MoreVertical, Plus, ClipboardPaste, ArrowLeftRight, Link2, XCircle,
  Undo2, Banknote, CreditCard, UtensilsCrossed, BookOpen, X, Check, Zap, Lock,
} from 'lucide-react';

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

  function renderTableCard(table, key, compact) {
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

    const lockedOverlay = occupiedElsewhere && (
      <div className="tb-locked-overlay">
        <Lock />
        <div className="tb-locked-text">Başka cihazda<br />açık</div>
      </div>
    );

    const cardClass = `tb-card tier-${isEmpty ? 'empty' : tier} ${dragOverTable === table ? 'drag-over' : ''} ${isMenuOpen ? 'menu-open' : ''} ${compact ? 'tb-card-compact' : ''} ${occupiedElsewhere ? 'locked' : ''} ${tier === 2 ? 'full' : ''}`;
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
        <div key={key || table} className={`tb-card tier-empty ${occupiedElsewhere ? 'locked' : ''}`} {...dragProps}>
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
        {lockedOverlay}
      </div>
    );
  }

  function renderSalonGrid() {
    const nodes = [];
    SALON_TABLES.forEach((table) => {
      if (PAIR_SECOND.has(table)) return; // ikili grubun ikincisi, birinciyle beraber çizildi
      const pairWith = PAIR_FIRST.get(table);
      if (pairWith) {
        nodes.push(
          <div className="tb-pair" key={table}>
            {renderTableCard(table)}
            {renderTableCard(pairWith)}
          </div>
        );
      } else {
        nodes.push(renderTableCard(table));
      }
    });
    return nodes;
  }

  return (
    <div className="tb-shell">
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

      <div className="tb-columns">
        <div className="tb-left">
          <section className="tb-section">
            <h2 className="tb-section-title">Salon</h2>
            <div className="tb-flow">{renderSalonGrid()}</div>
          </section>
          <section className="tb-section">
            <h2 className="tb-section-title">Alt Kat</h2>
            <div className="tb-flow">{ALT_TABLES.map((t) => renderTableCard(t))}</div>
          </section>
        </div>

        <aside className="tb-packages">
          <h2 className="tb-section-title">Paketler</h2>
          <div className={`tb-package-list ${packages.length > 8 ? 'ultra-compact' : packages.length > 4 ? 'compact' : ''}`}>
            {packages.map((p) => renderTableCard(p.name, p.name, true))}
            <button
              className="tb-add-package"
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
          </div>
        </aside>
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
    </div>
  );
}