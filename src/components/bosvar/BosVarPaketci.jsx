/**
 * BosVarPaketci — Paketçi ekranındaki "Boşum Aldım" modülü
 *
 * Kullanım: Paketci.jsx'te PaketDetay bileşeninin içine ya da paket detay alanına
 * import edip render et.
 *
 * Props:
 *   paketAdi           — string
 *   paketciAdi         — string (localStorage'dan gelen)
 *   bosvarBildirimleri — hook'tan
 *   submitBosvar       — hook fonksiyonu ({ paketAdi, paketciAdi }) => Promise<obj|null>
 *   deleteBosvar       — hook fonksiyonu (id) => void  (geri al için)
 *   showToast          — (msg: string) => void
 */

import React, { useState, useMemo } from 'react';
import { Package, Undo2, Clock } from 'lucide-react';
import './bosvar.css';

export default function BosVarPaketci({
  paketAdi,
  paketciAdi,
  bosvarBildirimleri = [],
  submitBosvar,
  deleteBosvar,
  showToast,
}) {
  const [loading, setLoading] = useState(false);
  const [recentId, setRecentId] = useState(null); // geri alınabilir son bildirim id

  // Bu pakete ait bildirimler
  const buPaketBildirimler = useMemo(
    () => bosvarBildirimleri
      .filter((b) => b.paketAdi === paketAdi)
      .sort((a, b) => b.ts - a.ts),
    [bosvarBildirimleri, paketAdi]
  );

  const bekleyen = buPaketBildirimler.find((b) => b.durum === 'bekliyor');
  const onaylanmis = buPaketBildirimler.find((b) => b.durum === 'onaylandi');
  const reddedilmis = buPaketBildirimler.find(
    (b) => b.durum === 'reddedildi' && b.id === recentId
  );

  async function handleBosum() {
    if (loading || bekleyen) return;
    setLoading(true);
    const result = await submitBosvar({ paketAdi, paketciAdi });
    if (result) {
      setRecentId(result.id);
      showToast('Bildirim gönderildi — yönetici onayı bekleniyor');
    } else {
      showToast('Gönderilemedi, tekrar deneyin');
    }
    setLoading(false);
  }

  function handleUndo() {
    if (!recentId) return;
    deleteBosvar(recentId);
    setRecentId(null);
    showToast('Geri alındı');
  }

  // Durum etiketi
  const durumEtiketi = onaylanmis
    ? { text: '✓ Onaylandı', cls: 'bv-tag--onaylandi' }
    : bekleyen
    ? { text: 'Onay bekliyor', cls: 'bv-tag--wait' }
    : null;

  return (
    <div className="bv-pk-block">
      <div className="bv-pk-title">
        <Package size={14} /> Boş Var Durumu
      </div>

      {/* Onaylandıysa sadece yeşil rozet göster */}
      {onaylanmis && (
        <div className="bv-pk-approved">
          <span className="bv-tag bv-tag--onaylandi">✓ Yönetici Onayladı</span>
          <span className="bv-pk-name">{onaylanmis.paketciAdi}</span>
          <span className="bv-history-time">
            <Clock size={11} /> {new Date(onaylanmis.ts).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
      )}

      {/* Bekleniyorsa bilgi + geri al */}
      {!onaylanmis && bekleyen && (
        <div className="bv-pk-waiting">
          <span className="bv-tag bv-tag--wait">Onay bekleniyor…</span>
          {bekleyen.id === recentId && (
            <button className="bv-undo-btn" onClick={handleUndo}>
              <Undo2 size={12} /> Geri Al
            </button>
          )}
        </div>
      )}

      {/* Reddedildiyse uyarı + tekrar gönder */}
      {!onaylanmis && !bekleyen && buPaketBildirimler.some((b) => b.durum === 'reddedildi') && (
        <div className="bv-pk-rejected">
          <span className="bv-tag bv-tag--reddedildi">Reddedildi</span>
          {buPaketBildirimler.find((b) => b.durum === 'reddedildi')?.onayNotu && (
            <span className="bv-pk-reject-note">
              {buPaketBildirimler.find((b) => b.durum === 'reddedildi').onayNotu}
            </span>
          )}
        </div>
      )}

      {/* Ana buton: boşum aldım */}
      {!onaylanmis && !bekleyen && (
        <button
          className={`bv-bosum-btn ${loading ? 'bv-bosum-btn--loading' : ''}`}
          onClick={handleBosum}
          disabled={loading}
        >
          <Package size={16} />
          {loading ? 'Gönderiliyor…' : 'Boşum Aldım'}
        </button>
      )}
    </div>
  );
}