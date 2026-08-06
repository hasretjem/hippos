import React, { useState, useEffect, useMemo } from 'react';
import './GunSonu.css';
import { TL } from '../../hooks/useHipposData';
import {
  ArrowLeft, Save, Banknote, Calculator, ShoppingBag, Users, Utensils,
  ChevronDown, ChevronUp, Plus, Trash2, AlertTriangle, Check,
} from 'lucide-react';

// Nakit sayım tablosundaki banknot/madeni para birimleri (büyükten küçüğe, sayarken doğal sıra).
const DENOMS = [200, 100, 50, 20, 10, 5];

// Excel'deki "GİDER KALEMLERİ" sütunuyla aynı kategoriler.
const GIDER_KATEGORILERI = [
  'Gıda Alışı',
  'Kahvaltı Malzeme Alışı',
  'Tavuk Alışı',
  'Kırmızı Et Alışı',
  'İçecek Alışları',
  'Personel Gideri',
  'Ambalaj Malzeme Alışı',
  'Temizlik Malzemesi Alışı',
  'Fatura Gideri (Elektrik/Su/Doğalgaz/Telefon/İnternet)',
  'Kira + Aidat + Otopark Gideri',
  'Vergi + SSK + Diğer Giderler',
  'Yemek Kartı - Banka Masrafı',
  'Diğer Giderler',
];

const YEMEK_KARTLARI = ['edenred', 'sedexco', 'SetCard', 'multinet', 'metropol', 'tokemflex'];

const EKMEK_TURLERI = [
  { key: 'buyukBeyaz', label: 'Büyük Beyaz Ekmeği' },
  { key: 'kucukBeyaz', label: 'Küçük Beyaz Ekmeği' },
  { key: 'domatesli', label: 'Domatesli/Fesleğenli Ekmeği' },
  { key: 'kucukKepek', label: 'Küçük Kepek Ekmeği' },
];

function parseNum(v) {
  return parseFloat(String(v ?? '').replace(',', '.')) || 0;
}

