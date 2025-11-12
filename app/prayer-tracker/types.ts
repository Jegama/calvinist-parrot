import { Models } from "appwrite";

export type AppwriteUser = Models.User<Models.Preferences>;

export type Member = {
  id: string;
  displayName: string;
  role: string;
  appwriteUserId: string;
};

export type Family = {
  id: string;
  familyName: string;
  parents: string;
  children: string[];
  categoryTag?: string | null;
  lastPrayedAt?: string | null;
  lastPrayedByMemberId?: string | null;
  lastPrayedBy?: { id: string; displayName: string } | null;
  createdAt?: string;
  archivedAt?: string | null;
  requests?: FamilyRequest[]; // Family-specific prayer requests (from rotation API)
};

export type PersonalRequest = {
  id: string;
  requestText: string;
  notes?: string | null;
  linkedScripture?: string | null;
  lastPrayedAt?: string | null;
  dateAdded?: string;
  status?: "ACTIVE" | "ANSWERED" | "ARCHIVED";
  answeredAt?: string | null;
};

export type FamilyRequest = {
  id: string;
  familyId: string;
  requestText: string;
  notes?: string | null;
  linkedScripture?: string | null;
  lastPrayedAt?: string | null;
  dateAdded?: string;
  status?: "ACTIVE" | "ANSWERED" | "ARCHIVED";
  answeredAt?: string | null;
};

// Unified request type that can be either household or family-specific
export type UnifiedRequest = {
  id: string;
  requestText: string;
  notes?: string | null;
  linkedScripture?: string | null;
  lastPrayedAt?: string | null;
  dateAdded?: string;
  status?: "ACTIVE" | "ANSWERED" | "ARCHIVED";
  answeredAt?: string | null;
  // Discriminator: if familyId is null, it's a household request (prayerPersonalRequest)
  // if familyId is set, it's a family-specific request (prayerFamilyRequest)
  familyId?: string | null;
  familyName?: string | null; // For display purposes
};

export type Rotation = {
  families: Family[];
  personal: PersonalRequest[];
};

export type NewFamilyFormState = {
  familyName: string;
  parents: string;
  children: string;
  categorySelect: string;
  customCategory: string;
};

export type FamilySheetState = NewFamilyFormState & {
  id: string;
  lastPrayedAt: string;
  archivedAt: string | null;
};

export type NewPersonalFormState = {
  text: string;
  notes: string;
  linkedToFamily: string; // "household" or a familyId
};

export type PersonalSheetState = {
  id: string;
  requestText: string;
  notes: string;
  status: "ACTIVE" | "ANSWERED" | "ARCHIVED";
  linkedToFamily: string; // "household" or a familyId
  originalLinkedToFamily?: string; // Track original value to detect changes
  lastPrayedAt: string;
};
