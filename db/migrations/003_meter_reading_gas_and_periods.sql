alter table meter_reading
  add column if not exists utility_type text,
  add column if not exists entry_type text,
  add column if not exists period_start date,
  add column if not exists period_end date;

update meter_reading mr
set utility_type = coalesce(mr.utility_type, ru.meter_type, 'electricity')
from rental_unit ru
where ru.id = mr.unit_id;

update meter_reading
set entry_type = coalesce(entry_type, 'meter_read');

alter table meter_reading
  alter column utility_type set default 'electricity',
  alter column entry_type set default 'meter_read';

alter table meter_reading
  add constraint meter_reading_utility_type_chk
    check (utility_type in ('electricity', 'gas', 'water'))
    not valid;

alter table meter_reading
  add constraint meter_reading_entry_type_chk
    check (entry_type in ('meter_read', 'billed_usage'))
    not valid;

alter table meter_reading validate constraint meter_reading_utility_type_chk;
alter table meter_reading validate constraint meter_reading_entry_type_chk;

create index if not exists meter_reading_utility_type_idx
  on meter_reading(utility_type, captured_at desc);

