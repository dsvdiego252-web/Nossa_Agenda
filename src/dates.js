export const OWNERS = { Diego: '#668bc1', Daiane: '#c38091', Ambos: '#8b7bb6', Família: '#b58b45' };
export const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
export const isoDate = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
export const parseDate = value => new Date(`${value}T12:00:00`);
export const addDays = (value, amount) => { const d = parseDate(value); d.setDate(d.getDate() + amount); return isoDate(d); };
export const formatDate = (value, options = { day: 'numeric', month: 'long' }) => parseDate(value).toLocaleDateString('pt-BR', options);
export const dayDistance = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
export function occursOn(event, day) {
  if (event.deleted || day < event.date || (event.repeat_until && day > event.repeat_until)) return false;
  const diff = dayDistance(event.date, day);
  switch (event.repeat) {
    case 'daily': return true;
    case 'weekly': return diff % 7 === 0;
    case 'monthly': return parseDate(event.date).getDate() === parseDate(day).getDate();
    case 'custom': return event.weekdays.includes(parseDate(day).getDay());
    default: return day === event.date;
  }
}
export function occurrences(events, from, to) {
  const result = [];
  for (let day = from; day <= to; day = addDays(day, 1)) {
    for (const event of events) if (occursOn(event, day)) result.push({ ...event, occurrence: day });
  }
  return result.sort((a, b) => `${a.occurrence}${a.start_time}`.localeCompare(`${b.occurrence}${b.start_time}`));
}
export function monthDays(day) {
  const date = parseDate(day); date.setDate(1);
  const start = addDays(isoDate(date), -date.getDay());
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}
export function validateEvent(event) {
  if (!event.title?.trim() || event.title.length > 120) throw new Error('Informe um título de até 120 caracteres.');
  if (!Object.hasOwn(OWNERS, event.owner)) throw new Error('Escolha um responsável válido.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(event.date) || isoDate(parseDate(event.date)) !== event.date) throw new Error('Informe uma data válida.');
  if (![event.start_time, event.end_time].every(t => /^([01]\d|2[0-3]):[0-5]\d$/.test(t)) || event.end_time <= event.start_time) throw new Error('O horário final deve ser posterior ao inicial, no mesmo dia.');
  if (!event.category?.trim() || event.category.length > 40) throw new Error('A categoria deve ter entre 1 e 40 caracteres.');
  if (!['none', 'daily', 'weekly', 'monthly', 'custom'].includes(event.repeat)) throw new Error('Repetição inválida.');
  if (!Array.isArray(event.weekdays) || event.weekdays.some(n => !Number.isInteger(n) || n < 0 || n > 6)) throw new Error('Dias da semana inválidos.');
  if (event.repeat === 'custom' && !event.weekdays.length) throw new Error('Selecione pelo menos um dia da semana.');
  if (event.repeat_until && (!/^\d{4}-\d{2}-\d{2}$/.test(event.repeat_until) || isoDate(parseDate(event.repeat_until)) !== event.repeat_until || event.repeat_until < event.date)) throw new Error('A data limite deve ser igual ou posterior à data inicial.');
  if (!/^#[0-9a-f]{6}$/i.test(event.color)) throw new Error('Cor inválida.');
  if ((event.notes || '').length > 4000) throw new Error('As observações devem ter até 4.000 caracteres.');
  if (![-1, 0, 10, 30, 60, 1440].includes(event.reminder)) throw new Error('Lembrete inválido.');
  return event;
}

export function todayInBrasilia() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(p => [p.type, p.value]));
  return values.year + '-' + values.month + '-' + values.day;
}
