import React, { useState } from 'react';
import './MutfakPaneli.css';
import FisMenu from './FisMenu';
import StokSayimEkrani from '../../components/StokSayim/StokSayimEkrani';
import { ClipboardList } from 'lucide-react';

// Mutfak Paneli — iki sekme:
//  1) Fiş Görünüm  : günlük menü seçimi (FisMenu.jsx — kendi içinde bağımsız)
//  2) Stok Sayım   : Gıda + Manav stok sayımı (StokSayimEkrani ortak bileşeni)
//
// NOT: Eski "Akordiyon" sekmesi (grup listesi + sihirbaz + çekmece ile menü seçme)
// kullanıcı isteğiyle tamamen kaldırıldı — aynı işi Fiş Görünüm yapıyor. Fiş Görünüm'ün
// hiçbir özelliğine dokunulmadı; FisMenu.jsx ayrı dosyadır ve akordiyonla hiçbir
// state/fonksiyon paylaşmıyordu.
export default function MutfakPaneli({ data }) {
  const [activeTab, setActiveTab] = useState('fis'); // 'fis' | 'stok'

  return (
    <div className="mp-shell">
      {/* ── SEKME ÇUBUĞU ── */}
      <div className="mp-tabs">
        <button
          className={`mp-tab ${activeTab === 'fis' ? 'active' : ''}`}
          onClick={() => setActiveTab('fis')}
        >
          📋 Fiş Görünüm
        </button>
        <button
          className={`mp-tab ${activeTab === 'stok' ? 'active' : ''}`}
          onClick={() => setActiveTab('stok')}
        >
          <ClipboardList size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} /> Stok Sayım
        </button>
      </div>

      {activeTab === 'fis' && <FisMenu data={data} />}
      {activeTab === 'stok' && <StokSayimEkrani data={data} rol="mutfak" adSoyad="Mutfak" />}
    </div>
  );
}