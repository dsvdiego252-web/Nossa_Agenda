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
