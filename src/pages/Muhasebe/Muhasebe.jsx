import React, { useState, useEffect, useMemo, useRef } from 'react';
import './Muhasebe.css';
import { TL } from '../../hooks/useHipposData';
import { supabase } from '../../services/supabase';
import {
  ArrowLeft, Receipt, Truck, Users, ListPlus, Copy, MessageCircle, Plus, Trash2,
  Lock, Delete, Check, X, Search, Pencil, ChefHat,
} from 'lucide-react';

const PERSONEL_PIN = '1234';

const TOPTANCI_KATEGORILERI = [
  'Manav', 'Kırmızı Et', 'Tavuk Eti', 'Ambalaj',
  'Baget Ekmek', 'Fırın Ekmeği', 'Kahvaltı ve Sandviç Malzemesi', 'Sulu Yemek Malzemesi',
];

// ================== FATURA/MAKBUZ — 4 alt sekme tanımı ==================
// firma alanı olan her sekmede o alan artık autocomplete'li (Toptancılar + aktif
// Personel listesinden). Seçim yapılınca kategori bilgisi de otomatik notta görünür.
const MUHASEBE_SEKMELERI = [
  {
    key: 'alisFaturasi',
    label: 'Alış Faturası',
    firmaField: 'firma',
    fields: [
      { key: 'firma', label: 'Tedarikçi / Firma Adı', type: 'firma' },
      { key: 'faturaNo', label: 'Fatura No', type: 'text' },
      { key: 'faturaTarihi', label: 'Fatura Tarihi', type: 'date' },
      { key: 'tutar', label: 'Tutar (TL)', type: 'number' },
      { key: 'kdvOrani', label: 'KDV Oranı', type: 'select', options: ['%1', '%10', '%20'] },
      { key: 'odemeDurumu', label: 'Ödeme Durumu', type: 'select', options: ['Ödendi', 'Açık Hesap - Vadeli'] },
      { key: 'aciklama', label: 'Açıklama / Kalem Detayı', type: 'textarea' },
    ],
    preview: (f) =>
      `🧾 *ALIŞ FATURASI KAYDI*\n🏢 Firma: ${f.firma || '-'}\n📄 Fatura No: ${f.faturaNo || '-'} | 📅 Tarih: ${f.faturaTarihi || '-'}\n💰 Tutar: ${f.tutar || '0'} TL (KDV Dahil)\n📌 Durum: ${f.odemeDurumu || '-'}\n📝 Açıklama: ${f.aciklama || '-'}`,
  },
  {
    key: 'satisFaturasi',
    label: 'Satış Faturası',
    firmaField: 'firma',
    fields: [
      { key: 'firma', label: 'Cari / Müşteri Firma Adı', type: 'firma' },
      { key: 'faturaNo', label: 'Fatura No', type: 'text' },
      { key: 'faturaTarihi', label: 'Fatura Tarihi', type: 'date' },
      { key: 'tutar', label: 'Toplam Tutar (TL)', type: 'number' },
      { key: 'kdvOrani', label: 'KDV Oranı', type: 'select', options: ['%1', '%10', '%20'] },
      { key: 'tahsilatDurumu', label: 'Tahsilat Durumu', type: 'select', options: ['Tahsil Edildi', 'Müşteri Borcuna İşlendi'] },
      { key: 'aciklama', label: 'Hizmet / Ürün Açıklaması', type: 'textarea' },
    ],
    preview: (f) =>
      `🧾 *SATIŞ FATURASI BİLGİSİ*\n🏢 Müşteri/Cari: ${f.firma || '-'}\n📄 Fatura No: ${f.faturaNo || '-'} | 📅 Tarih: ${f.faturaTarihi || '-'}\n💰 Toplam Tutar: ${f.tutar || '0'} TL\n📌 Açıklama: ${f.aciklama || '-'}`,
  },
  {
    key: 'alisMakbuzu',
    label: 'Alış Makbuzu',
    firmaField: 'firma',
    fields: [
      { key: 'firma', label: 'Ödeme Yapılan Firma/Kişi', type: 'firma' },
      { key: 'dekontNo', label: 'İşlem / Dekont No', type: 'text' },
      { key: 'tutar', label: 'Ödenen Tutar (TL)', type: 'number' },
      { key: 'odemeYontemi', label: 'Ödeme Yöntemi', type: 'select', options: ['Nakit', 'Havale-EFT', 'Kredi Kartı'] },
      { key: 'aciklama', label: 'Ödeme Açıklaması', type: 'textarea' },
    ],
    preview: (f) =>
      `💸 *ÖDEME (TEDİYE) MAKBUZU*\n👤 Ödeme Yapılan: ${f.firma || '-'}\n💳 Yöntem: ${f.odemeYontemi || '-'}\n💵 Ödenen Tutar: ${f.tutar || '0'} TL\n📝 Açıklama: ${f.aciklama || '-'}`,
  },
  {
    key: 'satisMakbuzu',
    label: 'Satış Makbuzu',
    firmaField: 'firma',
    fields: [
      { key: 'firma', label: 'Tahsilat Yapılan Cari / Müşteri', type: 'firma' },
      { key: 'tutar', label: 'Alınan Tutar (TL)', type: 'number' },
      { key: 'tahsilatYontemi', label: 'Tahsilat Yöntemi', type: 'select', options: ['Nakit', 'Havale', 'POS'] },
      { key: 'aciklama', label: 'Açıklama', type: 'textarea' },
    ],
    preview: (f) =>
      `📥 *TAHSİLAT MAKBUZU*\n👤 Cari/Müşteri: ${f.firma || '-'}\n💳 Yöntem: ${f.tahsilatYontemi || '-'}\n💵 Tahsil Edilen Tutar: ${f.tutar || '0'} TL\n📝 Açıklama: ${f.aciklama || '-'}`,
  },
];

function normalizeTrPhone(phone) {
  let digits = (phone || '').replace(/[^0-9]/g, '');
  if (digits.startsWith('0')) digits = digits.slice(1);
  if (!digits.startsWith('90')) digits = '90' + digits;
  return digits;
}

// Enter'a basınca DOM sırasındaki bir sonraki "mh-tabbable" alanına odaklanır —
// sayfadaki hemen her giriş kutusunda kullanılıyor.
function handleTabEnter(e) {
  if (e.key !== 'Enter') return;
  if (e.target.tagName === 'TEXTAREA' && !e.ctrlKey && !e.metaKey) return; // textarea'da normal Enter satır atlasın
  e.preventDefault();
  const all = Array.from(document.querySelectorAll('.mh-tabbable'));
  const idx = all.indexOf(e.target);
  if (idx !== -1 && idx < all.length - 1) all[idx + 1].focus();
}

