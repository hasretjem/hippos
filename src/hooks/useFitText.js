import { useLayoutEffect, useRef, useState } from 'react';
import { MIN_FONT_SIZE } from '../constants/themeDefaults';

// Verilen metin konteyneri, line-clamp:2 + overflow:hidden ile en fazla 2 satıra sığacak
// şekilde, [MIN_FONT_SIZE, maxFontSize] aralığında EN BÜYÜK font boyutunu bulur.
// Ağır kütüphane yok: sadece scrollHeight/clientHeight karşılaştırması + ikili arama (~5 adım).
// Kısa isimler maxFontSize'a kadar büyür; sığmayan isimler kendi maksimumunda kilitlenir.
export default function useFitText(text, maxFontSize) {
  const ref = useRef(null);
  const [fontSize, setFontSize] = useState(maxFontSize);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    let lo = MIN_FONT_SIZE;
    let hi = Math.max(maxFontSize, MIN_FONT_SIZE);
    let best = MIN_FONT_SIZE;

    // Ölçüm sırasında line-clamp geçici olarak kapatılmaz — clamp açıkken scrollHeight
    // gerçek (kesilmemiş) içerik yüksekliğini, clientHeight ise kutunun sınırını verir.
    function fits(size) {
      el.style.fontSize = size + 'px';
      // clamp aktifken tarayıcı fazla satırı gizler ama scrollHeight tam içeriği yansıtır mı
      // diye taşma testi: line-clamp kaldırılmadan scrollHeight bazı tarayıcılarda clamp
      // sonrası yüksekliği döndürebiliyor, bu yüzden ölçüm anında clamp'i devre dışı bırakıyoruz.
      const prevClamp = el.style.webkitLineClamp;
      const prevOverflow = el.style.overflow;
      el.style.webkitLineClamp = 'unset';
      el.style.overflow = 'visible';
      const contentHeight = el.scrollHeight;
      el.style.webkitLineClamp = prevClamp;
      el.style.overflow = prevOverflow;
      return contentHeight <= el.clientHeight + 0.5;
    }

    // clientHeight ölçümü clamp KAPALIYKEN yanlış olur (clamp kapalıyken kutu büyümez ama
    // biz clientHeight'ı sabit kutu yüksekliğinden almalıyız) — bunun için kutunun kendi
    // sabit max-height'ını kullanıyoruz (CSS'te .ds-product-name'e max-height veriliyor).
    for (let i = 0; i < 6; i++) {
      const mid = Math.round((lo + hi) / 2);
      if (fits(mid)) {
        best = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
      if (lo > hi) break;
    }

    el.style.fontSize = best + 'px';
    setFontSize(best);
  }, [text, maxFontSize]);

  return { ref, fontSize };
}