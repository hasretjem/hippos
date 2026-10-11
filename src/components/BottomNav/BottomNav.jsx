import React, { useEffect, useState } from 'react';
import './BottomNav.css';
import { Zap, Table2, BarChart3, Settings, Wallet, ChevronUp, ChevronDown, Pin } from 'lucide-react';
import useIsMobile from '../../hooks/useIsMobile';

const ITEMS = [
  { key: 'pos', label: 'Hızlı Satış', kisa: 'Hızlı Satış', Icon: Zap },
  { key: 'tables', label: 'Masalar', kisa: 'Masalar', Icon: Table2 },
  { key: 'cariler', label: 'Cariler', kisa: 'Cariler', Icon: Wallet },
  { key: 'reports', label: 'Kasa & Rapor', kisa: 'Rapor', Icon: BarChart3 },
  { key: 'settings', label: 'Yönetim Paneli', kisa: 'Yönetim', Icon: Settings },
];

const SABIT_ANAHTAR = 'hippos-mobil-menu-sabit';

// Telefon görünümü: menü altta ince bir ok olarak durur, oka dokununca açılır.
// "Sabitle" ile açık kalır (tercih bu cihazda hatırlanır). Masaüstünde hiç kullanılmaz.
function MobilAltMenu({ activePage, onNavigate, paketciBekleyenSayisi, stokOkunmadi }) {
  const [sabit, setSabit] = useState(() => {
    try { return localStorage.getItem(SABIT_ANAHTAR) === '1'; } catch { return false; }
  });
  const [acik, setAcik] = useState(sabit);

  useEffect(() => {
    document.body.classList.toggle('mnav-acik', acik);
    return () => document.body.classList.remove('mnav-acik');
  }, [acik]);

  function sabitDegis() {
    const yeni = !sabit;
    setSabit(yeni);
    if (yeni) setAcik(true);
    try { localStorage.setItem(SABIT_ANAHTAR, yeni ? '1' : '0'); } catch { /* tercih saklanamazsa sadece bu oturumda geçerli */ }
  }

  const uyariVar = paketciBekleyenSayisi > 0 || stokOkunmadi > 0;

  return (
    <nav className={`mnav ${acik ? 'acik' : ''}`}>
      <div className="mnav-tutamac">
        <button className="mnav-ok" onClick={() => setAcik((v) => !v)} aria-label={acik ? 'Menüyü kapat' : 'Menüyü aç'}>
          {acik ? <ChevronDown size={22} /> : <ChevronUp size={22} />}
          {!acik && uyariVar && <span className="mnav-nokta" />}
        </button>
        <button className={`mnav-sabitle ${sabit ? 'on' : ''}`} onClick={sabitDegis} aria-pressed={sabit}>
          <Pin size={13} /> {sabit ? 'Sabit' : 'Sabitle'}
        </button>
      </div>
      {acik && (
        <>
          {paketciBekleyenSayisi > 0 && <div className="mnav-ikaz">Paketçi Ödeme Bildirimi!</div>}
          <div className="mnav-butonlar">
            {ITEMS.map(({ key, kisa, Icon }) => {
              const rozet = key === 'cariler' ? paketciBekleyenSayisi : key === 'settings' ? stokOkunmadi : 0;
              return (
                <button
                  key={key}
                  className={activePage === key ? 'active' : ''}
                  onClick={() => {
                    if (!sabit) setAcik(false);
                    onNavigate(key, key === 'pos' ? { resetTable: true } : undefined);
                  }}
                >
                  <span className="nav-icon-wrap">
                    <Icon size={21} strokeWidth={2} />
                    {rozet > 0 && <span className="nav-badge">{rozet}</span>}
                  </span>
                  <span className="label">{kisa}</span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </nav>
  );
}

export default function BottomNav({ activePage, onNavigate, paketciBekleyenSayisi = 0, stokOkunmadi = 0 }) {
  const mobil = useIsMobile();
  if (mobil) {
    return <MobilAltMenu activePage={activePage} onNavigate={onNavigate} paketciBekleyenSayisi={paketciBekleyenSayisi} stokOkunmadi={stokOkunmadi} />;
  }
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