import React, { useState, useMemo, useRef } from 'react';
import './Paketci.css';
import BosVarPaketci from '../../components/bosvar/BosVarPaketci';
import '../../components/bosvar/bosvar.css';
import { TL } from '../../hooks/useHipposData';
import {
  Package, Users, Camera, Image as ImageIcon, StickyNote, Check, X,
  ChevronLeft, Wallet, Undo2, Clock, User, AlertTriangle, CupSoda, PackageOpen,
} from 'lucide-react';

const ODEME_YONTEMLERI = ['Nakit', 'Kredi Kartı', 'Yemek Kartı', 'Diğer'];

export default function Paketci({ data }) {
  const {
    packages, orders, tableNotes, tableOpenedAt,
    cariler, getCariBakiye,
    paketTeslimatlari, cariTeslimatBildirimleri,
    uploadTeslimatFoto, submitPaketTeslimat, submitCariTeslimatBildirim,
    deletePaketTeslimat, deleteCariTeslimatBildirim,
    bosvarBildirimleri, submitBosvarBildirim, deleteBosvarBildirim,
    tableBosvars,
    bosvarKayitlari, paketciBosvarAldi, paketciBosvarAlamadi,
  } = data;

  // ---- Paketçi adı (bir kez sorulur, cihazda saklanır) ----
  const [paketciAdi, setPaketciAdi] = useState(() => localStorage.getItem('hippos_paketci_adi') || '');
  const [nameInput, setNameInput] = useState('');
  function saveName() {
    if (!nameInput.trim()) return;
    localStorage.setItem('hippos_paketci_adi', nameInput.trim());
    setPaketciAdi(nameInput.trim());
  }

  const [tab, setTab] = useState('paketler'); // 'paketler' | 'cariler'
  const [selectedPaket, setSelectedPaket] = useState(null); // paket adı (string)
  const [selectedCari, setSelectedCari] = useState(null); // cari id
  const [actionModal, setActionModal] = useState(null); // { hedefTip: 'paket'|'cari', hedefId, tip: 'teslim_edildi'|'tam_odeme'|'kismi_odeme' }
  const [toast, setToast] = useState('');
  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(''), 2000);
  }

  // Bu oturumda paketçinin yaptığı son işlemler (geri al için, en fazla 5)
  const [recentActions, setRecentActions] = useState([]); // [{ id, hedefTip, label, ts }]
  function pushRecent(hedefTip, id, label) {
    setRecentActions((prev) => [{ id, hedefTip, label, ts: Date.now() }, ...prev].slice(0, 5));
  }
  function undoAction(action) {
    if (action.hedefTip === 'paket') deletePaketTeslimat(action.id);
    else deleteCariTeslimatBildirim(action.id);
    setRecentActions((prev) => prev.filter((a) => !(a.id === action.id && a.hedefTip === action.hedefTip)));
    showToast('Geri alındı');
  }

  // ---- Paket listesi: sadece hâlâ "açık" olanlar (onaylanmış teslim edildi kaydı olmayanlar) ----
  const paketListesi = useMemo(() => {
    return (packages || [])
      .map((p) => {
        const hareketler = paketTeslimatlari.filter((h) => h.paketAdi === p.name).sort((a, b) => b.ts - a.ts);
        const sonHareket = hareketler[0] || null;
        const teslimEdildiOnayli = hareketler.some((h) => h.tip === 'teslim_edildi' && h.durum === 'onaylandi');
        const hasIcecek = (orders[p.name] || []).some((i) => i.kategori === 'İÇECEKLER');
        return { ...p, hareketler, sonHareket, teslimEdildiOnayli, hasIcecek };
      })
      .filter((p) => !p.teslimEdildiOnayli)
      .sort((a, b) => a.num - b.num);
  }, [packages, paketTeslimatlari, orders]);

  // Boş Var kayıtları: satıştan bağımsız, ödeme sonrası açılan "kap toplama" kayıtları —
  // paket listesiyle karışık gösteriliyor, sadece açık ('bekliyor') olanlar.
  const bosvarKayitListesi = useMemo(() => {
    return (bosvarKayitlari || []).filter((b) => b.durum === 'bekliyor').sort((a, b) => b.ts - a.ts);
  }, [bosvarKayitlari]);

  const [selectedBosvarId, setSelectedBosvarId] = useState(null);
  const selectedBosvarKaydi = selectedBosvarId
    ? bosvarKayitListesi.find((b) => b.id === selectedBosvarId) || null
    : null;

  function paketTutar(name) {
    const items = orders[name] || [];
    return items.reduce((s, i) => s + (i.note ? 0 : i.fiyat), 0);
  }

  const selectedPaketData = selectedPaket
    ? {
        name: selectedPaket,
        items: orders[selectedPaket] || [],
        not: tableNotes[selectedPaket] || '',
        tutar: paketTutar(selectedPaket),
        acilis: tableOpenedAt[selectedPaket],
        hareketler: paketTeslimatlari.filter((h) => h.paketAdi === selectedPaket).sort((a, b) => b.ts - a.ts),
      }
    : null;

  // ---- Cari listesi ----
  const [cariSearch, setCariSearch] = useState('');
  const cariListesi = useMemo(() => {
    const q = cariSearch.trim().toLowerCase();
    return (cariler || [])
      .filter((c) => c.tip === 'bireysel') // paketçi firma carilerine ulaşamaz
      .filter((c) => getCariBakiye(c.id) > 0) // bakiyesi sıfırlanan/kapanan cari listeden düşer
      .filter((c) => !q || c.ad.toLowerCase().includes(q))
      .sort((a, b) => a.ad.localeCompare(b.ad, 'tr'));
  }, [cariler, cariSearch, getCariBakiye]);

  const selectedCariData = selectedCari
    ? {
        ...cariler.find((c) => c.id === selectedCari),
        bakiye: getCariBakiye(selectedCari),
        hareketler: cariTeslimatBildirimleri.filter((h) => h.cariId === selectedCari).sort((a, b) => b.ts - a.ts),
      }
    : null;

  // ============================================================
  if (!paketciAdi) {
    return (
      <div className="pk-shell pk-name-gate">
        <div className="pk-name-card">
          <h1>Paketçi Paneli</h1>
          <p>Devam etmek için adını gir — teslimat kayıtlarında görünecek.</p>
          <input
            autoFocus
            placeholder="Adın Soyadın"
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && saveName()}
          />
          <button className="pk-primary-btn" onClick={saveName} disabled={!nameInput.trim()}>Devam Et</button>
        </div>
      </div>
    );
  }

  return (
    <div className="pk-shell">
      <header className="pk-header">
        <h1>Paketçi Paneli</h1>
        <span className="pk-me"><User size={13} /> {paketciAdi}</span>
      </header>

      <div className="pk-tabs">
        <button className={tab === 'paketler' ? 'active' : ''} onClick={() => setTab('paketler')}>
          <Package size={16} /> Paketler {(paketListesi.length + bosvarKayitListesi.length) > 0 && <span className="pk-badge">{paketListesi.length + bosvarKayitListesi.length}</span>}
        </button>
        <button className={tab === 'cariler' ? 'active' : ''} onClick={() => setTab('cariler')}>
          <Users size={16} /> Cariler
        </button>
      </div>

      <div className="pk-body">
        {tab === 'paketler' && !selectedPaket && !selectedBosvarKaydi && (
          <div className="pk-list">
            {paketListesi.length === 0 && bosvarKayitListesi.length === 0 && <div className="pk-empty">Şu an açık teslimat yok.</div>}
            {bosvarKayitListesi.map((b) => (
              <button key={`bv-${b.id}`} className="pk-list-item pk-bosvar-item" onClick={() => setSelectedBosvarId(b.id)}>
                <div className="pk-list-item-top">
                  <span className="pk-list-item-name">{b.adresNot}</span>
                  <span className="pk-bosvar-tag"><PackageOpen size={12} /> Boş var</span>
                </div>
                <div className="pk-bosvar-sub"><Check size={12} /> Ödeme alındı — BOŞ VAR!</div>
                {b.paketciNotu && <div className="pk-bosvar-sub"><StickyNote size={12} /> {b.paketciNotu}</div>}
              </button>
            ))}
            {paketListesi.map((p) => {
              const durumEtiketi =
                p.sonHareket?.durum === 'bekliyor' ? { text: 'Onay bekliyor', cls: 'wait' } :
                p.sonHareket?.durum === 'reddedildi' ? { text: 'Reddedildi — tekrar gönder', cls: 'reject' } : null;
              return (
                <button key={p.name} className="pk-list-item" onClick={() => setSelectedPaket(p.name)}>
                  <div className="pk-list-item-top">
                    <span className="pk-list-item-name">{p.name}</span>
                    <span className="pk-list-item-total">{TL(paketTutar(p.name))}</span>
                  </div>
                  {tableNotes[p.name] && <div className="pk-list-item-note"><StickyNote size={11} /> {tableNotes[p.name]}</div>}
                  {p.hasIcecek && <div className="pk-drink-warning"><CupSoda size={13} /> Siparişte İçecek Var!</div>}
                  <BosVarPaketci mod="ikaz" paketAdi={p.name} bosvarTikliler={Object.keys(tableBosvars)} />
                  {durumEtiketi && <div className={`pk-status-tag ${durumEtiketi.cls}`}>{durumEtiketi.text}</div>}
                </button>
              );
            })}
          </div>
        )}

        {tab === 'paketler' && selectedBosvarKaydi && (
          <BosvarKaydiDetay
            kayit={selectedBosvarKaydi}
            onBack={() => setSelectedBosvarId(null)}
            onAldim={() => { paketciBosvarAldi(selectedBosvarKaydi.id); setSelectedBosvarId(null); showToast('Boş var alındı olarak işaretlendi'); }}
            onAlamadim={(not) => { paketciBosvarAlamadi(selectedBosvarKaydi.id, not); setSelectedBosvarId(null); showToast('Not gönderildi'); }}
          />
        )}

        {tab === 'paketler' && selectedPaketData && (
          <PaketDetay
            paket={selectedPaketData}
            onBack={() => setSelectedPaket(null)}
            onAction={(tip) => setActionModal({ hedefTip: 'paket', hedefId: selectedPaketData.name, tip, ustTutar: selectedPaketData.tutar })}
            paketciAdi={paketciAdi}
            bosvarBildirimleri={bosvarBildirimleri}
            submitBosvarBildirim={submitBosvarBildirim}
            deleteBosvarBildirim={deleteBosvarBildirim}
            tableBosvars={tableBosvars}
            showToast={showToast}
          />
        )}

        {tab === 'cariler' && !selectedCari && (
          <div className="pk-list">
            <input
              className="pk-search"
              placeholder="Cari ara..."
              value={cariSearch}
              onChange={(e) => setCariSearch(e.target.value)}
            />
            {cariListesi.length === 0 && <div className="pk-empty">Cari bulunamadı.</div>}
            {cariListesi.map((c) => (
              <button key={c.id} className="pk-list-item" onClick={() => setSelectedCari(c.id)}>
                <div className="pk-list-item-top">
                  <span className="pk-list-item-name">{c.ad}</span>
                  <span className="pk-list-item-total">{TL(getCariBakiye(c.id))}</span>
                </div>
                {c.telefon && <div className="pk-list-item-note">{c.telefon}</div>}
              </button>
            ))}
          </div>
        )}

        {tab === 'cariler' && selectedCariData && (
          <CariDetay
            cari={selectedCariData}
            onBack={() => setSelectedCari(null)}
            onAction={(tip) => setActionModal({ hedefTip: 'cari', hedefId: selectedCariData.id, tip, ustTutar: selectedCariData.bakiye })}
          />
        )}
      </div>

      {recentActions.length > 0 && (
        <div className="pk-recent-bar">
          <span className="pk-recent-label">Son işlemler:</span>
          {recentActions.map((a) => (
            <button key={`${a.hedefTip}-${a.id}`} className="pk-recent-chip" onClick={() => undoAction(a)}>
              <Undo2 size={12} /> {a.label}
            </button>
          ))}
        </div>
      )}

      {toast && <div className="pk-toast">{toast}</div>}

      {actionModal && (
        <ActionModal
          modal={actionModal}
          paketciAdi={paketciAdi}
          uploadTeslimatFoto={uploadTeslimatFoto}
          onClose={() => setActionModal(null)}
          onSubmitted={async (result, label) => {
            if (!result) return;
            pushRecent(actionModal.hedefTip, result.id, label);
            setActionModal(null);
            showToast('Gönderildi — yönetici onayı bekleniyor');
          }}
          submitPaketTeslimat={submitPaketTeslimat}
          submitCariTeslimatBildirim={submitCariTeslimatBildirim}
        />
      )}
    </div>
  );
}

