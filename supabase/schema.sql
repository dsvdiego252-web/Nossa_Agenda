-- Execute uma vez no projeto Supabase escolhido (recursos exclusivos da agenda). Não inclui usuários nem eventos.
begin;
create table public.agenda_familiar_members (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null unique check (name in ('Diego', 'Daiane'))
);
alter table public.agenda_familiar_members enable row level security;
revoke all on public.agenda_familiar_members from anon, authenticated;
grant select on public.agenda_familiar_members to authenticated;
create policy own_membership on public.agenda_familiar_members for select to authenticated using (id = (select auth.uid()));

create table public.agenda_familiar_events (
  id uuid primary key,
  title text not null check (length(trim(title)) between 1 and 120),
  owner text not null check (owner in ('Diego', 'Daiane', 'Ambos', 'Família')),
  date date not null,
  start_time time not null,
  end_time time not null check (end_time > start_time),
  category text not null check (length(trim(category)) between 1 and 40),
  repeat text not null default 'none' check (repeat in ('none', 'daily', 'weekly', 'monthly', 'custom')),
  weekdays integer[] not null default '{}' check (weekdays <@ array[0,1,2,3,4,5,6]),
  repeat_until date check (repeat_until >= date),
  notes text not null default '' check (length(notes) <= 4000),
  color text not null check (color ~ '^#[0-9a-fA-F]{6}$'),
  reminder integer not null default -1 check (reminder in (-1,0,10,30,60,1440)),
  deleted boolean not null default false,
  version integer not null default 1 check (version > 0),
  mutation_id uuid not null,
  created_by uuid not null default auth.uid() references auth.users(id),
  updated_at timestamptz not null default now(),
  check (repeat <> 'custom' or cardinality(weekdays) > 0)
);
create index agenda_familiar_events_date_idx on public.agenda_familiar_events(date) where not deleted;
alter table public.agenda_familiar_events enable row level security;
revoke all on public.agenda_familiar_events from anon, authenticated;
grant select, insert, update on public.agenda_familiar_events to authenticated;
create policy members_read on public.agenda_familiar_events for select to authenticated
  using (exists(select 1 from public.agenda_familiar_members where id = (select auth.uid())));
create policy members_insert on public.agenda_familiar_events for insert to authenticated
  with check (created_by = (select auth.uid()) and exists(select 1 from public.agenda_familiar_members where id = (select auth.uid())));
create policy members_update on public.agenda_familiar_events for update to authenticated
  using (exists(select 1 from public.agenda_familiar_members where id = (select auth.uid())))
  with check (exists(select 1 from public.agenda_familiar_members where id = (select auth.uid())));

create function public.agenda_familiar_event_audit() returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if TG_OP = 'UPDATE' then
    new.created_by := old.created_by;
    new.version := old.version + 1;
  else
    new.created_by := auth.uid();
    new.version := 1;
  end if;
  new.updated_at := now();
  return new;
end $$;
revoke all on function public.agenda_familiar_event_audit() from public, anon, authenticated;
create trigger event_audit before insert or update on public.agenda_familiar_events for each row execute function public.agenda_familiar_event_audit();

