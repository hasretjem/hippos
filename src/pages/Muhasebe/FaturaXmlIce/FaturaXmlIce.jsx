import React, { useState, useRef, useEffect } from 'react';
import './FaturaXmlIce.css';
import { TL } from '../../../hooks/useHipposData';
import { Upload, AlertTriangle, RotateCcw, Check } from 'lucide-react';

// ============================================================
// ADIM 1+2+3: Fatura XML İçe Aktarma.
// Adım 1: zip'i parse edip göster (hâlâ hiçbir muhasebe kaydı YOK).
// Adım 2: aynı faturanın (UUID bazlı) daha önce görülüp görülmediği
//         backend'de kontrol edilip "mükerrer" olarak işaretleniyor.
// Adım 3: tedarikçi bazlı öğrenen sınıflandırma (malzeme|gider) +
//         malzeme tedarikçileri için satır bazlı eşleştirme sözlüğü.
// Fatura Detaylı Giriş / Malzeme Maliyet Geçmişi'ne gerçek kayıt
// HÂLÂ yapılmıyor — bu Adım 4'te olacak.
//
// Bilinçli olarak Muhasebe.jsx'ten AYRI bir modül (kota tasarrufu +
// izolasyon).
// ============================================================
export default function FaturaXmlIce({ showToast }) {
  const [yukleniyor, setYukleniyor] = useState(false);
  const [sonuc, setSonuc] = useState(null); // { toplamDosya, basariliFatura, hataliDosya, faturalar, hatalar }
  const [malzemeler, setMalzemeler] = useState([]);
  const fileInputRef = useRef(null);

  useEffect(() => {
    fetch('/api/recete?resource=malzemeler')
      .then((r) => r.json())
      .then((d) => setMalzemeler((d.records || []).filter((m) => m.aktif)))
      .catch(() => {});
  }, []);

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

  // Bir tedarikçi malzeme/gider olarak sınıflandırılınca aynı isimdeki TÜM faturalara
  // (bu yüklemede birden fazla faturası varsa) uygulanır — sözlük tedarikçi bazlı.
  const tedarikciSiniflandir = async (tedarikciAdi, tip) => {
    try {
      const res = await fetch('/api/muhasebe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resource: 'tedarikciTipiKaydet', tedarikciAdi, tip }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setSonuc((prev) => ({
        ...prev,
        faturalar: prev.faturalar.map((f) => (f.tedarikciAdi === tedarikciAdi ? { ...f, tedarikciTipi: tip } : f)),
      }));
      showToast(`${tedarikciAdi} → "${tip === 'malzeme' ? 'Malzeme' : 'Gider'}" olarak kaydedildi`);
    } catch (err) {
      showToast('Kaydedilemedi: ' + err.message);
    }
  };

  const satirEslestir = async (fIdx, sIdx, fatura, satir, malzemeId) => {
    const malzeme = malzemeler.find((m) => m.id === malzemeId);
    if (!malzeme) return;
    try {
      const res = await fetch('/api/muhasebe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resource: 'eslestirmeKaydet',
          tedarikciAdi: fatura.tedarikciAdi,
          urunKodu: satir.urunKodu || '',
          urunAdi: satir.urunAdi,
          malzemeId: malzeme.id,
          malzemeAdi: malzeme.ad,
          paketMiktar: 1,
          paketBirim: satir.birimAdi,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setSonuc((prev) => {
        const kopya = { ...prev, faturalar: prev.faturalar.map((f) => ({ ...f, satirlar: [...f.satirlar] })) };
        kopya.faturalar[fIdx].satirlar[sIdx] = {
          ...kopya.faturalar[fIdx].satirlar[sIdx],
          eslesme: { malzemeId: malzeme.id, malzemeAdi: malzeme.ad, paketMiktar: 1, paketBirim: satir.birimAdi },
        };
        return kopya;
      });
    } catch (err) {
      showToast('Eşleştirme kaydedilemedi: ' + err.message);
    }
  };

  return (
    <div className="mh-panel fxi-wrap">
      <p className="fxi-intro">
        Uyumsoft'tan indirdiğin fatura zip dosyasını yükle. Bu adımda henüz Fatura Detaylı
        Giriş'e kayıt yapılmaz — mükerrer kontrolü, tedarikçi sınıflandırması ve malzeme
        eşleştirmesi burada hazırlanır.
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

          {sonuc.faturalar.map((f, fIdx) => (
            <div key={f.uuid} className="fxi-fatura-kart">
              {f.mukerrer && (
                <div className="fxi-mukerrer-uyari">
                  <RotateCcw size={13} />
                  Bu fatura daha önce {f.oncekiGorulmeTarihi} tarihinde yüklenmiş — mükerrer olabilir.
                </div>
              )}

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

              {f.tedarikciTipi === null && (
                <div className="fxi-siniflandirma-sor">
                  <span>Bu tedarikçiyi nasıl sınıflandırayım?</span>
                  <button className="fxi-tip-btn fxi-tip-malzeme" onClick={() => tedarikciSiniflandir(f.tedarikciAdi, 'malzeme')}>
                    Malzeme
                  </button>
                  <button className="fxi-tip-btn fxi-tip-gider" onClick={() => tedarikciSiniflandir(f.tedarikciAdi, 'gider')}>
                    Gider
                  </button>
                </div>
              )}

              {f.tedarikciTipi === 'gider' && (
                <div className="fxi-gider-etiket">
                  Gider olarak sınıflandırılmış — malzeme eşleştirmesi gerekmiyor.
                </div>
              )}

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
                    {f.tedarikciTipi === 'malzeme' && <th>Malzeme Eşleştirme</th>}
                  </tr>
                </thead>
                <tbody>
                  {f.satirlar.map((s, sIdx) => (
                    <tr key={sIdx} className={s.supheliMiktar ? 'fxi-supheli' : ''}>
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
                      {f.tedarikciTipi === 'malzeme' && (
                        <td>
                          {s.eslesme ? (
                            <span className="fxi-eslesme-ok">
                              <Check size={12} /> {s.eslesme.malzemeAdi}
                            </span>
                          ) : (
                            <select
                              defaultValue=""
                              onChange={(e) => e.target.value && satirEslestir(fIdx, sIdx, f, s, e.target.value)}
                              className="fxi-eslesme-select"
                            >
                              <option value="" disabled>Malzeme seç…</option>
                              {malzemeler.map((m) => (
                                <option key={m.id} value={m.id}>{m.ad}</option>
                              ))}
                            </select>
                          )}
                        </td>
                      )}
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