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
