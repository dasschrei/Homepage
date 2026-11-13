-- Web-Reservierungen ohne Kreditkarte: alle 5 Minuten aufräumen.
-- VORHER: in Supabase → Edge Functions → Secrets den Eintrag WEB_RES_CRON_KEY anlegen
-- (beliebiges langes Geheimwort) und unten bei DEIN-GEHEIMWORT dasselbe eintragen.

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('web-res-aufraeumen') where exists (select 1 from cron.job where jobname = 'web-res-aufraeumen');

select cron.schedule(
  'web-res-aufraeumen',
  '*/5 * * * *',
  $$
  select net.http_post(
    url     := 'https://bkzcvyvztjpmlbwnvnct.supabase.co/functions/v1/web-reservierung',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-key', 'DEIN-GEHEIMWORT'),
    body    := jsonb_build_object('action', 'aufraeumen')
  );
  $$
);

-- Kontrolle: Zeitplan vorhanden?
select jobname, schedule, active from cron.job where jobname = 'web-res-aufraeumen';
