import { useEffect } from 'react';

// =====================================================================
// TELEFONDA TABLOLAR — yana kaydırma yok, tek satır.
// Sadece telefon görünümünde (App.jsx'te `mobil` iken) bağlanır; masaüstünde hiç çalışmaz.
//
// Ne yapar:
//  1) Sayfadaki tabloları ekran genişliğine sığdırır (yazı 11–13px, uzun metin "…" ile kısalır).
//  2) 5'ten fazla sütunu olan tablolarda bazı sütunları gizler ve tablonun üstüne bir
//     "Sütunlar" seçici koyar; hangi sütunların görüneceğini kullanıcı seçer (bu cihazda hatırlanır).
//     Başlığı boş olan sütunlar (düzenle/sil gibi düğme sütunları) asla gizlenmez.
//  3) "…" ile kesilmiş bir hücreye dokununca tam metni kısa bir baloncukta gösterir.
//
// Tablonun kendisine (React'in yönettiği satır/hücrelere) hiçbir şey eklenmez veya silinmez;
// gizleme yalnızca CSS ile yapılır. Filtre düğmeleri, satır tıklamaları, düzenleme alanları aynen çalışır.
// =====================================================================

const TABLO_SECICI = 'table.m2-table, table.vr-izgara';
// Dik tutuşta 5, yan tutuşta (geniş ekran) 9 sütuna kadar varsayılan olarak gösterilir.
const yatay = () => window.innerWidth > 640;
const sutunSayisi = () => (yatay() ? 9 : 5);

// Bazı tablolar için varsayılan görünür sütunlar (başlık metninde geçen kelimeler, küçük harf).
const VARSAYILANLAR = [
  { sinif: 'm2-datalar', sutunlar: ['tarih', 'evrak', 'firma', 'miktar'], ana: 'firma',
    yatay: ['tarih', 'evrak', 'firma', 'açıklama', 'gider kategorisi', 'ödeme türü', 'miktar'] },
  { sinif: 'rc-urun-tablo', sutunlar: ['ürün', 'satış', 'kâr %'], ana: 'ürün',
    yatay: ['ürün', 'kategori', 'satış', 'maliyet', 'kâr', 'durum'] },
  { sinif: 'm2-yk', sutunlar: ['firma', 'vade', 'bankaya yatacak'], ana: 'firma',
    yatay: ['firma', 'fatura tarihi', 'matrah', 'fatura toplamı', 'vade', 'kesinti toplamı', 'bankaya yatacak'] },
  { sinif: 'rc-ham-tablo', sutunlar: ['malzeme', 'birim', 'fiyat', 'tarih'], ana: 'malzeme' },
  { sinif: 'm2-ekstre', sutunlar: ['tarih', 'açıklama', 'borç', 'alacak', 'bakiye'], ana: 'açıklama' },
];

const kucuk = (s) => (s || '').toLocaleLowerCase('tr-TR').replace(/\s+/g, ' ').trim();

let sayac = 0;
const durum = new WeakMap(); // table -> { id, bar }

function basliklar(table) {
  const satirlar = table.tHead ? table.tHead.rows : null;
  const sonSatir = satirlar && satirlar.length ? satirlar[satirlar.length - 1] : table.rows[0];
  if (!sonSatir) return [];
  return Array.from(sonSatir.cells).map((c) => {
    const ad = (c.textContent || '').replace(/\s+/g, ' ').trim();
    // Başlığı boş ya da "İşlem" olan sütunlar (düzenle/sil düğmeleri) her zaman görünür, seçicide yer almaz
    const sabit = !ad || ['işlem', 'işlemler'].includes(kucuk(ad));
    return { hucre: c, ad, sabit };
  });
}

function tabloAnahtari(table, adlar) {
  const sinif = Array.from(table.classList).filter((c) => c !== 'm2-table').join('.');
  const etiket = table.getAttribute('data-tablo') || table.getAttribute('data-panel') || '';
  // Dik ve yan tutuşun sütun seçimleri ayrı hatırlanır
  return `hippos-msutun:${yatay() ? 'y' : 'd'}:${sinif}:${etiket}:${adlar.join('|')}`.slice(0, 240);
}

function gorunurleriBul(table, b, anahtar) {
  try {
    const kayit = localStorage.getItem(anahtar);
    if (kayit) {
      const dizi = JSON.parse(kayit);
      if (Array.isArray(dizi) && dizi.length) return new Set(dizi);
    }
  } catch { /* kayıt okunamazsa varsayılan */ }
  const v = VARSAYILANLAR.find((x) => table.classList.contains(x.sinif));
  const set = new Set();
  if (v) {
    const liste = yatay() && v.yatay ? v.yatay : v.sutunlar;
    b.forEach((s, i) => { if (!s.sabit && liste.some((k) => kucuk(s.ad).includes(k))) set.add(i); });
  }
  if (!set.size) {
    let n = 0;
    b.forEach((s, i) => { if (!s.sabit && n < sutunSayisi()) { set.add(i); n++; } });
  }
  return set;
}

