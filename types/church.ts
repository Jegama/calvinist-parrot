export type CoreDoctrineKey =
  | "trinity"
  | "gospel"
  | "justification_by_faith"
  | "christ_deity_humanity"
  | "scripture_authority"
  | "incarnation_virgin_birth"
  | "atonement_necessary_sufficient"
  | "resurrection_of_jesus"
  | "return_and_judgment"
  | "character_of_god";

export type CoreDoctrineStatusValue = "true" | "false" | "unknown";

export type CoreDoctrineMap = Record<CoreDoctrineKey, CoreDoctrineStatusValue>;

export interface ChurchAddress {
  id: string;
  street1: string | null;
  street2: string | null;
  city: string | null;
  state: string | null;
  postCode: string | null;
  latitude: number | null;
  longitude: number | null;
  sourceUrl: string | null;
  isPrimary: boolean;
}

export interface ChurchServiceTime {
  id: string;
  label: string;
}

export interface ChurchNote {
  label: string;
  text: string;
  source_url: string | null;
}

export interface DenominationInfo {
  label: string | null;
  confidence: number | null;
  signals: string[];
}

export interface ConfessionInfo {
  adopted: boolean;
  name: string | null;
  source_url: string | null;
}

export interface ChurchEvaluationRaw {
  church: {
    name: string | null;
    website: string;
    addresses: Array<{
      street_1: string | null;
      street_2: string | null;
      city: string | null;
      state: string | null;
      post_code: string | null;
      source_url: string | null;
    }>;
    contacts: { phone: string | null; email: string | null };
    service_times: string[];
    best_pages_for: {
      beliefs: string | null;
      confession: string | null;
      about: string | null;
      leadership: string | null;
    };
    denomination: DenominationInfo;
    confession: ConfessionInfo;
    core_doctrines: CoreDoctrineMap;
    secondary: {
      baptism: string | null;
      governance: string | null;
      lords_supper: string | null;
      gifts: string | null;
      women_in_church: string | null;
      sanctification: string | null;
      continuity: string | null;
      security: string | null;
      atonement_model: string | null;
    };
    tertiary: {
      eschatology: string | null;
      worship_style: string | null;
      counseling: string | null;
      creation: string | null;
      christian_liberty: string | null;
      discipline: string | null;
      parachurch: string | null;
    };
    badges: string[];
    notes: ChurchNote[];
  };
}

export type EvaluationStatus = "pass" | "caution" | "red_flag";

export interface ChurchEvaluationRecord {
  id: string;
  status: EvaluationStatus;
  badges: string[];
  coverageRatio: number;
  coreOnSiteCount: number;
  coreTotalCount: number;
  coreDoctrines: CoreDoctrineMap;
  secondary: ChurchEvaluationRaw["church"]["secondary"] | null;
  tertiary: ChurchEvaluationRaw["church"]["tertiary"] | null;
  raw: ChurchEvaluationRaw;
  createdAt: string;
}

export interface ChurchListItem {
  id: string;
  name: string;
  website: string;
  city: string | null;
  state: string | null;
  latitude: number | null;
  longitude: number | null;
  confessionAdopted: boolean;
  denomination: DenominationInfo;
  status: EvaluationStatus | null;
  coverageRatio: number | null;
  badges: string[];
  serviceTimes: ChurchServiceTime[];
}

export interface ChurchDetail extends ChurchListItem {
  email: string | null;
  phone: string | null;
  addresses: ChurchAddress[];
  bestPages: {
    beliefs: string | null;
    confession: string | null;
    about: string | null;
    leadership: string | null;
  };
  evaluation: ChurchEvaluationRecord | null;
}

export interface ChurchListResponse {
  page: number;
  pageSize: number;
  total: number;
  items: ChurchListItem[];
}

export interface ChurchSearchResult {
  id: string;
  name: string;
  displayName: string;
  latitude: number;
  longitude: number;
  address: {
    city?: string;
    state?: string;
    country?: string;
  };
  website?: string | null;
  osmType?: string;
  osmId?: number;
}

export interface ChurchMetaResponse {
  states: string[];
  denominations: string[];
  totals: {
    confessional: number;
    nonConfessional: number;
    overall: number;
  };
}
