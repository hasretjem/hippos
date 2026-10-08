import { Plus } from 'lucide-react';
import { fiyatFmt, rcApi, TL } from './rcOrtak';

export default function YariMamuller({ yariMamuller, onDuzenle, onYenile, bildir }) {
  async function sil(y) {
    if (!window.confirm(`"${y.ad}" silinsin mi?`)) return;
    try {
      await rcApi('receteSil', { method: 'POST', body: { id: y.id } });
      bildir('Yarı mamul silindi');
      onYenile();
    } catch (e) {
      bildir(e.message, true);
    }
  }
  return (
    <div className="m2-card rc-kart">
      <p className="m2-hint" style={{ marginTop: 0 }}>
        Birden çok yemekte ortak kullanılan karışımları buraya bir kez yazın (ör. "Salçalı yemek bazı": salça + yağ + baharat). Ürün reçetelerinde malzeme gibi seçilir; fiyatlar değişince hepsi birlikte güncellenir.
      </p>
      <div className="rc-arac">
        <button className="m2-btn mini" onClick={() => onDuzenle({ ad: '', ciktiMiktar: '', ciktiBirim: 'g' })}>
          <Plus size={14} style={{ verticalAlign: '-2px' }} /> Yeni yarı mamul
        </button>
      </div>
      <div className="m2-table-wrap">
        <table className="m2-table rc-ym-tablo">
          <thead>
            <tr>
              <th>Yarı mamul</th>
              <th className="sayi">Çıktı</th>
              <th className="sayi">Karışım maliyeti</th>
              <th className="sayi">Birim maliyet</th>
              <th>Durum</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {yariMamuller.length === 0 && (
              <tr><td colSpan={6} className="m2-empty">Henüz yarı mamul yok.</td></tr>
            )}
            {yariMamuller.map((y) => (
              <tr key={y.id}>
                <td className="rc-ad">{y.ad} <small className="rc-sonuk">{y.kalemSayisi} kalem</small></td>
                <td className="sayi">{y.ciktiMiktar} {y.ciktiBirim}</td>
                <td className="sayi">{TL(y.toplamMaliyet)}</td>
                <td className="sayi"><b>{fiyatFmt(y.birimMaliyet)} ₺/{y.ciktiBirim}</b></td>
                <td>{y.eksik.length ? <span className="rc-rozet eksik" title={y.eksik.join(', ')}>Fiyat eksik</span> : <span className="rc-rozet tamam">Tamam</span>}</td>
                <td className="rc-islem">
                  <button className="m2-btn sec mini" onClick={() => onDuzenle(y)}>Düzenle</button>
                  <button className="m2-btn sec mini" onClick={() => sil(y)}>Sil</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