export default function Muhasebe({ onNavigate }) {
  const [anaTab, setAnaTab] = useState('faturaMakbuz'); // faturaMakbuz | toptancilar | personel | faturaDetay
  const [toast, setToast] = useState('');
  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(''), 1800);
  }

  // ================== ORTAK VERİ: Toptancılar + Personel (autocomplete için) ==================
  const [toptancilar, setToptancilar] = useState([]);
  const [personeller, setPersoneller] = useState([]);
  const [ortakVeriLoading, setOrtakVeriLoading] = useState(true);

  async function fetchToptancilar() {
    try {
      const res = await fetch('/api/toptancilar');
      const json = await res.json();
      setToptancilar(json.records || []);
    } catch {
      showToast('Toptancılar yüklenemedi');
    }
  }
  async function fetchPersoneller() {
    try {
      const res = await fetch('/api/personel');
      const json = await res.json();
      setPersoneller(json.records || []);
    } catch {
      showToast('Personel listesi yüklenemedi');
    }
  }
  useEffect(() => {
    Promise.all([fetchToptancilar(), fetchPersoneller()]).finally(() => setOrtakVeriLoading(false));
  }, []);

  // "Firma" alanlarında öneri olarak gösterilecek birleşik liste: aktif toptancılar +
  // aktif personel. Personelin kategorisi her zaman "Personel" olarak sabitlenir.
  const firmaOnerileri = useMemo(() => {
    const t = toptancilar.filter((x) => x.durum !== 'pasif').map((x) => ({ ad: x.firmaAdi, kategori: x.kategori, tip: 'toptanci', kaynak: x }));
    const p = personeller.filter((x) => x.durum === 'aktif').map((x) => ({ ad: x.adSoyad, kategori: 'Personel', tip: 'personel', kaynak: x }));
    return [...t, ...p];
  }, [toptancilar, personeller]);

  return (
    <div className="mh-shell">
      <button className="mh-back" onClick={() => onNavigate('settings')}><ArrowLeft size={16} /> Geri</button>

      <div className="mh-tabs">
        <button className={anaTab === 'faturaMakbuz' ? 'active' : ''} onClick={() => setAnaTab('faturaMakbuz')}>
          <Receipt size={15} /> Fatura/Makbuz
        </button>
        <button className={anaTab === 'toptancilar' ? 'active' : ''} onClick={() => setAnaTab('toptancilar')}>
          <Truck size={15} /> Toptancılar
        </button>
        <button className={anaTab === 'personel' ? 'active' : ''} onClick={() => setAnaTab('personel')}>
          <Users size={15} /> Personel
        </button>
        <button className={anaTab === 'faturaDetay' ? 'active' : ''} onClick={() => setAnaTab('faturaDetay')}>
          <ListPlus size={15} /> Fatura Detaylı Giriş
        </button>
        <button className={anaTab === 'receteler' ? 'active' : ''} onClick={() => setAnaTab('receteler')}>
          <ChefHat size={15} /> Reçeteler
        </button>
      </div>

      <div className="mh-body">
        {anaTab === 'faturaMakbuz' && (
          <FaturaMakbuzSekmesi firmaOnerileri={firmaOnerileri} showToast={showToast} />
        )}
        {anaTab === 'toptancilar' && (
          <ToptancilarSekmesi toptancilar={toptancilar} loading={ortakVeriLoading} onRefresh={fetchToptancilar} showToast={showToast} />
        )}
        {anaTab === 'personel' && (
          <PersonelSekmesi personeller={personeller} loading={ortakVeriLoading} onRefresh={fetchPersoneller} showToast={showToast} />
        )}
        {anaTab === 'faturaDetay' && (
          <FaturaDetaySekmesi showToast={showToast} />
        )}
        {anaTab === 'receteler' && (
          <ReceteSekmesi showToast={showToast} />
        )}
      </div>

      {toast && <div className="mh-toast">{toast}</div>}
    </div>
  );
}

