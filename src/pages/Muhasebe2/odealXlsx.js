// Bağımlılıksız .xlsx okuyucu (yalnız ilk sayfa, düz değerler). Dosya tarayıcıda okunur, hiçbir yere gönderilmez.
// xlsx = zip; kayıtlar "stored" (0) ya da "deflate" (8) olabilir. Deflate için tarayıcının DecompressionStream'i kullanılır.

const dec = new TextDecoder('utf-8');

async function inflateRaw(bytes) {
  const ds = new DecompressionStream('deflate-raw');
  const yaz = ds.writable.getWriter();
  yaz.write(bytes);
  yaz.close();
  return new Uint8Array(await new Response(ds.readable).arrayBuffer());
}

async function zipDosyalar(buf) {
  const u8 = new Uint8Array(buf);
  const dv = new DataView(buf);
  let eocd = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('Bu dosya geçerli bir .xlsx değil');
  const adet = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const girdiler = {};
  for (let i = 0; i < adet; i++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const yontem = dv.getUint16(p + 10, true);
    const boyut = dv.getUint32(p + 20, true);
    const adUzun = dv.getUint16(p + 28, true);
    const ekUzun = dv.getUint16(p + 30, true);
    const yorumUzun = dv.getUint16(p + 32, true);
    const yerel = dv.getUint32(p + 42, true);
    const ad = dec.decode(u8.subarray(p + 46, p + 46 + adUzun));
    girdiler[ad] = { yontem, boyut, yerel };
    p += 46 + adUzun + ekUzun + yorumUzun;
  }
  async function oku(ad) {
    const g = girdiler[ad];
    if (!g) return null;
    const adUzun = dv.getUint16(g.yerel + 26, true);
    const ekUzun = dv.getUint16(g.yerel + 28, true);
    const bas = g.yerel + 30 + adUzun + ekUzun;
    const veri = u8.subarray(bas, bas + g.boyut);
    if (g.yontem === 0) return dec.decode(veri);
    if (g.yontem === 8) return dec.decode(await inflateRaw(veri));
    throw new Error('Desteklenmeyen sıkıştırma türü');
  }
  return { adlar: Object.keys(girdiler), oku };
}

const xmlCoz = (s) =>
  String(s)
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&');

function kolonIndeks(ref) {
  const harf = ref.replace(/[0-9]/g, '');
  let n = 0;
  for (const c of harf) n = n * 26 + (c.charCodeAt(0) - 64);
  return n - 1;
}

function metinleriTopla(xml) {
  let out = '';
  const re = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g;
  let m;
  while ((m = re.exec(xml))) out += m[1];
  return xmlCoz(out);
}

// Dönen değer: satırlar dizisi (her satır hücre dizisi; sayılar number, metinler string, boşlar '')
export async function xlsxOku(buf) {
  const zip = await zipDosyalar(buf);
  const sayfaAdi =
    zip.adlar.find((a) => a === 'xl/worksheets/sheet1.xml') || zip.adlar.filter((a) => /^xl\/worksheets\/[^/]+\.xml$/.test(a)).sort()[0];
  if (!sayfaAdi) throw new Error('Dosyada sayfa bulunamadı');
  const sstXml = await zip.oku('xl/sharedStrings.xml');
  const sst = [];
  if (sstXml) {
    const re = /<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g;
    let m;
    while ((m = re.exec(sstXml))) sst.push(metinleriTopla(m[1]));
  }
  const xml = await zip.oku(sayfaAdi);
  const satirlar = [];
  const satirRe = /<row\b[^>]*>([\s\S]*?)<\/row>/g;
  let sm;
  while ((sm = satirRe.exec(xml))) {
    const satir = [];
    const hucreRe = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
    let hm;
    while ((hm = hucreRe.exec(sm[1]))) {
      const ozellik = hm[1];
      const ref = (/\br="([A-Z]+[0-9]+)"/.exec(ozellik) || [])[1];
      if (!ref) continue;
      const tip = (/\bt="([^"]+)"/.exec(ozellik) || [])[1] || 'n';
      const ic = hm[2] || '';
      let deger = '';
      if (tip === 'inlineStr') deger = metinleriTopla(ic);
      else {
        const v = (/<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/.exec(ic) || [])[1];
        if (v !== undefined) {
          if (tip === 's') deger = sst[Number(v)] ?? '';
          else if (tip === 'str' || tip === 'e') deger = xmlCoz(v);
          else if (tip === 'b') deger = v === '1';
          else deger = Number(v);
        }
      }
      satir[kolonIndeks(ref)] = deger;
    }
    for (let i = 0; i < satir.length; i++) if (satir[i] === undefined) satir[i] = '';
    satirlar.push(satir);
  }
  return satirlar;
}
