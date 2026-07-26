import { useEffect } from 'react';
import DirectSale from "./pages/DirectSale/DirectSale";
import { supabase } from './services/supabase';

export default function App() {
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

  return <DirectSale />;
}
