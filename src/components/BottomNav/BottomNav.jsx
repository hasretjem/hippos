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

export default function BottomNav({ activePage, onNavigate, paketciBekleyenSayisi = 0, stokOkunmadi = 0 }) {
  return (
    <nav className="nav-bottom">
      {ITEMS.map(({ key, label, Icon }) => {
        const isCari = key === 'cariler';
        const isSettings = key === 'settings';
        const hasBekleyen = isCari && paketciBekleyenSayisi > 0;
        const hasStokBildirim = isSettings && stokOkunmadi > 0;
        return (
          <button
            key={key}
            className={`${activePage === key ? 'active' : ''} ${hasBekleyen ? 'has-alert' : ''}`}
            onClick={() => onNavigate(key, key === 'pos' ? { resetTable: true } : undefined)}
          >
            <span className="nav-icon-wrap">
              <Icon size={16} strokeWidth={2} />
              {hasBekleyen && (
                <span className="nav-badge">{paketciBekleyenSayisi}</span>
              )}
              {hasStokBildirim && (
                <span className="nav-badge">{stokOkunmadi}</span>
              )}
            </span>
            <span className="label">{label}</span>
            {hasBekleyen && (
              <span className="nav-alert-text">Paketçi Ödeme Bildirimi!</span>
            )}
          </button>
        );
      })}
    </nav>
  );
}