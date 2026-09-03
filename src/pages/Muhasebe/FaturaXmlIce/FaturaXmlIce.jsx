import React, { useState, useRef, useEffect } from 'react';
import './FaturaXmlIce.css';
import { TL } from '../../../hooks/useHipposData';
import { Upload, AlertTriangle, RotateCcw, Check } from 'lucide-react';

// Toptancılar sayfasındaki mevcut kategori sözlüğüyle AYNI liste (api/toptancilar.js
// TOPTANCI_KATEGORILERI) — ikisi birbirinden bağımsız güncellenmemeli.
const KATEGORILER = [
  'Manav', 'Kırmızı Et', 'Tavuk Eti', 'Ambalaj',
  'Baget Ekmek', 'Fırın Ekmeği', 'Kahvaltı ve Sandviç Malzemesi', 'Sulu Yemek Malzemesi',
];

// ============================================================
// ADIM 1+2+3: Fatura XML İçe Aktarma.
// Adım 1: zip'i parse edip göster (hâlâ hiçbir muhasebe kaydı YOK).
// Adım 2: aynı faturanın (UUID bazlı) daha önce görülüp görülmediği
//         backend'de kontrol edilip "mükerrer" olarak işaretleniyor.
// Adım 3: tedarikçi bazlı öğrenen KATEGORİ önerisi (Toptancılar'daki mevcut
//         kategori sözlüğü) — fatura seviyesinde varsayılan, ama her satır
//         bağımsız değiştirilebiliyor. Malzeme eşleştirmesi kategoriden
//         bağımsız: her satırda isteğe bağlı.
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

  // Fatura seviyesinde varsayılan kategori seçimi — aynı isimdeki tedarikçi için
  // öğrenilir (bir sonraki faturada tekrar sorulmaz), ama her satır ayrı ayrı
  // değiştirilebildiği için burada sadece "varsayılanı" güncelliyoruz.
  const tedarikciKategoriSec = async (tedarikciAdi, kategori) => {
    try {
      const res = await fetch('/api/muhasebe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resource: 'tedarikciKategoriKaydet', tedarikciAdi, kategori }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setSonuc((prev) => ({
        ...prev,
        faturalar: prev.faturalar.map((f) => (f.tedarikciAdi === tedarikciAdi
          ? { ...f, tedarikciKategoriOnerisi: kategori, satirlar: f.satirlar.map((s) => ({ ...s, kategori })) }
          : f)),
      }));
      showToast(`${tedarikciAdi} → "${kategori}" olarak kaydedildi`);
    } catch (err) {
      showToast('Kaydedilemedi: ' + err.message);
    }
  };

  // Bir satırın kategorisi tedarikçi varsayılanından bağımsız olarak değiştirilebiliyor
  // (aynı faturada birden fazla kategori olabildiği için) — sadece bu fatura için, yerelde.
  const satirKategoriDegistir = (fIdx, sIdx, kategori) => {
    setSonuc((prev) => {
      const kopya = { ...prev, faturalar: prev.faturalar.map((f) => ({ ...f, satirlar: [...f.satirlar] })) };
      kopya.faturalar[fIdx].satirlar[sIdx] = { ...kopya.faturalar[fIdx].satirlar[sIdx], kategori };
      return kopya;
    });
  };

  // Malzeme Havuzu'nda henüz karşılığı olmayan bir ürün için buradan direkt yeni
  // malzeme kaydı açılabiliyor — sonra otomatik olarak bu satırla eşleştiriliyor.
  const yeniMalzemeOlusturVeEslestir = async (fIdx, sIdx, fatura, satir) => {
    const ad = window.prompt('Yeni malzeme adı:', satir.urunAdi || '');
    if (!ad) return;
    const birim = window.prompt('Birim (kg, gr, lt, ml, adet…):', satir.birimAdi || 'adet');
    if (!birim) return;
    try {
      const res = await fetch('/api/recete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resource: 'malzemeler', ad, birim }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const yeniMalzeme = data.record;
      setMalzemeler((prev) => [...prev, yeniMalzeme]);
      await satirEslestir(fIdx, sIdx, fatura, satir, null, yeniMalzeme);
    } catch (err) {
      showToast('Malzeme oluşturulamadı: ' + err.message);
    }
  };

  // malzemeId (havuzdan seçilen) veya malzemeObj (az önce oluşturulan, henüz state'e
  // işlenmemiş olabileceği için id'den aramak yerine direkt obje geçiliyor) — biri gerekli.
  const satirEslestir = async (fIdx, sIdx, fatura, satir, malzemeId, malzemeObj) => {
    const malzeme = malzemeObj || malzemeler.find((m) => m.id === malzemeId);
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

              {f.tedarikciKategoriOnerisi === null && (
                <div className="fxi-siniflandirma-sor">
                  <span>Bu tedarikçi için varsayılan kategori seç:</span>
                  {KATEGORILER.map((k) => (
                    <button key={k} className="fxi-tip-btn fxi-kategori-btn" onClick={() => tedarikciKategoriSec(f.tedarikciAdi, k)}>
                      {k}
                    </button>
                  ))}
                </div>
              )}

              <table className="fxi-tablo">
                <thead>
                  <tr>
                    <th>Ürün Adı</th>
                    <th>Ürün Kodu</th>
                    <th>Miktar</th>
                    <th>Birim</th>
                    <th>Birim Fiyat (KDV Dahil)</th>
                    <th>Satır Tutarı (KDV Dahil)</th>
                    <th>KDV %</th>
                    <th>Not (ham)</th>
                    <th>Kategori</th>
                    <th>Malzeme Eşleştirme</th>
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
                      <td>{TL(s.efektifBirimFiyatKdvDahil)}</td>
                      <td>{TL(s.satirTutariKdvDahil)}</td>
                      <td>%{s.kdvOrani}</td>
                      <td className="fxi-not">{s.not || '—'}</td>
                      <td>
                        <select
                          value={s.kategori || ''}
                          onChange={(e) => satirKategoriDegistir(fIdx, sIdx, e.target.value)}
                          className="fxi-eslesme-select"
                        >
                          <option value="" disabled>Kategori seç…</option>
                          {KATEGORILER.map((k) => (
                            <option key={k} value={k}>{k}</option>
                          ))}
                        </select>
                      </td>
                      <td>
                        {s.eslesme ? (
                          <div className="fxi-eslesme-ok">
                            <span><Check size={12} /> {s.eslesme.malzemeAdi}</span>
                            <span className="fxi-fiyat-onizleme">
                              {TL(s.efektifBirimFiyatKdvDahil)} / {s.birimAdi} olarak kaydedilecek
                            </span>
                          </div>
                        ) : (
                          <select
                            defaultValue=""
                            onChange={(e) => {
                              const val = e.target.value;
                              if (!val) return;
                              if (val === '__yeni__') yeniMalzemeOlusturVeEslestir(fIdx, sIdx, f, s);
                              else satirEslestir(fIdx, sIdx, f, s, val);
                              e.target.value = '';
                            }}
                            className="fxi-eslesme-select"
                          >
                            <option value="" disabled>Malzeme seç…</option>
                            <option value="__yeni__">+ Yeni Malzeme Oluştur</option>
                            {malzemeler.map((m) => (
                              <option key={m.id} value={m.id}>{m.ad}</option>
                            ))}
                          </select>
                        )}
                      </td>
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