function PaketDetay({ paket, onBack, onAction, paketciAdi, bosvarBildirimleri, submitBosvarBildirim, deleteBosvarBildirim, showToast, tableBosvars }) {
  const hasIcecek = paket.items.some((i) => i.kategori === 'İÇECEKLER');
  return (
    <div className="pk-detail">
      <button className="pk-back-btn" onClick={onBack}><ChevronLeft size={16} /> Listeye dön</button>
      {hasIcecek && (
        <div className="pk-drink-warning-big"><CupSoda size={18} /> Siparişte İçecek Var!</div>
      )}
      <div className="pk-detail-card">
        <h2>{paket.name}</h2>
        {paket.not && <div className="pk-detail-note"><StickyNote size={13} /> {paket.not}</div>}
        <div className="pk-detail-items">
          {paket.items.map((i) => (
            <div key={i.id} className="pk-detail-item">
              <span>{i.note ? `• ${i.ad}` : i.ad}</span>
              {!i.note && <span>{TL(i.fiyat)}</span>}
            </div>
          ))}
        </div>
        <div className="pk-detail-total">
          <span>TOPLAM</span>
          <span>{TL(paket.tutar)}</span>
        </div>
      </div>

      {paket.hareketler.length > 0 && (
        <div className="pk-history">
          <h3>Geçmiş bildirimler</h3>
          {paket.hareketler.map((h) => (
            <div key={h.id} className={`pk-history-item ${h.durum}`}>
              <div className="pk-history-top">
                <span>{h.tip === 'teslim_edildi' ? 'Teslim Edildi' : `Kısmi Ödeme: ${TL(h.tutar)}`}</span>
                <span className={`pk-status-tag ${h.durum === 'bekliyor' ? 'wait' : h.durum === 'reddedildi' ? 'reject' : 'ok'}`}>
                  {h.durum === 'bekliyor' ? 'Onay bekliyor' : h.durum === 'reddedildi' ? 'Reddedildi' : 'Onaylandı'}
                </span>
              </div>
              {h.notMetni && <div className="pk-history-note">{h.notMetni}</div>}
              {h.durum === 'reddedildi' && h.onayNotu && <div className="pk-history-reject"><AlertTriangle size={12} /> {h.onayNotu}</div>}
            </div>
          ))}
        </div>
      )}

      <BosVarPaketci
        mod="detay"
        paketAdi={paket.name}
        paketciAdi={paketciAdi}
        bosvarTikliler={Object.keys(tableBosvars)}
        bosvarBildirimleri={bosvarBildirimleri}
        submitBosvarBildirim={submitBosvarBildirim}
        deleteBosvarBildirim={deleteBosvarBildirim}
        showToast={showToast}
      />

      <div className="pk-action-row">
        <button className="pk-deliver-btn" onClick={() => onAction('teslim_edildi')}>
          <Check size={16} /> Teslim Ettim
        </button>
        <button className="pk-partial-btn" onClick={() => onAction('kismi_odeme')}>
          <Wallet size={16} /> Kısmi Ödeme Aldım
        </button>
      </div>
    </div>
  );
}

