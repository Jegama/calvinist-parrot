import type { Models } from "appwrite";
import { NextResponse } from "next/server";

import { requireAuthenticatedUser } from "@/lib/auth";

import { isLocalSermonRuntime } from "./runtime";
import { SERMON_DAILY_RUN_LIMIT } from "./types";

export const SERMON_EVALUATOR_BETA_LABEL = "sermonevaluatorbeta";
export const SERMON_EVALUATOR_ADMIN_LABEL = "sermonevaluatoradmin";

type AppwriteUserWithLabels = Pick<
  Models.User<Models.Preferences>,
  "$id" | "labels"
> &
  Partial<Pick<Models.User<Models.Preferences>, "email">>;

function isDevelopmentSermonAdmin(
  user: AppwriteUserWithLabels | null | undefined,
) {
  if (
    process.env.NODE_ENV !== "development" ||
    !isLocalSermonRuntime() ||
    !user?.email
  ) {
    return false;
  }
  const configuredEmail =
    process.env.SERMON_DEV_ADMIN_EMAIL?.trim().toLowerCase() ||
    "test@test.com";
  return user.email.trim().toLowerCase() === configuredEmail;
}

export function hasSermonEvaluationAccess(
  user: AppwriteUserWithLabels | null | undefined,
) {
  return Boolean(
    isDevelopmentSermonAdmin(user) ||
      user?.labels.includes(SERMON_EVALUATOR_BETA_LABEL) ||
      user?.labels.includes(SERMON_EVALUATOR_ADMIN_LABEL),
  );
}

export function isSermonEvaluationAdmin(
  user: AppwriteUserWithLabels | null | undefined,
) {
  return Boolean(
    isDevelopmentSermonAdmin(user) ||
      user?.labels.includes(SERMON_EVALUATOR_ADMIN_LABEL),
  );
}

export function getSermonEvaluationCapabilities(
  user: AppwriteUserWithLabels | null | undefined,
) {
  const isAdmin = isSermonEvaluationAdmin(user);
  return {
    hasAccess: hasSermonEvaluationAccess(user),
    isAdmin,
    canChooseCustomRunCount: isAdmin,
    dailyQuotaExempt: isAdmin,
    allowedRunCount: { min: 1 as const, max: isAdmin ? 9 : 3 },
    dailyRunLimit: SERMON_DAILY_RUN_LIMIT,
  };
}

export async function requireSermonEvaluationAccess() {
  const auth = await requireAuthenticatedUser();
  if (auth.errorResponse || !auth.user) {
    return auth;
  }
  if (!hasSermonEvaluationAccess(auth.user)) {
    return {
      ...auth,
      errorResponse: NextResponse.json(
        { error: "Sermon evaluation access is not enabled for this account" },
        { status: 403 },
      ),
    };
  }
  return auth;
}

export async function requireSermonEvaluationAdmin() {
  const auth = await requireAuthenticatedUser();
  if (auth.errorResponse || !auth.user) {
    return auth;
  }
  if (!isSermonEvaluationAdmin(auth.user)) {
    return {
      ...auth,
      errorResponse: NextResponse.json(
        { error: "Sermon evaluation administrator access is required" },
        { status: 403 },
      ),
    };
  }
  return auth;
}
