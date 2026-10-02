// Hesap özeti (ekstre) için ortak mantık: popup ve PDF aynı fonksiyonları kullanır.
//
// İşaret kuralı: Bakiye = Borç - Alacak (satır satır yürüyen toplam).
//   Alacak = fatura/fişler + tahsilat makbuzları, Borç = ödeme (tediye) makbuzları.
//   Eksi (-) bakiye: firma ALACAKLI (işletmenin borcu var). Artı (+) bakiye: firma BORÇLU.

export const ISLETME_ADI = 'Perpa Sandviç';

const sayiFmt = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const paraFmt = (n) => sayiFmt.format(Number(n) || 0);

export function tarihTR(iso) {
  if (!iso) return '';
  const [y, m, d] = String(iso).split('-');
  return `${d}.${m}.${y}`;
}

const kurus = (v) => Math.round((Number(v) || 0) * 100);

// Bakiyenin anlamı (firma gözüyle).
export function durumBul(bakiye) {
  const b = Number(bakiye) || 0;
  if (b < -0.005) return 'alacakli';
  if (b > 0.005) return 'borclu';
  return 'yok';
}

// Ekstre satırlarından ekrana/PDF'e girecek görünümü üretir.
//  satirlar: API'den gelen, eskiden yeniye sıralı, bakiyesi hesaplanmış tüm satırlar
//  baslangic/bitis: 'YYYY-MM-DD' (boşsa sınırsız)
//  kapaliGizle: kendi içinde sıfırlanan işlemleri (peşin fatura + otomatik ödeme) gizler
// Başlangıçtan önceki işlemler tek bir "devir" bakiyesine toplanır (hesaplanan, kayıtlı değil).
export function ekstreGorunum(satirlar, { baslangic = '', bitis = '', kapaliGizle = false } = {}) {
  const gizli = new Set();
  if (kapaliGizle) {
    const gruplar = new Map();
    satirlar.forEach((r) => {
      if (!r.grupId) return;
      const g = gruplar.get(r.grupId) || { net: 0, say: 0 };
      g.net += kurus(r.borc) - kurus(r.alacak);
      g.say += 1;
      gruplar.set(r.grupId, g);
    });
    satirlar.forEach((r) => {
      const g = r.grupId ? gruplar.get(r.grupId) : null;
      if (g && g.say >= 2 && g.net === 0) gizli.add(r.id);
    });
  }
  const gorunen = satirlar.filter((r) => !gizli.has(r.id));

  const oncesiGorunen = baslangic ? gorunen.filter((r) => r.tarih < baslangic) : [];
  const oncesiTum = baslangic ? satirlar.filter((r) => r.tarih < baslangic) : [];
  const devir =
    oncesiGorunen.length > 0 ? { tarih: baslangic, bakiye: oncesiTum[oncesiTum.length - 1].bakiye } : null;

  const aralik = gorunen.filter((r) => (!baslangic || r.tarih >= baslangic) && (!bitis || r.tarih <= bitis));
  let borcK = 0;
  let alacakK = 0;
  aralik.forEach((r) => {
    borcK += kurus(r.borc);
    alacakK += kurus(r.alacak);
  });
  const bakiye = aralik.length ? aralik[aralik.length - 1].bakiye : devir ? devir.bakiye : 0;
  return { devir, satirlar: aralik, toplamBorc: borcK / 100, toplamAlacak: alacakK / 100, bakiye };
}

