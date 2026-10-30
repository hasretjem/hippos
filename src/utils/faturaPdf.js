import html2canvas from 'html2canvas';

// Faturalandırılmış faturanın hareket listesini müşteriye iletilecek PDF olarak indirir.
// Her blok (başlık, sipariş kartı, ödeme, toplam) ayrı çizilip A4 sayfalarına sırayla yerleştirilir;
// böylece bir sipariş kartı iki sayfaya bölünmez. jsPDF sadece tıklanınca yüklenir (ana paket şişmez).

const KIRMIZI = '#E94F37';
const KOYU = '#153826';
const YESIL = '#0A5C38';
const ACIK = '#F1FBF6';
const ACIK2 = '#E1F6EA';
const GENISLIK = 760; // px — PDF'te 190 mm'ye (A4 - 10 mm kenar boşluğu) oturur

const para = (n) =>
  `${Number(n || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺`;

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function tarihSaat(ts) {
  const d = new Date(ts);
  return `${d.toLocaleDateString('tr-TR')} · ${d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}`;
}
function dosyaAdiParcasi(s) {
  return String(s || '')
    .replace(/İ/g, 'I').replace(/ı/g, 'i').replace(/Ş/g, 'S').replace(/ş/g, 's').replace(/Ğ/g, 'G').replace(/ğ/g, 'g')
    .replace(/Ü/g, 'U').replace(/ü/g, 'u').replace(/Ö/g, 'O').replace(/ö/g, 'o').replace(/Ç/g, 'C').replace(/ç/g, 'c')
    .replace(/[^A-Za-z0-9.\-_]+/g, '-').replace(/^-+|-+$/g, '');
}

function blokOlustur(html, stil = '') {
  const el = document.createElement('div');
  el.style.cssText = `width:${GENISLIK}px;box-sizing:border-box;font-family:Arial,Helvetica,sans-serif;color:${KOYU};background:#fff;${stil}`;
  el.innerHTML = html;
  return el;
}

function logoYukle() {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img.src);
    img.onerror = () => resolve('');
    img.src = `${import.meta.env.BASE_URL || '/'}pwa/ana-192.png`;
  });
}

