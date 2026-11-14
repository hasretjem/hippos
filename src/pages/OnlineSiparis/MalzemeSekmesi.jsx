import { useMemo, useState } from 'react';
import { Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { ModalKabuk, TL, sayi, trNorm } from '../Muhasebe2/m2Ortak';
import { birimMaliyet, faturaBirimFiyat } from './olHesap';
import { malzemeKaydet, malzemeSil } from './olVeri';

const fiyatFmt = (n) => new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(Number(n) || 0);

function MalzemeModal({ malzeme, siraSonraki, onKapat, onKaydedildi }) {
  const [f, setF] = useState(() =>
    malzeme
      ? { ...malzeme, birim_gram: malzeme.birim_gram === null ? '' : String(malzeme.birim_gram), fiyat: String(malzeme.fiyat) }
      : { ad: '', birim_adi: '', birim_gram: '', fiyat_turu: 'kg', fiyat: '', kontrol: false, notu: '', sira: siraSonraki, surulebilir: false, tur: 'malzeme' }
  );
  const [fatura, setFatura] = useState({ liste: '', iskonto: '', kdv: '1', bolen: '1' });
  const [hata, setHata] = useState('');
  const [bekliyor, setBekliyor] = useState(false);
  const ayarla = (alan, deger) => setF((x) => ({ ...x, [alan]: deger }));
  const hesaplanan = fatura.liste ? faturaBirimFiyat(fatura.liste, fatura.iskonto, fatura.kdv, fatura.bolen) : null;
  const onizleme = birimMaliyet({ fiyat_turu: f.fiyat_turu, birim_gram: sayi(f.birim_gram), fiyat: sayi(f.fiyat) });

  async function kaydet() {
    if (!f.ad.trim()) return setHata('Ürün adı yaz.');
    if (f.fiyat_turu === 'kg' && sayi(f.birim_gram) <= 0) return setHata('kg fiyatlı üründe birim gramı yaz.');
    if (sayi(f.fiyat) <= 0) return setHata('Fiyat yaz.');
    setBekliyor(true);
    setHata('');
    try {
      await malzemeKaydet(f);
      onKaydedildi();
    } catch (e) {
      setHata(e.message);
      setBekliyor(false);
    }
  }

  return (
    <ModalKabuk baslik={malzeme ? 'Malzemeyi düzenle' : 'Yeni malzeme'} onKapat={onKapat} ekSinif="ol-malzeme-modal">
      <div className="ol-form">
        <label>
          <span className="rc-etiket">Ürün adı</span>
          <input className="m2-input" value={f.ad} onChange={(e) => ayarla('ad', e.target.value)} />
        </label>
        <label>
          <span className="rc-etiket">Birim (örn. yarım dilim, 1 tutam)</span>
          <input className="m2-input" value={f.birim_adi} onChange={(e) => ayarla('birim_adi', e.target.value)} />
        </label>
        <label>
          <span className="rc-etiket">Birim gramı</span>
          <input className="m2-input" inputMode="decimal" value={f.birim_gram} onChange={(e) => ayarla('birim_gram', e.target.value)} />
        </label>
        <label>
          <span className="rc-etiket">Fiyat türü</span>
          <select className="m2-select" value={f.fiyat_turu} onChange={(e) => ayarla('fiyat_turu', e.target.value)}>
            <option value="kg">TL / kg</option>
            <option value="adet">TL / adet</option>
          </select>
        </label>
        <label>
          <span className="rc-etiket">KDV dahil fiyat ({f.fiyat_turu === 'kg' ? 'TL/kg' : 'TL/adet'})</span>
          <input className="m2-input" inputMode="decimal" value={f.fiyat} onChange={(e) => ayarla('fiyat', e.target.value)} />
        </label>
        <label className="ol-tam">
          <span className="rc-etiket">Not</span>
          <input className="m2-input" value={f.notu} onChange={(e) => ayarla('notu', e.target.value)} />
        </label>
        <label>
          <span className="rc-etiket">Mutfak fişinde</span>
          <select className="m2-select" value={f.tur || 'malzeme'} onChange={(e) => ayarla('tur', e.target.value)}>
            <option value="malzeme">Malzeme (fişte yazar)</option>
            <option value="ekmek">Ekmek (müşterinin seçtiği ekmek yazar)</option>
            <option value="ambalaj">Ambalaj (fişte yazmaz)</option>
          </select>
        </label>
        <label className="rc-onay">
          <input type="checkbox" checked={!!f.surulebilir} onChange={(e) => ayarla('surulebilir', e.target.checked)} /> Sürülebilir (fişte ekmeğin hemen altında yazar)
        </label>
        <label className="rc-onay ol-tam">
          <input type="checkbox" checked={f.kontrol} onChange={(e) => ayarla('kontrol', e.target.checked)} /> Kesin değil / kontrol edilecek (sandviçlerde * ile işaretlenir)
        </label>
      </div>

      <div className="ol-fatura">
        <b>Faturadan hesapla (isteğe bağlı)</b>
        <div className="ol-fatura-satir">
          <input className="m2-input" inputMode="decimal" placeholder="Liste fiyatı" value={fatura.liste} onChange={(e) => setFatura({ ...fatura, liste: e.target.value })} />
          <input className="m2-input" inputMode="decimal" placeholder="İskonto %" value={fatura.iskonto} onChange={(e) => setFatura({ ...fatura, iskonto: e.target.value })} />
          <input className="m2-input" inputMode="decimal" placeholder="KDV %" value={fatura.kdv} onChange={(e) => setFatura({ ...fatura, kdv: e.target.value })} />
          <input className="m2-input" inputMode="decimal" placeholder="Bölen (koli adedi, kg için 1)" value={fatura.bolen} onChange={(e) => setFatura({ ...fatura, bolen: e.target.value })} />
          <button className="m2-btn sec mini" disabled={hesaplanan === null} onClick={() => ayarla('fiyat', String(hesaplanan))}>
            {hesaplanan === null ? 'Fiyata yaz' : `${fiyatFmt(hesaplanan)} → fiyata yaz`}
          </button>
        </div>
      </div>

      <p className="m2-hint">Birim maliyet: <b>{TL(onizleme)}</b></p>
      {hata && <div className="m2-info r">{hata}</div>}
      <div className="m2-modal-actions">
        <button className="m2-btn sec" onClick={onKapat}>Vazgeç</button>
        <button className="m2-btn" disabled={bekliyor} onClick={kaydet}>{bekliyor ? '…' : 'Kaydet'}</button>
      </div>
    </ModalKabuk>
  );
}

export default function MalzemeSekmesi({ veri, onYenile, bildir }) {
  const [ara, setAra] = useState('');
  const [modal, setModal] = useState(null); // { malzeme? }
  const liste = useMemo(() => {
    const q = trNorm(ara);
    return veri.malzemeler.filter((m) => !q || trNorm(`${m.ad} ${m.birim_adi}`).includes(q));
  }, [veri.malzemeler, ara]);
  const siraSonraki = (veri.malzemeler.reduce((t, m) => Math.max(t, m.sira), 0) || 0) + 1;

  async function sil(m) {
    const kullanan = veri.sandvicler.filter((s) => [...s.normal.kalemler, ...s.buyuk.kalemler].some((k) => k.malzeme_id === m.id));
    if (kullanan.length) {
      bildir(`"${m.ad}" şu sandviçlerde kullanılıyor, önce oradan çıkar: ${kullanan.map((s) => s.ad).join(', ')}`, true);
      return;
    }
    if (!window.confirm(`"${m.ad}" silinsin mi?`)) return;
    try {
      await malzemeSil(m.id);
      bildir('Malzeme silindi');
      onYenile();
    } catch (e) {
      bildir(e.message, true);
    }
  }

  return (
    <div className="m2-card ol-kart">
      <div className="rc-arac">
        <div className="rc-ara">
          <Search size={16} />
          <input className="m2-input" placeholder="Malzeme ara…" value={ara} onChange={(e) => setAra(e.target.value)} />
        </div>
        <span className="rc-bosluk" />
        <button className="m2-btn" onClick={() => setModal({})}>
          <Plus size={15} /> Yeni malzeme
        </button>
      </div>
      <p className="m2-hint">Fiyatlar KDV dahildir. Fiyat değişince burayı güncelle, bütün sandviç maliyetleri kendiliğinden yenilenir.</p>
      <div className="m2-table-wrap">
        <table className="m2-table ol-malzeme-tablo">
          <thead>
            <tr>
              <th>Ürün</th>
              <th>Birim</th>
              <th>Gram</th>
              <th>Fiyat</th>
              <th>Birim maliyet</th>
              <th>Not</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {liste.map((m) => (
              <tr key={m.id} className={m.kontrol ? 'ol-kontrol' : ''}>
                <td className="rc-ad">{m.ad}{m.kontrol ? ' *' : ''}{m.surulebilir ? <small className="ol-rozet">sürülebilir</small> : null}{m.tur && m.tur !== 'malzeme' ? <small className="ol-rozet gri">{m.tur}</small> : null}</td>
                <td>{m.birim_adi}</td>
                <td className="ol-sag">{m.birim_gram === null ? '—' : m.birim_gram}</td>
                <td className="ol-sag">{TL(m.fiyat)} / {m.fiyat_turu}</td>
                <td className="ol-sag"><b>{TL(birimMaliyet(m))}</b></td>
                <td className="rc-sonuk">{m.notu}</td>
                <td className="rc-islem">
                  <button className="rc-ikon-btn" onClick={() => setModal({ malzeme: m })} aria-label="Düzenle"><Pencil size={16} /></button>
                  <button className="rc-ikon-btn" onClick={() => sil(m)} aria-label="Sil"><Trash2 size={16} /></button>
                </td>
              </tr>
            ))}
            {liste.length === 0 && (
              <tr><td colSpan={7} className="ol-bos">Malzeme bulunamadı</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {modal && (
        <MalzemeModal
          malzeme={modal.malzeme}
          siraSonraki={siraSonraki}
          onKapat={() => setModal(null)}
          onKaydedildi={() => {
            setModal(null);
            bildir('Malzeme kaydedildi');
            onYenile();
          }}
        />
      )}
    </div>
  );
}