function stilYaz(id, b, gorunur) {
  let el = document.getElementById(`mtablo-stil-${id}`);
  if (!el) {
    el = document.createElement('style');
    el.id = `mtablo-stil-${id}`;
    document.head.appendChild(el);
  }
  const gizli = [];
  b.forEach((s, i) => { if (!s.sabit && !gorunur.has(i)) gizli.push(i + 1); });
  el.textContent = gizli
    .map((n) => `table[data-mtablo="${id}"] > * > tr:not([data-mspanli]) > :nth-child(${n}){display:none !important}`)
    .join('\n');
}

function seciciCiz(table, kayit) {
  const { id, b, gorunur, anahtar } = kayit;
  let bar = kayit.bar;
  if (!bar) {
    bar = document.createElement('div');
    bar.className = 'mtablo-bar';
    kayit.bar = bar;
  }
  // Tablo kaydırma kutusunun içindeyse seçiciyi kutunun önüne koy
  const kutu = table.parentElement;
  const hedef = kutu && kutu.children.length === 1 && kutu !== document.body ? kutu : table;
  if (bar.nextSibling !== hedef && hedef.parentNode) hedef.parentNode.insertBefore(bar, hedef);

  bar.innerHTML = '';
  const etiket = document.createElement('span');
  etiket.className = 'mtablo-etiket';
  etiket.textContent = 'Sütunlar:';
  bar.appendChild(etiket);
  b.forEach((s, i) => {
    if (s.sabit) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `mtablo-cip${gorunur.has(i) ? ' on' : ''}`;
    btn.textContent = s.ad;
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (gorunur.has(i)) {
        if (gorunur.size <= 1) return;
        gorunur.delete(i);
      } else {
        gorunur.add(i);
      }
      try { localStorage.setItem(anahtar, JSON.stringify([...gorunur])); } catch { /* sadece bu oturum */ }
      uygula(table, kayit);
    });
    bar.appendChild(btn);
  });
  void id;
}

function sabitleriIsaretle(table, b) {
  // Ana sütun (ürün / firma adı gibi) diğerlerinden geniş tutulur ki ad okunabilsin
  const v = VARSAYILANLAR.find((x) => table.classList.contains(x.sinif));
  const anaSira = v && v.ana
    ? b.findIndex((s) => !s.sabit && kucuk(s.ad).includes(v.ana))
    : b.findIndex((s) => !s.sabit && /(^| )(ad|adı)( |$)|firma|ürün|malzeme|açıklama|personel|cari|kalem/.test(kucuk(s.ad)));
  b.forEach((s, i) => {
    if (i === anaSira) s.hucre.setAttribute('data-mana', '');
    else s.hucre.removeAttribute('data-mana');
  });
  b.forEach((s) => {
    if (!s.sabit) return;
    // Düğme içeren sabit sütun (Düzenle / Sil / Reçete yaz) daha geniş, onay kutusu sütunu dar tutulur
    const sira = Array.from(s.hucre.parentElement.cells).indexOf(s.hucre);
    const ilkSatir = table.tBodies[0] && Array.from(table.tBodies[0].rows).find((r) => r.cells.length > sira && r.cells[sira].colSpan === 1);
    const dugmeli = s.ad || (ilkSatir && ilkSatir.cells[sira].querySelector('button'));
    s.hucre.setAttribute('data-mbos', dugmeli ? 'islem' : '');
  });
}

// Gizlenen sütunlar yüzünden, birkaç sütunu kaplayan hücreler (ör. "Toplam" ya da "Yükleniyor…" satırı: colSpan=13)
// tabloda hayalet sütunlar açıp gerçek sütunları sıkıştırıyordu. Kaplanan sütun sayısını görünenlere göre düşürürüz.
function hucreKaplamalariniDuzelt(table, kayit) {
  const { b, gorunur } = kayit;
  const gizli = b.map((s, i) => !s.sabit && !gorunur.has(i));
  Array.from(table.rows).forEach((tr) => {
    const hucreler = Array.from(tr.cells);
    const birlesik = hucreler.some((c) => (Number(c.getAttribute('data-mspan')) || c.colSpan || 1) > 1);
    if (!birlesik) { tr.removeAttribute('data-mspanli'); return; }
    // Birleşik hücreli satırda "kaçıncı hücre" ile "kaçıncı sütun" aynı değildir; gizlemeyi hücre bazında yaparız
    tr.setAttribute('data-mspanli', '');
    let sutun = 0;
    hucreler.forEach((c) => {
      const asil = Number(c.getAttribute('data-mspan')) || c.colSpan || 1;
      if (asil > 1 && !c.hasAttribute('data-mspan')) c.setAttribute('data-mspan', String(asil));
      let gorunen = 0;
      for (let k = sutun; k < sutun + asil; k++) if (!gizli[k]) gorunen++;
      if (gorunen === 0) c.setAttribute('data-mgizli', ''); else c.removeAttribute('data-mgizli');
      const yeni = Math.max(1, gorunen);
      if (asil > 1 && c.colSpan !== yeni) c.colSpan = yeni;
      sutun += asil;
    });
  });
}

