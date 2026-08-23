const REQUIRED_REPORT_FORMATS = new Set(["MARKDOWN", "JSON", "CSV"]);

export function isDurationReportRegenerationPending(
  durationPolicyUpdatedAt: Date | null,
  artifacts: Array<{
    format: string;
    reportVersion: number;
    createdAt: Date;
  }>,
) {
  if (!durationPolicyUpdatedAt) return false;
  const formatsByFreshVersion = new Map<number, Set<string>>();
  for (const artifact of artifacts) {
    if (artifact.createdAt < durationPolicyUpdatedAt) continue;
    const formats =
      formatsByFreshVersion.get(artifact.reportVersion) ??
      new Set<string>();
    formats.add(artifact.format.toUpperCase());
    formatsByFreshVersion.set(artifact.reportVersion, formats);
  }
  return !Array.from(formatsByFreshVersion.values()).some((formats) =>
    Array.from(REQUIRED_REPORT_FORMATS).every((format) =>
      formats.has(format),
    ),
  );
}