-- Compare-and-swap: a versão esperada evita perda silenciosa de alterações.
-- mutation_id permite repetir uma requisição cuja resposta se perdeu.
create function public.agenda_familiar_save_event(p_event jsonb, p_expected_version integer, p_mutation uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare existing public.agenda_familiar_events; result public.agenda_familiar_events; incoming public.agenda_familiar_events;
begin
  if auth.uid() is null or not exists(select 1 from public.agenda_familiar_members where id = auth.uid()) then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;
  if p_mutation is null or p_expected_version is null or p_expected_version < 0 then
    raise exception 'INVALID_OPERATION';
  end if;
  incoming := jsonb_populate_record(null::public.agenda_familiar_events, p_event);
  -- Serializa inclusive duas criações simultâneas do mesmo UUID.
  perform pg_advisory_xact_lock(hashtextextended(incoming.id::text, 0));
  select * into existing from public.agenda_familiar_events where id = incoming.id for update;
  if found then
    if existing.mutation_id = p_mutation then return to_jsonb(existing); end if;
    if existing.version <> p_expected_version then raise exception 'CONFLICT'; end if;
    update public.agenda_familiar_events set
      title = incoming.title, owner = incoming.owner, date = incoming.date,
      start_time = incoming.start_time, end_time = incoming.end_time,
      category = incoming.category, repeat = incoming.repeat, weekdays = incoming.weekdays,
      repeat_until = incoming.repeat_until, notes = incoming.notes, color = incoming.color,
      reminder = incoming.reminder, deleted = incoming.deleted, mutation_id = p_mutation
      where id = incoming.id returning * into result;
  else
    if p_expected_version <> 0 then raise exception 'CONFLICT'; end if;
    insert into public.agenda_familiar_events(id,title,owner,date,start_time,end_time,category,repeat,weekdays,repeat_until,notes,color,reminder,deleted,mutation_id)
    values(incoming.id,incoming.title,incoming.owner,incoming.date,incoming.start_time,incoming.end_time,incoming.category,
      incoming.repeat,incoming.weekdays,incoming.repeat_until,incoming.notes,incoming.color,incoming.reminder,incoming.deleted,p_mutation)
    returning * into result;
  end if;
  return to_jsonb(result);
end $$;
revoke all on function public.agenda_familiar_save_event(jsonb, integer, uuid) from public, anon;
grant execute on function public.agenda_familiar_save_event(jsonb, integer, uuid) to authenticated;

-- Exclusão lógica permite propagar exclusões para aparelhos offline.
-- Não remover tombstones sem uma política de retenção e revalidação.
do $$
begin
  if exists(select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.agenda_familiar_events;
  end if;
end $$;
commit;


-- Web Push: estrutura completa para instalações novas.
-- Apply once to an existing agenda installation. No existing events are changed.
begin;
create schema agenda_familiar_private;
revoke all on schema agenda_familiar_private from public, anon, authenticated;
create table agenda_familiar_private.push_config (
  singleton boolean primary key default true check(singleton),
  token text not null default (gen_random_uuid()::text || gen_random_uuid()::text)
);
insert into agenda_familiar_private.push_config default values;
alter table agenda_familiar_private.push_config enable row level security;
revoke all on agenda_familiar_private.push_config from public, anon, authenticated;

create table public.agenda_familiar_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.agenda_familiar_members(id) on delete cascade,
  endpoint text not null unique check(length(endpoint) < 2048 and endpoint ~ '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-zA-Z0-9-]+\.notify\.windows\.com)/'),
  p256dh text not null check(length(p256dh) between 80 and 100),
  auth text not null check(length(auth) between 20 and 30),
  created_at timestamptz not null default now(),
  test_after timestamptz,
  last_test timestamptz
);
alter table public.agenda_familiar_push_subscriptions enable row level security;
revoke all on public.agenda_familiar_push_subscriptions from public, anon, authenticated;
grant select, delete on public.agenda_familiar_push_subscriptions to authenticated;
create policy own_push on public.agenda_familiar_push_subscriptions for all to authenticated
using(user_id=(select auth.uid()) and exists(select 1 from public.agenda_familiar_members where id=(select auth.uid())))
with check(user_id=(select auth.uid()) and exists(select 1 from public.agenda_familiar_members where id=(select auth.uid())));

create table agenda_familiar_private.push_deliveries (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.agenda_familiar_push_subscriptions(id) on delete cascade,
  tag text not null,
  event_id uuid references public.agenda_familiar_events(id) on delete cascade,
  event_version integer,
  due_at timestamptz not null,
  payload jsonb not null,
  lease_until timestamptz,
  lease_token uuid,
  attempts integer not null default 0,
  sent_at timestamptz,
  last_status integer,
  unique(subscription_id,tag)
);
revoke all on agenda_familiar_private.push_deliveries from public,anon,authenticated;
alter table agenda_familiar_private.push_deliveries enable row level security;

create function public.agenda_familiar_register_push(p_endpoint text,p_p256dh text,p_auth text)
returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
 if auth.uid() is null or not exists(select 1 from public.agenda_familiar_members where id=auth.uid()) then raise exception 'NOT_AUTHORIZED' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,42));
 if (select count(*) from public.agenda_familiar_push_subscriptions where user_id=auth.uid()) >= 10 and not exists(select 1 from public.agenda_familiar_push_subscriptions where endpoint=p_endpoint and user_id=auth.uid()) then raise exception 'Limite de 10 aparelhos. Remova aparelhos antigos.'; end if;
 insert into public.agenda_familiar_push_subscriptions(user_id,endpoint,p256dh,auth) values(auth.uid(),p_endpoint,p_p256dh,p_auth)
 on conflict(endpoint) do update set p256dh=excluded.p256dh,auth=excluded.auth
 where agenda_familiar_push_subscriptions.user_id=auth.uid() returning id into result;
 if result is null then raise exception 'Este aparelho pertence a outra conta. Desative os lembretes nela primeiro.'; end if;
 return result;
