import { useSyncExternalStore } from 'react';

// Telefon görünümü eşiği. mobil.css içindeki tüm kurallar da AYNI eşiği kullanır
// (@media (max-width: 640px)). Kasadaki bilgisayarlar bu genişliğin çok üstünde olduğu
// için orada hiçbir mobil kod devreye girmez.
export const MOBIL_SORGU = '(max-width: 640px)';

function abone(cb) {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const mq = window.matchMedia(MOBIL_SORGU);
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
}

function anlik() {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia(MOBIL_SORGU).matches;
}

export default function useIsMobile() {
  return useSyncExternalStore(abone, anlik, () => false);
}

// Telefonda WhatsApp'a otomatik yönlendirme yapılmaz; mesaj panoya kopyalanır.
// Kopyalama izin vermezse (eski tarayıcı) false döner, çağıran tarafta metin gösterilir.
export async function panoyaKopyala(metin) {
  try {
    await navigator.clipboard.writeText(metin);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = metin;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}
