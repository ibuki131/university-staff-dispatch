import { supabase } from './supabase'

// ── 店舗登録 ──────────────────────────────────────
export async function registerStore({ storeName, email, password, category, address }) {
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
  })
  if (authError) throw new Error(authError.message)

  const { error: userError } = await supabase.from('users').insert({
    id: authData.user.id,
    email,
    name: storeName,
    type: 'store',
    avatar: '🏪',
  })
  if (userError) throw new Error(userError.message)

  const { error: storeError } = await supabase.from('stores').insert({
    user_id: authData.user.id,
    name: storeName,
    category,
    address,
    approved: false,
  })
  if (storeError) throw new Error(storeError.message)

  return { success: true }
}

// ── 学生登録 ──────────────────────────────────────
export async function registerStudent({ name, email, password, university }) {
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
  })
  if (authError) throw new Error(authError.message)

  const { error } = await supabase.from('users').insert({
    id: authData.user.id,
    email,
    name,
    type: 'student',
    university,
    avatar: '🧑‍🎓',
    trust_score: 4.0,
    total_shifts: 0,
  })
  if (error) throw new Error(error.message)

  return { success: true }
}

// ── ログイン ──────────────────────────────────────
export async function login({ email, password }) {
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email,
    password,
  })
  if (authError) throw new Error(authError.message)

  const { data: profile } = await supabase
    .from('users')
    .select('*')
    .eq('id', authData.user.id)
    .single()

  if (!profile) throw new Error('プロフィールが見つかりません')

  if (profile.type === 'store') {
    const { data: store } = await supabase
      .from('stores')
      .select('approved')
      .eq('user_id', profile.id)
      .single()

    if (!store?.approved) {
      throw new Error('審査中です。承認までしばらくお待ちください。')
    }
    return { ...profile, storeData: store }
  }

  return profile
}