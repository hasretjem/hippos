import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { ekstraKaydet, ekstraSil, icecekKaydet, icecekSil } from './olVeri';

// Satış ekranındaki "Online sipariş" kategorisinin Ekstralar ve İçecekler listeleri (platform liste fiyatlarıyla).
const TANIM = {
  ekstra: {
    anahtar: 'ekstralar',
    kaydet: ekstraKaydet,
    sil: ekstraSil,
    bos: { ad: '', sira: '', fiyat_kucuk: '', fiyat_buyuk: '', adet_kucuk: '1', adet_buyuk: '1', surulebilir: false, aktif: true },
    sutunlar: [
      ['sira', 'Sıra', 'sayi'],
      ['ad', 'Ürün', 'metin'],
      ['fiyat_kucuk', 'Küçük fiyat', 'sayi'],
      ['fiyat_buyuk', 'Büyük fiyat', 'sayi'],
      ['adet_kucuk', 'Küçük adet', 'sayi'],
      ['adet_buyuk', 'Büyük adet', 'sayi'],
      ['surulebilir', 'Sürülebilir', 'onay'],
      ['aktif', 'Açık', 'onay'],
    ],
    ipucu: 'Fiyatlar platformdaki liste fiyatıdır (indirimden önce). Adet: açık büfede bir seçimde sandviçe konan porsiyon (mutfak fişinde bu adet yazar).',
  },
  icecek: {
    anahtar: 'icecekler',
    kaydet: icecekKaydet,
    sil: icecekSil,
    bos: { ad: '', sira: '', fiyat: '', aktif: true },
    sutunlar: [
      ['sira', 'Sıra', 'sayi'],
      ['ad', 'İçecek', 'metin'],
      ['fiyat', 'Fiyat', 'sayi'],
      ['aktif', 'Açık', 'onay'],
    ],
    ipucu: 'Fiyatlar platformdaki liste fiyatıdır (indirimden önce). Satış ekranında bu sırayla listelenir.',
  },
};

const metne = (r, sutunlar) => {
  const o = { ...r };
  sutunlar.forEach(([k, , tip]) => {
    if (tip === 'sayi') o[k] = r[k] === null || r[k] === undefined ? '' : String(r[k]).replace('.', ',');
  });
  return o;
};

export default function ListeSekmesi({ tur, veri, onYenile, bildir }) {
  const t = TANIM[tur];
  const [satirlar, setSatirlar] = useState(() => veri[t.anahtar].map((r) => metne(r, t.sutunlar)));
  const [degisen, setDegisen] = useState(() => new Set());
  const [bekliyor, setBekliyor] = useState(false);
  useEffect(() => {
    setSatirlar(veri[t.anahtar].map((r) => metne(r, t.sutunlar)));
    setDegisen(new Set());
  }, [veri, t]);

  const guncelle = (i, alan, deger) => {
    setSatirlar((p) => p.map((r, j) => (j === i ? { ...r, [alan]: deger } : r)));
    setDegisen((p) => new Set(p).add(i));
  };
  const ekle = () => {
    const sonSira = satirlar.reduce((m, r) => Math.max(m, Number(String(r.sira).replace(',', '.')) || 0), 0);
    setSatirlar((p) => [...p, { ...t.bos, sira: String(sonSira + 1) }]);
    setDegisen((p) => new Set(p).add(satirlar.length));
  };

  async function kaydet() {
    const idler = [...degisen].filter((i) => satirlar[i]);
    if (idler.some((i) => !String(satirlar[i].ad || '').trim())) return bildir('Adı boş satır var.', true);
    setBekliyor(true);
    try {
      for (const i of idler) await t.kaydet(satirlar[i]);
      bildir('Liste kaydedildi');
      onYenile();
    } catch (e) {
      bildir(e.message, true);
    }
    setBekliyor(false);
  }
  async function sil(i) {
    const r = satirlar[i];
    if (!r.id) {
      setSatirlar((p) => p.filter((_, j) => j !== i));
      setDegisen(new Set());
      return;
    }
    if (!window.confirm(`"${r.ad}" silinsin mi?`)) return;
    try {
      await t.sil(r.id);
      bildir('Silindi');
      onYenile();
    } catch (e) {
      bildir(e.message, true);
    }
  }

  return (
    <div className="m2-card ol-kart">
      <div className="rc-arac">
        <p className="m2-hint ol-liste-ipucu">{t.ipucu}</p>
        <span className="rc-bosluk" />
        <button className="m2-btn sec" onClick={ekle}><Plus size={15} /> Yeni satır</button>
        <button className="m2-btn" disabled={bekliyor || degisen.size === 0} onClick={kaydet}>{bekliyor ? '…' : 'Kaydet'}</button>
      </div>
      <div className="m2-table-wrap">
        <table className="m2-table ol-kalem-tablo ol-liste-tablo">
          <thead>
            <tr>
              {t.sutunlar.map(([k, e]) => <th key={k}>{e}</th>)}
              <th />
            </tr>
          </thead>
          <tbody>
            {satirlar.map((r, i) => (
              <tr key={r.id || `yeni-${i}`} className={degisen.has(i) ? 'ol-degisti' : ''}>
                {t.sutunlar.map(([k, , tip]) => (
                  <td key={k} className={tip === 'metin' ? 'ol-liste-ad' : ''}>
                    {tip === 'onay' ? (
                      <input type="checkbox" checked={!!r[k]} onChange={(e) => guncelle(i, k, e.target.checked)} />
                    ) : (
                      <input className={`m2-input ${tip === 'sayi' ? 'ol-adet' : ''}`} inputMode={tip === 'sayi' ? 'decimal' : undefined} value={r[k] ?? ''} onChange={(e) => guncelle(i, k, e.target.value)} />
                    )}
                  </td>
                ))}
                <td><button className="rc-ikon-btn" onClick={() => sil(i)} aria-label="Sil"><Trash2 size={16} /></button></td>
              </tr>
            ))}
            {satirlar.length === 0 && <tr><td colSpan={t.sutunlar.length + 1} className="ol-bos">Liste boş</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
