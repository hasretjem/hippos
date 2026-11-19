import { createClient } from '@supabase/supabase-js';
import { supabaseFetchOlustur } from './baglanti';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Supabase URL veya Anon Key eksik! .env dosyanızı kontrol edin.');
}

// Supabase'e ulaşılamazsa kayıtlar bilgisayarda kuyruğa alınır ve Supabase gelince aktarılır (services/baglanti.js).
export const supabase = createClient(supabaseUrl, supabaseAnonKey, { global: { fetch: supabaseFetchOlustur(supabaseUrl) } });