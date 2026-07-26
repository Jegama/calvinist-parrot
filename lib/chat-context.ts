export const DEFAULT_CHAT_DENOMINATION = "reformed-baptist";

export function resolveEffectiveDenomination(
  profileDenomination?: string | null,
  chatDenomination?: string | null,
): string {
  return (
    profileDenomination?.trim() ||
    chatDenomination?.trim() ||
    DEFAULT_CHAT_DENOMINATION
  );
}
