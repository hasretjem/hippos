import React, { useState, useMemo, useRef } from 'react';
import './StokSayimEkrani.css';
import { STOK_SEKMELERI, STOK_SEKME_ROL } from '../../hooks/useStokTakip';
import { Send, RotateCcw } from 'lucide-react';

// Mutfak: Gıda + Manav, Paketçi: Ambalaj + İçecek — rol parametresiyle belirlenir.
// Fiş görünümü tarzı: Malzeme Adı — Elimizde Miktar — Birim — Not, altta Gönder/Sıfırla.
export default function StokSayimEkrani({ data, rol, adSoyad }) {
  const stok = data.stok;
  const sekmeler = STOK_SEKME_ROL[rol] || [];
  const [aktifSekme, setAktifSekme] = useState(sekmeler[0]);
  const [taslak, setTaslak] = useState({}); // { [sekme]: { [urunId]: { elimizde, not } } }
  const [gonderOnay, setGonderOnay] = useState(false);
  const [sifirlaOnay, setSifirlaOnay] = useState(false);
  const [toast, setToast] = useState('');
  const inputRefs = useRef({});

  const urunlerBuSekme = useMemo(
    () => stok.urunler.filter((u) => u.sekme === aktifSekme).sort((a, b) => a.sira - b.sira),
    [stok.urunler, aktifSekme],
  );

  // Son gönderilen kalemler (sunucudan) + üzerine yazılmamış yerel taslak birleşimi
  const sonKalemHaritasi = useMemo(() => {
    const m = {};
    const sayim = stok.sayimlar[aktifSekme];
    (sayim?.kalemler || []).forEach((k) => { m[k.urunId] = k; });
    return m;
  }, [stok.sayimlar, aktifSekme]);

  function taslakDeger(urunId, alan) {
    const yerel = taslak[aktifSekme]?.[urunId]?.[alan];
    if (yerel !== undefined) return yerel;
    return sonKalemHaritasi[urunId]?.[alan] ?? '';
  }

  function setAlan(urunId, alan, deger) {
    setTaslak((prev) => ({
      ...prev,
      [aktifSekme]: {
        ...(prev[aktifSekme] || {}),
        [urunId]: { ...(prev[aktifSekme]?.[urunId] || {}), [alan]: deger },
      },
    }));
  }

  function handleEnter(e, idx) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const next = urunlerBuSekme[idx + 1];
    if (next) {
      const ref = inputRefs.current[next.id];
      if (ref) ref.focus();
    }
  }

  async function handleSatirEkle() {
    const ad = window.prompt('Yeni ürün adı:');
    if (!ad || !ad.trim()) return;
    await stok.urunEkleMobil(aktifSekme, ad.trim());
  }

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(''), 2000);
  }

  async function handleGonderOnay() {
    const kalemlerTaslak = taslak[aktifSekme] || {};
    const kalemler = urunlerBuSekme.map((u) => {
      const t = kalemlerTaslak[u.id];
      const onceki = sonKalemHaritasi[u.id] || {};
      return {
        urunId: u.id,
        elimizde: t?.elimizde !== undefined ? t.elimizde : (onceki.elimizde || ''),
        not: t?.not !== undefined ? t.not : (onceki.not || ''),
        // Yönetim Paneli'nin yazdığı alanlar korunur, mobil taraf bunlara dokunmaz.
        siparis: onceki.siparis || '',
        kendimAlacagim: onceki.kendimAlacagim || false,
      };
    });
    await stok.sayimGonder(aktifSekme, kalemler, adSoyad);
    setTaslak((prev) => ({ ...prev, [aktifSekme]: {} }));
    setGonderOnay(false);
    showToast('Gönderildi.');
  }

  async function handleSifirlaOnay() {
    await stok.sayimSifirla(aktifSekme);
    setTaslak((prev) => ({ ...prev, [aktifSekme]: {} }));
    setSifirlaOnay(false);
    showToast('Sıfırlandı.');
  }

  const sekmeLabel = STOK_SEKMELERI.find((s) => s.key === aktifSekme)?.label || '';
  const sonGonderim = stok.sayimlar[aktifSekme]?.gonderimTarihi;

  return (
    <div className="sse-shell">
      {sekmeler.length > 1 && (
        <div className="sse-tabs">
          {sekmeler.map((key) => {
            const label = STOK_SEKMELERI.find((s) => s.key === key)?.label || key;
            return (
              <button
                key={key}
                className={`sse-tab ${aktifSekme === key ? 'active' : ''}`}
                onClick={() => setAktifSekme(key)}
              >{label}</button>
            );
          })}
        </div>
      )}

      {sonGonderim && (
        <div className="sse-son-gonderim">
          Son gönderim: {new Date(sonGonderim).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul' })}
        </div>
      )}

      <div className="sse-list">
        <div className="sse-row sse-row-head">
          <div className="sse-col sse-col-ad">Malzeme Adı</div>
          <div className="sse-col sse-col-num">Elimizde</div>
          <div className="sse-col sse-col-birim">Birim</div>
          <div className="sse-col sse-col-not">Not</div>
        </div>
        {urunlerBuSekme.map((u, idx) => (
          <div key={u.id} className="sse-row">
            <div className="sse-col sse-col-ad">{u.ad}</div>
            <div className="sse-col sse-col-num">
              <input
                ref={(el) => { inputRefs.current[u.id] = el; }}
                className="sse-input"
                value={taslakDeger(u.id, 'elimizde')}
                onFocus={(e) => e.target.select()}
                onChange={(e) => setAlan(u.id, 'elimizde', e.target.value)}
                onKeyDown={(e) => handleEnter(e, idx)}
                inputMode="decimal"
              />
            </div>
            <div className="sse-col sse-col-birim">{u.birim}</div>
            <div className="sse-col sse-col-not">
              <input
                className="sse-input sse-input-not"
                value={taslakDeger(u.id, 'not')}
                onChange={(e) => setAlan(u.id, 'not', e.target.value)}
                placeholder="not..."
              />
            </div>
          </div>
        ))}
        <div className="sse-satir-ekle">
          <button className="sse-btn sse-btn-outline" onClick={handleSatirEkle}>+ Satır Ekle</button>
        </div>
      </div>

      <div className="sse-footer">
        <button className="sse-btn sse-btn-outline" onClick={() => setSifirlaOnay(true)}>
          <RotateCcw size={16} /> Sıfırla
        </button>
        <button className="sse-btn sse-btn-primary" onClick={() => setGonderOnay(true)}>
          <Send size={16} /> Gönder
        </button>
      </div>

      {gonderOnay && (
        <div className="sse-modal-overlay" onClick={() => setGonderOnay(false)}>
          <div className="sse-modal" onClick={(e) => e.stopPropagation()}>
            <p>{sekmeLabel} sayımını göndermek istediğinize emin misiniz?</p>
            <div className="sse-modal-actions">
              <button className="sse-btn sse-btn-outline" onClick={() => setGonderOnay(false)}>İptal</button>
              <button className="sse-btn sse-btn-primary" onClick={handleGonderOnay}>Evet, Gönder</button>
            </div>
          </div>
        </div>
      )}

      {sifirlaOnay && (
        <div className="sse-modal-overlay" onClick={() => setSifirlaOnay(false)}>
          <div className="sse-modal" onClick={(e) => e.stopPropagation()}>
            <p className="sse-modal-warning">Yeni sipariş girişi yapmıyorsanız lütfen sıfırlamayın!</p>
            <div className="sse-modal-actions">
              <button className="sse-btn sse-btn-outline" onClick={() => setSifirlaOnay(false)}>İptal</button>
              <button className="sse-btn sse-btn-danger" onClick={handleSifirlaOnay}>Evet, Sıfırla</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="sse-toast">{toast}</div>}
    </div>
  );
}