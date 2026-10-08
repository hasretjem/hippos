import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { fmt, rcApi, trNorm, TL } from './rcOrtak';

const DURUM_ETIKET = { yok: 'Reçete yok', eksik: 'Fiyat eksik', tamam: 'Tamam', gerekmez: 'Gerekmez' };

export default function UrunlerSekmesi({ ozet, onDuzenle, onYenile, bildir }) {
  const [filtre, setFiltre] = useState('hepsi');
  const [ara, setAra] = useState('');
  const [kategori, setKategori] = useState('tumu');
  const [pasifler, setPasifler] = useState(false);
  const [sirala, setSirala] = useState('ad');
  const [secili, setSecili] = useState(() => new Set());

  const kategoriler = useMemo(() => [...new Set(ozet.urunler.map((u) => u.kategori).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'tr')), [ozet]);

  const taban = useMemo(() => ozet.urunler.filter((u) => pasifler || u.durumu === 'AKTIF'), [ozet, pasifler]);
  const sayilar = useMemo(() => {
    const s = { hepsi: taban.length, yok: 0, eksik: 0, tamam: 0, gerekmez: 0 };
    taban.forEach((u) => {
      s[u.durum] += 1;
    });
    return s;
  }, [taban]);

  const gorunen = useMemo(() => {
    const n = trNorm(ara);
    const l = taban.filter((u) => (filtre === 'hepsi' || u.durum === filtre) && (kategori === 'tumu' || u.kategori === kategori) && (!n || trNorm(u.ad).includes(n)));
    const k = {
      ad: (a, b) => a.ad.localeCompare(b.ad, 'tr'),
      karAz: (a, b) => (a.karYuzde ?? 1e9) - (b.karYuzde ?? 1e9),
      karCok: (a, b) => (b.karYuzde ?? -1e9) - (a.karYuzde ?? -1e9),
      maliyet: (a, b) => (b.maliyet ?? -1) - (a.maliyet ?? -1),
    }[sirala];
    return [...l].sort(k);
  }, [taban, filtre, kategori, ara, sirala]);

  const hepsiSecili = gorunen.length > 0 && gorunen.every((u) => secili.has(u.id));
  const secDegistir = (id) =>
    setSecili((s) => {
      const y = new Set(s);
      if (y.has(id)) y.delete(id);
      else y.add(id);
      return y;
    });

  async function toplu(gerekmez) {
    try {
      await rcApi('gerekmezToplu', { method: 'POST', body: { urunIdler: [...secili], gerekmez } });
      bildir(gerekmez ? `${secili.size} ürün "reçete gerekmez" yapıldı` : `${secili.size} ürün geri alındı`);
      setSecili(new Set());
      onYenile();
    } catch (e) {
      bildir(e.message, true);
    }
  }

  return (
    <div className="m2-card rc-kart">
      <div className="rc-chipler">
        {[
          ['hepsi', 'Tümü'],
          ['yok', 'Reçetesiz'],
          ['eksik', 'Fiyatı eksik'],
          ['tamam', 'Tamam'],
          ['gerekmez', 'Gerekmez'],
        ].map(([k, e]) => (
          <button key={k} className={`m2-chip ${filtre === k ? 'on' : ''} ${k === 'yok' && sayilar.yok ? 'rc-chip-uyari' : ''}`} onClick={() => setFiltre(k)}>
            {e} <b>{sayilar[k]}</b>
          </button>
        ))}
      </div>

      <div className="rc-arac">
        <div className="rc-ara">
          <Search size={15} />
          <input className="m2-input" placeholder="Ürün ara…" value={ara} onChange={(e) => setAra(e.target.value)} />
        </div>
        <select className="m2-select" value={kategori} onChange={(e) => setKategori(e.target.value)}>
          <option value="tumu">Tüm kategoriler</option>
          {kategoriler.map((k) => (
            <option key={k} value={k}>{k}</option>
          ))}
        </select>
        <select className="m2-select" value={sirala} onChange={(e) => setSirala(e.target.value)}>
          <option value="ad">Ada göre</option>
          <option value="karAz">Kâr % (azdan çoğa)</option>
          <option value="karCok">Kâr % (çoktan aza)</option>
          <option value="maliyet">Maliyet (yüksekten)</option>
        </select>
        <label className="rc-onay">
          <input type="checkbox" checked={pasifler} onChange={(e) => setPasifler(e.target.checked)} /> Pasif ürünler
        </label>
      </div>

      {secili.size > 0 && (
        <div className="rc-toplu">
          <b>{secili.size} ürün seçili</b>
          <button className="m2-btn mini" onClick={() => toplu(true)}>Reçete gerekmez yap</button>
          <button className="m2-btn sec mini" onClick={() => toplu(false)}>Gerekmez'i geri al</button>
          <button className="m2-btn sec mini" onClick={() => setSecili(new Set())}>Seçimi temizle</button>
        </div>
      )}

      <div className="m2-table-wrap">
        <table className="m2-table rc-urun-tablo">
          <thead>
            <tr>
              <th style={{ width: 34 }}>
                <input
                  type="checkbox"
                  checked={hepsiSecili}
                  onChange={() => setSecili(hepsiSecili ? new Set() : new Set(gorunen.map((u) => u.id)))}
                  aria-label="Görünenleri seç"
                />
              </th>
              <th>Ürün</th>
              <th>Kategori</th>
              <th className="sayi">Satış (KDV dahil)</th>
              <th className="sayi">Maliyet</th>
              <th className="sayi">Paket +</th>
              <th className="sayi">Kâr</th>
              <th className="sayi">Kâr %</th>
              <th>Durum</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {gorunen.length === 0 && (
              <tr>
                <td colSpan={10} className="m2-empty">Bu filtrede ürün yok.</td>
              </tr>
            )}
            {gorunen.map((u) => (
              <tr key={u.id} className={u.durumu !== 'AKTIF' ? 'oto' : ''}>
                <td><input type="checkbox" checked={secili.has(u.id)} onChange={() => secDegistir(u.id)} aria-label={`${u.ad} seç`} /></td>
                <td className="rc-ad">{u.ad}</td>
                <td>{u.kategori}</td>
                <td className="sayi">{TL(u.fiyat)}</td>
                <td className="sayi">{u.maliyet != null ? TL(u.maliyet) : '—'}</td>
                <td className="sayi">{u.paketEk ? `+ ${TL(u.paketEk)}` : '—'}</td>
                <td className={`sayi ${u.kar != null ? (u.kar >= 0 ? 'rc-iyi' : 'rc-kotu') : ''}`}>{u.kar != null ? TL(u.kar) : '—'}</td>
                <td className="sayi">{u.karYuzde != null ? `%${fmt(u.karYuzde, 1)}` : '—'}</td>
                <td>
                  <span className={`rc-rozet ${u.durum}`} title={u.eksik && u.eksik.length ? `Fiyatı yok: ${u.eksik.join(', ')}` : ''}>{DURUM_ETIKET[u.durum]}</span>
                </td>
                <td>
                  <button className="m2-btn sec mini" onClick={() => onDuzenle(u)}>{u.durum === 'yok' ? 'Reçete yaz' : 'Düzenle'}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="m2-hint">Kâr = KDV hariç satış (menü fiyatı ÷ 1,{ozet.kdv}) − maliyet. Maliyet malzemelerin son alış fiyatıyla hesaplanır; fire dahildir. "Paket +" yalnızca paket satışlarda eklenir.</p>
    </div>
  );
}
