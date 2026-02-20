create materialized view if not exists energy_weather_report as
select
  mr.unit_id,
  date_trunc('day', mr.captured_at)::date as day,
  max(mr.reading_value) - min(mr.reading_value) as consumption_delta,
  wd.temp_avg_c,
  wd.hdd,
  wd.cdd,
  wd.precipitation_mm
from meter_reading mr
left join weather_daily wd
  on wd.weather_date = date(mr.captured_at)
where mr.parse_status = 'approved'
group by mr.unit_id, date_trunc('day', mr.captured_at)::date, wd.temp_avg_c, wd.hdd, wd.cdd, wd.precipitation_mm;
