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
