import { useEffect, useState } from 'react';
import DirectSale from './pages/DirectSale/DirectSale';
import Tables from './pages/Tables/Tables';
import Settings from './pages/Settings/Settings';
import Products from './pages/Products/Products';
import Cariler from './pages/Cariler/Cariler';
import Paketci from './pages/Paketci/Paketci';
import BottomNav from './components/BottomNav/BottomNav';
import useHipposData, { QUICK_SALE } from './hooks/useHipposData';
import { supabase } from './services/supabase';

export default function App() {
  const data = useHipposData();
  const [activePage, setActivePage] = useState('tables');
  const [selectedTable, setSelectedTable] = useState(QUICK_SALE);

  // Paketçi kendi telefonundan /paketci adresine girer — ana panelden tamamen ayrı,
  // bağımsız bir mobil sayfa. Aynı Supabase verisini kullanır ama farklı arayüz.
  const isPaketciRoute = typeof window !== 'undefined' && window.location.pathname.startsWith('/paketci');

  useEffect(() => {
    async function testConnection() {
      // Supabase 'tables' tablosu test çağrısı
      const { data, error } = await supabase.from('tables').select('*');

      if (error) {
        console.error('❌ Supabase Bağlantı Hatası:', error.message);
      } else {
        console.log('✅ Supabase Bağlantısı Başarılı! Masalar:', data);
      }
    }

    testConnection();
  }, []);

  if (isPaketciRoute) {
    return <Paketci data={data} />;
  }

  function handleNavigate(page, opts) {
    if (page === 'tables' || page === 'pos' || page === 'settings' || page === 'products' || page === 'cariler') {
      // Sadece alt menüden "Hızlı Satış"a bilerek tıklanınca seçili masa sıfırlanır.
      // Masalar sayfasından bir masaya girerken (opts.resetTable verilmez) buna dokunulmaz.
      if (page === 'pos' && opts?.resetTable) setSelectedTable(QUICK_SALE);
      setActivePage(page);
    } else {
      // Kasa & Rapor, Gün Sonu sayfaları henüz hazır değil
      alert('Bu sayfa henüz hazırlanıyor.');
    }
  }

  return (
    <>
      {activePage === 'pos' && (
        <DirectSale
          data={data}
          selectedTable={selectedTable}
          setSelectedTable={setSelectedTable}
          onNavigate={handleNavigate}
        />
      )}
      {activePage === 'tables' && (
        <Tables data={data} setSelectedTable={setSelectedTable} onNavigate={handleNavigate} />
      )}
      {activePage === 'settings' && (
        <Settings data={data} onNavigate={handleNavigate} />
      )}
      {activePage === 'products' && (
        <Products data={data} onNavigate={handleNavigate} />
      )}
      {activePage === 'cariler' && (
        <Cariler data={data} onNavigate={handleNavigate} />
      )}
      {activePage !== 'products' && activePage !== 'pos' && <BottomNav activePage={activePage} onNavigate={handleNavigate} />}
    </>
  );
}