function BosvarKaydiDetay({ kayit, onBack, onAldim, onAlamadim }) {
  const [alamadımAcik, setAlamadımAcik] = useState(false);
  const [notMetni, setNotMetni] = useState('');
  const [hata, setHata] = useState('');

  function handleAlamadimGonder() {
    if (!notMetni.trim()) {
      setHata('Sebep ve ne zaman alınacağını yaz');
      return;
    }
    onAlamadim(notMetni.trim());
  }

  return (
    <div className="pk-detail">
      <button className="pk-back-btn" onClick={onBack}><ChevronLeft size={16} /> Listeye dön</button>
      <div className="pk-bosvar-detail-card">
        <div className="pk-bosvar-detail-tag">BOŞ VAR</div>
        <h2>{kayit.adresNot}</h2>
        <div className="pk-bosvar-detail-time">
          <Clock size={12} /> {new Date(kayit.ts).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}'de eklendi
        </div>
        {kayit.paketciNotu && <div className="pk-detail-note"><StickyNote size={13} /> {kayit.paketciNotu}</div>}
      </div>

      {!alamadımAcik ? (
        <div className="pk-action-row">
          <button className="pk-deliver-btn" onClick={onAldim}>
            <Check size={16} /> Aldım
          </button>
          <button className="pk-partial-btn" onClick={() => setAlamadımAcik(true)}>
            <X size={16} /> Alamadım
          </button>
        </div>
      ) : (
        <div className="pk-bosvar-alamadim-form">
          <textarea
            autoFocus
            rows={2}
            placeholder="Neden alamadın, ne zaman alacaksın?"
            value={notMetni}
            onChange={(e) => { setNotMetni(e.target.value); setHata(''); }}
          />
          {hata && <div className="pk-bosvar-hata">{hata}</div>}
          <div className="pk-action-row">
            <button className="pk-bosvar-vazgec-btn" onClick={() => setAlamadımAcik(false)}>Vazgeç</button>
            <button className="pk-partial-btn" onClick={handleAlamadimGonder}>Gönder</button>
          </div>
        </div>
      )}
    </div>
  );
}

