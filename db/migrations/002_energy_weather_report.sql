drop materialized view if exists energy_weather_report;

create materialized view energy_weather_report as
with ordered as (
  select
    mr.unit_id,
    (mr.captured_at at time zone 'America/Vancouver')::date as reading_day,
    mr.reading_value,
    lag((mr.captured_at at time zone 'America/Vancouver')::date) over (
      partition by mr.unit_id
      order by mr.captured_at
    ) as prev_day,
    lag(mr.reading_value) over (
      partition by mr.unit_id
      order by mr.captured_at
    ) as prev_value
  from meter_reading mr
  where mr.parse_status = 'approved'
),
intervals as (
  select
    unit_id,
    prev_day,
    reading_day,
    (reading_value - prev_value) as total_delta,
    greatest((reading_day - prev_day), 1) as days_between
  from ordered
  where prev_day is not null
),
daily as (
  select
    i.unit_id,
    gs::date as day,
    (i.total_delta / i.days_between::numeric(12,3))::numeric(12,3) as consumption_delta
  from intervals i
  cross join lateral generate_series(i.prev_day + 1, i.reading_day, interval '1 day') gs
)
select
  d.unit_id,
  d.day,
  d.consumption_delta,
  wd.temp_avg_c,
  wd.hdd,
  wd.cdd,
  wd.precipitation_mm
from daily d
left join weather_daily wd
  on wd.weather_date = d.day;
