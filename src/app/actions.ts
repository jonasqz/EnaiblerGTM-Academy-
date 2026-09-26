"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { authFor } from "@/server/auth";
import { getTenant } from "@/server/request";

export async function signOut(): Promise<void> {
  const tenant = await getTenant();
  await authFor(tenant).api.signOut({ headers: await headers() });
  redirect("/");
}
