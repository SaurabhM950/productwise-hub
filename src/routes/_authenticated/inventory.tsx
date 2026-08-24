import { useMemo, useState } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { PackageSearch, Search } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { getMyRole, roleHome, ROUTE_ROLES, type AppRole } from "@/lib/auth";
import { formatCurrency } from "@/lib/format";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/inventory")({
  head: () => ({
    meta: [
      { title: "Inventory · StockPilot" },
      {
        name: "description",
        content:
          "Browse and search every product, stock level, supplier and price in StockPilot.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  beforeLoad: async ({ context }) => {
    const role = await getMyRole(context.user.id);
    if (!(ROUTE_ROLES.inventory as readonly AppRole[]).includes(role)) {
      throw redirect({ to: roleHome(role) });
    }
    return { role };
  },
  component: InventoryPage,
});

type ProductWithSupplier = {
  id: string;
  name: string;
  sku: string;
  barcode: string | null;
  brand: string | null;
  category: string;
  quantity: number;
  purchase_price: number;
  selling_price: number;
  low_stock_threshold: number;
  suppliers: { company_name: string } | null;
};

async function fetchProducts(): Promise<ProductWithSupplier[]> {
  const { data, error } = await supabase
    .from("products")
    .select(
      "id, name, sku, barcode, brand, category, quantity, purchase_price, selling_price, low_stock_threshold, suppliers(company_name)",
    )
    .order("name");
  if (error) throw error;
  return (data ?? []) as unknown as ProductWithSupplier[];
}

function stockBadge(p: ProductWithSupplier) {
  if (p.quantity === 0) return <Badge variant="destructive">Out of stock</Badge>;
  if (p.quantity <= p.low_stock_threshold)
    return <Badge variant="outline">Low · {p.quantity}</Badge>;
  return <Badge variant="secondary">{p.quantity} in stock</Badge>;
}

function InventoryPage() {
  const { user, role } = Route.useRouteContext();
  const [query, setQuery] = useState("");
  const { data, isPending } = useQuery({
    queryKey: ["inventory-products"],
    queryFn: fetchProducts,
  });

  const products = useMemo(() => {
    const all = data ?? [];
    const q = query.trim().toLowerCase();
    if (!q) return all;
    return all.filter((p) =>
      [p.name, p.sku, p.category, p.brand ?? "", p.barcode ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [data, query]);

  return (
    <AppShell
      role={role}
      userEmail={user.email}
      title="Inventory"
      description="Every product and its live stock level."
    >
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name, SKU, category or barcode…"
          className="pl-9"
          aria-label="Search products"
        />
      </div>

      <Card className="mt-4">
        <CardContent className="p-0">
          {isPending ? (
            <div className="p-6">
              <Skeleton className="h-64 w-full" />
            </div>
          ) : products.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-16 text-center">
              <PackageSearch className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {query
                  ? "No products match your search."
                  : "No products yet. Add your first product to get started."}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Stock</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <p className="font-medium">{p.name}</p>
                      {p.brand && (
                        <p className="text-xs text-muted-foreground">{p.brand}</p>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {p.sku}
                    </TableCell>
                    <TableCell>{p.category}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {p.suppliers?.company_name ?? "—"}
                    </TableCell>
                    <TableCell>{stockBadge(p)}</TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {formatCurrency(p.purchase_price)}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(p.selling_price)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </AppShell>
  );
}
