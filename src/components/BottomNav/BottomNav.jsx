import React from 'react';
import './BottomNav.css';
import { Zap, Table2, BarChart3, Settings, Wallet } from 'lucide-react';

const ITEMS = [
  { key: 'pos', label: 'Hızlı Satış', Icon: Zap },
  { key: 'tables', label: 'Masalar', Icon: Table2 },
  { key: 'cariler', label: 'Cariler', Icon: Wallet },
  { key: 'reports', label: 'Kasa & Rapor', Icon: BarChart3 },
  { key: 'settings', label: 'Yönetim Paneli', Icon: Settings },
];

export default function BottomNav({ activePage, onNavigate }) {
  return (
    <nav className="nav-bottom">
      {ITEMS.map(({ key, label, Icon }) => (
        <button
          key={key}
          className={activePage === key ? 'active' : ''}
          onClick={() => onNavigate(key)}
        >
          <Icon size={16} strokeWidth={2} />
          <span className="label">{label}</span>
        </button>
      ))}
    </nav>
  );
}