function CariDetay({ cari, onBack, onAction }) {
  return (
    <div className="pk-detail">
      <button className="pk-back-btn" onClick={onBack}><ChevronLeft size={16} /> Listeye dön</button>
      <div className="pk-detail-card">
        <h2>{cari.ad}</h2>
        {cari.telefon && <div className="pk-detail-note">{cari.telefon}</div>}
        <div className="pk-detail-total">
          <span>GÜNCEL BAKİYE</span>
          <span>{TL(cari.bakiye)}</span>
        </div>
      </div>

      {cari.hareketler.length > 0 && (
        <div className="pk-history">
          <h3>Geçmiş bildirimler</h3>
          {cari.hareketler.map((h) => (
            <div key={h.id} className={`pk-history-item ${h.durum}`}>
              <div className="pk-history-top">
                <span>{h.tip === 'tam_odeme' ? 'Ödeme Aldım' : 'Kısmi Ödeme'}: {TL(h.tutar)} ({h.odemeYontemi})</span>
                <span className={`pk-status-tag ${h.durum === 'bekliyor' ? 'wait' : h.durum === 'reddedildi' ? 'reject' : 'ok'}`}>
                  {h.durum === 'bekliyor' ? 'Onay bekliyor' : h.durum === 'reddedildi' ? 'Reddedildi' : 'Onaylandı'}
                </span>
              </div>
              {h.notMetni && <div className="pk-history-note">{h.notMetni}</div>}
              {h.durum === 'reddedildi' && h.onayNotu && <div className="pk-history-reject"><AlertTriangle size={12} /> {h.onayNotu}</div>}
            </div>
          ))}
        </div>
      )}

      <div className="pk-action-row">
        <button className="pk-deliver-btn" onClick={() => onAction('tam_odeme')}>
          <Check size={16} /> Ödeme Aldım
        </button>
        <button className="pk-partial-btn" onClick={() => onAction('kismi_odeme')}>
          <Wallet size={16} /> Kısmi Ödeme Aldım
        </button>
      </div>
      <p className="pk-hint">Not: Bu bildirim carinin bakiyesini değiştirmez — sadece yöneticiye bilgi gider.</p>
    </div>
  );
}

