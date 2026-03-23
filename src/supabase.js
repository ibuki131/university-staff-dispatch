import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('[Supabase] 環境変数が未設定です。');
  console.error('VITE_SUPABASE_URL=', supabaseUrl);
  console.error('VITE_SUPABASE_ANON_KEY=', supabaseAnonKey);
  throw new Error('Supabase URL/ANON KEYが設定されていません。.envを確認してください。');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);