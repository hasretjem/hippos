/**
 * BosVarPanel — Satış ekranı, masa notu yanındaki tik + bildirim gösterimi
 *
 * Props:
 *   paketAdi          — string ('Paket 1' vb.)
 *   bosvarTik         — boolean (table_state'ten gelen)
 *   onTikDegis        — (yeniDeger: boolean) => void
 *   bosvarBildirimleri — hook'tan
 */
import React from 'react';
import { CheckSquare, Square, Package } from 'lucide-react';
import './bosvar.css';

export default function BosVarPanel({ paketAdi, bosvarTik, onTikDegis, bosvarBildirimleri = [] }) {
  const buPaketBildirimler = bosvarBildirimleri
    .filter((b) => b.paketAdi === paketAdi)
    .sort((a, b) => b.ts - a.ts);

  const sonBildirim = buPaketBildirimler[0] || null;

  return (
    <div className={`bv-panel ${bosvarTik ? 'bv-panel--aktif' : ''}`}>
      <button
        className="bv-tik-btn"
        onClick={() => onTikDegis(!bosvarTik)}
        title={bosvarTik ? 'Boş Var tikini kaldır' : 'Boş Var tik'}
      >
        {bosvarTik
          ? <CheckSquare size={15} className="bv-icon-aktif" />
          : <Square size={15} className="bv-icon-pasif" />
        }
        <span>Boş Var!</span>
      </button>

      {bosvarTik && sonBildirim && (
        <div className="bv-bildirim">
          <Package size={11} />
          <span className="bv-bildirim-ad">{sonBildirim.paketciAdi}</span>
          <span className="bv-bildirim-txt">Boşu Aldım dedi</span>
          <span className="bv-bildirim-saat">
            {new Date(sonBildirim.ts).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
      )}
    </div>
  );
}