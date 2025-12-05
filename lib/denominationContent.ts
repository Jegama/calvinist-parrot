import * as denominations from "./denominations";

export const DENOMINATION_OPTIONS = [
  { value: "reformed-baptist", label: "Reformed Baptist" },
  { value: "presbyterian", label: "Presbyterian" },
  { value: "wesleyan", label: "Wesleyan" },
  { value: "lutheran", label: "Lutheran" },
  { value: "anglican", label: "Anglican" },
  { value: "pentecostal", label: "Pentecostal/Charismatic" },
  { value: "non-denom", label: "Non-Denominational Evangelical" },
] as const;

export type DenominationValue = (typeof DENOMINATION_OPTIONS)[number]["value"];

export const DENOMINATION_CONTENT: Record<DenominationValue, string> = {
  "reformed-baptist": denominations.reformed_baptist,
  presbyterian: denominations.presbyterian,
  wesleyan: denominations.wesleyan,
  lutheran: denominations.lutheran,
  anglican: denominations.anglican,
  pentecostal: denominations.pentecostal,
  "non-denom": denominations.non_denom,
};