end $$;
revoke all on function public.agenda_familiar_register_push(text,text,text) from public,anon;
grant execute on function public.agenda_familiar_register_push(text,text,text) to authenticated;

create function public.agenda_familiar_test_push(p_subscription uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not exists(select 1 from public.agenda_familiar_members where id=auth.uid()) then raise exception 'NOT_AUTHORIZED' using errcode='42501'; end if;
 update public.agenda_familiar_push_subscriptions set test_after=now()+interval '30 seconds',last_test=now()
 where id=p_subscription and user_id=auth.uid() and (last_test is null or last_test < now()-interval '1 minute');
 if not found then raise exception 'Ative os lembretes neste aparelho ou aguarde um minuto entre testes.'; end if;
end $$;
revoke all on function public.agenda_familiar_test_push(uuid) from public,anon;
grant execute on function public.agenda_familiar_test_push(uuid) to authenticated;

create function agenda_familiar_private.check_push_token(p_token text) returns void language plpgsql set search_path='' as $$
begin
 if p_token is null or length(p_token)<64 or not exists(select 1 from agenda_familiar_private.push_config where token=p_token) then raise exception 'NOT_AUTHORIZED' using errcode='42501'; end if;
end $$;
revoke all on function agenda_familiar_private.check_push_token(text) from public,anon,authenticated;

create function public.agenda_familiar_claim_push(p_token text) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 perform agenda_familiar_private.check_push_token(p_token);
 if not pg_try_advisory_xact_lock(281092826) then return '[]'::jsonb; end if;
 -- Only a 10 minute recovery window; never send an old backlog after an outage.
 insert into agenda_familiar_private.push_deliveries(subscription_id,tag,event_id,event_version,due_at,payload)
 select s.id,e.id::text||':'||d.day::date::text||':'||e.version||':'||e.reminder,e.id,e.version,t.due,
 jsonb_build_object('title',e.title,'body',to_char(e.start_time,'HH24:MI')||' · '||e.owner,'tag',e.id::text||':'||d.day::date::text||':'||e.version||':'||e.reminder)
 from public.agenda_familiar_events e
 cross join generate_series(((now() at time zone 'America/Sao_Paulo')::date-1)::timestamp,((now() at time zone 'America/Sao_Paulo')::date+2)::timestamp,interval '1 day') d(day)
 cross join public.agenda_familiar_push_subscriptions s
 join public.agenda_familiar_members m on m.id=s.user_id
 cross join lateral (select ((d.day::date+e.start_time) at time zone 'America/Sao_Paulo')-make_interval(mins=>e.reminder) as due) t
 where not e.deleted and e.reminder>=0 and d.day::date>=e.date and (e.repeat_until is null or d.day::date<=e.repeat_until)
 and (e.repeat='daily' or (e.repeat='none' and d.day::date=e.date) or (e.repeat='weekly' and (d.day::date-e.date)%7=0) or (e.repeat='monthly' and extract(day from d.day)=extract(day from e.date)) or (e.repeat='custom' and extract(dow from d.day)::integer=any(e.weekdays)))
 and t.due<=now() and t.due>now()-interval '10 minutes' and t.due>=s.created_at
 on conflict(subscription_id,tag) do nothing;
 insert into agenda_familiar_private.push_deliveries(subscription_id,tag,due_at,payload)
 select id,'test:'||test_after::text,test_after,jsonb_build_object('title','Agenda Familiar','body','Teste recebido! Os lembretes podem chegar com a agenda fechada.','tag','test:'||test_after::text)
 from public.agenda_familiar_push_subscriptions where test_after<=now() and test_after>now()-interval '10 minutes'
 on conflict(subscription_id,tag) do nothing;
 with selected as (
 select d.id from agenda_familiar_private.push_deliveries d join public.agenda_familiar_push_subscriptions s on s.id=d.subscription_id join public.agenda_familiar_members m on m.id=s.user_id
 left join public.agenda_familiar_events e on e.id=d.event_id
 where d.sent_at is null and d.attempts<5 and d.due_at<=now() and d.due_at>now()-interval '10 minutes' and (d.lease_until is null or d.lease_until<now())
 and (d.event_id is null or (not e.deleted and e.version=d.event_version))
 order by d.due_at limit 50 for update of d skip locked
 ), claimed as (
 update agenda_familiar_private.push_deliveries d set lease_until=now()+interval '90 seconds',lease_token=gen_random_uuid(),attempts=d.attempts+1 from selected where d.id=selected.id returning d.*
 )
 select coalesce(jsonb_agg(jsonb_build_object('id',d.id,'lease',d.lease_token,'payload',d.payload,'subscription',jsonb_build_object('endpoint',s.endpoint,'keys',jsonb_build_object('p256dh',s.p256dh,'auth',s.auth)))),'[]'::jsonb) into result
 from claimed d join public.agenda_familiar_push_subscriptions s on s.id=d.subscription_id;
 delete from agenda_familiar_private.push_deliveries where due_at<now()-interval '7 days';
 return result;
end $$;
revoke all on function public.agenda_familiar_claim_push(text) from public,authenticated;
grant execute on function public.agenda_familiar_claim_push(text) to anon;

create function public.agenda_familiar_finish_push(p_token text,p_id uuid,p_lease uuid,p_status integer) returns void language plpgsql security definer set search_path='' as $$
begin
 perform agenda_familiar_private.check_push_token(p_token);
 if p_status in (404,410) then
 delete from public.agenda_familiar_push_subscriptions where id in(select subscription_id from agenda_familiar_private.push_deliveries where id=p_id and lease_token=p_lease and sent_at is null);
 else
 update agenda_familiar_private.push_deliveries set sent_at=case when p_status between 200 and 299 then now() else null end,last_status=p_status,lease_until=now()+interval '1 minute'
 where id=p_id and lease_token=p_lease and sent_at is null;
 end if;
end $$;
revoke all on function public.agenda_familiar_finish_push(text,uuid,uuid,integer) from public,authenticated;
grant execute on function public.agenda_familiar_finish_push(text,uuid,uuid,integer) to anon;
commit;


-- Atualização da agenda com Web Push já instalado. Preserva eventos e inscrições.
begin;
alter table public.agenda_familiar_events add column reminders integer[]
 check (reminders is null or (reminders <@ array[0,10,30,60,1440] and cardinality(reminders)<=5 and array_position(reminders,null) is null));
create or replace function public.agenda_familiar_save_event(p_event jsonb, p_expected_version integer, p_mutation uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare existing public.agenda_familiar_events; result public.agenda_familiar_events; incoming public.agenda_familiar_events;
begin
  if auth.uid() is null or not exists(select 1 from public.agenda_familiar_members where id = auth.uid()) then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;
  if p_mutation is null or p_expected_version is null or p_expected_version < 0 then
    raise exception 'INVALID_OPERATION';
  end if;
  incoming := jsonb_populate_record(null::public.agenda_familiar_events, p_event);
  -- Serializa inclusive duas criações simultâneas do mesmo UUID.
  perform pg_advisory_xact_lock(hashtextextended(incoming.id::text, 0));
  select * into existing from public.agenda_familiar_events where id = incoming.id for update;
  if found then
    if existing.mutation_id = p_mutation then return to_jsonb(existing); end if;
    if existing.version <> p_expected_version then raise exception 'CONFLICT'; end if;
    update public.agenda_familiar_events set
      title = incoming.title, owner = incoming.owner, date = incoming.date,
      start_time = incoming.start_time, end_time = incoming.end_time,
      category = incoming.category, repeat = incoming.repeat, weekdays = incoming.weekdays,
      repeat_until = incoming.repeat_until, notes = incoming.notes, color = incoming.color,
      reminder = incoming.reminder, reminders = case when p_event ? 'reminders' then incoming.reminders when incoming.reminder = existing.reminder then existing.reminders else null end, deleted = incoming.deleted, mutation_id = p_mutation
      where id = incoming.id returning * into result;
  else
    if p_expected_version <> 0 then raise exception 'CONFLICT'; end if;
    insert into public.agenda_familiar_events(id,title,owner,date,start_time,end_time,category,repeat,weekdays,repeat_until,notes,color,reminder,reminders,deleted,mutation_id)
    values(incoming.id,incoming.title,incoming.owner,incoming.date,incoming.start_time,incoming.end_time,incoming.category,
      incoming.repeat,incoming.weekdays,incoming.repeat_until,incoming.notes,incoming.color,incoming.reminder,incoming.reminders,incoming.deleted,p_mutation)
    returning * into result;
  end if;
  return to_jsonb(result);
end $$;

do $migration$
declare definition text;
begin
 definition := pg_get_functiondef('public.agenda_familiar_claim_push(text)'::regprocedure);
 definition := replace(definition,'e.reminder','r.minutes');
 definition := regexp_replace(definition,'cross\s+join\s+lateral\s*\(select',
 'cross join lateral (select distinct unnest(coalesce(e.reminders,case when e.reminder>=0 then array[e.reminder] else array[]::integer[] end)) as minutes) r cross join lateral (select','i');
 if position('unnest(coalesce(e.reminders' in definition)=0 then raise exception 'Formato da função claim_push inesperado'; end if;
 execute definition;
end $migration$;
commit;

-- Amplia antecedências sem alterar compromissos existentes.
begin;
alter table public.agenda_familiar_events drop constraint agenda_familiar_events_reminder_check;
alter table public.agenda_familiar_events add constraint agenda_familiar_events_reminder_check check (reminder in (-1,0,10,30,60,1440,2880,10080));
alter table public.agenda_familiar_events drop constraint agenda_familiar_events_reminders_check;
alter table public.agenda_familiar_events add constraint agenda_familiar_events_reminders_check check (reminders is null or (reminders <@ array[0,10,30,60,1440,2880,10080] and cardinality(reminders)<=7 and array_position(reminders,null) is null));
do $migration$
declare definition text; updated text;
begin
 definition := pg_get_functiondef('public.agenda_familiar_claim_push(text)'::regprocedure);
 updated := regexp_replace(definition,'::date\s*\+\s*2','::date+8','g');
 if updated=definition then raise exception 'Janela do agendador não encontrada'; end if;
 execute updated;
end $migration$;
commit;
