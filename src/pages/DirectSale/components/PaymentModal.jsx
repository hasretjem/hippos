import {
  Banknote,
  CreditCard,
  UtensilsCrossed,
  BookOpen,
  Calculator,
  ChevronUp,
  ChevronDown,
  Delete,
  Undo2,
  X,
} from 'lucide-react';

export default function PaymentModal({
  payMode,
  setPayMode,
  selectedItems,
  selectedTotal,
  finalTotal,
  showChangeCalc,
  setShowChangeCalc,
  receivedAmount,
  setReceivedAmount,
  handlePay,
  openCariPicker,
  TL,
}) {
  return (
    <>
      {payMode && (
        <div className="ds-modal-overlay" onClick={() => setPayMode(false)}>
          <div className="ds-modal ds-pay-modal" onClick={(e) => e.stopPropagation()}>
            <div className="ds-modal-head">
              <h3>Ödeme Yöntemi Seç</h3>
              <button className="ds-modal-x" onClick={() => setPayMode(false)}><X size={16} /></button>
            </div>
            <div className="ds-pay-modal-total">
              <span>Ödenecek Tutar</span>
              <strong>{TL(selectedItems.length > 0 ? selectedTotal : finalTotal)}</strong>
            </div>

            <button className="ds-change-calc-toggle" onClick={() => setShowChangeCalc((v) => !v)}>
              <Calculator size={15} /> Para Üstü Hesapla {showChangeCalc ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>

            {showChangeCalc && (() => {
              const odenecek = selectedItems.length > 0 ? selectedTotal : finalTotal;
              const alinan = Number(receivedAmount) || 0;
              const paraUstu = Math.max(0, alinan - odenecek);
              return (
                <div className="ds-change-calc">
                  <div className="ds-change-quick-grid">
                    {[50, 100, 150, 200, 250, 300, 350, 400, 450, 500, 550, 600, 650, 700, 750, 800].map((amt) => (
                      <button key={amt} onClick={() => setReceivedAmount(String(amt))}>{amt}</button>
                    ))}
                  </div>
                  <div className="ds-change-manual">
                    <span>Alınan Tutar</span>
                    <div className="ds-change-manual-input">{receivedAmount || '0'} ₺</div>
                  </div>
                  <div className="ds-change-result">
                    <span>Para Üstü</span>
                    <strong>{TL(paraUstu)}</strong>
                  </div>
                  <div className="ds-change-numpad">
                    {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((k) => (
                      <button key={k} onClick={() => setReceivedAmount((prev) => (prev === '0' ? k : prev + k))}>{k}</button>
                    ))}
                    <button className="clear" onClick={() => setReceivedAmount('')}><Delete size={16} /></button>
                    <button onClick={() => setReceivedAmount((prev) => (prev === '0' ? '0' : prev + '0'))}>0</button>
                    <button className="clear" onClick={() => setReceivedAmount((prev) => prev.slice(0, -1))}>⌫</button>
                  </div>
                </div>
              );
            })()}

            <div className="ds-pay-grid">
              <button className="cash" onClick={() => handlePay('NAKİT')}>
                <Banknote size={19} /><span className="lbl">Nakit</span>
              </button>
              <button className="card" onClick={() => handlePay('KREDİ KARTI')}>
                <CreditCard size={19} /><span className="lbl">Kredi K.</span>
              </button>
              <button className="meal" onClick={() => handlePay('YEMEK KARTI')}>
                <UtensilsCrossed size={19} /><span className="lbl">Yemek K.</span>
              </button>
              <button className="credit" onClick={openCariPicker}>
                <BookOpen size={19} /><span className="lbl">Cari</span>
              </button>
            </div>
            <button className="ds-pay-back-btn" onClick={() => setPayMode(false)}>
              <Undo2 size={14} /> Geri
            </button>
          </div>
        </div>
      )}

    </>
  );
}
