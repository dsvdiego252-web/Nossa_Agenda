import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
const diego = '00000000-0000-0000-0000-000000000001';
const daiane = '00000000-0000-0000-0000-000000000002';
const outsider = '00000000-0000-0000-0000-000000000003';
test('SQL executável: dois membros, RLS, CAS, idempotência e exclusão', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated;
      create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema auth, public to authenticated, anon;
      grant execute on function auth.uid() to authenticated, anon;
      insert into auth.users values ('${diego}'),('${daiane}'),('${outsider}');`);
    await db.exec(await readFile('supabase/schema.sql','utf8'));
    await db.exec(`insert into public.members values ('${diego}','Diego'),('${daiane}','Daiane');`);
    await assert.rejects(db.exec(`insert into public.members values ('${outsider}','Visitante')`));
    await assert.rejects(db.exec(`insert into public.members values ('${outsider}','Diego')`));
    async function as(id) { await db.exec(`reset role; set role authenticated; select set_config('request.jwt.claim.sub','${id}',false);`); }
    const event = {id:crypto.randomUUID(), title:'Teste SQL',owner:'Ambos',date:'2026-09-20',start_time:'09:00',end_time:'10:00',category:'Teste',repeat:'weekly',weekdays:[],repeat_until:null,notes:'',color:'#668bc1',reminder:10,deleted:false};
    const mutation = crypto.randomUUID();
    const save = (e,version,op=crypto.randomUUID()) => db.query('select public.save_event($1::jsonb,$2::int,$3::uuid) as event',[JSON.stringify(e),version,op]);
    await as(diego);
    const first = await save(event,0,mutation);
    assert.equal(first.rows[0].event.version,1);
    assert.equal((await save(event,0,mutation)).rows[0].event.version,1);
    await as(daiane);
    assert.equal((await db.query('select * from public.events')).rows.length,1);
    assert.equal((await save({...event,title:'Editado'},1)).rows[0].event.version,2);
    await as(diego);
    await assert.rejects(save({...event,title:'Versão antiga'},1), /CONFLICT/);
    assert.equal((await db.query('select title from public.events')).rows[0].title,'Editado');
    await assert.rejects(save({...event,end_time:'08:00'},2));
    await save({...event,deleted:true},2);
    assert.equal((await db.query('select deleted from public.events')).rows[0].deleted,true);
    await assert.rejects(db.exec('delete from public.events'),/permission denied/);
    await as(outsider);
    assert.equal((await db.query('select * from public.events')).rows.length,0);
    await assert.rejects(save({...event,id:crypto.randomUUID()},0),/NOT_AUTHORIZED/);
    await assert.rejects(db.exec(`insert into public.members values ('${outsider}','Diego')`),/permission denied/);
    await db.exec('reset role; set role anon');
    await assert.rejects(db.query('select * from public.events'),/permission denied/);
    await assert.rejects(save(event,0),/permission denied/);
    await db.exec(`reset role; delete from public.members where id='${diego}'`);
    await as(diego);
    assert.equal((await db.query('select * from public.events')).rows.length,0);
    await assert.rejects(save(event,3),/NOT_AUTHORIZED/);
  } finally { await db.close(); }
});

