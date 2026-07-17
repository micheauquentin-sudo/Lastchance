import "server-only";

import { cookies } from "next/headers";
import { ACTIVE_ORGANIZATION_COOKIE } from "@/lib/active-organization";

export async function setActiveOrganizationCookie(
  organizationId: string,
): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_ORGANIZATION_COOKIE, organizationId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}

export async function clearActiveOrganizationCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(ACTIVE_ORGANIZATION_COOKIE);
}
