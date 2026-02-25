export type MeterIdentifierMapping = {
  unitName: string;
  utilityType: "electricity" | "gas" | "water";
  readingUnitDefault: string;
  label: string;
};

const METER_IDENTIFIER_MAP: Record<string, MeterIdentifierMapping> = {
  "345185639": {
    unitName: "House",
    utilityType: "electricity",
    readingUnitDefault: "kWh",
    label: "House electricity meter"
  },
  "345185645": {
    unitName: "Coach",
    utilityType: "electricity",
    readingUnitDefault: "kWh",
    label: "Coach electricity meter"
  },
  "348819731": {
    unitName: "Suite",
    utilityType: "electricity",
    readingUnitDefault: "kWh",
    label: "Suite electricity meter"
  }
};

export function normalizeMeterIdentifier(value: string) {
  return value.replace(/\D/g, "");
}

export function lookupMeterIdentifier(value: string) {
  return METER_IDENTIFIER_MAP[normalizeMeterIdentifier(value)] ?? null;
}
