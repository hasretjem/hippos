/**
 * BosVarPanel — Paket siparişlere özel "Boş Var!" modülü (Satış Ekranı tarafı)
 *
 * Kullanım: DirectSale.jsx'e import edip isPaketEkrani koşulunda render et.
 * Props:
 *   paketAdi          — seçili paket adı (string)
 *   bosvarBildirimleri — hook'tan gelen tüm bosvar bildirimleri
 *   onaylaBosvar      — hook fonksiyonu
 *   reddetBosvar      — hook fonksiyonu (id, not) => void
 *   onOdemeEngelle    — boolean setter; true => Ödeme Al butonu disable olsun
 */

import React, { useState, useMemo } from 'react';
import { CheckSquare, Square, Check, X, Package } from 'lucide-react';
import './bosvar.css';

export default function BosVarPanel({
  paketAdi,
  bosvarBildirimleri = [],
  onaylaBosvar,
  reddetBosvar,
}) {
  const [rejectId, setRejectId] = useState(null);
  const [rejectNote, setRejectNote] = useState('');

  // Bu pakete ait bildirimler, en yeni önce
  const buPaketBildirimler = useMemo(
    () => bosvarBildirimleri
      .filter((b) => b.paketAdi === paketAdi)
      .sort((a, b) => b.ts - a.ts),
    [bosvarBildirimleri, paketAdi]
  );

  const bekleyen = buPaketBildirimler.find((b) => b.durum === 'bekliyor');
  const onaylanmis = buPaketBildirimler.find((b) => b.durum === 'onaylandi');

  function handleReject() {
    if (!rejectId) return;
    reddetBosvar(rejectId, rejectNote.trim() || 'Reddedildi');
    setRejectId(null);
    setRejectNote('');
  }

  // Hiç bildirim yoksa ve onay da yoksa: boş panel (Ödeme Al'ı bloke eder)
  const odemeBloklandi = !onaylanmis; // onay yokken ödeme alınamaz

  return (
    <div className={`bv-panel ${onaylanmis ? 'bv-panel--onaylandi' : ''}`}>
      <div className="bv-panel-header">
        <CheckSquare size={14} className={onaylanmis ? 'bv-icon-ok' : 'bv-icon-wait'} />
        <span>Boş Var Onayı</span>
        {onaylanmis && <span className="bv-badge bv-badge--ok">Onaylandı</span>}
        {!onaylanmis && <span className="bv-badge bv-badge--warn">Onay Bekleniyor</span>}
      </div>

      {odemeBloklandi && (
        <div className="bv-block-hint">
          <Square size={12} /> Bu paket teslim alınana kadar ödeme alınamaz.
        </div>
      )}

      {/* Bekleyen bildirim — onay/red butonu */}
      {bekleyen && !rejectId && (
        <div className="bv-pending">
          <div className="bv-pending-row">
            <span className="bv-tag bv-tag--wait">Onay bekliyor</span>
            <span className="bv-pending-name">{bekleyen.paketciAdi} — Boşum Aldım</span>
          </div>
          <div className="bv-pending-actions">
            <button
              className="bv-btn bv-btn--approve"
              onClick={() => onaylaBosvar(bekleyen.id)}
            >
              <Check size={13} /> Onayla
            </button>
            <button
              className="bv-btn bv-btn--reject"
              onClick={() => { setRejectId(bekleyen.id); setRejectNote(''); }}
            >
              <X size={13} /> Reddet
            </button>
          </div>
        </div>
      )}

      {/* Red notu girişi */}
      {rejectId && (
        <div className="bv-reject-form">
          <input
            autoFocus
            className="bv-reject-input"
            placeholder="Red sebebi (opsiyonel)"
            value={rejectNote}
            onChange={(e) => setRejectNote(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleReject()}
          />
          <div className="bv-reject-row">
            <button className="bv-btn bv-btn--reject" onClick={handleReject}>
              <X size={13} /> Reddet
            </button>
            <button className="bv-btn bv-btn--cancel" onClick={() => setRejectId(null)}>
              Vazgeç
            </button>
          </div>
        </div>
      )}

      {/* Geçmiş satırlar */}
      {buPaketBildirimler.length > 0 && (
        <div className="bv-history">
          {buPaketBildirimler.map((b) => (
            <div key={b.id} className={`bv-history-row bv-history-row--${b.durum}`}>
              <span className={`bv-tag bv-tag--${b.durum}`}>
                {b.durum === 'bekliyor' ? 'Bekliyor' : b.durum === 'onaylandi' ? 'Onaylandı' : 'Reddedildi'}
              </span>
              <span className="bv-history-name">
                <Package size={11} /> {b.paketciAdi}
              </span>
              <span className="bv-history-time">
                {new Date(b.ts).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
              </span>
              {b.onayNotu && <span className="bv-history-note">({b.onayNotu})</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * isBosvarOnaylandi — DirectSale'de Ödeme Al butonunu bloke etmek için
 * kullanılacak yardımcı. Paket ekranında değilse her zaman true (engel yok).
 */
export function isBosvarOnaylandi(paketAdi, bosvarBildirimleri = []) {
  if (!paketAdi || !paketAdi.startsWith('Paket ')) return true; // Paket değilse engel yok
  return bosvarBildirimleri.some(
    (b) => b.paketAdi === paketAdi && b.durum === 'onaylandi'
  );
}