function uygula(table, kayit) {
  const { id, b, gorunur } = kayit;
  table.setAttribute('data-mtablo', id);
  const gorunenSayi = b.filter((s, i) => s.sabit || gorunur.has(i)).length;
  table.setAttribute('data-msayi', String(Math.min(gorunenSayi, 8)));
  sabitleriIsaretle(table, b);
  stilYaz(id, b, gorunur);
  hucreKaplamalariniDuzelt(table, kayit);
  if (b.filter((s) => !s.sabit).length > sutunSayisi()) seciciCiz(table, kayit);
  else if (kayit.bar) { kayit.bar.remove(); kayit.bar = null; }
}

function tara() {
  document.querySelectorAll(TABLO_SECICI).forEach((table) => {
    const b = basliklar(table);
    if (!b.length) return;
    const adlar = b.filter((s) => !s.sabit).map((s) => s.ad);
    let kayit = durum.get(table);
    const anahtar = tabloAnahtari(table, adlar);
    if (!kayit || kayit.anahtar !== anahtar) {
      const id = kayit ? kayit.id : String(++sayac);
      kayit = { id, b, anahtar, gorunur: gorunurleriBul(table, b, anahtar), bar: kayit ? kayit.bar : null };
      durum.set(table, kayit);
      uygula(table, kayit);
    } else {
      kayit.b = b;
      sabitleriIsaretle(table, b);
      hucreKaplamalariniDuzelt(table, kayit);
      if (table.getAttribute('data-mtablo') !== kayit.id) uygula(table, kayit);
      else if (kayit.bar && !kayit.bar.isConnected) seciciCiz(table, kayit);
    }
  });
  // Tablosu kaldırılmış seçicileri temizle
  document.querySelectorAll('.mtablo-bar').forEach((bar) => {
    const sonraki = bar.nextElementSibling;
    const tablo = sonraki && (sonraki.matches('table') ? sonraki : sonraki.querySelector('table'));
    if (!tablo) bar.remove();
  });
}

let balon = null;
let balonZaman = null;
function balonGoster(metin, x, y) {
  if (!balon) {
    balon = document.createElement('div');
    balon.className = 'mtablo-balon';
    document.body.appendChild(balon);
  }
  balon.textContent = metin;
  balon.style.left = '12px';
  balon.style.right = '12px';
  balon.style.top = `${Math.max(12, Math.min(y + 14, window.innerHeight - 90))}px`;
  balon.style.display = 'block';
  clearTimeout(balonZaman);
  balonZaman = setTimeout(() => { if (balon) balon.style.display = 'none'; }, 2600);
  void x;
}

function hucreTik(e) {
  const td = e.target.closest && e.target.closest('table[data-mtablo] td');
  if (!td) return;
  if (e.target.closest('button, input, select, textarea, a, label')) return;
  if (td.scrollWidth <= td.clientWidth + 1) return;
  const table = td.closest('table');
  const kayit = durum.get(table);
  const sira = Array.from(td.parentElement.cells).indexOf(td);
  const baslik = kayit && kayit.b[sira] ? kayit.b[sira].ad : '';
  const metin = (td.textContent || '').replace(/\s+/g, ' ').trim();
  if (metin) balonGoster(baslik ? `${baslik}: ${metin}` : metin, e.clientX, e.clientY);
}

export default function MobilTabloYoneticisi() {
  useEffect(() => {
    let zaman = null;
    const planla = () => { clearTimeout(zaman); zaman = setTimeout(tara, 120); };
    const gozlemci = new MutationObserver(planla);
    gozlemci.observe(document.body, { childList: true, subtree: true });
    tara();
    document.addEventListener('click', hucreTik, true);
    window.addEventListener('resize', planla); // telefon yan/dik çevrilince yeniden düzenle
    return () => {
      window.removeEventListener('resize', planla);
      gozlemci.disconnect();
      clearTimeout(zaman);
      document.removeEventListener('click', hucreTik, true);
      document.querySelectorAll('.mtablo-bar').forEach((x) => x.remove());
      document.querySelectorAll('style[id^="mtablo-stil-"]').forEach((x) => x.remove());
      document.querySelectorAll('table[data-mtablo]').forEach((t) => { t.removeAttribute('data-mtablo'); t.removeAttribute('data-msayi'); });
      document.querySelectorAll('[data-mspan]').forEach((c) => { c.colSpan = Number(c.getAttribute('data-mspan')) || 1; c.removeAttribute('data-mspan'); });
      document.querySelectorAll('[data-mgizli]').forEach((c) => c.removeAttribute('data-mgizli'));
      document.querySelectorAll('[data-mspanli]').forEach((r) => r.removeAttribute('data-mspanli'));
      if (balon) { balon.remove(); balon = null; }
    };
  }, []);
  return null;
}
