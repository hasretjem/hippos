import React, { useState, useEffect } from 'react';
import './Tables.css';
import { SALON_TABLES, ALT_TABLES, TABLE_PAIRS, QUICK_SALE, TL, getElapsedMinutes, getColorTier } from '../../hooks/useHipposData';
import {
  MoreVertical, Plus, ClipboardPaste, ArrowLeftRight, Link2, XCircle,
  Undo2, Banknote, CreditCard, UtensilsCrossed, BookOpen, X, Check, Pencil, Zap,
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
  } = data;

  // Renk-zaman kademesi her 30 dk'da bir değişsin diye periyodik yeniden çizim
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((t) => t + 1), 30000);
    return () => clearInterval(id);
  }, []);

  const [menuFor, setMenuFor] = useState(null);
  const [editingNoteFor, setEditingNoteFor] = useState(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [pickModal, setPickModal] = useState(null); // { title, options, onPick }
  const [confirmModal, setConfirmModal] = useState(null); // { title, onConfirm }
  const [closeModalFor, setCloseModalFor] = useState(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [dragFrom, setDragFrom] = useState(null);
  const [dragOverTable, setDragOverTable] = useState(null);

  const allDynamicTargets = [...SALON_TABLES, ...ALT_TABLES, ...packages.map((p) => p.name)];

  function openTable(table) {
    setSelectedTable(table);
    onNavigate('pos');
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

  function askTransfer(e, table) {
    e.stopPropagation();
    setMenuFor(null);
    const targets = allDynamicTargets.filter((t) => t !== table && (!orders[t] || orders[t].length === 0));
    if (targets.length === 0) return;
    setPickModal({
      title: `${table} nereye taşınsın?`,
      options: targets,
      onPick: (target) => {
        transferTable(table, target);
        setPickModal(null);
      },
    });
  }

  function askMerge(e, table) {
    e.stopPropagation();
    setMenuFor(null);
    const targets = allDynamicTargets.filter((t) => t !== table && orders[t] && orders[t].length > 0);
    if (targets.length === 0) return;
    setPickModal({
      title: `${table} hangi masayla birleştirilsin?`,
      options: targets,
      onPick: (target) => {
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

    const menu = isMenuOpen && (
      <div className="tb-menu" onClick={(e) => e.stopPropagation()}>
        <button onClick={(e) => askTransfer(e, table)} disabled={isEmpty}><ArrowLeftRight size={13} /> Taşı</button>
        <button onClick={(e) => askMerge(e, table)} disabled={isEmpty}><Link2 size={13} /> Birleştir</button>
        <button className="danger" onClick={(e) => askClose(e, table)} disabled={isEmpty}><XCircle size={13} /> Masayı Kapat</button>
      </div>
    );

    const cardClass = `tb-card tier-${isEmpty ? 'empty' : tier} ${dragOverTable === table ? 'drag-over' : ''} ${isMenuOpen ? 'menu-open' : ''} ${compact ? 'tb-card-compact' : ''}`;
    const dragProps = {
      draggable: !isEmpty,
      onDragStart: (e) => handleDragStart(e, table),
      onDragOver: (e) => handleDragOver(e, table),
      onDragLeave: () => setDragOverTable((t) => (t === table ? null : t)),
      onDrop: (e) => handleDrop(e, table),
      onClick: () => openTable(table),
    };

    if (compact) {
      return (
        <div key={key || table} className={cardClass} {...dragProps}>
          <div className="tb-card-top">
            <span className="tb-card-name">{table}</span>
            {!isEmpty && <span className="tb-card-total-inline">{TL(total)}</span>}
            <button className="tb-menu-btn" onClick={(e) => { e.stopPropagation(); setMenuFor(isMenuOpen ? null : table); }}>
              <MoreVertical size={14} />
            </button>
            {menu}
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
        </div>
      );
    }

    return (
      <div key={key || table} className={cardClass} {...dragProps}>
        <div className="tb-card-top">
          <span className="tb-card-name">{table}</span>
          <button className="tb-menu-btn" onClick={(e) => { e.stopPropagation(); setMenuFor(isMenuOpen ? null : table); }}>
            <MoreVertical size={15} />
          </button>
          {menu}
        </div>

        {!isEmpty && (
          <div className="tb-card-time">
            {new Date(openedAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })} · {elapsed} dk
          </div>
        )}

        {!isEmpty && (
          isEditing ? (
            noteEditRow
          ) : (
            <div className="tb-card-note" onClick={(e) => startEditNote(e, table)}>
              {note ? <span className="txt">{note}</span> : <span className="txt placeholder"><Pencil size={11} /> not ekle</span>}
            </div>
          )
        )}

        <div className="tb-card-bottom">
          {isEmpty ? <span className="tb-status-empty">Boş</span> : <span className="tb-card-total">{TL(total)}</span>}
        </div>
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
        <span className="tb-quicksale-ico"><Zap size={18} fill="currentColor" /></span>
        <span className="tb-quicksale-text">
          <span className="title">Hızlı Satış</span>
          <span className="sub">Masa açmadan direkt satış ekranına git</span>
        </span>
        {(orders[QUICK_SALE] || []).length > 0 && (
          <span className="tb-quicksale-amount">{TL(getTableTotal(QUICK_SALE))}</span>
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
              <Plus size={22} />
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