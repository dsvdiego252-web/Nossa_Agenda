import { createClient } from '@supabase/supabase-js';
const url = import.meta.env?.VITE_SUPABASE_URL;
const key = import.meta.env?.VITE_SUPABASE_PUBLISHABLE_KEY;
export const configured = Boolean(url && key && !url.includes('SEU-PROJETO') && !key.includes('SUBSTITUA'));
export const supabase = configured ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } }) : null;
export async function getMember() {
  const { data: user, error: authError } = await supabase.auth.getUser();
  if (authError || !user.user) throw new Error('Sua sessão expirou. Entre novamente.');
  const { data, error } = await supabase.from('members').select('id,name').eq('id', user.user.id).single();
  if (error || !data) throw new Error('Esta conta não está autorizada. Confira os membros no Supabase.');
  return data;
}
export async function fetchEvents() {
  // Paginação evita perder eventos quando ultrapassam o limite padrão da API.
  const all = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabase.from('events').select('*').order('id').range(offset, offset + 499);
    if (error) throw error;
    all.push(...data.map(e => ({ ...e, start_time: e.start_time.slice(0, 5), end_time: e.end_time.slice(0, 5) })));
    if (data.length < 500) return all;
  }
}
export async function pushOperation(op) {
  const { data, error } = await supabase.rpc('save_event', { p_event: op.event, p_expected_version: op.expected, p_mutation: op.mutation });
  if (error) throw error;
  return { ...data, start_time: data.start_time.slice(0, 5), end_time: data.end_time.slice(0, 5) };
}
