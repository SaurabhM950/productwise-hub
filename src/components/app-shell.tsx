import type { ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Boxes, LayoutDashboard, LogOut, ShoppingCart } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import type { AppRole } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const NAV_ITEMS = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, roles: ["admin"] },
  { to: "/inventory", label: "Inventory", icon: Boxes, roles: ["admin", "manager"] },
  {
    to: "/pos",
    label: "Point of Sale",
    icon: ShoppingCart,
    roles: ["admin", "manager", "staff"],
  },
] as const;

const ROLE_BADGE_VARIANT: Record<AppRole, "default" | "secondary" | "outline"> = {
  admin: "default",
  manager: "secondary",
  staff: "outline",
};

type AppShellProps = {
  role: AppRole;
  userEmail?: string;
  title: string;
  description?: string;
  children: ReactNode;
};

export function AppShell({ role, userEmail, title, description, children }: AppShellProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b bg-card">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4">
          <Link to="/" className="flex shrink-0 items-center gap-2 font-display font-bold">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Boxes className="h-4 w-4" />
            </span>
            <span className="hidden sm:inline">StockPilot</span>
          </Link>

          <nav className="flex flex-1 items-center gap-1 overflow-x-auto">
            {NAV_ITEMS.filter((item) => (item.roles as readonly string[]).includes(role)).map(
              (item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  activeOptions={{ exact: true }}
                  className="flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                  activeProps={{
                    className: "bg-accent font-medium text-accent-foreground",
                  }}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </Link>
              ),
            )}
          </nav>

          <div className="flex shrink-0 items-center gap-3">
            {userEmail && (
              <span className="hidden max-w-40 truncate text-sm text-muted-foreground md:inline">
                {userEmail}
              </span>
            )}
            <Badge variant={ROLE_BADGE_VARIANT[role]} className="capitalize">
              {role}
            </Badge>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleSignOut}
              aria-label="Sign out"
              title="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">
        <h1 className="font-display text-2xl font-bold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
        <div className="mt-6">{children}</div>
      </main>
    </div>
  );
}
