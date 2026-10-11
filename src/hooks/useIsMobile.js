import { useSyncExternalStore } from 'react';

// Telefon görünümü eşiği. mobil.css içindeki tüm kurallar da AYNI sorguyu kullanır:
//  - dik tutuş: genişlik 640px'ten az
//  - yan tutuş: dokunmatik ekran, yatay ve yüksekliği 500px'ten az (telefon yan çevrilmiş)
// Kasadaki bilgisayarlar hem geniş hem yüksek olduğu için orada hiçbir mobil kod devreye girmez.
export const MOBIL_SORGU = '(max-width: 640px), (max-height: 500px) and (orientation: landscape) and (pointer: coarse)';

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
