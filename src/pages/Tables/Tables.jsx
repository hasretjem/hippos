import React from 'react';
import './Tables.css';
import { TABLES, TL } from '../../hooks/useHipposData';

export default function Tables({ data, setSelectedTable, onNavigate }) {
  const { orders, tableNotes } = data;

  function openTable(table) {
    setSelectedTable(table);
    onNavigate('pos');
  }

  return (
    <div className="tb-shell">
      <header className="tb-header">
        <h1>Masalar</h1>
        <span className="tb-count">{TABLES.length} masa</span>
      </header>

      <div className="tb-grid">
        {TABLES.map((table) => {
          const items = orders[table] || [];
          const payableCount = items.filter((i) => !i.note).length;
          const isEmpty = items.length === 0;
          const total = items.reduce((s, i) => s + (i.note ? 0 : i.fiyat), 0);
          const note = tableNotes[table];

          return (
            <button
              key={table}
              className={`tb-card ${isEmpty ? 'empty' : 'occupied'}`}
              onClick={() => openTable(table)}
            >
              <div className="tb-card-top">
                <span className="tb-card-name">{table}</span>
                <span className={`tb-status ${isEmpty ? 'empty' : 'occupied'}`}>
                  {isEmpty ? 'BOŞ' : 'DOLU'}
                </span>
              </div>
              {!isEmpty && (
                <>
                  <div className="tb-card-count">{payableCount} ürün</div>
                  <div className="tb-card-total">{TL(total)}</div>
                </>
              )}
              {note && <div className="tb-card-note">📝 {note}</div>}
            </button>
          );
        })}
      </div>
    </div>
  );
}