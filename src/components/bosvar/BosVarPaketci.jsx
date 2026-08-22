/**
 * BosVarPaketci — iki mod:
 *   mod='ikaz'  → liste kartında yeşil pill (içecek var gibi)
 *   mod='detay' → detay sayfasında büyük ikaz + "Boşu Aldım" butonu
 */
import React, { useState } from 'react';
import { PackageOpen } from 'lucide-react';
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

  if (!tikVar) return null;

  /* ---------- Liste kartı: sadece pill ---------- */
  if (mod === 'ikaz') {
    return (
      <div className="bv-ikaz">
        <PackageOpen size={13} /> Boş Var!
      </div>
    );
  }

  /* ---------- Detay sayfası ---------- */
  const buPaketBildirimler = bosvarBildirimleri
    .filter((b) => b.paketAdi === paketAdi)
    .sort((a, b) => b.ts - a.ts);
  const sonBildirim = buPaketBildirimler[0];

  async function handleBosum() {
    if (loading || sonBildirim) return;
    setLoading(true);
    const result = await submitBosvarBildirim({ paketAdi, paketciAdi });
    showToast(result ? 'Bildirim gönderildi' : 'Gönderilemedi, tekrar dene');
    setLoading(false);
  }

  return (
    <div className="bv-detay-blok">
      <div className="bv-ikaz bv-ikaz--buyuk">
        <PackageOpen size={15} /> Boş Var!
      </div>
      {sonBildirim ? (
        <div className="bv-gonderildi">
          ✓ Boşu Aldım — bildirildi ({new Date(sonBildirim.ts).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })})
        </div>
      ) : (
        <button
          className={`bv-bosum-btn ${loading ? 'bv-bosum-btn--loading' : ''}`}
          onClick={handleBosum}
          disabled={loading}
        >
          <PackageOpen size={15} />
          {loading ? 'Gönderiliyor…' : 'Boşu Aldım'}
        </button>
      )}
    </div>
  );
}