// ================== 1) FATURA / MAKBUZ ==================
function FaturaMakbuzSekmesi({ firmaOnerileri, showToast }) {
  const [tab, setTab] = useState('alisFaturasi');
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [waNumara, setWaNumara] = useState('');
  const [firmaOnerAcik, setFirmaOnerAcik] = useState(false);

  const sekme = MUHASEBE_SEKMELERI.find((s) => s.key === tab);
  const aktifForm = form[tab] || {};
  const onizleme = sekme.preview(aktifForm);

  function updateField(fieldKey, value) {
    setForm((prev) => ({ ...prev, [tab]: { ...(prev[tab] || {}), [fieldKey]: value } }));
  }

  const firmaQuery = (aktifForm[sekme.firmaField] || '').trim().toLocaleLowerCase('tr-TR');
  const firmaFiltreli = useMemo(() => {
    if (!firmaQuery) return [];
    return firmaOnerileri.filter((f) => f.ad.toLocaleLowerCase('tr-TR').includes(firmaQuery)).slice(0, 8);
  }, [firmaOnerileri, firmaQuery]);

  function firmaSec(oneri) {
    updateField(sekme.firmaField, oneri.ad);
    setFirmaOnerAcik(false);
  }

  async function kaydet() {
    setSaving(true);
    try {
      const res = await fetch('/api/muhasebe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tip: tab, ...aktifForm }),
      });
      if (!res.ok) throw new Error('save failed');
      showToast(`${sekme.label} kaydedildi`);
      setForm((prev) => ({ ...prev, [tab]: {} }));
    } catch {
      showToast('Kaydedilemedi — bağlantıyı kontrol et');
    } finally {
      setSaving(false);
    }
  }

  async function kopyalaMetin() {
    try {
      await navigator.clipboard.writeText(onizleme);
      showToast('Metin kopyalandı, WhatsApp\'a yapıştırabilirsiniz');
    } catch {
      showToast('Kopyalanamadı');
    }
  }

  function whatsappAc() {
    const digits = normalizeTrPhone(waNumara);
    if (!digits || digits === '90') {
      showToast('Önce bir telefon numarası gir');
      return;
    }
    const win = window.open(`https://wa.me/${digits}?text=${encodeURIComponent(onizleme)}`, '_blank');
    if (!win) showToast('Tarayıcı pencereyi engelledi — popup iznini kontrol et');
  }

  return (
    <div className="mh-fm">
      <div className="mh-subtabs">
        {MUHASEBE_SEKMELERI.map((s) => (
          <button key={s.key} className={tab === s.key ? 'active' : ''} onClick={() => setTab(s.key)}>
            {s.label}
          </button>
        ))}
      </div>

      <div className="mh-fm-cols">
        <div className="mh-fm-col-left">
          {sekme.fields.map((f) => (
            <div key={f.key} className="mh-field">
              <label>{f.label}</label>
              {f.type === 'select' ? (
                <select className="mh-tabbable" value={aktifForm[f.key] || ''} onChange={(e) => updateField(f.key, e.target.value)} onKeyDown={handleTabEnter}>
                  <option value="">Seç...</option>
                  {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              ) : f.type === 'textarea' ? (
                <textarea className="mh-tabbable" rows={2} value={aktifForm[f.key] || ''} onChange={(e) => updateField(f.key, e.target.value)} onKeyDown={handleTabEnter} />
              ) : f.type === 'firma' ? (
                <div className="mh-firma-autocomplete">
                  <input
                    className="mh-tabbable"
                    type="text"
                    value={aktifForm[f.key] || ''}
                    onChange={(e) => { updateField(f.key, e.target.value); setFirmaOnerAcik(true); }}
                    onFocus={() => setFirmaOnerAcik(true)}
                    onBlur={() => setTimeout(() => setFirmaOnerAcik(false), 150)}
                    onKeyDown={handleTabEnter}
                    placeholder="Yazmaya başla, kayıtlı toptancı/personel listesinden seç"
                  />
                  {firmaOnerAcik && firmaFiltreli.length > 0 && (
                    <div className="mh-firma-dropdown">
                      {firmaFiltreli.map((o, i) => (
                        <button key={i} onMouseDown={() => firmaSec(o)}>
                          <span className="ad">{o.ad}</span>
                          <span className="kat">{o.kategori || '-'}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <input className="mh-tabbable" type={f.type} value={aktifForm[f.key] || ''} onChange={(e) => updateField(f.key, e.target.value)} onKeyDown={handleTabEnter} />
              )}
            </div>
          ))}
          <button className="mh-primary-btn" disabled={saving} onClick={kaydet}>
            {saving ? 'Kaydediliyor...' : 'Kaydet'}
          </button>
        </div>

        <div className="mh-fm-col-right">
          <span className="mh-subhead">Önizleme</span>
          <pre className="mh-onizleme">{onizleme}</pre>
          <button className="mh-secondary-btn" onClick={kopyalaMetin}><Copy size={13} /> Metni Kopyala</button>
          <div className="mh-wa-row">
            <input className="mh-tabbable" type="tel" placeholder="0532 123 45 67 (opsiyonel)" value={waNumara} onChange={(e) => setWaNumara(e.target.value)} onKeyDown={handleTabEnter} />
            <button className="mh-wa-btn" onClick={whatsappAc}><MessageCircle size={13} /> WhatsApp'ta Aç</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ================== 2) TOPTANCILAR ==================
function ToptancilarSekmesi({ toptancilar, loading, onRefresh, showToast }) {
  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState({ firmaAdi: '', kategori: '', telefon: '', yetkiliKisi: '', adres: '', not: '' });
  const [saving, setSaving] = useState(false);

  const filtreli = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('tr-TR');
    if (!q) return toptancilar;
    return toptancilar.filter((t) => t.firmaAdi.toLocaleLowerCase('tr-TR').includes(q) || (t.kategori || '').toLocaleLowerCase('tr-TR').includes(q));
  }, [toptancilar, search]);

  function updateForm(k, v) { setForm((prev) => ({ ...prev, [k]: v })); }

  async function kaydet() {
    if (!form.firmaAdi.trim()) { showToast('Firma adı gerekli'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/toptancilar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error();
      showToast('Toptancı eklendi');
      setForm({ firmaAdi: '', kategori: '', telefon: '', yetkiliKisi: '', adres: '', not: '' });
      setFormOpen(false);
      onRefresh();
    } catch {
      showToast('Kaydedilemedi');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mh-toptanci">
      <div className="mh-toptanci-head">
        <div className="mh-search-box">
          <Search size={14} />
          <input placeholder="Toptancı ara..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <button className="mh-primary-btn small" onClick={() => setFormOpen((v) => !v)}>
          <Plus size={14} /> Yeni Toptancı
        </button>
      </div>

      {formOpen && (
        <div className="mh-toptanci-form">
          <div className="mh-field">
            <label>Firma Adı</label>
            <input className="mh-tabbable" autoFocus value={form.firmaAdi} onChange={(e) => updateForm('firmaAdi', e.target.value)} onKeyDown={handleTabEnter} />
          </div>
          <div className="mh-field">
            <label>Kategori</label>
            <select className="mh-tabbable" value={form.kategori} onChange={(e) => updateForm('kategori', e.target.value)} onKeyDown={handleTabEnter}>
              <option value="">Seç...</option>
              {TOPTANCI_KATEGORILERI.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
          </div>
          <div className="mh-field">
            <label>Telefon</label>
            <input className="mh-tabbable" value={form.telefon} onChange={(e) => updateForm('telefon', e.target.value)} onKeyDown={handleTabEnter} />
          </div>
          <div className="mh-field">
            <label>Yetkili Kişi</label>
            <input className="mh-tabbable" value={form.yetkiliKisi} onChange={(e) => updateForm('yetkiliKisi', e.target.value)} onKeyDown={handleTabEnter} />
          </div>
          <div className="mh-field">
            <label>Adres</label>
            <input className="mh-tabbable" value={form.adres} onChange={(e) => updateForm('adres', e.target.value)} onKeyDown={handleTabEnter} />
          </div>
          <div className="mh-field">
            <label>Not</label>
            <textarea className="mh-tabbable" rows={2} value={form.not} onChange={(e) => updateForm('not', e.target.value)} onKeyDown={handleTabEnter} />
          </div>
          <button className="mh-primary-btn" disabled={saving} onClick={kaydet}>{saving ? 'Kaydediliyor...' : 'Kaydet'}</button>
        </div>
      )}

      {loading ? (
        <p className="mh-empty">Yükleniyor...</p>
      ) : (
        <div className="mh-toptanci-list">
          {filtreli.length === 0 && <p className="mh-empty">Kayıtlı toptancı yok</p>}
          {filtreli.map((t) => (
            <div key={t.id} className="mh-toptanci-row">
              <div className="mh-toptanci-info">
                <span className="ad">{t.firmaAdi}</span>
                <span className="kat">{t.kategori || '-'}</span>
                {t.telefon && <span className="tel">{t.telefon}</span>}
              </div>
              <div className="mh-toptanci-bakiye">
                <span className={t.bakiye > 0 ? 'borc' : t.bakiye < 0 ? 'alacak' : 'sifir'}>
                  {t.bakiye > 0 ? `Borcumuz: ${TL(t.bakiye)}` : t.bakiye < 0 ? `Alacağımız: ${TL(-t.bakiye)}` : 'Bakiye: 0'}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ================== 3) PERSONEL (şifre korumalı) ==================
function PersonelSekmesi({ personeller, loading, onRefresh, showToast }) {
  const [unlocked, setUnlocked] = useState(false);
  const [pinValue, setPinValue] = useState('');
  const [pinError, setPinError] = useState(false);

  function checkPin(digits) {
    if (digits === PERSONEL_PIN) {
      setUnlocked(true);
    } else {
      setPinError(true);
      setTimeout(() => { setPinValue(''); setPinError(false); }, 550);
    }
  }
  function pressPinDigit(d) {
    setPinValue((prev) => {
      if (prev.length >= 4) return prev;
      const next = prev + d;
      if (next.length === 4) setTimeout(() => checkPin(next), 100);
      return next;
    });
  }

  if (!unlocked) {
    return (
      <div className="mh-pin-gate">
        <div className={`mh-pin-box ${pinError ? 'shake' : ''}`}>
          <Lock size={20} />
          <h3>Personel Bilgileri Korumalı</h3>
          <div className="mh-pin-dots">
            {[0, 1, 2, 3].map((i) => <span key={i} className={`dot ${pinValue.length > i ? 'filled' : ''}`} />)}
          </div>
          {pinError && <p className="mh-pin-error">Yanlış PIN</p>}
          <div className="mh-pin-keypad">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((n) => (
              <button key={n} onClick={() => pressPinDigit(n)}>{n}</button>
            ))}
            <div />
            <button onClick={() => pressPinDigit('0')}>0</button>
            <button onClick={() => setPinValue((p) => p.slice(0, -1))}><Delete size={16} /></button>
          </div>
        </div>
      </div>
    );
  }

  return <PersonelIcerik personeller={personeller} loading={loading} onRefresh={onRefresh} showToast={showToast} />;
}

function PersonelIcerik({ personeller, loading, onRefresh, showToast }) {
  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState({ adSoyad: '', iseBaslamaTarihi: '', maas: '', sigortali: false, cepNo: '', not: '' });
  const [saving, setSaving] = useState(false);
  const [detayFor, setDetayFor] = useState(null); // personel objesi
  const [odemeler, setOdemeler] = useState([]);
  const [odemeForm, setOdemeForm] = useState({ tarih: '', tutar: '', tur: 'Avans', aciklama: '' });
  const [odemeSaving, setOdemeSaving] = useState(false);

  const filtreli = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('tr-TR');
    if (!q) return personeller;
    return personeller.filter((p) => p.adSoyad.toLocaleLowerCase('tr-TR').includes(q));
  }, [personeller, search]);

  function updateForm(k, v) { setForm((prev) => ({ ...prev, [k]: v })); }

  async function kaydet() {
    if (!form.adSoyad.trim()) { showToast('Ad Soyad gerekli'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/personel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error();
      showToast('Personel eklendi');
      setForm({ adSoyad: '', iseBaslamaTarihi: '', maas: '', sigortali: false, cepNo: '', not: '' });
      setFormOpen(false);
      onRefresh();
    } catch {
      showToast('Kaydedilemedi');
    } finally {
      setSaving(false);
    }
  }

  async function istenAyrildi(p) {
    try {
      const res = await fetch('/api/personel', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: p.id, durum: 'ayrildi', istenAyrilmaTarihi: new Date().toLocaleDateString('tr-TR') }),
      });
      if (!res.ok) throw new Error();
      showToast(`${p.adSoyad} işten ayrıldı olarak işaretlendi`);
      onRefresh();
    } catch {
      showToast('Güncellenemedi');
    }
  }

  async function openDetay(p) {
    setDetayFor(p);
    setOdemeForm({ tarih: new Date().toLocaleDateString('tr-TR'), tutar: '', tur: 'Avans', aciklama: '' });
    try {
      const res = await fetch(`/api/personel?resource=odemeler`);
      const json = await res.json();
      setOdemeler((json.records || []).filter((o) => o.personelId === p.id));
    } catch {
      showToast('Ödeme geçmişi yüklenemedi');
    }
  }

  async function odemeKaydet() {
    if (!odemeForm.tutar) { showToast('Tutar gerekli'); return; }
    setOdemeSaving(true);
    try {
      const res = await fetch('/api/personel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resource: 'odeme', personelId: detayFor.id, personelAdi: detayFor.adSoyad, ...odemeForm }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error();
      setOdemeler((prev) => [json.record, ...prev]);
      setOdemeForm({ tarih: new Date().toLocaleDateString('tr-TR'), tutar: '', tur: 'Avans', aciklama: '' });
      showToast('Ödeme kaydedildi');
    } catch {
      showToast('Kaydedilemedi');
    } finally {
      setOdemeSaving(false);
    }
  }

  return (
    <div className="mh-personel">
      <div className="mh-toptanci-head">
        <div className="mh-search-box">
          <Search size={14} />
          <input placeholder="Personel ara..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <button className="mh-primary-btn small" onClick={() => setFormOpen((v) => !v)}>
          <Plus size={14} /> Yeni Eleman
        </button>
      </div>

      {formOpen && (
        <div className="mh-toptanci-form">
          <div className="mh-field">
            <label>Ad Soyad</label>
            <input className="mh-tabbable" autoFocus value={form.adSoyad} onChange={(e) => updateForm('adSoyad', e.target.value)} onKeyDown={handleTabEnter} />
          </div>
          <div className="mh-field">
            <label>İşe Başlama Tarihi</label>
            <input className="mh-tabbable" type="date" value={form.iseBaslamaTarihi} onChange={(e) => updateForm('iseBaslamaTarihi', e.target.value)} onKeyDown={handleTabEnter} />
          </div>
          <div className="mh-field">
            <label>Maaş (TL)</label>
            <input className="mh-tabbable" type="number" value={form.maas} onChange={(e) => updateForm('maas', e.target.value)} onKeyDown={handleTabEnter} />
          </div>
          <div className="mh-field mh-field-checkbox">
            <label><input type="checkbox" checked={form.sigortali} onChange={(e) => updateForm('sigortali', e.target.checked)} /> Sigortalı</label>
          </div>
          <div className="mh-field">
            <label>Cep No</label>
            <input className="mh-tabbable" value={form.cepNo} onChange={(e) => updateForm('cepNo', e.target.value)} onKeyDown={handleTabEnter} />
          </div>
          <div className="mh-field">
            <label>Not</label>
            <textarea className="mh-tabbable" rows={2} value={form.not} onChange={(e) => updateForm('not', e.target.value)} onKeyDown={handleTabEnter} />
          </div>
          <button className="mh-primary-btn" disabled={saving} onClick={kaydet}>{saving ? 'Kaydediliyor...' : 'Kaydet'}</button>
        </div>
      )}

      {loading ? (
        <p className="mh-empty">Yükleniyor...</p>
      ) : (
        <div className="mh-personel-list">
          {filtreli.length === 0 && <p className="mh-empty">Kayıtlı personel yok</p>}
          {filtreli.map((p) => (
            <div key={p.id} className={`mh-personel-row ${p.durum === 'ayrildi' ? 'ayrildi' : ''}`}>
              <div className="mh-personel-info" onClick={() => openDetay(p)}>
                <span className="ad">{p.adSoyad}</span>
                <span className="detay">
                  İşe giriş: {p.iseBaslamaTarihi || '-'} · Maaş: {TL(p.maas)} · {p.sigortali ? 'Sigortalı' : 'Sigortasız'}
                  {p.durum === 'ayrildi' && ` · Ayrıldı: ${p.istenAyrilmaTarihi}`}
                </span>
              </div>
              {p.durum !== 'ayrildi' && (
                <button className="mh-ayrildi-btn" onClick={() => istenAyrildi(p)}>İşten Ayrıldı</button>
              )}
            </div>
          ))}
        </div>
      )}

      {detayFor && (
        <div className="mh-modal-overlay" onClick={() => setDetayFor(null)}>
          <div className="mh-modal mh-personel-detay" onClick={(e) => e.stopPropagation()}>
            <div className="mh-modal-head">
              <h3>{detayFor.adSoyad} — Ödeme Dökümü</h3>
              <button onClick={() => setDetayFor(null)}><X size={18} /></button>
            </div>

            <div className="mh-odeme-form">
              <input className="mh-tabbable" type="date" value={odemeForm.tarih} onChange={(e) => setOdemeForm((p) => ({ ...p, tarih: e.target.value }))} onKeyDown={handleTabEnter} />
              <input className="mh-tabbable" type="number" placeholder="Tutar" value={odemeForm.tutar} onChange={(e) => setOdemeForm((p) => ({ ...p, tutar: e.target.value }))} onKeyDown={handleTabEnter} />
              <select className="mh-tabbable" value={odemeForm.tur} onChange={(e) => setOdemeForm((p) => ({ ...p, tur: e.target.value }))} onKeyDown={handleTabEnter}>
                <option value="Avans">Avans</option>
                <option value="Maaş">Maaş</option>
                <option value="Diğer">Diğer</option>
              </select>
              <input className="mh-tabbable" placeholder="Açıklama" value={odemeForm.aciklama} onChange={(e) => setOdemeForm((p) => ({ ...p, aciklama: e.target.value }))} onKeyDown={handleTabEnter} />
              <button className="mh-primary-btn small" disabled={odemeSaving} onClick={odemeKaydet}>{odemeSaving ? '...' : 'Ekle'}</button>
            </div>

            <div className="mh-odeme-list">
              {odemeler.length === 0 && <p className="mh-empty">Henüz ödeme yok</p>}
              {odemeler.map((o) => (
                <div key={o.id} className="mh-odeme-row">
                  <span className="tarih">{o.tarih}</span>
                  <span className="tur">{o.tur}</span>
                  <span className="tutar">{TL(o.tutar)}</span>
                  <span className="aciklama">{o.aciklama}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ================== 4) FATURA DETAYLI GİRİŞ ==================
function FaturaDetaySekmesi({ showToast }) {
  const [alisFaturalari, setAlisFaturalari] = useState([]);
  const [loading, setLoading] = useState(true);
  const [seciliFatura, setSeciliFatura] = useState(null);
  const [kalemler, setKalemler] = useState([]);
  const [kalemForm, setKalemForm] = useState({ urunAdi: '', adet: '', birimFiyat: '', kdvOrani: '%20', iskontoOrani: '' });
  const [saving, setSaving] = useState(false);

  // ---- Malzeme Havuzu — Reçete/Maliyet sistemi burada da kullanılıyor: ürün adı artık
  // serbest yazılabilir (mevcut davranış korunuyor) AMA aynı zamanda Malzeme Havuzu'ndan
  // bir malzemeye eşlenebiliyor — eşlenirse fiyat otomatik Malzeme Maliyet Geçmişi'ne
  // de kaydolur, reçetelerde kullanılabilir hale gelir.
  const [malzemeler, setMalzemeler] = useState([]);
  const [seciliMalzeme, setSeciliMalzeme] = useState(null); // {id, ad, birim} ya da null (eşlenmemiş)
  const [malzemeAramaAcik, setMalzemeAramaAcik] = useState(false);
  const [yeniMalzemeModal, setYeniMalzemeModal] = useState(false);
  const [yeniMalzemeForm, setYeniMalzemeForm] = useState({ ad: '', birim: 'kg' });

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/muhasebe?tip=alisFaturasi');
        const json = await res.json();
        setAlisFaturalari(json.records || []);
      } catch {
        showToast('Alış faturaları yüklenemedi');
      } finally {
        setLoading(false);
      }
    }
    load();
    fetch('/api/recete?resource=malzemeler').then((r) => r.json()).then((j) => setMalzemeler(j.records || [])).catch(() => {});
  }, []);

  async function faturaSec(f) {
    setSeciliFatura(f);
    setKalemForm({ urunAdi: '', adet: '', birimFiyat: '', kdvOrani: '%20', iskontoOrani: '' });
    setSeciliMalzeme(null);
    try {
      const res = await fetch(`/api/muhasebe?resource=detay&faturaId=${f.id}`);
      const json = await res.json();
      setKalemler(json.records || []);
    } catch {
      showToast('Kalemler yüklenemedi');
    }
  }

  function malzemeSec(m) {
    setSeciliMalzeme(m);
    setKalemForm((p) => ({ ...p, urunAdi: m.ad }));
    setMalzemeAramaAcik(false);
  }

  async function yeniMalzemeKaydet() {
    if (!yeniMalzemeForm.ad.trim()) { showToast('Malzeme adı gerekli'); return; }
    try {
      const res = await fetch('/api/recete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resource: 'malzemeler', ...yeniMalzemeForm }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error();
      setMalzemeler((prev) => [...prev, json.record]);
      malzemeSec(json.record);
      setYeniMalzemeModal(false);
      setYeniMalzemeForm({ ad: '', birim: 'kg' });
      showToast('Malzeme oluşturuldu');
    } catch {
      showToast('Malzeme oluşturulamadı');
    }
  }

  async function kalemEkle() {
    if (!kalemForm.urunAdi.trim()) { showToast('Ürün adı gerekli'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/muhasebe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resource: 'detay',
          faturaId: seciliFatura.id,
          firma: seciliFatura.firma,
          faturaNo: seciliFatura.faturaNo,
          ...kalemForm,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error();
      setKalemler((prev) => [...prev, json.record]);

      // Malzeme Havuzu'ndan bir malzemeye eşlendiyse, bu alışın fiyatını da Malzeme Maliyet
      // Geçmişi'ne kaydet — reçete maliyeti hesabı bundan besleniyor. Eşlenmemişse (serbest
      // yazılmış ürün adıysa) bu adım atlanır, sadece fatura kaydı olarak kalır.
      if (seciliMalzeme) {
        fetch('/api/recete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            resource: 'maliyetGecmisi',
            malzemeId: seciliMalzeme.id,
            malzemeAdi: seciliMalzeme.ad,
            miktar: kalemForm.adet,
            birim: seciliMalzeme.birim,
            toplamFiyat: (Number(kalemForm.adet) || 0) * (Number(kalemForm.birimFiyat) || 0),
            faturaId: seciliFatura.id,
          }),
        }).catch(() => {});
      }

      setKalemForm({ urunAdi: '', adet: '', birimFiyat: '', kdvOrani: kalemForm.kdvOrani, iskontoOrani: '' });
      setSeciliMalzeme(null);
      showToast('Kalem eklendi');
    } catch {
      showToast('Eklenemedi');
    } finally {
      setSaving(false);
    }
  }

  const kalemToplam = kalemler.reduce((s, k) => s + (k.satirTutari || 0), 0);
  const kdvToplam = kalemler.reduce((s, k) => s + (k.kdvTutari || 0), 0);
  const genelToplam = kalemToplam + kdvToplam;

  return (
    <div className="mh-detay">
      <div className="mh-detay-cols">
        <div className="mh-detay-col-left">
          <span className="mh-subhead">Alış Faturaları</span>
          {loading ? (
            <p className="mh-empty">Yükleniyor...</p>
          ) : (
            <div className="mh-detay-fatura-list">
              {alisFaturalari.length === 0 && <p className="mh-empty">Kayıtlı alış faturası yok — önce Fatura/Makbuz sekmesinden ekleyin</p>}
              {alisFaturalari.map((f) => (
                <button
                  key={f.id}
                  className={`mh-detay-fatura-item ${seciliFatura?.id === f.id ? 'active' : ''}`}
                  onClick={() => faturaSec(f)}
                >
                  <span className="firma">{f.firma}</span>
                  <span className="no">No: {f.faturaNo || '-'} · {f.faturaTarihi || f.tarih}</span>
                  <span className="tutar">{TL(Number(f.tutar) || 0)}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="mh-detay-col-right">
          {!seciliFatura ? (
            <p className="mh-empty">Soldan bir alış faturası seç, kalemlerini gir</p>
          ) : (
            <>
              <span className="mh-subhead">{seciliFatura.firma} — {seciliFatura.faturaNo || 'No yok'}</span>

              <div className="mh-kalem-form">
                <div className="mh-malzeme-secici">
                  <input
                    className="mh-tabbable"
                    placeholder="Ürün Adı (Malzeme Havuzu'ndan seç veya yeni yaz)"
                    value={kalemForm.urunAdi}
                    onChange={(e) => { setKalemForm((p) => ({ ...p, urunAdi: e.target.value })); setSeciliMalzeme(null); setMalzemeAramaAcik(true); }}
                    onFocus={() => setMalzemeAramaAcik(true)}
                    onBlur={() => setTimeout(() => setMalzemeAramaAcik(false), 150)}
                    onKeyDown={handleTabEnter}
                    lang="tr" autoCorrect="off" autoCapitalize="off" spellCheck="false"
                  />
                  {seciliMalzeme && <span className="mh-malzeme-badge">✓ {seciliMalzeme.birim}</span>}
                  {malzemeAramaAcik && (
                    <div className="mh-malzeme-dropdown">
                      {malzemeler
                        .filter((m) => !kalemForm.urunAdi.trim() || m.ad.toLocaleLowerCase('tr').includes(kalemForm.urunAdi.toLocaleLowerCase('tr')))
                        .slice(0, 8)
                        .map((m) => (
                          <button key={m.id} onMouseDown={() => malzemeSec(m)}>{m.ad} <span>({m.birim})</span></button>
                        ))}
                      <button className="mh-malzeme-yeni-btn" onMouseDown={() => { setYeniMalzemeForm({ ad: kalemForm.urunAdi, birim: 'kg' }); setYeniMalzemeModal(true); setMalzemeAramaAcik(false); }}>
                        <Plus size={12} /> Yeni Malzeme Oluştur
                      </button>
                    </div>
                  )}
                </div>
                <input className="mh-tabbable" type="number" placeholder="Adet" value={kalemForm.adet} onChange={(e) => setKalemForm((p) => ({ ...p, adet: e.target.value }))} onKeyDown={handleTabEnter} />
                <input className="mh-tabbable" type="number" placeholder="Birim Fiyat" value={kalemForm.birimFiyat} onChange={(e) => setKalemForm((p) => ({ ...p, birimFiyat: e.target.value }))} onKeyDown={handleTabEnter} />
                <select className="mh-tabbable" value={kalemForm.kdvOrani} onChange={(e) => setKalemForm((p) => ({ ...p, kdvOrani: e.target.value }))} onKeyDown={handleTabEnter}>
                  <option value="%1">%1</option>
                  <option value="%10">%10</option>
                  <option value="%20">%20</option>
                </select>
                <input className="mh-tabbable" type="number" placeholder="İskonto %" value={kalemForm.iskontoOrani} onChange={(e) => setKalemForm((p) => ({ ...p, iskontoOrani: e.target.value }))} onKeyDown={handleTabEnter} />
                <button className="mh-primary-btn small" disabled={saving} onClick={kalemEkle}><Plus size={13} /> Ekle</button>
              </div>

              {yeniMalzemeModal && (
                <div className="mh-malzeme-modal-overlay" onClick={() => setYeniMalzemeModal(false)}>
                  <div className="mh-malzeme-modal" onClick={(e) => e.stopPropagation()}>
                    <span className="mh-subhead">Yeni Malzeme Oluştur</span>
                    <label>Malzeme Adı</label>
                    <input className="mh-tabbable" autoFocus value={yeniMalzemeForm.ad} onChange={(e) => setYeniMalzemeForm((p) => ({ ...p, ad: e.target.value }))} lang="tr" autoCorrect="off" autoCapitalize="off" spellCheck="false" />
                    <label>Birim</label>
                    <select className="mh-tabbable" value={yeniMalzemeForm.birim} onChange={(e) => setYeniMalzemeForm((p) => ({ ...p, birim: e.target.value }))}>
                      <option value="gr">gr</option>
                      <option value="kg">kg</option>
                      <option value="ml">ml</option>
                      <option value="litre">litre</option>
                      <option value="adet">adet</option>
                      <option value="porsiyon">porsiyon</option>
                    </select>
                    <div className="mh-malzeme-modal-btns">
                      <button onClick={() => setYeniMalzemeModal(false)}>İptal</button>
                      <button className="mh-primary-btn small" onClick={yeniMalzemeKaydet}>Kaydet</button>
                    </div>
                  </div>
                </div>
              )}

              <div className="mh-kalem-list">
                <div className="mh-kalem-head">
                  <span>Ürün</span><span>Adet</span><span>Birim F.</span><span>KDV</span><span>İsk.</span><span>KDV Tutarı</span><span>Tutar</span>
                </div>
                {kalemler.length === 0 && <p className="mh-empty">Henüz kalem girilmedi</p>}
                {kalemler.map((k) => (
                  <div key={k.id} className="mh-kalem-row">
                    <span>{k.urunAdi}</span>
                    <span>{k.adet}</span>
                    <span>{TL(k.birimFiyat)}</span>
                    <span>{k.kdvOrani}</span>
                    <span>{k.iskontoOrani || '-'}</span>
                    <span>{TL(k.kdvTutari)}</span>
                    <span>{TL(k.satirTutari)}</span>
                  </div>
                ))}
              </div>
              <div className="mh-kalem-toplam">
                <span>KDV Toplamı</span>
                <strong>{TL(kdvToplam)}</strong>
              </div>
              <div className="mh-kalem-toplam">
                <span>Kalemler Toplamı (KDV Hariç)</span>
                <strong>{TL(kalemToplam)}</strong>
              </div>
              <div className="mh-kalem-toplam">
                <span>Genel Toplam (KDV Dahil)</span>
                <strong>{TL(genelToplam)}</strong>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ================== REÇETELER ==================
// Ürün listesi Supabase'ten (products) geliyor — mevcut ürün havuzu, elle yazılmıyor.
// Maliyet/reçete hesabı Sheets'ten (api/recete.js) geliyor. Satış anındaki maliyet snapshot'ı
// (sold_items.unit_cost_at_sale/total_cost_at_sale) Supabase'de — bu ekran onu göstermiyor,
// sadece GÜNCEL maliyeti gösterip yeni reçete tanımlamaya yarıyor.
function ReceteSekmesi({ showToast }) {
  const [urunler, setUrunler] = useState([]);
  const [loading, setLoading] = useState(true);
  const [aramaMetni, setAramaMetni] = useState('');
  const [seciliUrun, setSeciliUrun] = useState(null);
  const [receteHesap, setReceteHesap] = useState(null);
  const [receteYukleniyor, setReceteYukleniyor] = useState(false);

  const [malzemeler, setMalzemeler] = useState([]);
  const [kalemler, setKalemler] = useState([]);
  const [malzemeEkleAcik, setMalzemeEkleAcik] = useState(false);
  const [malzemeAramaMetni, setMalzemeAramaMetni] = useState('');
  const [yeniMalzemeModal, setYeniMalzemeModal] = useState(false);
  const [yeniMalzemeForm, setYeniMalzemeForm] = useState({ ad: '', birim: 'kg' });
  const [kaydediliyor, setKaydediliyor] = useState(false);

  useEffect(() => {
    async function load() {
      const { data } = await supabase.from('products').select('id, ad, kategori, alt_kategori, fiyat').eq('durum', 'AKTIF').order('ad');
      setUrunler(data || []);
      setLoading(false);
    }
    load();
    fetch('/api/recete?resource=malzemeler').then((r) => r.json()).then((j) => setMalzemeler(j.records || [])).catch(() => {});
  }, []);

  const filtreliUrunler = useMemo(() => {
    const q = aramaMetni.toLocaleLowerCase('tr').trim();
    if (!q) return urunler;
    return urunler.filter((u) => u.ad.toLocaleLowerCase('tr').includes(q));
  }, [urunler, aramaMetni]);

  async function urunSec(u) {
    setSeciliUrun(u);
    setReceteHesap(null);
    setReceteYukleniyor(true);
    try {
      const res = await fetch(`/api/recete?resource=recete&urunId=${u.id}`);
      const json = await res.json();
      setReceteHesap(json);
      setKalemler((json.kalemler || []).map((k) => ({ malzemeId: k.malzemeId, malzemeAdi: k.malzemeAdi, miktar: k.miktar, birim: k.birim })));
    } catch {
      showToast('Reçete yüklenemedi');
    } finally {
      setReceteYukleniyor(false);
    }
  }

  function kalemMiktarGuncelle(idx, miktar) {
    setKalemler((prev) => prev.map((k, i) => (i === idx ? { ...k, miktar } : k)));
  }
  function kalemSil(idx) {
    setKalemler((prev) => prev.filter((_, i) => i !== idx));
  }
  function malzemeKalemeEkle(m) {
    if (kalemler.some((k) => k.malzemeId === m.id)) { showToast('Bu malzeme zaten reçetede'); return; }
    setKalemler((prev) => [...prev, { malzemeId: m.id, malzemeAdi: m.ad, miktar: '', birim: m.birim }]);
    setMalzemeEkleAcik(false);
    setMalzemeAramaMetni('');
  }

  async function yeniMalzemeKaydet() {
    if (!yeniMalzemeForm.ad.trim()) { showToast('Malzeme adı gerekli'); return; }
    try {
      const res = await fetch('/api/recete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resource: 'malzemeler', ...yeniMalzemeForm }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error();
      setMalzemeler((prev) => [...prev, json.record]);
      malzemeKalemeEkle(json.record);
      setYeniMalzemeModal(false);
      setYeniMalzemeForm({ ad: '', birim: 'kg' });
      showToast('Malzeme oluşturuldu');
    } catch {
      showToast('Malzeme oluşturulamadı');
    }
  }

  async function receteKaydet() {
    if (!seciliUrun) return;
    const gecerliKalemler = kalemler.filter((k) => k.malzemeId && Number(k.miktar) > 0);
    if (gecerliKalemler.length === 0) { showToast('En az bir malzeme + miktar girin'); return; }
    setKaydediliyor(true);
    try {
      const res = await fetch('/api/recete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resource: 'recete', urunId: seciliUrun.id, urunAdi: seciliUrun.ad, kalemler: gecerliKalemler }),
      });
      if (!res.ok) throw new Error();
      showToast('Reçete kaydedildi');
      urunSec(seciliUrun);
    } catch {
      showToast('Reçete kaydedilemedi');
    } finally {
      setKaydediliyor(false);
    }
  }

  const guncelMaliyet = receteHesap && !receteHesap.receteYok ? receteHesap.maliyet : null;
  const satisFiyati = seciliUrun ? Number(seciliUrun.fiyat) || 0 : 0;
  const brutKar = guncelMaliyet !== null ? satisFiyati - guncelMaliyet : null;
  const maliyetOrani = guncelMaliyet !== null && satisFiyati > 0 ? (guncelMaliyet / satisFiyati) * 100 : null;

  function durumRozeti(hesap) {
    if (!hesap) return null;
    if (hesap.receteYok) return <span className="rc-rozet rc-rozet-yok" title="Reçete Tanımlanmamış">⚠️</span>;
    if (hesap.eksikMalzemeler && hesap.eksikMalzemeler.length > 0) return <span className="rc-rozet rc-rozet-eksik" title="Maliyet Verisi Eksik">🔴</span>;
    return <span className="rc-rozet rc-rozet-tam" title="Maliyeti Güncel ve Eksiksiz">🟢</span>;
  }

  return (
    <div className="rc-shell">
      <div className="rc-col-left">
        <div className="rc-search">
          <Search size={14} />
          <input placeholder="Ürün ara..." value={aramaMetni} onChange={(e) => setAramaMetni(e.target.value)} lang="tr" autoCorrect="off" autoCapitalize="off" spellCheck="false" />
        </div>
        {loading && <p className="mh-empty">Yükleniyor...</p>}
        <div className="rc-urun-list">
          {filtreliUrunler.map((u) => (
            <button key={u.id} className={`rc-urun-row ${seciliUrun?.id === u.id ? 'active' : ''}`} onClick={() => urunSec(u)}>
              <span className="rc-urun-ad">{u.ad}</span>
              <span className="rc-urun-fiyat">{TL(Number(u.fiyat) || 0)}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="rc-col-right">
        {!seciliUrun ? (
          <p className="mh-empty">Soldan bir ürün seç, reçetesini düzenle</p>
        ) : receteYukleniyor ? (
          <p className="mh-empty">Yükleniyor...</p>
        ) : (
          <>
            <div className="rc-urun-head">
              <h3>{seciliUrun.ad} {durumRozeti(receteHesap)}</h3>
              <div className="rc-metrikler">
                <div><span>Satış Fiyatı</span><strong>{TL(satisFiyati)}</strong></div>
                <div><span>Güncel Maliyet</span><strong>{guncelMaliyet !== null ? TL(guncelMaliyet) : '⚠️ Hesaplanamıyor'}</strong></div>
                <div><span>Brüt Kâr</span><strong>{brutKar !== null ? TL(brutKar) : '—'}</strong></div>
                <div><span>Maliyet Oranı</span><strong>{maliyetOrani !== null ? `%${maliyetOrani.toFixed(1)}` : '—'}</strong></div>
              </div>
              {receteHesap?.eksikMalzemeler?.length > 0 && (
                <p className="rc-uyari">⚠️ Maliyet bilgisi bulunamadı: {receteHesap.eksikMalzemeler.join(', ')}</p>
              )}
            </div>

            <div className="rc-kalem-list">
              <div className="rc-kalem-head"><span>Malzeme</span><span>Miktar</span><span>Birim</span><span></span></div>
              {kalemler.length === 0 && <p className="mh-empty">Henüz malzeme eklenmedi</p>}
              {kalemler.map((k, idx) => (
                <div key={idx} className="rc-kalem-row">
                  <span>{k.malzemeAdi}</span>
                  <input type="number" value={k.miktar} onChange={(e) => kalemMiktarGuncelle(idx, e.target.value)} />
                  <span>{k.birim}</span>
                  <button onClick={() => kalemSil(idx)}><Trash2 size={13} /></button>
                </div>
              ))}
            </div>

            <div className="rc-malzeme-ekle-wrap">
              <button className="mh-secondary-btn small" onClick={() => setMalzemeEkleAcik((v) => !v)}><Plus size={13} /> Malzeme Ekle</button>
              {malzemeEkleAcik && (
                <div className="mh-malzeme-dropdown rc-malzeme-dropdown">
                  <input placeholder="Malzeme ara..." value={malzemeAramaMetni} onChange={(e) => setMalzemeAramaMetni(e.target.value)} autoFocus lang="tr" autoCorrect="off" autoCapitalize="off" spellCheck="false" />
                  {malzemeler
                    .filter((m) => !malzemeAramaMetni.trim() || m.ad.toLocaleLowerCase('tr').includes(malzemeAramaMetni.toLocaleLowerCase('tr')))
                    .slice(0, 8)
                    .map((m) => (
                      <button key={m.id} onClick={() => malzemeKalemeEkle(m)}>{m.ad} <span>({m.birim})</span></button>
                    ))}
                  <button className="mh-malzeme-yeni-btn" onClick={() => { setYeniMalzemeForm({ ad: malzemeAramaMetni, birim: 'kg' }); setYeniMalzemeModal(true); setMalzemeEkleAcik(false); }}>
                    <Plus size={12} /> Yeni Malzeme Oluştur
                  </button>
                </div>
              )}
            </div>

            <button className="mh-primary-btn" disabled={kaydediliyor} onClick={receteKaydet}>
              <Check size={14} /> Kaydet
            </button>
          </>
        )}
      </div>

      {yeniMalzemeModal && (
        <div className="mh-malzeme-modal-overlay" onClick={() => setYeniMalzemeModal(false)}>
          <div className="mh-malzeme-modal" onClick={(e) => e.stopPropagation()}>
            <span className="mh-subhead">Yeni Malzeme Oluştur</span>
            <label>Malzeme Adı</label>
            <input className="mh-tabbable" autoFocus value={yeniMalzemeForm.ad} onChange={(e) => setYeniMalzemeForm((p) => ({ ...p, ad: e.target.value }))} lang="tr" autoCorrect="off" autoCapitalize="off" spellCheck="false" />
            <label>Birim</label>
            <select className="mh-tabbable" value={yeniMalzemeForm.birim} onChange={(e) => setYeniMalzemeForm((p) => ({ ...p, birim: e.target.value }))}>
              <option value="gr">gr</option>
              <option value="kg">kg</option>
              <option value="ml">ml</option>
              <option value="litre">litre</option>
              <option value="adet">adet</option>
              <option value="porsiyon">porsiyon</option>
            </select>
            <div className="mh-malzeme-modal-btns">
              <button onClick={() => setYeniMalzemeModal(false)}>İptal</button>
              <button className="mh-primary-btn small" onClick={yeniMalzemeKaydet}>Kaydet</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}