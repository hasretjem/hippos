import { useState } from 'react';
import { X } from 'lucide-react';

// Muhasebe2 sekmelerinin ortak yardımcıları (formatlar, API çağrısı, modal kabuğu).

export const para = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' });
export const TL = (n) => para.format(Number(n) || 0);
export const sayiFmt = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export function tarihTR(iso) {
  if (!iso) return '';
  const [y, m, d] = String(iso).split('-');
  return `${d}.${m}.${y}`;
}

export function bugunISO() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Istanbul' });
}
// Arama için: büyük/küçük harf, ı/i ve Türkçe karakter farklarını yok sayar.
export function trNorm(s) {
  return String(s || '')
    .toLocaleLowerCase('tr')
    .replace(/ı/g, 'i')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}
export function sayi(v) {
  const n = Number(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

export async function api(resource, { method = 'GET', body, query } = {}) {
  const qs = new URLSearchParams({ resource, ...(query || {}) }).toString();
  const res = await fetch(`/api/muhasebe2?${qs}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  let j = {};
  try {
    j = await res.json();
  } catch {
    j = {};
  }
  if (!res.ok) throw new Error(j.error || `Sunucu hatası (${res.status})`);
  return j;
}

export function ModalKabuk({ baslik, onKapat, genis, ekSinif = '', children }) {
  return (
    <div className="m2-modal-bg" onClick={onKapat}>
      <div className={`m2-modal ${genis ? 'genis' : ''} ${ekSinif}`.trim()} onClick={(e) => e.stopPropagation()}>
        <div className="m2-modal-head">
          <h3>{baslik}</h3>
          <button onClick={onKapat} aria-label="Kapat">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function useModalKaydet(onKaydet, onBitti) {
  const [hata, setHata] = useState('');
  const [bekliyor, setBekliyor] = useState(false);
  async function calistir(payload) {
    setBekliyor(true);
    setHata('');
    try {
      const sonuc = await onKaydet(payload);
      onBitti(sonuc);
    } catch (e) {
      setHata(e.message);
      setBekliyor(false);
    }
  }
  return { hata, bekliyor, calistir };
}

export function ModalAksiyon({ onKapat, onKaydet, devreDisi, bekliyor }) {
  return (
    <div className="m2-modal-actions">
      <button className="m2-btn sec" onClick={onKapat}>
        Vazgeç
      </button>
      <button className="m2-btn" disabled={devreDisi || bekliyor} onClick={onKaydet}>
        {bekliyor ? '…' : 'Kaydet'}
      </button>
    </div>
  );
}