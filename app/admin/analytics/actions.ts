"use server";

import { refresh, updateTag } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { analyticsAccess } from "@/lib/analytics/access";
import { analyticsReportTag } from "@/lib/analytics/report";

export async function refreshAnalytics() {
  const access = await analyticsAccess();
  if (access === "signed-out") redirect("/login");
  if (access !== "authorized") notFound();
  updateTag(analyticsReportTag);
  refresh();
}
