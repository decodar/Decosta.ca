create table if not exists utility_bill_charge (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references rental_unit(id) on delete cascade,
  utility_type text not null check (utility_type in ('electricity', 'gas', 'water')),
  bill_id text,
  period_start date,
  period_end date,
  total_charges_cad numeric(12,2) not null check (total_charges_cad >= 0),
  currency text not null default 'CAD',
  confidence numeric(5,4),
  source text not null default 'bill_pdf_ai',
  raw_evidence text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists utility_bill_charge_unit_utility_period_idx
  on utility_bill_charge(unit_id, utility_type, period_end desc, period_start desc);

create unique index if not exists utility_bill_charge_dedupe_idx
  on utility_bill_charge(
    unit_id,
    utility_type,
    coalesce(bill_id, ''),
    coalesce(period_start, date '1900-01-01'),
    coalesce(period_end, date '1900-01-01')
  );
