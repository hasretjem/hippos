import React from 'react';
import './BottomNav.css';

const ITEMS = [
  { key: 'pos', label: 'Ana Sayfa (POS)', icon: '🏠' },
  { key: 'tables', label: 'Masalar', icon: '🪑' },
  { key: 'reports', label: 'Kasa & Rapor', icon: '📊' },
  { key: 'settings', label: 'Ayarlar', icon: '⚙️' },
];

export default function BottomNav({ activePage, onNavigate }) {
  return (
    <nav className="nav-bottom">
      {ITEMS.map((item) => (
        <button
          key={item.key}
          className={activePage === item.key ? 'active' : ''}
          onClick={() => onNavigate(item.key)}
        >
          <span className="ico">{item.icon}</span>
          <span className="label">{item.label}</span>
        </button>
      ))}
    </nav>
  );
}