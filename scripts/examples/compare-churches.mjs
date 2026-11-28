// Run with Node.js 24: node scripts/examples/compare-churches.mjs
// Edit the cities below or set PARROT_BASE_URL to use a local deployment.
import { pathToFileURL } from "node:url";

const locations = [
  { city: "Bellevue", state: "WA" },
  { city: "Houston", state: "TX" },
  { city: "Sunnyvale", state: "CA" },
];

export async function compareChurches(baseUrl = "https://www.calvinistparrot.com") {
  const table = [
    "| City | Evaluated rows read | Recommended | Historic confession | Coverage | First saved record |",
    "| --- | ---: | ---: | ---: | --- | --- |",
  ];

  for (const { city, state } of locations) {
    const records = new Map();
    let hasMore = false;
    // The directory supports up to 25 rows per page. Keep each city to four requests.
    for (let page = 1; page <= 4; page++) {
      const url = new URL("/api/v1/churches", baseUrl);
      url.search = new URLSearchParams({ city, state, page: String(page), pageSize: "25" }).toString();
      const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error(`${city}, ${state} page ${page}: HTTP ${response.status}`);
      const result = await response.json();
      for (const church of result.items) records.set(church.id, church);
      hasMore = result.hasMore;
      if (!hasMore) break;
    }

    const churches = [...records.values()];
    const recommended = churches.filter(church => church.status === "recommended").length;
    const confessional = churches.filter(church => church.confessionAdopted).length;
    let sample = "—";
    if (churches.length) {
      const link = new URL("/church-finder", baseUrl);
      link.searchParams.set("church", churches[0].id);
      sample = `[Open](${link})`;
    }
    table.push(`| ${city}, ${state} | ${churches.length} | ${recommended} | ${confessional} | ${hasMore ? "Partial (4 pages)" : "Complete"} | ${sample} |`);
  }
  return table.join("\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(await compareChurches(process.env.PARROT_BASE_URL));
}
