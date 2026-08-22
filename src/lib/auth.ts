import { supabase } from "@/integrations/supabase/client";

export type AppRole = "admin" | "manager" | "staff";

/** Highest-privilege role wins when a user holds several. */
const ROLE_PRIORITY: readonly AppRole[] = ["admin", "manager", "staff"];

/** Where each role lands after sign-in. */
export const ROLE_HOME = {
  admin: "/dashboard",
  manager: "/inventory",
  staff: "/pos",
} as const;

export function roleHome(role: AppRole): (typeof ROLE_HOME)[AppRole] {
  return ROLE_HOME[role];
}

/** Fetch the current user's highest role. Defaults to "staff" when none is found. */
export async function getMyRole(userId: string): Promise<AppRole> {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  const roles = (data ?? []).map((row) => row.role as AppRole);
  return ROLE_PRIORITY.find((role) => roles.includes(role)) ?? "staff";
}

/** Roles allowed to visit each protected area. */
export const ROUTE_ROLES = {
  dashboard: ["admin"],
  inventory: ["admin", "manager"],
  pos: ["admin", "manager", "staff"],
} as const satisfies Record<string, readonly AppRole[]>;
