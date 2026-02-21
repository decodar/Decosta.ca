alter table meter_reading
  add column if not exists bill_id text,
  add column if not exists is_opening boolean;

create index if not exists meter_reading_bill_id_idx
  on meter_reading(bill_id);

