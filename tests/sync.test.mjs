import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { AgendaStore } from '../src/sync.js';
import { readAccount } from '../src/storage.js';
Object.defineProperty(navigator,'onLine',{value:true,writable:true,configurable:true});
const member = { id:crypto.randomUUID(), name:'Diego' };
const event = { title:'Teste de fila',owner:'Diego',date:'2026-09-20',start_time:'09:00',end_time:'10:00',category:'Pessoal',repeat:'none',weekdays:[],repeat_until:null,notes:'',color:'#668bc1',reminder:-1,deleted:false };
function server() {
  const events = new Map();
  return { events, api: {
    getMember:async () => member,
    fetchEvents:async () => structuredClone([...events.values()]),
    pushOperation:async op => {
      const previous=events.get(op.event.id);
      if(previous?.mutation_id===op.mutation) return previous;
      if((previous?.version || 0)!==op.expected) throw new Error('CONFLICT');
      events.set(op.event.id,structuredClone(op.event)); return op.event;
    }
  }};
}
test('fila offline, reabertura, edições encadeadas e sincronização',async () => {
  const remote=server();
  const store=new AgendaStore(member,false,()=>{},remote.api);
  await store.init();
  navigator.onLine=false;
  await store.save(event);
  await store.save({...store.state.events[0],title:'Editado offline'});
  await store.sync();
  assert.equal(store.state.queue.length,2);
  assert.equal(remote.events.size,0);
  const reloaded=new AgendaStore(member,false,()=>{},remote.api);
  await reloaded.init();
  assert.equal(reloaded.state.events[0].title,'Editado offline');
  navigator.onLine=true;
  await reloaded.sync();
  assert.equal(reloaded.state.queue.length,0);
  assert.equal([...remote.events.values()][0].version,2);
  assert.equal(reloaded.status,'Sincronizado');
  await reloaded.clear();
});
test('resposta perdida repete mutation_id sem duplicar',async () => {
  const remote=server(); let fail=true; const push=remote.api.pushOperation;
  remote.api.pushOperation=async op => { const result=await push(op); if(fail){fail=false;throw new Error('Conexão perdida');}return result; };
  const store=new AgendaStore(member,false,()=>{},remote.api); await store.init();
  await store.save(event); await store.sync();
  assert.equal(store.state.queue.length,1);
  await store.sync();
  assert.equal(store.state.queue.length,0);
  assert.equal(remote.events.size,1);
  assert.equal([...remote.events.values()][0].version,1);
  await store.clear();
});
test('conflito preserva remoto e permite manter cópia local',async () => {
  const remote=server(); const store=new AgendaStore(member,false,()=>{},remote.api); await store.init();
  await store.save(event); await store.sync();
  const original=store.state.events[0];
  remote.events.set(original.id,{...original,title:'Mudança da Daiane',version:2,mutation_id:crypto.randomUUID()});
  await store.save({...original,title:'Mudança offline do Diego'}); await store.sync();
  assert.ok(store.state.conflict);
  assert.equal(remote.events.get(original.id).title,'Mudança da Daiane');
  await store.resolveConflict(true);
  assert.equal(store.state.conflict,null);
  assert.equal(store.state.queue.length,0);
  assert.equal(remote.events.size,2);
  assert.ok([...remote.events.values()].some(e=>e.title.includes('cópia local')));
  await store.clear();
});
test('sem autorização mantém fila e não envia; contas isoladas',async () => {
  const remote=server(); remote.api.getMember=async()=>{throw new Error('Conta revogada');};
  const store=new AgendaStore(member,false,()=>{},remote.api); await store.init();
  await store.save(event); await store.sync();
  assert.equal(remote.events.size,0); assert.equal(store.state.queue.length,1);
  const other=new AgendaStore({id:crypto.randomUUID(),name:'Daiane'},false,()=>{},remote.api); await other.init();
  assert.equal(other.state.events.length,0);
  await store.clear();
  assert.equal(await readAccount(member.id),undefined);
});
test('edição de formulário desatualizado não apaga alteração mais recente',async () => {
  const remote=server(); const store=new AgendaStore(member,false,()=>{},remote.api); await store.init();
  await store.save(event); const old={...store.state.events[0]};
  await store.save({...old,title:'Nova'});
  await assert.rejects(store.save({...old,title:'Antiga'}),/mudou/);
  await store.clear();
});

