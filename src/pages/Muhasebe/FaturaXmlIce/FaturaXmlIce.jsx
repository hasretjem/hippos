import React, { useState, useRef, useEffect } from 'react';
import './FaturaXmlIce.css';
import { TL } from '../../../hooks/useHipposData';
import { Upload, AlertTriangle, RotateCcw, Check, Pencil, X } from 'lucide-react';

// Malzeme Havuzu'nda yeni malzeme açarken seçilebilecek birimler — recete.js'teki
// birim dönüşüm kelime dağarcığıyla (kg/gr/ml/litre/adet/porsiyon) uyumlu tutuldu.
const BIRIMLER = ['Adet', 'kg', 'gr', 'lt', 'ml', 'Paket', 'Kutu', 'Porsiyon'];

function metinNormalize(s) {
  return String(s || '').trim().toLocaleLowerCase('tr').replace(/\s+/g, ' ');
}

// ============================================================
// ADIM 1+2+3: Fatura XML İçe Aktarma.
// Adım 1: zip'i parse edip göster (hâlâ hiçbir muhasebe kaydı YOK).
// Adım 2: aynı faturanın (UUID bazlı) daha önce görülüp görülmediği
//         backend'de kontrol edilip "mükerrer" olarak işaretleniyor —
//         kullanıcı onaylayıp listeden kaldırabiliyor.
// Adım 3: tedarikçi bazlı öğrenen KATEGORİ önerisi (kalıcı, kullanıcı
//         yeni kategori ekleyebiliyor) — fatura seviyesinde varsayılan,
//         her satır bağımsız değiştirilebiliyor. Malzeme eşleştirmesi
//         kategoriden bağımsız: her satırda aranabilir, isteğe bağlı,
//         paket/birim dönüşümlü (örn. 1 PK = 50 Adet) ve sonradan
//         düzenlenebilir. Aynı tedarikçi+ürün kodu/adıyla eşleşen diğer
//         satırlara (aynı yüklemedeki başka faturalarda da) otomatik
//         uygulanır.
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
  const [kategoriler, setKategoriler] = useState([]);
  const [editingKey, setEditingKey] = useState(null); // `${fIdx}:${sIdx}` — o an düzenlenen malzeme eşleştirme satırı
  const [formState, setFormState] = useState({
    malzemeArama: '', malzemeSecim: '', yeniMalzemeMi: false, yeniAd: '', yeniBirim: 'Adet', paketMiktar: '1',
  });
  const [kaydedilenler, setKaydedilenler] = useState({}); // uuid -> true (bu oturumda kaydedildi)
  const [kaydediliyor, setKaydediliyor] = useState(false); // toplu kaydetme sürüyor mu
  const [kaydedilenSayisi, setKaydedilenSayisi] = useState(0); // toplu kaydetme ilerleme sayacı
  const fileInputRef = useRef(null);

  useEffect(() => {
    fetch('/api/recete?resource=malzemeler')
      .then((r) => r.json())
      .then((d) => setMalzemeler((d.records || []).filter((m) => m.aktif)))
      .catch(() => {});
    fetch('/api/muhasebe?resource=kategoriler')
      .then((r) => r.json())
      .then((d) => setKategoriler(d.kategoriler || []))
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
      // Faturalar tarihe göre (eskiden yeniye) sıralanıyor — tarih "YYYY-MM-DD" formatında
      // geldiği için doğrudan metin karşılaştırması kronolojik sıralama için yeterli.
      const sirali = [...data.faturalar].sort((a, b) => String(a.tarih || '').localeCompare(String(b.tarih || '')));
      setSonuc({ ...data, faturalar: sirali });
      showToast(`${data.basariliFatura} fatura okundu${data.hataliDosya ? `, ${data.hataliDosya} dosyada hata` : ''}`);
    } catch (err) {
      showToast('Hata: ' + err.message);
    } finally {
      setYukleniyor(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Mükerrer olarak işaretlenmiş bir fatura, kullanıcı onaylayınca (X) sadece bu
  // ekrandan/listeden kaldırılıyor — zaten log'a "görüldü" olarak yazılmıştı,
  // burada tekrar bir yere kayıt yapılmıyor, sadece görünümden çıkarılıyor.
  const faturayiListedenKaldir = (uuid) => {
    setSonuc((prev) => ({ ...prev, faturalar: prev.faturalar.filter((f) => f.uuid !== uuid) }));
  };

  // Yeni kategori sözlüğe kalıcı olarak eklenir (Sheets'te en sona) — bundan sonraki
  // her fatura yüklemesinde de görünür. cb: kategori adı belirlendikten sonra çağrılır.
  const yeniKategoriEkle = async (cb) => {
    const ad = window.prompt('Yeni kategori adı:');
    if (!ad || !ad.trim()) return;
    try {
      const res = await fetch('/api/muhasebe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resource: 'kategoriEkle', kategori: ad.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setKategoriler((prev) => (prev.includes(data.kategori) ? prev : [...prev, data.kategori]));
      cb(data.kategori);
    } catch (err) {
      showToast('Kategori eklenemedi: ' + err.message);
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

  const duzenlemeyeBasla = (fIdx, sIdx, satir) => {
    setEditingKey(`${fIdx}:${sIdx}`);
    setFormState({
      malzemeArama: '',
      malzemeSecim: satir.eslesme ? satir.eslesme.malzemeId : '',
      yeniMalzemeMi: false,
      yeniAd: '',
      yeniBirim: 'Adet',
      paketMiktar: satir.eslesme ? String(satir.eslesme.paketMiktar || 1) : '1',
    });
  };

  const duzenlemeyiIptalEt = () => setEditingKey(null);

  // Tek bir faturayı kaydeder (başarısızsa fırlatır) — "Tümünü Kaydet" tarafından
  // sırayla çağrılıyor, kendi başına toast/hata göstermiyor, onu çağıran yönetiyor.
  const faturaKaydetTek = async (f) => {
    const resource = f.yon === 'satis' ? 'xmlKaydetSatis' : 'xmlKaydetAlis';
    const body = f.yon === 'satis'
      ? {
        resource,
        aliciAdi: f.aliciAdi,
        faturaNo: f.faturaNo,
        tarih: f.tarih,
        toplamKdvDahil: f.toplamKdvDahil,
        toplamKdvTutari: f.toplamKdvTutari,
      }
      : {
        resource,
        tedarikciAdi: f.tedarikciAdi,
        faturaNo: f.faturaNo,
        tarih: f.tarih,
        toplamKdvDahil: f.toplamKdvDahil,
        toplamKdvTutari: f.toplamKdvTutari,
        satirlar: f.satirlar.map((s) => ({
          urunAdi: s.urunAdi,
          miktar: s.miktar,
          birimFiyat: s.efektifBirimFiyatKdvDahil,
          kdvOrani: s.kdvOrani,
          iskontoOrani: s.iskontoOrani,
          kdvTutari: s.kdvTutari,
          satirTutari: s.satirTutariKdvDahil,
          kategori: s.kategori || '',
        })),
      };
    const res = await fetch('/api/muhasebe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
  };

  // ADIM 4: ekrandaki mükerrer OLMAYAN, henüz kaydedilmemiş tüm faturaları tek tek
  // (sırayla, aynı anda değil — Sheets append'lerinin birbirine çarpmaması için)
  // kaydeder. Yön (alış/satış) backend'de VKN karşılaştırmasıyla belirlendi.
  const tumunuKaydet = async () => {
    const kaydedilecekler = sonuc.faturalar.filter((f) => !kaydedilenler[f.uuid]);
    if (kaydedilecekler.length === 0) return;
    setKaydediliyor(true);
    setKaydedilenSayisi(0);
    let hataSayisi = 0;
    for (const f of kaydedilecekler) {
      try {
        await faturaKaydetTek(f);
        setKaydedilenler((prev) => ({ ...prev, [f.uuid]: true }));
      } catch (err) {
        hataSayisi += 1;
        showToast(`${f.faturaNo} kaydedilemedi: ${err.message}`);
      }
      setKaydedilenSayisi((prev) => prev + 1);
    }
    setKaydediliyor(false);
    if (hataSayisi === 0) showToast(`${kaydedilecekler.length} fatura kaydedildi`);
    else showToast(`${kaydedilecekler.length - hataSayisi} fatura kaydedildi, ${hataSayisi} tanesi başarısız`);
  };

  // Bir satır eşleştirilince, AYNI yüklemedeki (henüz Sheets'e yansımamış) diğer
  // faturalardaki aynı tedarikçi + aynı ürün kodu/adına sahip eşleşmemiş satırlara
  // da otomatik uygulanır — kullanıcı her tekrarında aynı işi yapmasın diye.
  // Otomatik uygulananlar "otomatikEslesme" ile işaretlenip uyarı ikonuyla gösterilir.
  const kaydetEslesme = async (fIdx, sIdx, fatura, satir) => {
    let malzeme;
    try {
      if (formState.yeniMalzemeMi) {
        if (!formState.yeniAd.trim()) { showToast('Malzeme adı gerekli'); return; }
        const res = await fetch('/api/recete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ resource: 'malzemeler', ad: formState.yeniAd.trim(), birim: formState.yeniBirim }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        malzeme = data.record;
        setMalzemeler((prev) => [...prev, malzeme]);
      } else {
        malzeme = malzemeler.find((m) => m.id === formState.malzemeSecim);
        if (!malzeme) { showToast('Bir malzeme seç veya "+ Yeni Malzeme Oluştur" kullan'); return; }
      }

      const paketMiktar = Number(String(formState.paketMiktar).replace(',', '.')) || 1;

      const res2 = await fetch('/api/muhasebe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resource: 'eslestirmeKaydet',
          tedarikciAdi: fatura.tedarikciAdi,
          urunKodu: satir.urunKodu || '',
          urunAdi: satir.urunAdi,
          malzemeId: malzeme.id,
          malzemeAdi: malzeme.ad,
          paketMiktar,
          paketBirim: malzeme.birim,
        }),
      });
      if (!res2.ok) throw new Error((await res2.json()).error);

      const yeniEslesme = { malzemeId: malzeme.id, malzemeAdi: malzeme.ad, paketMiktar, paketBirim: malzeme.birim };
      const kodNorm = metinNormalize(satir.urunKodu);
      const adNorm = metinNormalize(satir.urunAdi);

      setSonuc((prev) => {
        const kopya = { ...prev, faturalar: prev.faturalar.map((f) => ({ ...f, satirlar: [...f.satirlar] })) };
        kopya.faturalar[fIdx].satirlar[sIdx] = { ...kopya.faturalar[fIdx].satirlar[sIdx], eslesme: yeniEslesme, otomatikEslesme: false };
        kopya.faturalar.forEach((f, fi) => {
          if (f.tedarikciAdi !== fatura.tedarikciAdi) return;
          f.satirlar.forEach((s, si) => {
            if (fi === fIdx && si === sIdx) return;
            if (s.eslesme) return;
            const ayniKod = satir.urunKodu && s.urunKodu && metinNormalize(s.urunKodu) === kodNorm;
            const ayniAd = metinNormalize(s.urunAdi) === adNorm;
            if (ayniKod || ayniAd) {
              kopya.faturalar[fi].satirlar[si] = { ...s, eslesme: yeniEslesme, otomatikEslesme: true };
            }
          });
        });
        return kopya;
      });
      setEditingKey(null);
    } catch (err) {
      showToast('Eşleştirme kaydedilemedi: ' + err.message);
    }
  };

  return (
    <div className="mh-panel fxi-wrap">
      <p className="fxi-intro">
        Uyumsoft'tan indirdiğin fatura zip dosyasını yükle. Bu adımda henüz Fatura Detaylı
        Giriş'e kayıt yapılmaz — mükerrer kontrolü, tedarikçi kategorisi ve malzeme
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
                  <button className="fxi-mukerrer-kaldir" onClick={() => faturayiListedenKaldir(f.uuid)} title="Onayla ve listeden kaldır">
                    <X size={14} />
                  </button>
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
                  {f.toplamIskonto > 0 && (
                    <>
                      <span className="fxi-meta"> · İskonto: </span>{TL(f.toplamIskonto)}
                    </>
                  )}
                  <span className="fxi-meta"> · Toplam: </span><b>{TL(f.toplamKdvDahil)}</b>
                </div>
              </div>

              {f.yon === 'satis' ? (
                <div className="fxi-kaydet-satir">
                  {kaydedilenler[f.uuid] && (
                    <span className="fxi-eslesme-ok"><span><Check size={14} /> Satış Faturası olarak kaydedildi</span></span>
                  )}
                </div>
              ) : (
              <>
              {f.tedarikciKategoriOnerisi === null && (
                <div className="fxi-siniflandirma-sor">
                  <span>Bu tedarikçi için varsayılan kategori seç:</span>
                  {kategoriler.map((k) => (
                    <button key={k} className="fxi-tip-btn fxi-kategori-btn" onClick={() => tedarikciKategoriSec(f.tedarikciAdi, k)}>
                      {k}
                    </button>
                  ))}
                  <button
                    className="fxi-tip-btn fxi-yeni-kategori-btn"
                    onClick={() => yeniKategoriEkle((yeniAd) => tedarikciKategoriSec(f.tedarikciAdi, yeniAd))}
                  >
                    + Yeni Kategori
                  </button>
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
                    <th>İskonto %</th>
                    <th>Not (ham)</th>
                    <th>Kategori</th>
                    <th>Malzeme Eşleştirme</th>
                  </tr>
                </thead>
                <tbody>
                  {f.satirlar.map((s, sIdx) => {
                    const key = `${fIdx}:${sIdx}`;
                    const duzenleniyor = editingKey === key;
                    const secilenMalzeme = malzemeler.find((m) => m.id === formState.malzemeSecim);
                    const aramaEslesenler = duzenleniyor && formState.malzemeArama
                      ? malzemeler.filter((m) => metinNormalize(m.ad).includes(metinNormalize(formState.malzemeArama)))
                      : [];
                    return (
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
                        <td>{s.iskontoOrani > 0 ? `%${s.iskontoOrani}` : '—'}</td>
                        <td className="fxi-not">{s.not || '—'}</td>
                        <td>
                          <select
                            value={s.kategori || ''}
                            onChange={(e) => {
                              if (e.target.value === '__yeni__') yeniKategoriEkle((yeniAd) => satirKategoriDegistir(fIdx, sIdx, yeniAd));
                              else satirKategoriDegistir(fIdx, sIdx, e.target.value);
                            }}
                            className="fxi-eslesme-select"
                          >
                            <option value="" disabled>Kategori seç…</option>
                            <option value="__yeni__">+ Yeni Kategori</option>
                            {kategoriler.map((k) => (
                              <option key={k} value={k}>{k}</option>
                            ))}
                          </select>
                        </td>
                        <td>
                          {s.eslesme && !duzenleniyor ? (
                            <div className="fxi-eslesme-ok">
                              <span>
                                <Check size={12} /> {s.eslesme.malzemeAdi}
                                {s.otomatikEslesme && (
                                  <AlertTriangle size={12} className="fxi-uyari-ikon" title="Aynı tedarikçi + ürün kodu/adına göre otomatik eşleşti — kontrol et" />
                                )}
                              </span>
                              <span className="fxi-fiyat-onizleme">
                                {TL(s.efektifBirimFiyatKdvDahil / (s.eslesme.paketMiktar || 1))} / {s.eslesme.paketBirim} olarak kaydedilecek
                              </span>
                              <button className="fxi-duzenle-link" onClick={() => duzenlemeyeBasla(fIdx, sIdx, s)}>
                                <Pencil size={11} /> Düzenle
                              </button>
                            </div>
                          ) : (
                            <div className="fxi-eslesme-form">
                              {!formState.yeniMalzemeMi ? (
                                <>
                                  <input
                                    type="text"
                                    placeholder="Malzeme ara…"
                                    value={duzenleniyor ? formState.malzemeArama : ''}
                                    onFocus={() => { if (!duzenleniyor) duzenlemeyeBasla(fIdx, sIdx, s); }}
                                    onChange={(e) => setFormState((prev) => ({ ...prev, malzemeArama: e.target.value }))}
                                    className="fxi-eslesme-input"
                                  />
                                  {duzenleniyor && aramaEslesenler.length > 0 && (
                                    <div className="fxi-arama-sonuclari">
                                      {aramaEslesenler.slice(0, 8).map((m) => (
                                        <div
                                          key={m.id}
                                          className="fxi-arama-satir"
                                          onClick={() => setFormState((prev) => ({ ...prev, malzemeSecim: m.id, malzemeArama: '' }))}
                                        >
                                          {m.ad}
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                  {duzenleniyor && secilenMalzeme && (
                                    <div className="fxi-secili-etiket">Seçili: {secilenMalzeme.ad}</div>
                                  )}
                                  <button
                                    type="button"
                                    className="fxi-yeni-kategori-btn fxi-yeni-malzeme-btn"
                                    onClick={() => {
                                      if (!duzenleniyor) duzenlemeyeBasla(fIdx, sIdx, s);
                                      setFormState((prev) => ({ ...prev, yeniMalzemeMi: true, malzemeSecim: '' }));
                                    }}
                                  >
                                    + Yeni Malzeme Oluştur
                                  </button>
                                </>
                              ) : (
                                <>
                                  <input
                                    type="text"
                                    placeholder="Malzeme adı"
                                    value={formState.yeniAd}
                                    onChange={(e) => setFormState((prev) => ({ ...prev, yeniAd: e.target.value }))}
                                    className="fxi-eslesme-input"
                                  />
                                  <select
                                    value={formState.yeniBirim}
                                    onChange={(e) => setFormState((prev) => ({ ...prev, yeniBirim: e.target.value }))}
                                    className="fxi-eslesme-select"
                                  >
                                    {BIRIMLER.map((b) => (
                                      <option key={b} value={b}>{b}</option>
                                    ))}
                                  </select>
                                  <button
                                    type="button"
                                    className="fxi-duzenle-link"
                                    onClick={() => setFormState((prev) => ({ ...prev, yeniMalzemeMi: false }))}
                                  >
                                    Var olan malzemeyi ara
                                  </button>
                                </>
                              )}

                              {duzenleniyor && (formState.malzemeSecim || (formState.yeniMalzemeMi && formState.yeniAd.trim())) && (
                                <>
                                  <label className="fxi-paket-etiket">
                                    1 {s.birimAdi} = kaç malzeme birimi?
                                    <input
                                      type="number"
                                      min="0.0001"
                                      step="any"
                                      value={formState.paketMiktar}
                                      onChange={(e) => setFormState((prev) => ({ ...prev, paketMiktar: e.target.value }))}
                                      className="fxi-paket-input"
                                    />
                                  </label>
                                  <div className="fxi-eslesme-form-btns">
                                    <button className="fxi-tip-btn fxi-kategori-btn" onClick={() => kaydetEslesme(fIdx, sIdx, f, s)}>Kaydet</button>
                                    {s.eslesme && (
                                      <button className="fxi-tip-btn fxi-tip-gider" onClick={duzenlemeyiIptalEt}>Vazgeç</button>
                                    )}
                                  </div>
                                </>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              <div className="fxi-kaydet-satir">
                {kaydedilenler[f.uuid] && (
                  <span className="fxi-eslesme-ok"><span><Check size={14} /> Alış Faturası olarak kaydedildi</span></span>
                )}
              </div>
              </>
              )}
            </div>
          ))}

          {sonuc.faturalar.length > 0 && (
            <div className="fxi-tumunu-kaydet-satir">
              <button
                className="fxi-tip-btn fxi-kategori-btn fxi-tumunu-kaydet-btn"
                disabled={kaydediliyor || sonuc.faturalar.every((f) => kaydedilenler[f.uuid])}
                onClick={tumunuKaydet}
              >
                {kaydediliyor ? `Kaydediliyor… (${kaydedilenSayisi}/${sonuc.faturalar.length})` : 'Tümünü Kaydet'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}