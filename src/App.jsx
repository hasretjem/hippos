import { useEffect, useState } from 'react';
import DirectSale from './pages/DirectSale/DirectSale';
import Tables from './pages/Tables/Tables';
import Settings from './pages/Settings/Settings';
import Products from './pages/Products/Products';
import BottomNav from './components/BottomNav/BottomNav';
import useHipposData, { QUICK_SALE } from './hooks/useHipposData';
import { supabase } from './services/supabase';

export default function App() {
  const data = useHipposData();
  const [activePage, setActivePage] = useState('pos');
  const [selectedTable, setSelectedTable] = useState(QUICK_SALE);

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

  function handleNavigate(page) {
    if (page === 'tables' || page === 'pos' || page === 'settings' || page === 'products') {
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
      {activePage !== 'products' && <BottomNav activePage={activePage} onNavigate={handleNavigate} />}
    </>
  );
}