import { useState } from 'react';
import { komisyonToplam, onerilenCarpan, yuzde } from './olHesap';
import { parametreKaydet } from './olVeri';
import { sayi } from '../Muhasebe2/m2Ortak';

const YUZDE_ALANLARI = [
  ['indirim', 'Yemeksepeti indirimi', 'Hızlı Büyüme Paketi: %20. İndirimi değiştirirsen çarpanı da güncelle.'],
  ['kom_iletim', 'Komisyon', 'Yemeksepeti ekranında %20'],
  ['kom_dagitim', 'Vale dağıtım', 'Yemeksepeti kuryesiyle teslimatta %12'],
  ['kom_kdv', 'Komisyon üzerindeki KDV', 'Komisyon KDV hariç ise %20. Faturadaki KDV indirilebiliyorsa 0 yazılabilir; muhasebecinle doğrula.'],
  ['satis_kdv', 'Satış KDV oranı', 'Varsayım %10; muhasebecinle doğrula.'],
];

export default function ParametreSekmesi({ veri, onYenile, bildir }) {
  const p0 = veri.p;
  const [f, setF] = useState(() => ({
    carpan: String(p0.carpan).replace('.', ','),
    ambalaj_normal: String(p0.ambalaj_normal).replace('.', ','),
    ambalaj_buyuk: String(p0.ambalaj_buyuk).replace('.', ','),
    ...Object.fromEntries(YUZDE_ALANLARI.map(([k]) => [k, String(Math.round(p0[k] * 10000) / 100).replace('.', ',')])),
  }));
  const [bekliyor, setBekliyor] = useState(false);

  const taslak = {
    carpan: sayi(f.carpan),
    ambalaj_normal: sayi(f.ambalaj_normal),
    ambalaj_buyuk: sayi(f.ambalaj_buyuk),
    ...Object.fromEntries(YUZDE_ALANLARI.map(([k]) => [k, sayi(f[k]) / 100])),
  };
  const toplamKom = komisyonToplam(taslak);
  const oneri = onerilenCarpan(taslak);

  async function kaydet() {
    if (taslak.carpan <= 0) return bildir('Çarpan 0\'dan büyük olmalı', true);
    setBekliyor(true);
    try {
      await parametreKaydet(taslak);
      bildir('Parametreler kaydedildi');
      onYenile();
    } catch (e) {
      bildir(e.message, true);
    }
    setBekliyor(false);
  }

  return (
    <div className="m2-card ol-kart">
      <div className="ol-form ol-param">
        <label>
          <span className="rc-etiket">Çarpan (dükkân fiyatı × çarpan)</span>
          <input className="m2-input" inputMode="decimal" value={f.carpan} onChange={(e) => setF({ ...f, carpan: e.target.value })} />
        </label>
        {YUZDE_ALANLARI.map(([k, etiket, not]) => (
          <label key={k} title={not}>
            <span className="rc-etiket">{etiket} (%)</span>
            <input className="m2-input" inputMode="decimal" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
            <small className="ol-sonuk">{not}</small>
          </label>
        ))}
        <label>
          <span className="rc-etiket">Ambalaj maliyeti – normal boy (TL)</span>
          <input className="m2-input" inputMode="decimal" value={f.ambalaj_normal} onChange={(e) => setF({ ...f, ambalaj_normal: e.target.value })} />
          <small className="ol-sonuk">Şimdilik 0; sandviç maliyetine eklenir.</small>
        </label>
        <label>
          <span className="rc-etiket">Ambalaj maliyeti – büyük boy (TL)</span>
          <input className="m2-input" inputMode="decimal" value={f.ambalaj_buyuk} onChange={(e) => setF({ ...f, ambalaj_buyuk: e.target.value })} />
        </label>
      </div>

      <div className="ol-ozet-kutu">
        <div><span>Toplam komisyon (KDV dahil)</span><b>{yuzde(toplamKom)}</b></div>
        <div>
          <span>Dükkândaki tutarı koruyan çarpan</span>
          <b>{oneri ? new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 3 }).format(oneri) : '—'}</b>
          {oneri && (
            <button className="rc-link" onClick={() => setF({ ...f, carpan: String(Math.round(oneri * 100) / 100).replace('.', ',') })}>
              Çarpana yaz
            </button>
          )}
        </div>
      </div>
      <p className="m2-hint">Platform fiyatı = dükkân fiyatı × çarpan (yukarı yuvarlanır). Yemeksepeti'nin yatıracağı tutar = menü fiyatı × (1 − indirim) × (1 − toplam komisyon). Kâr KDV dahil gösterilir (yatan tutar − maliyet).</p>
      <div className="m2-modal-actions">
        <button className="m2-btn" disabled={bekliyor} onClick={kaydet}>{bekliyor ? '…' : 'Kaydet'}</button>
      </div>
    </div>
  );
}