// ---- Teslim/Ödeme bildirimi modalı — kanıt (foto/not) zorunluluğu burada yönetiliyor ----
function ActionModal({ modal, paketciAdi, uploadTeslimatFoto, onClose, onSubmitted, submitPaketTeslimat, submitCariTeslimatBildirim }) {
  const isKismi = modal.tip === 'kismi_odeme';
  const isCari = modal.hedefTip === 'cari';

  const [tutar, setTutar] = useState('');
  const [odemeYontemi, setOdemeYontemi] = useState(isCari ? '' : 'Nakit');
  const [notMetni, setNotMetni] = useState('');
  const [evidenceType, setEvidenceType] = useState(null); // 'fis' | 'yemek_karti' | 'not'
  const [fotoFile, setFotoFile] = useState(null);
  const [fotoPreview, setFotoPreview] = useState(null);
  const [uploading, setUploading] = useState(false);
  const cameraInputRef = useRef(null);
  const galleryInputRef = useRef(null);
  const yemekKartiInputRef = useRef(null);

  function handleFile(file, type) {
    if (!file) return;
    setFotoFile(file);
    setEvidenceType(type);
    setFotoPreview(URL.createObjectURL(file));
  }

  const parsedTutar = parseFloat(tutar.replace(',', '.'));
  const tutarAsimVar = isKismi && !isNaN(parsedTutar) && modal.ustTutar != null && parsedTutar > modal.ustTutar;
  const tutarGecerli = !isKismi || (!isNaN(parsedTutar) && parsedTutar > 0 && !tutarAsimVar);
  const notZorunluTamam = evidenceType === 'not' ? notMetni.trim().length > 0 : true;
  const kismiNotZorunlu = isKismi ? notMetni.trim().length > 0 : true;
  const kanitVar = evidenceType === 'not' ? notMetni.trim().length > 0 : !!fotoFile;
  const odemeYontemiSecili = !isCari || !isKismi ? true : !!odemeYontemi; // cari kısmi ödemede zorunlu
  const canSubmit = tutarGecerli && kanitVar && notZorunluTamam && (isKismi ? notMetni.trim().length > 0 && !!odemeYontemi : true) && !uploading;

  async function handleSubmit() {
    if (!canSubmit) return;
    setUploading(true);
    let fotoUrl = null;
    if (fotoFile) {
      fotoUrl = await uploadTeslimatFoto(fotoFile);
    }
    let result = null;
    let label = '';
    if (modal.hedefTip === 'paket') {
      result = await submitPaketTeslimat({
        paketAdi: modal.hedefId,
        tip: modal.tip,
        tutar: isKismi ? parsedTutar : null,
        odemeYontemi: isKismi ? odemeYontemi : null,
        notMetni: notMetni.trim() || null,
        fotoUrl,
        paketciAdi,
      });
      label = `${modal.hedefId} — ${modal.tip === 'teslim_edildi' ? 'Teslim' : 'Kısmi Öd.'}`;
    } else {
      result = await submitCariTeslimatBildirim({
        cariId: modal.hedefId,
        tip: isKismi ? 'kismi_odeme' : 'tam_odeme',
        tutar: isKismi ? parsedTutar : modal.ustTutar,
        odemeYontemi: odemeYontemi || 'Nakit',
        notMetni: notMetni.trim() || null,
        fotoUrl,
        paketciAdi,
      });
      label = `Cari — ${isKismi ? 'Kısmi Öd.' : 'Ödeme'}`;
    }
    setUploading(false);
    onSubmitted(result, label);
  }

  return (
    <div className="pk-modal-overlay" onClick={onClose}>
      <div className="pk-modal" onClick={(e) => e.stopPropagation()}>
        <div className="pk-modal-head">
          <h3>
            {modal.hedefTip === 'paket'
              ? modal.tip === 'teslim_edildi' ? 'Teslim Ettim' : 'Kısmi Ödeme Aldım'
              : isKismi ? 'Kısmi Ödeme Aldım' : 'Ödeme Aldım'}
          </h3>
          <button className="pk-modal-x" onClick={onClose}><X size={18} /></button>
        </div>

        {isKismi && modal.ustTutar != null && (
          <div className="pk-modal-total-hint">
            {modal.hedefTip === 'paket' ? 'Sipariş Toplamı' : 'Güncel Bakiye'}: <strong>{TL(modal.ustTutar)}</strong>
          </div>
        )}
        {isKismi && (
          <div className="pk-modal-section">
            <label>Alınan Tutar (TL)</label>
            <input
              type="text" inputMode="decimal" placeholder="ör. 90" value={tutar}
              onChange={(e) => setTutar(e.target.value)}
              className={tutarAsimVar ? 'pk-input-error' : ''}
            />
            {tutarAsimVar && (
              <div className="pk-inline-error">
                Girilen tutar toplamı ({TL(modal.ustTutar)}) aşıyor — kontrol et.
              </div>
            )}
          </div>
        )}
        {(isKismi || isCari) && (
          <div className="pk-modal-section">
            <label>Ödeme Yöntemi</label>
            <div className="pk-method-row">
              {ODEME_YONTEMLERI.map((m) => (
                <button key={m} className={odemeYontemi === m ? 'active' : ''} onClick={() => setOdemeYontemi(m)}>{m}</button>
              ))}
            </div>
          </div>
        )}

        <div className="pk-modal-section">
          <label>{isKismi ? 'Not (zorunlu)' : 'Kanıt (en az biri gerekli)'}</label>
          <div className="pk-evidence-row">
            <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }}
              onChange={(e) => handleFile(e.target.files[0], 'fis')} />
            <input ref={galleryInputRef} type="file" accept="image/*" style={{ display: 'none' }}
              onChange={(e) => handleFile(e.target.files[0], 'fis')} />
            <input ref={yemekKartiInputRef} type="file" accept="image/*" style={{ display: 'none' }}
              onChange={(e) => handleFile(e.target.files[0], 'yemek_karti')} />
            <button onClick={() => cameraInputRef.current?.click()}><Camera size={15} /> Fiş Çek</button>
            <button onClick={() => galleryInputRef.current?.click()}><ImageIcon size={15} /> Galeriden</button>
            <button onClick={() => yemekKartiInputRef.current?.click()}><Wallet size={15} /> Yemek Kartı Ekranı</button>
          </div>
          {fotoPreview && (
            <div className="pk-foto-preview">
              <img src={fotoPreview} alt="önizleme" />
              <span>{evidenceType === 'yemek_karti' ? 'Yemek kartı ödemesi' : 'Fiş fotoğrafı'} eklendi</span>
            </div>
          )}
          <textarea
            placeholder={isKismi ? 'Örn: 90 TL nakit aldı, kalanı sonra gelecek' : 'Not (fotoğraf yoksa zorunlu) — örn: Kapıda nakit aldı'}
            value={notMetni}
            onChange={(e) => { setNotMetni(e.target.value); if (!fotoFile) setEvidenceType(e.target.value.trim() ? 'not' : null); }}
          />
        </div>

        {!canSubmit && (
          <p className="pk-modal-warning">
            {isKismi && tutarAsimVar && 'Girilen tutar toplamı aşamaz. '}
            {isKismi && !tutarAsimVar && !tutarGecerli && 'Geçerli bir tutar gir. '}
            {isKismi && !odemeYontemi && 'Ödeme yöntemi seç. '}
            {isKismi && !notMetni.trim() && 'Kısmi ödemede not zorunlu. '}
            {!isKismi && !kanitVar && 'Fotoğraf yükle veya not yaz.'}
          </p>
        )}

        <div className="pk-modal-footer">
          <button className="pk-secondary" onClick={onClose}>Vazgeç</button>
          <button className="pk-primary" disabled={!canSubmit} onClick={handleSubmit}>
            {uploading ? 'Gönderiliyor...' : 'Gönder'}
          </button>
        </div>
      </div>
    </div>
  );
}