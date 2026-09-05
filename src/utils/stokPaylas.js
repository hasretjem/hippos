import html2canvas from 'html2canvas';

// Sipariş listesini ekran dışında (scroll'dan bağımsız) sabit genişlikte bir şablona
// yazıp PNG'ye çeviren yardımcı. Kullanıcı isteği: ekranda ne kadar göründüğünden
// bağımsız olsun, liste 50 satır da olsa tamamı PNG'ye girsin.

const SABLON_GENISLIK = 720;

function trTarih(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('tr-TR', {
    day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Istanbul',
  });
}

// satirlar: [{ ad, siparis, birim, not }]
function sablonHtmlOlustur(baslikSag, satirlar) {
  const el = document.createElement('div');
  el.style.position = 'fixed';
  el.style.top = '-99999px';
  el.style.left = '-99999px';
  el.style.width = SABLON_GENISLIK + 'px';
  el.style.background = '#fff';
  el.style.fontFamily = "'Geom-BlackItalic', sans-serif";
  el.style.color = '#000';
  el.style.border = '2.5px solid #000';

  const baslik = document.createElement('div');
  baslik.style.padding = '14px 16px';
  baslik.style.borderBottom = '2.5px solid #000';
  baslik.style.display = 'flex';
  baslik.style.justifyContent = 'space-between';
  baslik.style.alignItems = 'baseline';
  baslik.innerHTML = `
    <span style="font-size:22px;font-weight:800;">Perpa Sandviç</span>
    <span style="font-size:14px;font-weight:800;">${baslikSag}</span>
  `;
  el.appendChild(baslik);

  const basHead = document.createElement('div');
  basHead.style.display = 'flex';
  basHead.style.borderBottom = '1.5px solid #000';
  basHead.style.background = '#e0e0e0';
  basHead.style.fontSize = '13px';
  basHead.style.fontWeight = '800';
  basHead.innerHTML = `
    <div style="flex:1;padding:8px 10px;">Malzeme Adı</div>
    <div style="width:90px;padding:8px 10px;text-align:center;">Sipariş</div>
    <div style="width:70px;padding:8px 10px;text-align:center;">Birim</div>
  `;
  el.appendChild(basHead);

  satirlar.forEach((s, i) => {
    const row = document.createElement('div');
    row.style.borderBottom = '1px solid #000';
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.style.background = i % 2 === 0 ? '#fff' : '#f7f7f7';
    row.innerHTML = `
      <div style="flex:1;padding:9px 10px;">
        <div style="font-size:15px;font-weight:800;">${escapeHtml(s.ad)}</div>
        ${s.not ? `<div style="font-size:12px;font-style:italic;color:#555;margin-top:2px;">"${escapeHtml(s.not)}"</div>` : ''}
      </div>
      <div style="width:90px;padding:9px 10px;text-align:center;font-size:15px;font-weight:800;">${escapeHtml(s.siparis)}</div>
      <div style="width:70px;padding:9px 10px;text-align:center;font-size:13px;">${escapeHtml(s.birim || '')}</div>
    `;
    el.appendChild(row);
  });

  if (satirlar.length === 0) {
    const bos = document.createElement('div');
    bos.style.padding = '20px';
    bos.style.textAlign = 'center';
    bos.style.fontSize = '14px';
    bos.style.color = '#888';
    bos.textContent = 'Bu listede sipariş yok.';
    el.appendChild(bos);
  }

  return el;
}

function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// satirlar: [{ ad, siparis, birim, not }]
// dönüş: { blob, dataUrl }
async function satirlardanPng(satirlar, tarihIso) {
  const baslikSag = trTarih(tarihIso) || trTarih(new Date().toISOString());
  const el = sablonHtmlOlustur(baslikSag, satirlar);
  document.body.appendChild(el);
  try {
    const canvas = await html2canvas(el, { backgroundColor: '#fff', scale: 2 });
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    return { blob, dataUrl: canvas.toDataURL('image/png') };
  } finally {
    document.body.removeChild(el);
  }
}

// Metin versiyonu — WhatsApp'a yapıştırılabilir düz metin.
function satirlardanMetin(satirlar, tarihIso) {
  const tarih = trTarih(tarihIso) || trTarih(new Date().toISOString());
  const basliklar = 'Malzeme Adı — Sipariş — Birim';
  const gövde = satirlar.map((s) => {
    const notEki = s.not ? ` "${s.not}"` : '';
    return `${s.ad} — ${s.siparis} — ${s.birim || ''}${notEki}`;
  }).join('\n');
  return `Perpa Sandviç — ${tarih}\n${basliklar}\n${gövde || '(liste boş)'}`;
}

async function panoyaPngKopyala(blob) {
  if (!navigator.clipboard || !window.ClipboardItem) return false;
  try {
    await navigator.clipboard.write([new window.ClipboardItem({ 'image/png': blob })]);
    return true;
  } catch {
    return false;
  }
}

async function panoyaMetinKopyala(metin) {
  try {
    await navigator.clipboard.writeText(metin);
    return true;
  } catch {
    return false;
  }
}

export { satirlardanPng, satirlardanMetin, panoyaPngKopyala, panoyaMetinKopyala, trTarih };