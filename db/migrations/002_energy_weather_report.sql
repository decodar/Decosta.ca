drop materialized view if exists energy_weather_report;

create materialized view energy_weather_report as
with meter_ordered as (
  select
    mr.unit_id,
    mr.utility_type,
    mr.reading_unit as usage_unit,
    (mr.captured_at at time zone 'America/Vancouver')::date as reading_day,
    mr.reading_value,
    lag((mr.captured_at at time zone 'America/Vancouver')::date) over (
      partition by mr.unit_id, mr.utility_type
      order by mr.captured_at
    ) as prev_day,
    lag(mr.reading_value) over (
      partition by mr.unit_id, mr.utility_type
      order by mr.captured_at
    ) as prev_value
  from meter_reading mr
  where mr.parse_status = 'approved'
    and coalesce(mr.entry_type, 'meter_read') = 'meter_read'
),
meter_intervals as (
  select
    unit_id,
    utility_type,
    usage_unit,
    prev_day,
    reading_day,
    (reading_value - prev_value) as total_delta,
    greatest((reading_day - prev_day), 1) as days_between
  from meter_ordered
  where prev_day is not null
),
meter_daily as (
  select
    i.unit_id,
    i.utility_type,
    i.usage_unit,
    gs::date as day,
    (i.total_delta / i.days_between::numeric(12,3))::numeric(12,3) as usage_value
  from meter_intervals i
  cross join lateral generate_series(i.prev_day + 1, i.reading_day, interval '1 day') gs
),
billed_periods as (
  select
    mr.unit_id,
    mr.utility_type,
    mr.reading_unit as usage_unit,
    mr.period_start,
    mr.period_end,
    mr.reading_value,
    greatest((mr.period_end - mr.period_start + 1), 1) as days_between
  from meter_reading mr
  where mr.parse_status = 'approved'
    and coalesce(mr.entry_type, 'meter_read') = 'billed_usage'
    and mr.period_start is not null
    and mr.period_end is not null
    and mr.period_end >= mr.period_start
),
billed_daily as (
  select
    b.unit_id,
    b.utility_type,
    b.usage_unit,
    gs::date as day,
    (b.reading_value / b.days_between::numeric(12,3))::numeric(12,3) as usage_value
  from billed_periods b
  cross join lateral generate_series(b.period_start, b.period_end, interval '1 day') gs
),
daily as (
  select * from meter_daily
  union all
  select * from billed_daily
)
select
  d.unit_id,
  d.utility_type,
  d.usage_unit,
  d.day,
  d.usage_value as consumption_delta,
  wd.temp_avg_c,
  wd.hdd,
  wd.cdd,
  wd.precipitation_mm
from daily d
left join weather_daily wd
  on wd.weather_date = d.day;
