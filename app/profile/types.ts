export type Question = {
  id: string;
  question: string;
  reviewed_answer: string;
};

export type ProfileStats = {
  answeredFamilyCount: number;
  answeredPersonalCount: number;
  lastPrayerAt?: string | null;
  denomination?: string | null;
};

export type ProfileOverviewResponse = {
  questions: Question[];
  profile: ProfileStats | null;
  space: RawPrayerSpace;
  membership: RawMembershipInfo | null;
};

export type SpaceMember = {
  id: string;
  displayName: string;
  appwriteUserId: string;
  role: "OWNER" | "MEMBER";
  joinedAt: string;
};

export type MembershipInfo = SpaceMember & {
  spaceId: string;
};

export type PrayerSpace = {
  id: string;
  spaceName: string;
  shareCode: string;
  members: SpaceMember[];
};

export type RawSpaceMember =
  | Partial<{
      id: string | number;
      displayName: string;
      appwriteUserId: string;
      role: string;
      joinedAt: string | Date;
    }>
  | null
  | undefined;

export type RawPrayerSpace =
  | Partial<{
      id: string | number;
      spaceName: string;
      shareCode: string;
      members: RawSpaceMember[];
    }>
  | null
  | undefined;

export type RawMembershipInfo = RawSpaceMember & { spaceId?: string | number };

export const toSpaceMember = (raw: RawSpaceMember): SpaceMember => ({
  id: String(raw?.id ?? ""),
  displayName: String(raw?.displayName ?? "Member"),
  appwriteUserId: String(raw?.appwriteUserId ?? ""),
  role: raw?.role === "OWNER" ? "OWNER" : "MEMBER",
  joinedAt: String(raw?.joinedAt ?? new Date().toISOString()),
});

export const toPrayerSpace = (raw: RawPrayerSpace): PrayerSpace => ({
  id: String(raw?.id ?? ""),
  spaceName: String(raw?.spaceName ?? "Prayer Space"),
  shareCode: String(raw?.shareCode ?? ""),
  members: Array.isArray(raw?.members) ? raw.members.map(toSpaceMember) : [],
});

export const toMembershipInfo = (raw: RawMembershipInfo): MembershipInfo => ({
  ...toSpaceMember(raw),
  spaceId: String(raw?.spaceId ?? ""),
});
