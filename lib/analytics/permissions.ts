// Appwrite user labels are alphanumeric.
export function canViewAnalytics(labels: readonly string[]) {
  return labels.includes("analyticsadmin");
}
