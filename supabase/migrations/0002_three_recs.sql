-- "ถ้าชอบเรื่องนี้" shows 3 cards per title now (pipeline/pick-recs.ts).
alter table public.recommendations drop constraint recommendations_position_check;
alter table public.recommendations add constraint recommendations_position_check
  check (position between 1 and 3);
