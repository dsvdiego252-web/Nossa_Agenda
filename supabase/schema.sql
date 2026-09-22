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