// ---------------------------------------------------------------------------
// PDF tanımı (pdfmake). Sıralama PDF'te ESKİDEN YENİYE: ilk işlem üstte.
// ---------------------------------------------------------------------------
export function ekstrePdfTanimi({ isletme = ISLETME_ADI, firmaAdi, aralikMetni, gorunum, olusturma }) {
  const { devir, satirlar, toplamBorc, toplamAlacak, bakiye } = gorunum;
  const th = (t, sag) => ({ text: t, bold: true, color: '#FFFFFF', fontSize: 8, alignment: sag ? 'right' : 'left' });
  const govde = [
    [th('Tarih'), th('Evrak Türü'), th('Belge No'), th('Açıklama'), th('Ödeme Şekli'), th('Borç', true), th('Alacak', true), th('Bakiye', true)],
  ];

  if (devir) {
    govde.push([
      { text: tarihTR(devir.tarih), fontSize: 8 },
      { text: 'Devir bakiye', fontSize: 8, italics: true },
      '',
      { text: 'Önceki işlemlerden devir', fontSize: 8, italics: true },
      '',
      '',
      '',
      { text: paraFmt(devir.bakiye), fontSize: 8, alignment: 'right', bold: true },
    ]);
  }
  satirlar.forEach((r) => {
    govde.push([
      { text: tarihTR(r.tarih), fontSize: 8 },
      { text: r.evrakTuru, fontSize: 8 },
      { text: r.belgeNo || '', fontSize: 8 },
      { text: r.aciklama || '', fontSize: 8 },
      { text: r.odemeSekli || '', fontSize: 8 },
      { text: r.borc ? paraFmt(r.borc) : '', fontSize: 8, alignment: 'right' },
      { text: r.alacak ? paraFmt(r.alacak) : '', fontSize: 8, alignment: 'right' },
      { text: paraFmt(r.bakiye), fontSize: 8, alignment: 'right', bold: true },
    ]);
  });
  govde.push([
    { text: 'TOPLAM', colSpan: 5, bold: true, fontSize: 8.5 },
    {},
    {},
    {},
    {},
    { text: paraFmt(toplamBorc), bold: true, fontSize: 8.5, alignment: 'right' },
    { text: paraFmt(toplamAlacak), bold: true, fontSize: 8.5, alignment: 'right' },
    { text: paraFmt(bakiye), bold: true, fontSize: 8.5, alignment: 'right' },
  ]);

  const durum = durumBul(bakiye);
  const ozet =
    durum === 'alacakli'
      ? `Firma ALACAKLI: ${paraFmt(-bakiye)} TL (işletmenin firmaya borcu)`
      : durum === 'borclu'
        ? `Firma BORÇLU: ${paraFmt(bakiye)} TL (firmanın işletmeye borcu)`
        : 'Bakiye yok.';

  const sonSatir = govde.length - 1;
  return {
    pageSize: 'A4',
    pageMargins: [28, 36, 28, 40],
    info: { title: `Hesap Özeti - ${firmaAdi}`, author: isletme },
    defaultStyle: { fontSize: 9 },
    content: [
      { text: isletme, fontSize: 15, bold: true },
      { text: 'HESAP ÖZETİ', fontSize: 11, bold: true, color: '#E94F37', margin: [0, 2, 0, 8] },
      {
        columns: [
          [
            { text: 'Firma', fontSize: 7.5, color: '#777777' },
            { text: firmaAdi, fontSize: 11, bold: true },
          ],
          [
            { text: 'Dönem', fontSize: 7.5, color: '#777777' },
            { text: aralikMetni, fontSize: 9.5 },
          ],
          [
            { text: 'Düzenlenme tarihi', fontSize: 7.5, color: '#777777' },
            { text: olusturma, fontSize: 9.5 },
          ],
        ],
        margin: [0, 0, 0, 10],
      },
      {
        table: {
          headerRows: 1,
          dontBreakRows: true,
          widths: [44, 70, 82, '*', 62, 46, 46, 54],
          body: govde,
        },
        layout: {
          hLineWidth: () => 0.4,
          vLineWidth: () => 0,
          hLineColor: () => '#CCCCCC',
          paddingTop: () => 3.5,
          paddingBottom: () => 3.5,
          paddingLeft: () => 4,
          paddingRight: () => 4,
          fillColor: (i) => (i === 0 ? '#393E41' : i === sonSatir ? '#E9EAD8' : i % 2 === 0 ? '#F6F7EB' : null),
        },
      },
      { text: ozet, bold: true, fontSize: 10, margin: [0, 10, 0, 4] },
      {
        text: `${isletme} kayıtlarına göre düzenlenmiştir. Bakiye = Borç − Alacak; eksi (−) bakiye firmanın alacaklı olduğunu, artı (+) bakiye borçlu olduğunu gösterir.`,
        fontSize: 7.5,
        color: '#666666',
      },
    ],
    footer: (sayfa, toplam) => ({ text: `Sayfa ${sayfa} / ${toplam}`, alignment: 'center', fontSize: 8, margin: [0, 12, 0, 0] }),
  };
}

