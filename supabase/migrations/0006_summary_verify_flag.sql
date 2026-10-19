-- Verification is the most expensive step of a summary run, so it can be switched off per job.
alter table summary_jobs add column if not exists verify boolean not null default true;
