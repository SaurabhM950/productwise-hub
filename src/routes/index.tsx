import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { getMyRole, roleHome } from "@/lib/auth";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "InventViq — Inventory Management" },
      {
        name: "description",
        content:
          "InventViq tracks products, stock levels, suppliers, purchases and sales with role-based access for admins, managers and staff.",
      },
      { property: "og:title", content: "InventViq — Inventory Management" },
      {
        property: "og:description",
        content:
          "InventViq tracks products, stock levels, suppliers, purchases and sales with role-based access for admins, managers and staff.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
    const role = await getMyRole(data.user.id);
    throw redirect({ to: roleHome(role) });
  },
  component: () => (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  ),
});