// ---------------------------------------------------------------------------
// PDF kütüphanesi (pdfmake): uygulamaya gömülmez, ilk kullanımda CDN'den yüklenir.
// Önce cdnjs, olmazsa jsDelivr denenir.
// ---------------------------------------------------------------------------
const KAYNAKLAR = [
  [
    'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.7/pdfmake.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.7/vfs_fonts.js',
  ],
  [
    'https://cdn.jsdelivr.net/npm/pdfmake@0.2.7/build/pdfmake.min.js',
    'https://cdn.jsdelivr.net/npm/pdfmake@0.2.7/build/vfs_fonts.js',
  ],
];

function scriptYukle(src) {
  return new Promise((coz, red) => {
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onload = () => coz();
    s.onerror = () => red(new Error(`yüklenemedi: ${src}`));
    document.head.appendChild(s);
  });
}

let yuklemeSozu = null;
export function pdfKutuphanesiniYukle() {
  const hazir = () => window.pdfMake && typeof window.pdfMake.createPdf === 'function' && window.pdfMake.vfs;
  if (hazir()) return Promise.resolve(window.pdfMake);
  if (!yuklemeSozu) {
    yuklemeSozu = (async () => {
      for (const [kutuphane, yazitipi] of KAYNAKLAR) {
        try {
          if (!(window.pdfMake && typeof window.pdfMake.createPdf === 'function')) await scriptYukle(kutuphane);
          if (!(window.pdfMake && window.pdfMake.vfs)) await scriptYukle(yazitipi);
          if (hazir()) return window.pdfMake;
        } catch {
          /* sıradaki kaynağı dene */
        }
      }
      throw new Error('PDF kütüphanesi yüklenemedi. İnternet bağlantınızı kontrol edip tekrar deneyin.');
    })().catch((e) => {
      yuklemeSozu = null;
      throw e;
    });
  }
  return yuklemeSozu;
}

export async function ekstrePdfUret(tanim) {
  const pdfMake = await pdfKutuphanesiniYukle();
  return new Promise((coz, red) => {
    try {
      pdfMake.createPdf(tanim).getBlob(coz);
    } catch (e) {
      red(e);
    }
  });
}

const TR_HARF = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', Ç: 'C', Ğ: 'G', İ: 'I', Ö: 'O', Ş: 'S', Ü: 'U' };
export function dosyaAdi(firmaAdi, tarihISO) {
  const temiz = String(firmaAdi || 'cari')
    .replace(/[çğıöşüÇĞİÖŞÜ]/g, (h) => TR_HARF[h])
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return `Hesap_Ozeti_${temiz || 'cari'}_${tarihISO}.pdf`;
}

// Telefonda paylaşım menüsünü (WhatsApp vb.) açar, bilgisayarda dosyayı indirir.
export async function pdfPaylasVeyaIndir(blob, ad) {
  const dokunmatik = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');
  if (dokunmatik && typeof File === 'function' && navigator.canShare && navigator.share) {
    const dosya = new File([blob], ad, { type: 'application/pdf' });
    if (navigator.canShare({ files: [dosya] })) {
      try {
        await navigator.share({ files: [dosya], title: ad });
        return 'paylasildi';
      } catch (e) {
        if (e && e.name === 'AbortError') return 'iptal';
        /* başka bir hata olursa indirmeye düş */
      }
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = ad;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return 'indirildi';
}