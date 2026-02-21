const UNIT_UTILITY_POLICY: Record<string, Array<"electricity" | "gas" | "water">> = {
  coach: ["electricity"],
  suite: ["electricity"],
  house: ["electricity", "gas"]
};

const DEFAULT_ALLOWED: Array<"electricity" | "gas" | "water"> = ["electricity", "gas", "water"];

export function getAllowedUtilitiesForUnitName(unitName: string) {
  const key = unitName.trim().toLowerCase();
  return UNIT_UTILITY_POLICY[key] ?? DEFAULT_ALLOWED;
}

export function isUtilityAllowedForUnit(unitName: string, utilityType: string) {
  return getAllowedUtilitiesForUnitName(unitName).includes(utilityType as "electricity" | "gas" | "water");
}

