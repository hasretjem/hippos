/**
 * BosVarPanel — Masa notu alanı yanındaki "Boş Var!" tikbuton
 * Sadece isPaketEkrani true iken render edilir.
 */
import React from 'react';
import { PackageOpen } from 'lucide-react';
import './bosvar.css';

export default function BosVarPanel({ paketAdi, bosvarTik, onTikDegis, bosvarBildirimleri = [] }) {
  const buPaketBildirimler = bosvarBildirimleri
    .filter((b) => b.paketAdi === paketAdi)
    .sort((a, b) => b.ts - a.ts);
  const sonBildirim = buPaketBildirimler[0] || null;

  return (
    <div className="bv-panel">
      <button
        className={`bv-tik-btn ${bosvarTik ? 'aktif' : ''}`}
        onClick={() => onTikDegis(!bosvarTik)}
        title={bosvarTik ? 'Boş Var tikini kaldır' : 'Boş Var tik'}
      >
        <PackageOpen size={16} />
        <span>Boş Var!</span>
        <div className="bv-tik-box">
          <span className="bv-tik-check">✓</span>
        </div>
      </button>

      {bosvarTik && sonBildirim && (
        <div className="bv-bildirim">
          <PackageOpen size={11} />
          <span>{sonBildirim.paketciAdi} — Boşu Aldım dedi</span>
          <span className="bv-bildirim-saat">
            {new Date(sonBildirim.ts).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
      )}
    </div>
  );
}