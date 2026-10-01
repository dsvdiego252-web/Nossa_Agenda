import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {authorized,validEndpoint,dispatch} from '../server/push.js';
test('dispatcher autentica segredo e rejeita endpoints privados',async()=>{
 assert.equal(authorized(undefined,'x'.repeat(72)),false); assert.equal(authorized('Bearer '+ 'x'.repeat(72),'x'.repeat(72)),true);
 for(const url of ['http://fcm.googleapis.com/x','https://localhost/x','https://fcm.googleapis.com.evil.test/x','https://fcm.googleapis.com:444/x','https://user@fcm.googleapis.com/x']) assert.equal(validEndpoint(url),false);
 assert.equal(validEndpoint('https://fcm.googleapis.com/fcm/send/test'),true);
 const calls=[]; const db={rpc:async(name,args)=>{calls.push([name,args]);return {data:name.includes('claim')?[{id:'1',lease:'lease',subscription:{endpoint:'https://localhost/x'},payload:{}}]:null};}};
 let sends=0; const result=await dispatch(db,'token',async()=>{sends++;}); assert.equal(sends,0);assert.equal(result.failed,1);assert.equal(calls[1][1].p_status,400);
});
test('push SQL: autorização, recorrência, reserva, repetição segura e revogação',async()=>{
 const db=new PGlite();const diego='00000000-0000-0000-0000-000000000001',other='00000000-0000-0000-0000-000000000003';
 try {
 await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth,public to anon,authenticated;insert into auth.users values('${diego}'),('${other}');`);
 await db.exec(await readFile('supabase/schema.sql','utf8'));

 await db.exec(`insert into public.agenda_familiar_members values('${diego}','Diego');`);
 const token=(await db.query('select token from agenda_familiar_private.push_config')).rows[0].token;
 const role=async(id)=>db.exec(`reset role;set role authenticated;select set_config('request.jwt.claim.sub','${id}',false);`);
 await role(other);await assert.rejects(db.query('select public.agenda_familiar_register_push($1,$2,$3)',['https://fcm.googleapis.com/test','A'.repeat(87),'B'.repeat(22)]),/NOT_AUTHORIZED/);
 await role(diego);
 const register=()=>db.query('select public.agenda_familiar_register_push($1,$2,$3) as id',['https://fcm.googleapis.com/test','A'.repeat(87),'B'.repeat(22)]);
 const sub=(await register()).rows[0].id;assert.equal((await register()).rows[0].id,sub);
 await assert.rejects(db.query('select public.agenda_familiar_register_push($1,$2,$3)',['https://localhost/test','A'.repeat(87),'B'.repeat(22)]));
 const when=(await db.query("select to_char((now() at time zone 'America/Sao_Paulo')-interval '2 minutes','YYYY-MM-DD') as date,to_char((now() at time zone 'America/Sao_Paulo')-interval '2 minutes','HH24:MI') as time")).rows[0];
 const event={id:crypto.randomUUID(),title:'Reminder test',owner:'Ambos',date:when.date,start_time:when.time,end_time:'23:59',category:'Teste',repeat:'daily',weekdays:[],repeat_until:null,notes:'',color:'#668bc1',reminder:0,reminders:[0,1440],deleted:false};
 await db.query('select public.agenda_familiar_save_event($1,0,$2)',[event,crypto.randomUUID()]);
 await db.exec("reset role;update public.agenda_familiar_push_subscriptions set created_at=now()-interval '1 day';set role anon;");
 const claim=()=>db.query('select public.agenda_familiar_claim_push($1) as jobs',[token]);
 await assert.rejects(db.query('select public.agenda_familiar_claim_push($1)',['wrong']),/NOT_AUTHORIZED/);
 await assert.rejects(db.query('select * from agenda_familiar_private.push_config'),/permission denied/);
 const jobs=(await claim()).rows[0].jobs;assert.equal(jobs.length,2);assert.deepEqual(jobs.map(j=>Number(j.payload.tag.split(':').at(-1))).sort((a,b)=>a-b),[0,1440]);assert.equal((await claim()).rows[0].jobs.length,0);
 const job=jobs[0];
 await db.query('select public.agenda_familiar_finish_push($1,$2,$3,201)',[token,jobs[1].id,jobs[1].lease]);
 await db.query('select public.agenda_familiar_finish_push($1,$2,$3,503)',[token,job.id,job.lease]);
 await db.exec("reset role;update agenda_familiar_private.push_deliveries set lease_until=now()-interval '1 second';set role anon;");
 const retry=(await claim()).rows[0].jobs[0];assert.ok(retry);assert.notEqual(retry.lease,job.lease);
 await db.query('select public.agenda_familiar_finish_push($1,$2,$3,201)',[token,retry.id,retry.lease]);assert.equal((await claim()).rows[0].jobs.length,0);
 await role(other);assert.equal((await db.query('select * from public.agenda_familiar_push_subscriptions')).rows.length,0);await assert.rejects(db.query('select public.agenda_familiar_test_push($1)',[sub]),/NOT_AUTHORIZED/);
 await role(diego);await db.query('select public.agenda_familiar_test_push($1)',[sub]);await assert.rejects(db.query('select public.agenda_familiar_test_push($1)',[sub]));
 await db.exec("reset role;update public.agenda_familiar_push_subscriptions set test_after=now()-interval '1 second';set role anon;");
 const testJob=(await claim()).rows[0].jobs[0];assert.ok(testJob.payload.tag.startsWith('test:'));
 await db.query('select public.agenda_familiar_finish_push($1,$2,$3,410)',[token,testJob.id,testJob.lease]);
 await role(diego);assert.equal((await db.query('select * from public.agenda_familiar_push_subscriptions')).rows.length,0);
 }finally{await db.close();}
});

