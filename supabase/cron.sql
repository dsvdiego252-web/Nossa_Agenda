-- Execute depois de configurar as variáveis e publicar a API na Vercel.
-- Troque somente o domínio se sua publicação usar outro endereço.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
select cron.schedule('agenda-familiar-push', '* * * * *', $cron$
  select net.http_post(
    url := 'https://nossa-agenda-one.vercel.app/api/push-dispatch',
    headers := jsonb_build_object('Content-Type','application/json','Authorization',
      'Bearer ' || (select token from agenda_familiar_private.push_config)),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
$cron$);
-- Reexecutar atualiza o mesmo agendamento. Para pausar:
-- select cron.unschedule('agenda-familiar-push');
