import { Prisma } from "@prisma/client";

import { evaluationStatusSchema } from "@/lib/api/contracts/church";
import prisma from "@/lib/prisma";
import type { EvaluationStatus } from "@/types/church";

type DirectoryFilters = {
  city?: string;
  state?: string;
  denomination?: string;
  confessional?: boolean;
  status?: string;
  evaluatedOnly?: boolean;
};

type DirectoryRow = {
  id: string;
  name: string;
  website: string;
  city: string | null;
  state: string | null;
  denomination: string | null;
  confessionAdopted: boolean;
  status: EvaluationStatus | null;
};

function directoryFrom(filters: DirectoryFilters) {
  const conditions: Prisma.Sql[] = [];
  const address: Prisma.Sql[] = [Prisma.sql`a."churchId" = c.id`];
  if (filters.city) address.push(Prisma.sql`lower(a.city) = lower(${filters.city})`);
  if (filters.state) address.push(Prisma.sql`lower(a.state) = lower(${filters.state})`);
  if (address.length > 1) conditions.push(Prisma.sql`EXISTS (
    SELECT 1 FROM "churchAddress" a WHERE ${Prisma.join(address, " AND ")}
  )`);
  if (filters.denomination) conditions.push(Prisma.sql`lower(c."denominationLabel") = lower(${filters.denomination})`);
  if (filters.status === "historic_reformed") conditions.push(Prisma.sql`c."confessionAdopted"`);
  else if (filters.confessional !== undefined) conditions.push(Prisma.sql`c."confessionAdopted" = ${filters.confessional}`);

  if (filters.evaluatedOnly) conditions.push(Prisma.sql`e.status IS NOT NULL`);
  if (filters.status === "exclude_red_flag_and_limited") {
    conditions.push(Prisma.sql`(e.status IS NULL OR e.status NOT IN ('NOT_ENDORSED', 'LIMITED_INFORMATION'))`);
  } else if (filters.status && evaluationStatusSchema.safeParse(filters.status).success) {
    conditions.push(Prisma.sql`e.status = ${filters.status.toUpperCase()}::"ChurchEvaluationStatus"`);
  }
  return Prisma.sql`
    FROM church c
    LEFT JOIN (
      SELECT DISTINCT ON ("churchId") "churchId", status FROM "churchEvaluation"
      ORDER BY "churchId", "createdAt" DESC, id DESC
    ) e ON e."churchId" = c.id
    ${conditions.length ? Prisma.sql`WHERE ${Prisma.join(conditions, " AND ")}` : Prisma.empty}
  `;
}

// Apply the directory's recommendation priority and latest-evaluation filter before
// pagination. Only the selected page crosses the database boundary.
export function directoryPage(filters: DirectoryFilters, offset: number, limit: number) {
  return prisma.$queryRaw<DirectoryRow[]>`
    WITH page AS (
      SELECT c.id, c.name, c.website, c."denominationLabel" AS denomination, c."confessionAdopted",
        lower(e.status::text) AS status,
        CASE WHEN c."confessionAdopted" THEN 1 WHEN e.status = 'RECOMMENDED' THEN 2
          WHEN e.status = 'BIBLICALLY_SOUND_WITH_DIFFERENCES' THEN 3
          WHEN e.status = 'LIMITED_INFORMATION' THEN 4 WHEN e.status = 'NOT_ENDORSED' THEN 5 ELSE 6 END AS priority
      ${directoryFrom(filters)}
      ORDER BY priority, lower(c.name), c.id LIMIT ${limit} OFFSET ${offset}
    )
    SELECT p.id, p.name, p.website, p.denomination, p."confessionAdopted", p.status, a.city, a.state
    FROM page p LEFT JOIN (
      SELECT DISTINCT ON (a."churchId") a."churchId", a.city, a.state
      FROM "churchAddress" a JOIN page ON page.id = a."churchId"
      ORDER BY a."churchId", a."isPrimary" DESC, a."createdAt", a.id
    ) a ON a."churchId" = p.id ORDER BY p.priority, lower(p.name), p.id
  `;
}

export async function directoryCount(filters: DirectoryFilters) {
  const [row] = await prisma.$queryRaw<{ total: bigint }[]>`SELECT count(*) AS total ${directoryFrom(filters)}`;
  return Number(row.total);
}
