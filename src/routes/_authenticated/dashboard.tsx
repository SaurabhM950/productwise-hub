import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  Boxes,
  CircleDollarSign,
  Package,
  Receipt,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { getMyRole, roleHome, ROUTE_ROLES, type AppRole } from "@/lib/auth";
import { formatCurrency, formatDateTime } from "@/lib/format";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard · InventViq" },
      {
        name: "description",
        content:
          "Admin overview of InventViq: stock value, low-stock alerts, and recent sales.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  beforeLoad: async ({ context }) => {
    const role = await getMyRole(context.user.id);
    if (!(ROUTE_ROLES.dashboard as readonly AppRole[]).includes(role)) {
      throw redirect({ to: roleHome(role) });
    }
    return { role };
  },
  component: DashboardPage,
});

type ProductRow = {
  id: string;
  name: string;
  sku: string;
  category: string;
  quantity: number;
  purchase_price: number;
  selling_price: number;
  low_stock_threshold: number;
};

type SaleRow = {
  id: string;
  customer_name: string;
  total_amount: number;
  payment_status: string;
  created_at: string;
};

async function fetchDashboard() {
  const [productsRes, salesRes] = await Promise.all([
    supabase
      .from("products")
      .select(
        "id, name, sku, category, quantity, purchase_price, selling_price, low_stock_threshold",
      )
      .order("name"),
    supabase
      .from("sales")
      .select("id, customer_name, total_amount, payment_status, created_at")
      .order("created_at", { ascending: false })
      .limit(8),
  ]);
  if (productsRes.error) throw productsRes.error;
  if (salesRes.error) throw salesRes.error;
  return {
    products: (productsRes.data ?? []) as ProductRow[],
    sales: (salesRes.data ?? []) as SaleRow[],
  };
}

function DashboardPage() {
  const { user, role } = Route.useRouteContext();
  const { data, isPending } = useQuery({
    queryKey: ["dashboard"],
    queryFn: fetchDashboard,
  });

  const products = data?.products ?? [];
  const sales = data?.sales ?? [];
  const totalUnits = products.reduce((sum, p) => sum + p.quantity, 0);
  const stockValue = products.reduce(
    (sum, p) => sum + p.quantity * p.purchase_price,
    0,
  );
  const lowStock = products.filter((p) => p.quantity <= p.low_stock_threshold);
  const todayRevenue = sales
    .filter((s) => new Date(s.created_at).toDateString() === new Date().toDateString())
    .reduce((sum, s) => sum + s.total_amount, 0);

  return (
    <AppShell
      role={role}
      userEmail={user.email}
      title="Dashboard"
      description="Workspace overview — stock health, value and recent activity."
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={Package}
          label="Products"
          value={isPending ? null : String(products.length)}
        />
        <StatCard
          icon={Boxes}
          label="Units in stock"
          value={isPending ? null : totalUnits.toLocaleString()}
        />
        <StatCard
          icon={CircleDollarSign}
          label="Stock value (cost)"
          value={isPending ? null : formatCurrency(stockValue)}
        />
        <StatCard
          icon={AlertTriangle}
          label="Low-stock items"
          value={isPending ? null : String(lowStock.length)}
          tone={lowStock.length > 0 ? "warn" : "ok"}
        />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="flex items-center gap-2 text-base">
              <Receipt className="h-4 w-4 text-muted-foreground" />
              Recent sales
            </CardTitle>
            <span className="text-sm text-muted-foreground">
              Today: {formatCurrency(todayRevenue)}
            </span>
          </CardHeader>
          <CardContent>
            {isPending ? (
              <Skeleton className="h-48 w-full" />
            ) : sales.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No sales recorded yet.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Customer</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sales.map((sale) => (
                    <TableRow key={sale.id}>
                      <TableCell className="font-medium">
                        {sale.customer_name}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            sale.payment_status === "paid"
                              ? "secondary"
                              : "outline"
                          }
                          className="capitalize"
                        >
                          {sale.payment_status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDateTime(sale.created_at)}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(sale.total_amount)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4 text-muted-foreground" />
              Low-stock alerts
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isPending ? (
              <Skeleton className="h-48 w-full" />
            ) : lowStock.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                All products are above their reorder thresholds.
              </p>
            ) : (
              <ul className="divide-y">
                {lowStock.slice(0, 8).map((p) => (
                  <li
                    key={p.id}
                    className="flex items-center justify-between gap-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{p.name}</p>
                      <p className="text-xs text-muted-foreground">{p.sku}</p>
                    </div>
                    <Badge
                      variant={p.quantity === 0 ? "destructive" : "outline"}
                      className="shrink-0"
                    >
                      {p.quantity} / {p.low_stock_threshold}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Package;
  label: string;
  value: string | null;
  tone?: "warn" | "ok";
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-5">
        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md ${
            tone === "warn"
              ? "bg-destructive/10 text-destructive"
              : "bg-secondary text-secondary-foreground"
          }`}
        >
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          {value === null ? (
            <Skeleton className="mt-1 h-6 w-16" />
          ) : (
            <p className="truncate font-display text-xl font-bold">{value}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
