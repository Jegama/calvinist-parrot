const dayFormat = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const shortDayFormat = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const countFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const percentFormat = new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 1 });
const moneyFormat = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 8,
});

export function dayLabel(day: string, short = false) {
  return (short ? shortDayFormat : dayFormat).format(new Date(day + "T12:00:00Z"));
}

export function instantLabel(iso: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone, month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit", timeZoneName: "short",
  }).format(new Date(iso));
}

export const numberLabel = (value: number | null) => value === null ? "—" : countFormat.format(value);
export const rateLabel = (value: number | null) => value === null ? "—" : percentFormat.format(value);
export const moneyLabel = (value: number | null) => value === null ? "—" : moneyFormat.format(value);

export const channelLabels = {
  combined: "All channels",
  web: "Website",
  public_api: "Public API",
  mcp: "MCP",
  unknown: "Unknown",
};