export async function faturaPdfIndir({ cari, fatura, donem, siparisler, odemeler }) {
  const { jsPDF } = await import('jspdf');
  const logo = await logoYukle();
  const iskonto = Number(cari?.iskonto || 0);
  const hareketToplam = siparisler.reduce((t, h) => t + Number(h.toplam || 0), 0);
  const odemeToplam = odemeler.reduce((t, o) => t + Number(o.tutar || 0), 0);

  const bloklar = [];

  // 1) Başlık bandı
  bloklar.push(blokOlustur(`
    <div style="background:${KIRMIZI};border-radius:14px;padding:18px 22px;display:flex;align-items:center;gap:16px;color:#fff;">
      ${logo ? `<img src="${logo}" style="width:64px;height:64px;border-radius:14px;border:3px solid #fff;" />` : ''}
      <div style="flex:1;">
        <div style="font-size:26px;font-weight:800;color:#fff;">Perpa Sandviç</div>
        <div style="font-size:13px;color:#fff;opacity:.95;margin-top:2px;">Cari Hesap Hareket Dökümü</div>
      </div>
      <div style="text-align:right;color:#fff;">
        <div style="font-size:11px;opacity:.9;color:#fff;">Fatura tutarı</div>
        <div style="font-size:24px;font-weight:800;color:#fff;">${para(fatura.tutar)}</div>
      </div>
    </div>
    <div style="display:flex;gap:12px;margin-top:12px;">
      <div style="flex:1;background:${ACIK2};border-radius:12px;padding:12px 16px;">
        <div style="font-size:11px;color:${YESIL};font-weight:700;">CARİ</div>
        <div style="font-size:18px;font-weight:800;color:${KOYU};margin-top:2px;">${esc(cari?.ad || '')}</div>
      </div>
      <div style="flex:1;background:${ACIK2};border-radius:12px;padding:12px 16px;">
        <div style="font-size:11px;color:${YESIL};font-weight:700;">DÖNEM</div>
        <div style="font-size:18px;font-weight:800;color:${KOYU};margin-top:2px;">${esc(donem)}</div>
      </div>
      ${iskonto > 0 ? `<div style="background:${ACIK2};border-radius:12px;padding:12px 16px;">
        <div style="font-size:11px;color:${YESIL};font-weight:700;">İSKONTO</div>
        <div style="font-size:18px;font-weight:800;color:${KOYU};margin-top:2px;">%${iskonto}</div>
      </div>` : ''}
    </div>
  `));

  // 2) Siparişler + ödemeler (eskiden yeniye)
  const girdiler = [
    ...siparisler.map((h) => ({ tip: 's', ts: h.ts, d: h })),
    ...odemeler.map((o) => ({ tip: 'o', ts: o.ts, d: o })),
  ].sort((a, b) => a.ts - b.ts);

  let no = 0;
  for (const g of girdiler) {
    if (g.tip === 's') {
      no += 1;
      const urunler = g.d.urunler || [];
      const urunToplam = urunler.reduce((t, u) => t + Number(u.fiyat || 0), 0);
      const iskontoTutar = Math.round((urunToplam - Number(g.d.toplam || 0)) * 100) / 100;
      bloklar.push(blokOlustur(`
        <div style="border:1.5px solid ${ACIK2};background:${ACIK};border-radius:12px;padding:10px 14px;">
          <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid ${ACIK2};padding-bottom:6px;margin-bottom:6px;">
            <div style="font-size:13px;font-weight:700;color:${YESIL};">
              <span style="background:${KIRMIZI};color:#fff;border-radius:10px;padding:1px 8px;margin-right:6px;font-size:12px;">${no}</span>${esc(tarihSaat(g.d.ts))}${g.d.personelAd ? ` · ${esc(g.d.personelAd)}` : ''}
            </div>
            <div style="font-size:15px;font-weight:800;color:${KOYU};">${para(g.d.toplam)}</div>
          </div>
          ${urunler.map((u) => `<div style="display:flex;justify-content:space-between;font-size:13px;color:${KOYU};padding:1.5px 0;"><span>${esc(u.ad)}</span><span>${para(u.fiyat)}</span></div>`).join('')}
          ${iskontoTutar > 0.009 ? `<div style="display:flex;justify-content:space-between;font-size:12px;font-weight:700;color:${YESIL};border-top:1px dashed ${YESIL};margin-top:5px;padding-top:4px;"><span>İskonto${iskonto > 0 ? ` (%${iskonto})` : ''}</span><span>-${para(iskontoTutar)}</span></div>` : ''}
        </div>
      `, 'padding-top:8px;'));
    } else {
      bloklar.push(blokOlustur(`
        <div style="display:flex;justify-content:space-between;align-items:center;background:${ACIK2};border:1.5px solid ${YESIL};border-radius:12px;padding:10px 14px;font-size:13px;font-weight:700;color:${YESIL};">
          <span>${esc(tarihSaat(g.d.ts))} · Ödeme alındı — ${esc(g.d.tur)}</span>
          <span style="font-size:15px;">-${para(g.d.tutar)}</span>
        </div>
      `, 'padding-top:8px;'));
    }
  }

  // 3) Toplam özeti
  bloklar.push(blokOlustur(`
    <div style="background:${ACIK2};border-radius:14px;padding:14px 20px;border:2px solid ${YESIL};">
      <div style="display:flex;justify-content:space-between;font-size:14px;color:${KOYU};padding:3px 0;"><span>Sipariş toplamı (${siparisler.length} adet${iskonto > 0 ? `, %${iskonto} iskontolu` : ''})</span><strong>${para(hareketToplam)}</strong></div>
      ${odemeToplam > 0 ? `<div style="display:flex;justify-content:space-between;font-size:14px;color:${KOYU};padding:3px 0;"><span>Dönemde alınan ödemeler</span><strong>-${para(odemeToplam)}</strong></div>` : ''}
      <div style="display:flex;justify-content:space-between;align-items:center;border-top:2px solid ${YESIL};margin-top:6px;padding-top:8px;">
        <span style="font-size:17px;font-weight:800;color:${KIRMIZI};">Fatura tutarı</span>
        <span style="font-size:24px;font-weight:800;color:${KIRMIZI};">${para(fatura.tutar)}</span>
      </div>
    </div>
  `, 'padding-top:12px;'));

  const kap = document.createElement('div');
  kap.style.cssText = 'position:fixed;top:0;left:-20000px;';
  bloklar.forEach((b) => kap.appendChild(b));
  document.body.appendChild(kap);

  try {
    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
    const SAYFA_G = 210, SAYFA_Y = 297, KENAR = 10, ALT = 14;
    const icerikG = SAYFA_G - KENAR * 2;
    let y = KENAR;
    for (const b of bloklar) {
      const canvas = await html2canvas(b, { scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false });
      const h = (canvas.height / canvas.width) * icerikG;
      if (y + h > SAYFA_Y - ALT && y > KENAR) { pdf.addPage(); y = KENAR; }
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', KENAR, y, icerikG, h);
      y += h;
    }
    const sayfa = pdf.getNumberOfPages();
    pdf.setFontSize(8);
    pdf.setTextColor(80, 100, 90);
    for (let i = 1; i <= sayfa; i += 1) {
      pdf.setPage(i);
      pdf.text(`Perpa Sandvic - Hippos  |  Sayfa ${i}/${sayfa}`, SAYFA_G / 2, SAYFA_Y - 6, { align: 'center' });
    }
    pdf.save(`${dosyaAdiParcasi(cari?.ad)}_${dosyaAdiParcasi(donem) || fatura.id}.pdf`);
  } finally {
    document.body.removeChild(kap);
  }
}
