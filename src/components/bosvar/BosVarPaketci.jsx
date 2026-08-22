/**
 * BosVarPaketci — Paketçi ekranında iki yerde kullanılır:
 *   1. Liste kartında: yeşil "Boş Var!" ikazı (sadece görsel)
 *   2. Paket detayında: "Boşu Aldım" butonu
 *
 * Props (liste kartı için):
 *   mod='ikaz'  paketAdi  bosvarTikliler
 *
 * Props (detay için):
 *   mod='detay'  paketAdi  paketciAdi  bosvarBildirimleri  submitBosvarBildirim  showToast
 */
import React, { useState } from 'react';
import { Package } from 'lucide-react';
import './bosvar.css';

export default function BosVarPaketci({
  mod = 'ikaz',
  paketAdi,
  bosvarTikliler = [],
  paketciAdi,
  bosvarBildirimleri = [],
  submitBosvarBildirim,
  showToast,
}) {
  const [loading, setLoading] = useState(false);

  const tikVar = bosvarTikliler.includes(paketAdi);

  // Liste kartı ikazı
  if (mod === 'ikaz') {
    if (!tikVar) return null;
    return (
      <div className="bv-ikaz">
        <Package size={13} /> Boş Var!
      </div>
    );
  }

  // Detay sayfası — "Boşu Aldım" butonu
  if (!tikVar) return null;

  const buPaketBildirimler = bosvarBildirimleri
    .filter((b) => b.paketAdi === paketAdi)
    .sort((a, b) => b.ts - a.ts);

  const sonBildirim = buPaketBildirimler[0];
  const zatenGonderildi = !!sonBildirim;

  async function handleBosum() {
    if (loading || zatenGonderildi) return;
    setLoading(true);
    const result = await submitBosvarBildirim({ paketAdi, paketciAdi });
    if (result) {
      showToast('Bildirim gönderildi');
    } else {
      showToast('Gönderilemedi, tekrar dene');
    }
    setLoading(false);
  }

  return (
    <div className="bv-detay-blok">
      <div className="bv-ikaz bv-ikaz--buyuk">
        <Package size={15} /> Boş Var!
      </div>

      {zatenGonderildi ? (
        <div className="bv-gonderildi">
          ✓ Bildirim gönderildi —{' '}
          {new Date(sonBildirim.ts).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
        </div>
      ) : (
        <button
          className={`bv-bosum-btn ${loading ? 'bv-bosum-btn--loading' : ''}`}
          onClick={handleBosum}
          disabled={loading}
        >
          <Package size={15} />
          {loading ? 'Gönderiliyor…' : 'Boşu Aldım'}
        </button>
      )}
    </div>
  );
}