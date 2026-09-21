import './styles.css';
import { configured, supabase, getMember } from './backend.js';
import { AgendaStore } from './sync.js';
import { readAccount } from './storage.js';
import { OWNERS, WEEKDAYS, todayInBrasilia, isoDate, parseDate, addDays, formatDate, monthDays, occurrences } from './dates.js';
import { enabled, toggleReminders, checkReminders } from './notifications.js';

const app = document.querySelector('#app');
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const icon = (name, size = 20) => {
  const paths = {
    calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M16 3v4M8 3v4M3 11h18"/>',
    home: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z"/><path d="M9 21v-8h6v8"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
    settings: '<path d="M4 7h16M4 17h16"/><circle cx="8" cy="7" r="3"/><circle cx="16" cy="17" r="3"/>',
    arrow: '<path d="m9 5 7 7-7 7"/>',
    heart: '<path d="M20 4c-3-2-6 0-8 2C10 4 7 2 4 4c-6 5 1 11 8 16 7-5 14-11 8-16Z"/>',
    logout: '<path d="M9 4H4v16h5M9 12h12m-5-5 5 5-5 5"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    leaf: '<path d="M20 3C5 2 2 8 5 15s16 4 15-12ZM4 21 15 10"/>',
    lock: '<rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>'
  };
  return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (paths[name] || paths.calendar) + '</svg>';
};
let store, channel, installPrompt, editorEvent;
let selected = todayInBrasilia(), view = 'month', ownerFilter = '', categoryFilter = '';
let toastTimer, authEpoch = 0;
const today = todayInBrasilia;
const visibleEvents = () => (store?.state.events || []).filter(e => !e.deleted && (!ownerFilter || e.owner === ownerFilter) && (!categoryFilter || e.category === categoryFilter));
const categories = () => [...new Set(['Pessoal', 'Trabalho', 'Saúde', 'Casa', 'Lazer', ...(store?.state.events || []).filter(e => !e.deleted).map(e => e.category)])].sort();
function toast(message) {
  const target = document.querySelector('#toast'); target.textContent = message; target.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => target.hidden = true, 5500);
}
function login(message = '') {
  app.innerHTML = '<main class="login-layout"><section class="login-story"><div class="brand">' + icon('calendar', 30) + '<span>agenda familiar<small>DIEGO & DAIANE</small></span></div><div><span class="eyebrow">NOSSO TEMPO, JUNTOS</span><h1>Uma vida a dois.<br>Um lugar para<br><em>organizar tudo.</em></h1><p>Dos pequenos planos aos grandes momentos.<br>A rotina da família, no mesmo ritmo.</p></div><div class="story-footer">' + icon('heart') + ' Feito para a vida que vocês compartilham.</div><div class="orbit orbit-one"></div><div class="orbit orbit-two"></div></section><section class="login-panel"><div class="login-card"><div class="small-icon">' + icon('home', 26) + '</div><span class="eyebrow">BEM-VINDOS AO SEU ESPAÇO</span><h2>Que bom ter você aqui.</h2><p class="muted">Entre para cuidar dos planos da família.</p><form id="login-form"><label>E-mail<input name="email" type="email" autocomplete="username" required placeholder="Seu e-mail" ' + (!configured ? 'disabled' : '') + '></label><label>Senha<input name="password" type="password" autocomplete="current-password" required placeholder="Sua senha" ' + (!configured ? 'disabled' : '') + '></label><p class="form-error" role="alert">' + esc(message) + '</p><button class="primary wide" ' + (!configured ? 'disabled' : '') + '>Entrar na nossa agenda ' + icon('arrow', 17) + '</button></form><p class="private-note">' + icon('lock', 15) + ' Acesso exclusivo de Diego e Daiane.</p>' + (!configured ? '<div class="setup-note"><strong>Vamos preparar a casa?</strong><p>Configure as duas variáveis do Supabase no arquivo .env.local. O README acompanha você em cada passo.</p><button class="text-button" data-action="preview">Explorar prévia local ' + icon('arrow', 15) + '</button><small>A prévia começa vazia e não se conecta ao banco.</small></div>' : '<small class="muted">Esqueceu sua senha? O administrador pode redefini-la no painel do Supabase. Não há cadastro público.</small>') + '</div></section></main>';
}
function eventCard(event) {
  return '<button class="event-card" data-action="edit" data-id="' + esc(event.id) + '" style="--event-color:' + esc(event.color) + '"><span class="event-time">' + esc(event.start_time) + '<small>' + esc(event.end_time) + '</small></span><span class="event-info"><strong>' + esc(event.title) + '</strong><small>' + esc(event.owner) + ' · ' + esc(event.category) + (event.repeat !== 'none' ? ' · ↻' : '') + '</small></span><span class="event-dot"></span></button>';
}
function empty(title, text) { return '<div class="empty"><span class="empty-icon">' + icon('leaf', 28) + '</span><strong>' + title + '</strong><p>' + text + '</p></div>'; }
function calendar() {
  const events = visibleEvents();
  let days;
  if (view === 'month') days = monthDays(selected);
  else if (view === 'week') { const start = addDays(selected, -parseDate(selected).getDay()); days = Array.from({ length: 7 }, (_, i) => addDays(start, i)); }
  else days = [selected];
  const expanded = occurrences(events, days[0], days.at(-1));
  if (view === 'day') return '<div class="day-view"><h3>' + formatDate(selected, { weekday: 'long', day: 'numeric', month: 'long' }) + '</h3>' + (expanded.map(eventCard).join('') || empty('Um dia cheio de possibilidades', 'Adicione um compromisso para começar.')) + '</div>';
  return '<div class="weekday-row">' + WEEKDAYS.map(d => '<span>' + d + '</span>').join('') + '</div><div class="calendar-grid ' + (view === 'week' ? 'week-grid' : '') + '">' + days.map(day => {
    const entries = expanded.filter(e => e.occurrence === day);
    return '<button data-action="select-day" data-day="' + day + '" class="day ' + (day.slice(0, 7) !== selected.slice(0, 7) && view === 'month' ? 'outside ' : '') + (day === today() ? 'today ' : '') + (day === selected ? 'selected' : '') + '" aria-label="' + formatDate(day, { day: 'numeric', month: 'long', year: 'numeric' }) + ', ' + entries.length + ' compromissos" aria-pressed="' + (day === selected) + '"><span class="day-number">' + parseDate(day).getDate() + '</span><span class="day-events">' + entries.slice(0, 2).map(e => '<span class="calendar-event" style="--event-color:' + esc(e.color) + '">' + esc(e.start_time) + ' ' + esc(e.title) + '</span>').join('') + (entries.length > 2 ? '<small>+' + (entries.length - 2) + ' mais</small>' : '') + '</span><span class="mobile-dots">' + entries.slice(0, 4).map(e => '<i style="background:' + esc(e.color) + '"></i>').join('') + '</span></button>';
  }).join('') + '</div>';
}
function render() {
  if (!store || store.closed) return;
  // Não substitui campos enquanto o usuário está editando.
  const dialogOpen = Boolean(document.querySelector('dialog[open]'));
  if (dialogOpen) { updateStatus(); return; }
  const name = store.preview ? 'vocês' : store.member.name;
  const upcoming = occurrences(visibleEvents(), today(), addDays(today(), 60)).filter(e => e.occurrence > today() || e.end_time >= new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })).slice(0, 5);
  const selectedEvents = occurrences(visibleEvents(), selected, selected);
  app.innerHTML = '<div class="app-shell"><aside class="sidebar"><div class="brand">' + icon('calendar', 28) + '<span>agenda familiar<small>DIEGO & DAIANE</small></span></div><div class="side-caption">NOSSO ESPAÇO</div><nav><button class="nav-item active" data-action="calendar">' + icon('calendar') + ' Nossa agenda</button><button class="nav-item" data-action="today">' + icon('clock') + ' Meu dia</button><button class="nav-item" data-action="settings">' + icon('settings') + ' Preferências</button></nav><div class="side-bottom"><div class="together"><span>♡</span><strong>Mais tempo para<br>o que importa.</strong><p>Uma rotina organizada.<br>Uma vida mais leve.</p></div><div class="profile"><span class="avatar">' + (store.preview ? 'D+D' : esc(name[0])) + '</span><span><strong>' + (store.preview ? 'Diego & Daiane' : esc(name)) + '</strong><small>' + (store.preview ? 'Prévia neste aparelho' : 'Nosso espaço privado') + '</small></span><button class="icon-button" data-action="logout" aria-label="Sair">' + icon('logout', 18) + '</button></div></div></aside><main class="main"><header class="topbar"><span class="breadcrumb">Nosso espaço <span>/</span> <strong>Agenda</strong></span><span id="sync-status" class="sync-status"></span><button class="icon-button mobile-settings" data-action="settings" aria-label="Preferências">' + icon('settings') + '</button></header><section class="page-heading"><div><span class="eyebrow">' + esc(formatDate(today(), { weekday: 'long', day: 'numeric', month: 'long' }).toUpperCase()) + '</span><h1>Olá, ' + esc(name) + '<span class="hello-dot">.</span></h1><p>Vamos abrir espaço para bons momentos?</p></div><button class="primary" data-action="new">' + icon('plus', 18) + ' Novo compromisso</button></section>' + (store.preview ? '<div class="preview-banner">' + icon('lock', 16) + '<span><strong>Prévia local.</strong> Sem conexão com o Supabase. Os dados ficam só neste navegador.</span><button class="text-button" data-action="logout">Sair da prévia</button></div>' : '') + '<section class="welcome-banner"><div><span class="eyebrow">CADA DIA, MAIS JUNTOS</span><h2>Os planos são nossos.<br>O tempo também.</h2><p>Todos os compromissos da família, em um só lugar.</p></div><div class="banner-art" aria-hidden="true"><span class="art-leaf">⌁</span><div class="mini-calendar"><div></div><span>nós dois</span>' + icon('heart', 38) + '</div><span class="art-spark">✧</span></div></section><div id="conflict"></div><section class="agenda-layout"><div class="calendar-column"><section class="calendar-panel"><div class="calendar-toolbar"><div class="month-heading"><h2>' + esc(formatDate(selected, { month: 'long', year: 'numeric' })) + '</h2><div class="calendar-arrows"><button class="icon-button previous" data-action="previous" aria-label="Período anterior">' + icon('arrow', 16) + '</button><button class="icon-button" data-action="next" aria-label="Próximo período">' + icon('arrow', 16) + '</button></div></div><div class="view-controls"><button class="today-button" data-action="today">Hoje</button><div class="segmented">' + [['month', 'Mês'], ['week', 'Semana'], ['day', 'Dia']].map(([id, label]) => '<button data-action="view" data-view="' + id + '" aria-pressed="' + (view === id) + '" class="' + (view === id ? 'active' : '') + '">' + label + '</button>').join('') + '</div></div></div><div class="filters"><label class="sr-only" for="owner-filter">Filtrar por responsável</label><select id="owner-filter"><option value="">Todos os responsáveis</option>' + Object.keys(OWNERS).map(n => '<option ' + (ownerFilter === n ? 'selected' : '') + '>' + n + '</option>').join('') + '</select><label class="sr-only" for="category-filter">Filtrar por categoria</label><select id="category-filter"><option value="">Todas as categorias</option>' + categories().map(n => '<option ' + (categoryFilter === n ? 'selected' : '') + '>' + esc(n) + '</option>').join('') + '</select>' + ((ownerFilter || categoryFilter) ? '<button class="text-button" data-action="clear-filters">Limpar</button>' : '') + '</div>' + calendar() + '<div class="legend">' + Object.entries(OWNERS).map(([n,c]) => '<span><i style="background:' + c + '"></i>' + n + '</span>').join('') + '<small>Cores padrão</small></div></section><section class="selected-panel"><div class="section-heading"><h3>' + (selected === today() ? 'Hoje' : formatDate(selected)) + '<span class="count">' + selectedEvents.length + '</span></h3><button class="text-button" data-action="new">' + icon('plus', 15) + ' Adicionar</button></div>' + (selectedEvents.map(eventCard).join('') || empty('Sem compromissos por aqui', (ownerFilter || categoryFilter) ? 'Nenhum compromisso corresponde aos filtros.' : 'Que tal planejar algo especial para este dia?')) + '</section></div><aside class="upcoming-panel"><div class="section-heading"><h3>Vem por aí</h3>' + icon('clock', 18) + '</div><p class="muted section-subtitle">Seus próximos 60 dias</p>' + (upcoming.length ? upcoming.map(e => '<div class="upcoming-item"><span class="upcoming-date">' + formatDate(e.occurrence, { weekday: 'short', day: 'numeric', month: 'short' }) + '</span>' + eventCard(e) + '</div>').join('') : empty('Tudo tranquilo', 'Os próximos compromissos vão aparecer aqui.')) + '<div class="gentle-note">' + icon('heart', 20) + '<p>Nem todo momento precisa de um plano. Reserve tempo para estar junto.</p></div></aside></section><footer class="page-footer">' + icon('lock', 13) + ' Só de vocês. Feito para compartilhar a vida.<span>Horário de Brasília</span></footer></main></div><dialog id="editor"></dialog><dialog id="settings"></dialog>';
  updateStatus();
}
function updateStatus() {
  if (!store) return;
  const el = document.querySelector('#sync-status');
  if (el) el.textContent = '● ' + store.status + (store.state.queue.length ? ' · ' + store.state.queue.length + ' pendente(s)' : '');
  const target = document.querySelector('#conflict');
  if (target) target.innerHTML = store.state.conflict ? '<div class="conflict-banner"><strong>Este compromisso mudou no outro aparelho.</strong><p>“' + esc(store.state.conflict.event.title) + '”: escolha usar a versão compartilhada ou salvar sua edição como um novo compromisso. As outras alterações aguardam essa escolha.</p><button data-action="conflict-remote">Usar versão compartilhada</button><button data-action="conflict-copy">Manter edição como cópia</button></div>' : '';
}
function openEditor(id, duplicate = false) {
  const original = store.state.events.find(e => e.id === id);
  editorEvent = original && !duplicate ? { ...original } : null;
  const event = original ? { ...original } : { title: '', owner: store.member.name in OWNERS ? store.member.name : 'Ambos', date: selected, start_time: '09:00', end_time: '10:00', category: 'Pessoal', repeat: 'none', weekdays: [], repeat_until: '', notes: '', reminder: -1 };
  event.color ||= OWNERS[event.owner];
  if (duplicate) { event.title = event.title.slice(0, 110) + ' (cópia)'; event.date = selected; }
  const dialog = document.querySelector('#editor');
  dialog.innerHTML = '<form id="event-form"><div class="dialog-heading"><div><span class="eyebrow">UM TEMPO PARA O QUE IMPORTA</span><h2>' + (editorEvent ? 'Editar compromisso' : 'Novo compromisso') + '</h2></div><button type="button" class="icon-button" data-action="close" aria-label="Fechar">×</button></div><label>Título<input name="title" required maxlength="120" value="' + esc(event.title) + '" placeholder="O que vamos planejar?" autofocus></label><div class="form-grid"><label>Responsável<select name="owner" aria-label="Responsável">' + Object.keys(OWNERS).map(n => '<option ' + (n === event.owner ? 'selected' : '') + '>' + n + '</option>').join('') + '</select></label><label>Categoria<input name="category" list="categories" required maxlength="40" value="' + esc(event.category) + '"><datalist id="categories">' + categories().map(n => '<option value="' + esc(n) + '"></option>').join('') + '</datalist><small>Escolha ou escreva uma nova.</small></label><label class="full">Data inicial<input name="date" type="date" required value="' + event.date + '"></label><label>Começa às<input name="start_time" type="time" required value="' + event.start_time + '"></label><label>Termina às<input name="end_time" type="time" required value="' + event.end_time + '"></label><label>Repetição<select name="repeat" aria-label="Repetição">' + [['none','Não repetir'],['daily','Diariamente'],['weekly','Semanalmente'],['monthly','Mensalmente'],['custom','Dias da semana']].map(([v,l]) => '<option value="' + v + '" ' + (v === event.repeat ? 'selected' : '') + '>' + l + '</option>').join('') + '</select></label><label>Repetir até (opcional)<input name="repeat_until" type="date" value="' + (event.repeat_until || '') + '"></label></div><fieldset id="weekdays" ' + (event.repeat !== 'custom' ? 'hidden' : '') + '><legend>Em quais dias?</legend>' + WEEKDAYS.map((d,i) => '<label class="weekday-check"><input type="checkbox" name="weekdays" value="' + i + '" ' + (event.weekdays.includes(i) ? 'checked' : '') + '><span>' + d + '</span></label>').join('') + '</fieldset><div class="form-grid"><label>Lembrete<select name="reminder" aria-label="Lembrete">' + [[-1,'Sem lembrete'],[0,'Na hora'],[10,'10 minutos antes'],[30,'30 minutos antes'],[60,'1 hora antes'],[1440,'1 dia antes']].map(([v,l]) => '<option value="' + v + '" ' + (v === event.reminder ? 'selected' : '') + '>' + l + '</option>').join('') + '</select></label><label>Cor<input type="color" name="color" value="' + event.color + '"></label></div><label>Observações<textarea name="notes" rows="3" maxlength="4000" placeholder="Algum detalhe para lembrar?">' + esc(event.notes) + '</textarea></label><p class="form-note">Horário de Brasília. Repetições não têm limite quando a data final está vazia. Alterar ou excluir uma rotina afeta toda a série. No dia 31, a repetição mensal pula meses sem esse dia.</p><p class="form-note">Lembretes exigem ativação em Preferências e o app aberto.</p><p class="form-error" role="alert"></p><div class="dialog-actions">' + (editorEvent ? '<button type="button" class="danger text-button" data-action="delete">Excluir série</button><button type="button" class="text-button" data-action="duplicate">Duplicar</button>' : '') + '<button type="submit" class="primary">Salvar compromisso</button></div></form>';
  dialog.showModal();
}
function settings() {
  const dialog = document.querySelector('#settings');
  dialog.innerHTML = '<div class="dialog-heading"><h2>Do seu jeito</h2><button class="icon-button" data-action="close" aria-label="Fechar">×</button></div><section class="setting-section"><h3>' + icon('bell') + ' Lembretes neste aparelho</h3><p>Receba lembretes enquanto o app estiver aberto e ativo. Não há entrega garantida com o app fechado ou celular bloqueado.</p><button class="secondary" data-action="notifications">' + (enabled(store.key) ? 'Desativar lembretes' : 'Ativar lembretes') + '</button></section><section class="setting-section"><h3>' + icon('home') + ' Sempre por perto</h3><p>Instale a agenda na tela inicial. No iPhone: Safari → Compartilhar → Adicionar à Tela de Início. No Android: menu do Chrome → Instalar aplicativo.</p><button class="secondary" data-action="install">Instalar aplicativo</button></section><section class="setting-section"><h3>' + icon('check') + ' Seus dados</h3><p>' + esc(store.status) + '. ' + store.state.queue.length + ' alteração(ões) na fila. O modo offline usa dados salvos neste navegador após um primeiro acesso.</p><button class="secondary" data-action="sync">Sincronizar agora</button><button class="text-button" data-action="export">Exportar cópia JSON</button></section><section class="setting-section"><p>Ao sair, os dados locais desta conta serão removidos. A conta continua no Supabase.</p><button class="text-button danger" data-action="logout">Sair da agenda</button></section>';
  dialog.showModal();
}
async function enter(member, preview = false) {
  if (store) store.closed = true;
  if (channel) { await supabase.removeChannel(channel); channel = null; }
  store = new AgendaStore(member, preview, render);
  await store.init(); render();
  if (!preview) {
    const current = store;
    channel = supabase.channel('agenda-events').on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, () => current.sync()).subscribe(status => {
      if (status === 'SUBSCRIBED') current.sync();
    });
    await store.sync();
  }
}
async function signOut() {
  if (!store) return;
  if (store.state.queue.length && !confirm('Há alterações não sincronizadas. Sair apagará essas alterações deste aparelho. Deseja sair mesmo assim?')) return;
  authEpoch++;
  const current = store;
  if (channel) { await supabase.removeChannel(channel); channel = null; }
  await current.clear(); store = null;
  if (!current.preview) await supabase.auth.signOut({ scope: 'local' });
  login();
}
function closeDialogs() { document.querySelectorAll('dialog[open]').forEach(d => d.close()); render(); }
app.addEventListener('click', async event => {
  const button = event.target.closest('[data-action]'); if (!button) return;
  const action = button.dataset.action;
  try {
    if (action === 'preview') return await enter({ id: 'preview', name: 'Diego' }, true);
    if (action === 'logout') return await signOut();
    if (!store) return;
    if (action === 'new') openEditor();
    if (action === 'edit') openEditor(button.dataset.id);
    if (action === 'close') closeDialogs();
    if (action === 'settings') settings();
    if (action === 'calendar') { view = 'month'; render(); }
    if (action === 'today') { selected = today(); render(); }
    if (action === 'select-day') { selected = button.dataset.day; render(); }
    if (action === 'view') { view = button.dataset.view; render(); }
    if (action === 'clear-filters') { ownerFilter = ''; categoryFilter = ''; render(); }
    if (action === 'next' || action === 'previous') {
      const amount = action === 'next' ? 1 : -1;
      if (view === 'month') { const d = parseDate(selected); d.setDate(1); d.setMonth(d.getMonth() + amount); selected = isoDate(d); }
      else selected = addDays(selected, amount * (view === 'week' ? 7 : 1));
      render();
    }
    if (action === 'duplicate') { const id = editorEvent.id; document.querySelector('#editor').close(); openEditor(id, true); }
    if (action === 'delete' && confirm('Excluir este compromisso e todas as suas repetições?')) {
      await store.save({ ...editorEvent, deleted: true }); closeDialogs(); toast('Compromisso excluído.'); void store.sync();
    }
    if (action === 'sync') { await store.sync(); toast(store.status); closeDialogs(); }
    if (action === 'notifications') { const active = await toggleReminders(store.key); toast(active ? 'Lembretes ativados neste aparelho.' : 'Lembretes desativados.'); dialogRefresh(); }
    if (action === 'install') {
      if (installPrompt) { await installPrompt.prompt(); installPrompt = null; }
      else toast('Use o menu do navegador para adicionar à tela inicial. A instalação requer HTTPS ou localhost.');
    }
    if (action === 'conflict-remote' || action === 'conflict-copy') await store.resolveConflict(action === 'conflict-copy');
    if (action === 'export') {
      const blob = new Blob([JSON.stringify({ exported_at: new Date().toISOString(), events: store.state.events, pending: store.state.queue }, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'agenda-familiar-' + today() + '.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  } catch (error) { toast(error.message || 'Não foi possível concluir. Tente novamente.'); }
});
function dialogRefresh() { document.querySelector('#settings').close(); settings(); }
app.addEventListener('change', event => {
  if (event.target.id === 'owner-filter') { ownerFilter = event.target.value; render(); }
  if (event.target.id === 'category-filter') { categoryFilter = event.target.value; render(); }
  if (event.target.name === 'repeat') document.querySelector('#weekdays').hidden = event.target.value !== 'custom';
  if (event.target.name === 'owner') document.querySelector('[name="color"]').value = OWNERS[event.target.value];
});
app.addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.target; const button = form.querySelector('[type="submit"], button.primary');
  const errorTarget = form.querySelector('.form-error'); errorTarget.textContent = ''; button.disabled = true;
  try {
    const data = new FormData(form);
    if (form.id === 'login-form') {
      const { error } = await supabase.auth.signInWithPassword({ email: data.get('email').trim(), password: data.get('password') });
      if (error) throw new Error('Não foi possível entrar. Confira e-mail, senha e conexão.');
      try { await enter(await getMember()); } catch (error) { await supabase.auth.signOut({ scope: 'local' }); throw error; }
    } else {
      const value = Object.fromEntries(data);
      value.title = value.title.trim(); value.category = value.category.trim();
      value.weekdays = data.getAll('weekdays').map(Number); value.reminder = Number(value.reminder);
      value.repeat_until = value.repeat === 'none' ? null : value.repeat_until || null;
      await store.save({ ...editorEvent, ...value, deleted: false });
      closeDialogs(); toast(store.preview ? 'Salvo na prévia local.' : 'Salvo neste aparelho. Sincronizando…'); void store.sync();
    }
  } catch (error) { errorTarget.textContent = error.message || 'Não foi possível salvar.'; }
  finally { button.disabled = false; }
});
app.addEventListener('cancel', () => setTimeout(render, 0), true);
window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); installPrompt = event; });
window.addEventListener('online', () => store?.sync());
window.addEventListener('offline', () => { if (store && !store.preview) { store.status = 'Offline · salvo neste aparelho'; render(); } });
window.addEventListener('focus', () => store?.sync());
document.addEventListener('visibilitychange', () => { if (!document.hidden) { store?.sync(); checkReminders(store).catch(() => {}); } });
setInterval(() => { store?.sync(); checkReminders(store).catch(() => {}); }, 30000);
if ('serviceWorker' in navigator && import.meta.env.PROD) navigator.serviceWorker.register('/sw.js').catch(() => toast('Não foi possível preparar o modo offline.'));
async function boot() {
  login();
  if (!configured) return;
  const epoch = ++authEpoch;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session || epoch !== authEpoch) return;
    if (!navigator.onLine) {
      const cached = await readAccount(session.user.id);
      if (cached?.member) await enter(cached.member);
      else login('Conecte-se à internet para o primeiro acesso.');
    } else await enter(await getMember());
  } catch (error) { login(error.message); }
}
if (supabase) supabase.auth.onAuthStateChange(event => {
  if (event === 'SIGNED_OUT' && store && !store.preview) {
    const old = store; old.closed = true; store = null; authEpoch++;
    if (channel) { void supabase.removeChannel(channel); channel = null; }
    login('Sessão encerrada. Entre novamente para continuar. Seus dados pendentes permanecem neste aparelho.');
  }
});
boot();

