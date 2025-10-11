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
};

export type NewPersonalFormState = {
  text: string;
  notes: string;
};

export type PersonalSheetState = {
  id: string;
  requestText: string;
  notes: string;
  status: "ACTIVE" | "ANSWERED" | "ARCHIVED";
};
