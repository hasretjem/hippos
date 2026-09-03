import React, { useState, useRef } from 'react';
import './FaturaXmlIce.css';
import { TL } from '../../../hooks/useHipposData';
import { Upload, AlertTriangle } from 'lucide-react';

// ============================================================
// ADIM 1: Fatura XML İçe Aktarma — sadece parse edip göster.
// Bu aşamada HİÇBİR YERE (Sheets/Supabase) yazma yok; amaç
// parser'ın doğru okuduğunu birlikte gözle doğrulamak.
//
// Bilinçli olarak Muhasebe.jsx'ten AYRI bir modül: bu özellik
// birkaç aşamada büyüyecek (eşleştirme sözlüğü, gerçek kayıt,
// toptancı bakiyesi, kategori raporu). Ayrı dosyada tutmak her
// aşamada sadece bu dosyayı okuyup değiştirmeyi sağlıyor.
// ============================================================
export default function FaturaXmlIce({ showToast }) {
  const [yukleniyor, setYukleniyor] = useState(false);
  const [sonuc, setSonuc] = useState(null); // { toplamDosya, basariliFatura, hataliDosya, faturalar, hatalar }
  const fileInputRef = useRef(null);

  const dosyaSecildi = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.zip')) {
      showToast('Lütfen bir .zip dosyası seçin');
      return;
    }

    setYukleniyor(true);
    setSonuc(null);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      const zipBase64 = btoa(binary);

      const res = await fetch('/api/muhasebe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resource: 'xmlImport', zipBase64 }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || 'Yükleme başarısız');
        return;
      }
      setSonuc(data);
      showToast(`${data.basariliFatura} fatura okundu${data.hataliDosya ? `, ${data.hataliDosya} dosyada hata` : ''}`);
    } catch (err) {
      showToast('Hata: ' + err.message);
    } finally {
      setYukleniyor(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="mh-panel fxi-wrap">
      <p className="fxi-intro">
        Uyumsoft'tan indirdiğin fatura zip dosyasını yükle. Bu adımda hiçbir kayıt yapılmaz —
        sadece faturaların doğru okunduğunu birlikte kontrol ediyoruz.
      </p>

      <label className="fxi-upload-btn">
        <Upload size={16} />
        <span>{yukleniyor ? 'Yükleniyor...' : 'Zip Dosyası Seç'}</span>
        <input
          ref={fileInputRef}
          type="file"
          accept=".zip"
          onChange={dosyaSecildi}
          disabled={yukleniyor}
          style={{ display: 'none' }}
        />
      </label>

      {sonuc && (
        <div className="fxi-sonuc">
          <div className="fxi-ozet">
            <span>Toplam dosya: <b>{sonuc.toplamDosya}</b></span>
            <span className="fxi-ok">Başarılı: <b>{sonuc.basariliFatura}</b></span>
            {sonuc.hataliDosya > 0 && (
              <span className="fxi-err">Hatalı: <b>{sonuc.hataliDosya}</b></span>
            )}
          </div>

          {sonuc.hatalar.length > 0 && (
            <div className="fxi-hata-kutu">
              {sonuc.hatalar.map((h, i) => (
                <div key={i} className="fxi-hata-satir">
                  <AlertTriangle size={13} />
                  {h.dosya}: {h.hata}
                </div>
              ))}
            </div>
          )}

          {sonuc.faturalar.map((f) => (
            <div key={f.uuid} className="fxi-fatura-kart">
              <div className="fxi-fatura-baslik">
                <div>
                  <b>{f.tedarikciAdi || '(Tedarikçi adı okunamadı)'}</b>
                  <span className="fxi-meta">
                    Fatura No: {f.faturaNo} · Tarih: {f.tarih}
                  </span>
                </div>
                <div className="fxi-toplamlar">
                  <span className="fxi-meta">KDV Hariç: </span>{TL(f.toplamKdvHaric)}
                  <span className="fxi-meta"> · KDV: </span>{TL(f.toplamKdvTutari)}
                  <span className="fxi-meta"> · Toplam: </span><b>{TL(f.toplamKdvDahil)}</b>
                </div>
              </div>

              <table className="fxi-tablo">
                <thead>
                  <tr>
                    <th>Ürün Adı</th>
                    <th>Ürün Kodu</th>
                    <th>Miktar</th>
                    <th>Birim</th>
                    <th>Birim Fiyat</th>
                    <th>Satır Tutarı</th>
                    <th>KDV %</th>
                    <th>Not (ham)</th>
                  </tr>
                </thead>
                <tbody>
                  {f.satirlar.map((s, i) => (
                    <tr key={i} className={s.supheliMiktar ? 'fxi-supheli' : ''}>
                      <td>
                        {s.supheliMiktar && (
                          <AlertTriangle size={12} className="fxi-uyari-ikon" title="Miktar/tutar tutarsız olabilir" />
                        )}
                        {s.urunAdi}
                      </td>
                      <td className={s.urunKodu ? '' : 'fxi-kod-yok'}>
                        {s.urunKodu || '(kod yok)'}
                      </td>
                      <td>{s.miktar}</td>
                      <td>{s.birimAdi}</td>
                      <td>{TL(s.birimFiyat)}</td>
                      <td>{TL(s.satirTutari)}</td>
                      <td>%{s.kdvOrani}</td>
                      <td className="fxi-not">{s.not || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}