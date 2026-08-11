import React, { useState } from 'react';

export default function GenericModal({ modal, onClose }) {
  const [inputVal, setInputVal] = useState(modal.defaultValue || '');
  const [selectVal, setSelectVal] = useState(modal.selectOptions?.[0]?.value || '');

  function confirm() {
    if (modal.onConfirm) modal.onConfirm(inputVal, selectVal);
    onClose();
  }

  return (
    <div className="ds-modal-overlay" onClick={onClose}>
      <div className="ds-modal ds-generic-modal" onClick={(e) => e.stopPropagation()}>
        <h3>{modal.title}</h3>
        {modal.showInput && (
          <textarea
            autoFocus
            rows={2}
            placeholder={modal.placeholder || 'Metin yazın...'}
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                confirm();
              }
            }}
          />
        )}
        {modal.showSelect && (
          <div className="ds-modal-select-wrap">
            <label>Hedef Masa Seçin:</label>
            <select value={selectVal} onChange={(e) => setSelectVal(e.target.value)}>
              {modal.selectOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        )}
        <div className="ds-modal-footer two">
          <button className="ds-secondary-btn" onClick={onClose}>Vazgeç</button>
          <button className="ds-primary-btn" onClick={confirm}>Onayla</button>
        </div>
      </div>
    </div>
  );
}