export default function GunSonu({ data, onNavigate }) {
  const { salesHistory } = data;

  const [toast, setToast] = useState('');
  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(''), 2200);
  }

  const bugunTarih = useMemo(() => new Date().toLocaleDateString('tr-TR'), []);

  // ---- Bugünkü ciro (Anlık Ciro panelindekiyle AYNI hesap) ----
  const todaysSales = useMemo(() => {
    const todayStr = new Date().toDateString();
    return (salesHistory || []).filter((s) => s.ts && new Date(s.ts).toDateString() === todayStr);
  }, [salesHistory]);
  const ciro = useMemo(() => {
    const t = { NAKİT: 0, 'KREDİ KARTI': 0, 'YEMEK KARTI': 0, CARİ: 0 };
    todaysSales.forEach((s) => {
      if (t[s.method] !== undefined) t[s.method] += s.amount;
    });
    return { ...t, total: t['NAKİT'] + t['KREDİ KARTI'] + t['YEMEK KARTI'] + t['CARİ'] };
  }, [todaysSales]);

  // ---- Geçmiş Gün Sonu kayıtları (dünkü devir kasayı otomatik bulmak için) + bugünkü ekmek kayıtları ----
  const [gecmisKayitlar, setGecmisKayitlar] = useState([]);
  const [ekmekToplam, setEkmekToplam] = useState({ buyukBeyaz: 0, kucukBeyaz: 0, domatesli: 0, kucukKepek: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadAll() {
      try {
        const [gsRes, ekRes] = await Promise.all([fetch('/api/gunsonu'), fetch('/api/ekmek')]);
        const gsJson = await gsRes.json();
        const ekJson = await ekRes.json();
        setGecmisKayitlar(gsJson.records || []);

        const toplam = { buyukBeyaz: 0, kucukBeyaz: 0, domatesli: 0, kucukKepek: 0 };
        (ekJson.records || []).forEach((r) => {
          toplam.buyukBeyaz += r.buyukBeyaz || 0;
          toplam.kucukBeyaz += r.kucukBeyaz || 0;
          toplam.domatesli += r.domatesli || 0;
          toplam.kucukKepek += r.kucukKepek || 0;
        });
        setEkmekToplam(toplam);
      } catch {
        showToast('Geçmiş veriler yüklenemedi — bağlantıyı kontrol et');
      } finally {
        setLoading(false);
      }
    }
    loadAll();
  }, []);

  // Bugünden ÖNCEKİ en son kaydın "yarına devir"i = bugünün "dünden devir"i.
  const dunkuKayit = useMemo(() => {
    const others = gecmisKayitlar.filter((r) => r.tarih !== bugunTarih);
    return others.length > 0 ? others[others.length - 1] : null;
  }, [gecmisKayitlar, bugunTarih]);

  const [dunDenDevirManuel, setDunDenDevirManuel] = useState('');
  const dunDenDevir = dunkuKayit ? dunkuKayit.nakitSayilanToplam || 0 : parseNum(dunDenDevirManuel);

  // ---- Nakit sayımı ----
  const [nakitAdet, setNakitAdet] = useState({});
  const nakitSayilanToplam = DENOMS.reduce((s, d) => s + d * (parseInt(nakitAdet[d], 10) || 0), 0);

  // ---- Gider kalemleri ----
  const [giderler, setGiderler] = useState({});
  const giderToplam = GIDER_KATEGORILERI.reduce((s, k) => s + parseNum(giderler[k]), 0);

  // ---- Cari ödemelerimiz (serbest liste — kime ne kadar ödendiği gün gün değişebiliyor) ----
  const [cariOdemeler, setCariOdemeler] = useState([{ ad: '', tutar: '' }]);
  const cariOdemeToplam = cariOdemeler.reduce((s, c) => s + parseNum(c.tutar), 0);
  function addCariOdemeRow() {
    setCariOdemeler((prev) => [...prev, { ad: '', tutar: '' }]);
  }
  function updateCariOdemeRow(idx, field, value) {
    setCariOdemeler((prev) => prev.map((r, i) => (i === idx ? { ...r, [field]: value } : r)));
  }
  function removeCariOdemeRow(idx) {
    setCariOdemeler((prev) => prev.filter((_, i) => i !== idx));
  }

  // ---- Yemek kartı dağılımı ----
  const [yemekKartDagilim, setYemekKartDagilim] = useState({});
  const yemekKartToplam = YEMEK_KARTLARI.reduce((s, k) => s + parseNum(yemekKartDagilim[k]), 0);
  const yemekKartFark = yemekKartToplam - ciro['YEMEK KARTI'];

  // ---- Sonuç ----
  const beklenenNakit = dunDenDevir + ciro['NAKİT'] - giderToplam - cariOdemeToplam;
  const nakitFark = nakitSayilanToplam - beklenenNakit;

  const [collapsed, setCollapsed] = useState({});
  function toggleSection(key) {
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  const [saving, setSaving] = useState(false);
  async function kaydet() {
    setSaving(true);
    try {
      const payload = {
        tarih: bugunTarih,
        ciro,
        nakitAdet,
        nakitSayilanToplam,
        dunDenDevir,
        giderler,
        giderToplam,
        cariOdemeler: cariOdemeler.filter((c) => c.ad.trim() || parseNum(c.tutar) > 0),
        cariOdemeToplam,
        yemekKartDagilim,
        yemekKartToplam,
        ekmekToplam,
        beklenenNakit,
        nakitFark,
        yarinaDevir: nakitSayilanToplam,
      };
      const res = await fetch('/api/gunsonu', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('save failed');
      showToast('Gün sonu kaydedildi');
      const gsRes = await fetch('/api/gunsonu');
      const gsJson = await gsRes.json();
      setGecmisKayitlar(gsJson.records || []);
    } catch {
      showToast('Kaydedilemedi — bağlantıyı kontrol et');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="gs-shell">
      <header className="gs-header">
        <button className="gs-back-btn" onClick={() => onNavigate('settings')}><ArrowLeft size={18} /></button>
        <div className="gs-header-title">
          <h1>Gün Sonu — Kasa Hesaplama</h1>
          <span>{bugunTarih}</span>
        </div>
        <button className="gs-save-btn" onClick={kaydet} disabled={saving}>
          <Save size={16} /> {saving ? 'Kaydediliyor...' : 'Gün Sonu Kaydet'}
        </button>
      </header>

      {loading ? (
        <p className="gs-loading">Yükleniyor...</p>
      ) : (
        <div className="gs-content">

          {/* BUGÜNKÜ CİRO — otomatik, salt okunur */}
          <section className="gs-card">
            <h2><Calculator size={16} /> Bugünkü Ciro <span className="gs-auto-tag">otomatik</span></h2>
            <div className="gs-ciro-grid">
              <div className="gs-ciro-item"><span>Nakit</span><strong>{TL(ciro['NAKİT'])}</strong></div>
              <div className="gs-ciro-item"><span>Kredi Kartı</span><strong>{TL(ciro['KREDİ KARTI'])}</strong></div>
              <div className="gs-ciro-item"><span>Yemek Kartı</span><strong>{TL(ciro['YEMEK KARTI'])}</strong></div>
              <div className="gs-ciro-item"><span>Cari</span><strong>{TL(ciro['CARİ'])}</strong></div>
              <div className="gs-ciro-item total"><span>TOPLAM</span><strong>{TL(ciro.total)}</strong></div>
            </div>
          </section>

          {/* NAKİT SAYIMI */}
          <section className="gs-card">
            <h2><Banknote size={16} /> Nakit Sayımı</h2>
            <div className="gs-nakit-table">
              <div className="gs-nakit-head"><span>Kupür</span><span>Adet</span><span>Tutar</span></div>
              {DENOMS.map((d) => (
                <div key={d} className="gs-nakit-row">
                  <span className="gs-nakit-denom">{d} ₺</span>
                  <input
                    type="number"
                    min={0}
                    value={nakitAdet[d] || ''}
                    onChange={(e) => setNakitAdet((prev) => ({ ...prev, [d]: e.target.value }))}
                  />
                  <span className="gs-nakit-tutar">{TL(d * (parseInt(nakitAdet[d], 10) || 0))}</span>
                </div>
              ))}
            </div>
            <div className="gs-row-total"><span>Sayılan Nakit Toplamı</span><strong>{TL(nakitSayilanToplam)}</strong></div>
          </section>

          {/* DÜNDEN DEVİR */}
          <section className="gs-card">
            <h2><Banknote size={16} /> Dünden Devir Kasa</h2>
            {dunkuKayit ? (
              <div className="gs-devir-auto">
                <span>{dunkuKayit.tarih} tarihli Gün Sonu kaydından otomatik alındı</span>
                <strong>{TL(dunDenDevir)}</strong>
              </div>
            ) : (
              <div className="gs-devir-manuel">
                <span>Geçmiş kayıt bulunamadı, elle gir:</span>
                <input
                  type="number"
                  placeholder="0"
                  value={dunDenDevirManuel}
                  onChange={(e) => setDunDenDevirManuel(e.target.value)}
                />
              </div>
            )}
          </section>

          {/* GİDER KALEMLERİ */}
          <section className="gs-card">
            <h2 className="gs-collapsible" onClick={() => toggleSection('gider')}>
              <span><ShoppingBag size={16} /> Gider Kalemleri</span>
              {collapsed.gider ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
            </h2>
            {!collapsed.gider && (
              <div className="gs-list-form">
                {GIDER_KATEGORILERI.map((k) => (
                  <div key={k} className="gs-list-row">
                    <span>{k}</span>
                    <input
                      type="number"
                      min={0}
                      placeholder="0"
                      value={giderler[k] || ''}
                      onChange={(e) => setGiderler((prev) => ({ ...prev, [k]: e.target.value }))}
                    />
                  </div>
                ))}
              </div>
            )}
            <div className="gs-row-total"><span>Toplam Gider</span><strong>{TL(giderToplam)}</strong></div>
          </section>

          {/* CARİ ÖDEMELERİMİZ */}
          <section className="gs-card">
            <h2 className="gs-collapsible" onClick={() => toggleSection('cari')}>
              <span><Users size={16} /> Cari Ödemelerimiz (biz kimlere ödedik)</span>
              {collapsed.cari ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
            </h2>
            {!collapsed.cari && (
              <div className="gs-list-form">
                {cariOdemeler.map((row, idx) => (
                  <div key={idx} className="gs-cari-odeme-row">
                    <input
                      placeholder="Kime (örn. Hukuk Bürosu)"
                      value={row.ad}
                      onChange={(e) => updateCariOdemeRow(idx, 'ad', e.target.value)}
                    />
                    <input
                      type="number"
                      min={0}
                      placeholder="0"
                      value={row.tutar}
                      onChange={(e) => updateCariOdemeRow(idx, 'tutar', e.target.value)}
                    />
                    <button className="gs-row-del" onClick={() => removeCariOdemeRow(idx)}><Trash2 size={13} /></button>
                  </div>
                ))}
                <button className="gs-add-row-btn" onClick={addCariOdemeRow}><Plus size={13} /> Satır Ekle</button>
              </div>
            )}
            <div className="gs-row-total"><span>Toplam Cari Ödeme</span><strong>{TL(cariOdemeToplam)}</strong></div>
          </section>

          {/* YEMEK KARTI DAĞILIMI */}
          <section className="gs-card">
            <h2 className="gs-collapsible" onClick={() => toggleSection('yemek')}>
              <span><Utensils size={16} /> Yemek Kartı Dağılımı</span>
              {collapsed.yemek ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
            </h2>
            {!collapsed.yemek && (
              <div className="gs-list-form">
                {YEMEK_KARTLARI.map((k) => (
                  <div key={k} className="gs-list-row">
                    <span>{k}</span>
                    <input
                      type="number"
                      min={0}
                      placeholder="0"
                      value={yemekKartDagilim[k] || ''}
                      onChange={(e) => setYemekKartDagilim((prev) => ({ ...prev, [k]: e.target.value }))}
                    />
                  </div>
                ))}
              </div>
            )}
            <div className="gs-row-total"><span>Girilen Toplam</span><strong>{TL(yemekKartToplam)}</strong></div>
            <div className={`gs-mini-hint ${Math.abs(yemekKartFark) > 0.5 ? 'warn' : ''}`}>
              Sistemdeki Yemek Kartı cirosu: {TL(ciro['YEMEK KARTI'])} — Fark: {TL(yemekKartFark)}
            </div>
          </section>

          {/* EKMEK SAYIMI — otomatik, Ekmek Gönderme'den */}
          <section className="gs-card">
            <h2><Utensils size={16} /> Bugünkü Ekmek Çıkışı <span className="gs-auto-tag">otomatik</span></h2>
            <div className="gs-ekmek-grid">
              {EKMEK_TURLERI.map((t) => (
                <div key={t.key} className="gs-ekmek-item"><span>{t.label}</span><strong>{ekmekToplam[t.key]} adet</strong></div>
              ))}
            </div>
          </section>

          {/* SONUÇ */}
          <section className="gs-card gs-summary">
            <h2><Calculator size={16} /> Gün Sonu Özeti</h2>
            <div className="gs-summary-row"><span>Dünden Devir</span><strong>{TL(dunDenDevir)}</strong></div>
            <div className="gs-summary-row"><span>+ Bugünkü Nakit Ciro</span><strong>{TL(ciro['NAKİT'])}</strong></div>
            <div className="gs-summary-row"><span>− Toplam Gider</span><strong>{TL(giderToplam)}</strong></div>
            <div className="gs-summary-row"><span>− Cari Ödemelerimiz</span><strong>{TL(cariOdemeToplam)}</strong></div>
            <div className="gs-summary-row expected"><span>= Beklenen Nakit</span><strong>{TL(beklenenNakit)}</strong></div>
            <div className="gs-summary-row counted"><span>Sayılan Nakit</span><strong>{TL(nakitSayilanToplam)}</strong></div>
            <div className={`gs-fark-box ${Math.abs(nakitFark) > 0.5 ? 'warn' : 'ok'}`}>
              {Math.abs(nakitFark) > 0.5 ? <AlertTriangle size={18} /> : <Check size={18} />}
              <span>Fark</span>
              <strong>{TL(nakitFark)}</strong>
            </div>
          </section>

        </div>
      )}

      {toast && <div className="gs-toast">{toast}</div>}
    </div>
  );
}