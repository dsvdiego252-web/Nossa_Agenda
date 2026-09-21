import { readAccount, writeAccount } from './storage.js';
import { getMember, fetchEvents, pushOperation } from './backend.js';
import { validateEvent } from './dates.js';
export class AgendaStore {
  constructor(member, preview, notify, backend = { getMember, fetchEvents, pushOperation }) {
    this.backend = backend; this.member = member; this.preview = preview; this.notify = notify;
    this.key = preview ? 'preview' : member.id; this.state = { member, events: [], queue: [], conflict: null };
    this.busy = false; this.closed = false; this.status = preview ? 'Prévia local' : 'Conectando';
  }
  async locked(fn) {
    if (!navigator.locks) throw new Error('Use uma versão atual do Chrome, Edge ou Safari para salvar com segurança.');
    return navigator.locks.request(`agenda:${this.key}`, async () => {
      if (this.closed) return;
      this.state = await readAccount(this.key) || this.state;
      return fn();
    });
  }
  async init() { await this.locked(async () => {}); this.notify(); }
  async persist() { await writeAccount(this.key, this.state); if (!this.closed) this.notify(); }
  async save(raw) {
    return this.locked(async () => {
      const event = validateEvent({ ...raw });
      const existing = this.state.events.find(e => e.id === event.id);
      if (this.state.conflict && this.state.conflict.event.id === event.id) throw new Error('Resolva o conflito deste compromisso primeiro.');
      if (existing && raw.version !== existing.version) throw new Error('Este compromisso mudou. Feche e abra novamente para editar.');
      const expected = existing?.version ?? 0;
      event.version = expected + 1;
      event.id ||= crypto.randomUUID();
      event.mutation_id = crypto.randomUUID();
      const next = structuredClone(this.state);
      next.events = [...next.events.filter(e => e.id !== event.id), event];
      if (!this.preview) next.queue.push({ event, expected, mutation: event.mutation_id });
      await writeAccount(this.key, next); this.state = next; this.notify();
    });
  }
  async sync() {
    if (this.preview || this.busy || this.closed) return;
    if (!navigator.onLine) { this.status = 'Offline · salvo neste aparelho'; this.notify(); return; }
    this.busy = true;
    try {
      await this.locked(async () => {
        this.status = 'Sincronizando'; this.notify();
        const member = await this.backend.getMember();
        if (member.id !== this.member.id || this.closed) throw new Error('Entre novamente para sincronizar.');
        if (!this.state.conflict) {
          while (this.state.queue.length && !this.closed) {
            const op = this.state.queue[0];
            try {
              await this.backend.pushOperation(op);
              this.state.queue.shift();
              await this.persist();
            } catch (error) {
              if (error.message?.includes('CONFLICT')) { this.state.conflict = op; await this.persist(); break; }
              throw error;
            }
          }
        }
        if (this.closed) return;
        const remote = await this.backend.fetchEvents();
        // A fila local prevalece apenas na visualização; nunca sobrepõe uma versão remota silenciosamente.
        const pending = new Set(this.state.queue.map(op => op.event.id));
        this.state.events = [...remote.filter(e => !pending.has(e.id)), ...this.state.events.filter(e => pending.has(e.id))];
        this.state.member = member;
        this.status = this.state.conflict ? 'Conflito · escolha uma versão' : 'Sincronizado';
        await this.persist();
      });
    } catch (error) {
      this.status = navigator.onLine ? `Sincronização pendente: ${error.message || 'tente novamente'}` : 'Offline · salvo neste aparelho';
    } finally { this.busy = false; if (!this.closed) this.notify(); }
  }
  async resolveConflict(copy) {
    await this.locked(async () => {
      const conflict = this.state.conflict;
      if (!conflict) return;
      const local = this.state.events.find(e => e.id === conflict.event.id);
      this.state.queue = this.state.queue.filter(op => op.event.id !== conflict.event.id);
      this.state.events = this.state.events.filter(e => e.id !== conflict.event.id);
      if (copy && local && !local.deleted) {
        const event = { ...local, id: crypto.randomUUID(), title: `${local.title.slice(0, 104)} (cópia local)`, version: 1, mutation_id: crypto.randomUUID() };
        this.state.events.push(event);
        this.state.queue.push({ event, expected: 0, mutation: event.mutation_id });
      }
      this.state.conflict = null; await this.persist();
    });
    await this.sync();
  }
  async clear() { await this.locked(() => writeAccount(this.key, null)); this.closed = true; }
}
