import { useMemo, useState } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Minus, Plus, Search, ShoppingCart, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { getMyRole, roleHome, ROUTE_ROLES, type AppRole } from "@/lib/auth";
import { formatCurrency } from "@/lib/format";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/pos")({
  head: () => ({
    meta: [
      { title: "Point of Sale · StockPilot" },
      {
        name: "description",
        content:
          "Ring up sales in StockPilot — stock levels update automatically on checkout.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  beforeLoad: async ({ context }) => {
    const role = await getMyRole(context.user.id);
    if (!(ROUTE_ROLES.pos as readonly AppRole[]).includes(role)) {
      throw redirect({ to: roleHome(role) });
    }
    return { role };
  },
  component: PosPage,
});

type PosProduct = {
  id: string;
  name: string;
  sku: string;
  category: string;
  quantity: number;
  selling_price: number;
};

type CartLine = { product: PosProduct; qty: number };

async function fetchSellable(): Promise<PosProduct[]> {
  const { data, error } = await supabase
    .from("products")
    .select("id, name, sku, category, quantity, selling_price")
    .gt("quantity", 0)
    .order("name");
  if (error) throw error;
  return (data ?? []) as PosProduct[];
}

function PosPage() {
  const { user, role } = Route.useRouteContext();
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [customer, setCustomer] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);

  const { data, isPending } = useQuery({
    queryKey: ["pos-products"],
    queryFn: fetchSellable,
  });

  const products = useMemo(() => {
    const all = data ?? [];
    const q = query.trim().toLowerCase();
    if (!q) return all;
    return all.filter((p) =>
      [p.name, p.sku, p.category].join(" ").toLowerCase().includes(q),
    );
  }, [data, query]);

  const total = cart.reduce(
    (sum, line) => sum + line.qty * line.product.selling_price,
    0,
  );

  function addToCart(product: PosProduct) {
    setCart((prev) => {
      const existing = prev.find((l) => l.product.id === product.id);
      const currentQty = existing?.qty ?? 0;
      if (currentQty + 1 > product.quantity) {
        toast.error(`Only ${product.quantity} × ${product.name} in stock`);
        return prev;
      }
      if (existing) {
        return prev.map((l) =>
          l.product.id === product.id ? { ...l, qty: l.qty + 1 } : l,
        );
      }
      return [...prev, { product, qty: 1 }];
    });
  }

  function changeQty(productId: string, delta: number) {
    setCart((prev) =>
      prev
        .map((l) =>
          l.product.id === productId
            ? { ...l, qty: Math.min(l.qty + delta, l.product.quantity) }
            : l,
        )
        .filter((l) => l.qty > 0),
    );
  }

  const checkout = useMutation({
    mutationFn: async () => {
      if (cart.length === 0) throw new Error("Cart is empty");
      const { data: sale, error: saleError } = await supabase
        .from("sales")
        .insert({
          customer_name: customer.trim() || "Walk-in customer",
          total_amount: total,
          payment_status: "paid",
          created_by: user.id,
        })
        .select("id")
        .single();
      if (saleError) throw saleError;

      const { error: itemsError } = await supabase.from("sale_items").insert(
        cart.map((l) => ({
          sale_id: sale.id,
          product_id: l.product.id,
          quantity: l.qty,
          unit_price: l.product.selling_price,
        })),
      );
      if (itemsError) throw itemsError;
    },
    onSuccess: () => {
      toast.success(`Sale completed — ${formatCurrency(total)}`);
      setCart([]);
      setCustomer("");
      queryClient.invalidateQueries({ queryKey: ["pos-products"] });
      queryClient.invalidateQueries({ queryKey: ["inventory-products"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Checkout failed");
    },
  });

  return (
    <AppShell
      role={role}
      userEmail={user.email}
      title="Point of Sale"
      description="Add products to the cart and check out — stock updates automatically."
    >
      <div className="grid gap-6 lg:grid-cols-5">
        {/* Product picker */}
        <div className="lg:col-span-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search products…"
              className="pl-9"
              aria-label="Search products"
            />
          </div>
          {isPending ? (
            <Skeleton className="mt-4 h-72 w-full" />
          ) : products.length === 0 ? (
            <p className="py-16 text-center text-sm text-muted-foreground">
              {query
                ? "No products match your search."
                : "Nothing in stock to sell right now."}
            </p>
          ) : (
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {products.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => addToCart(p)}
                  className="rounded-lg border bg-card p-4 text-left transition-colors hover:border-primary/50 hover:bg-accent/50"
                >
                  <p className="truncate text-sm font-medium">{p.name}</p>
                  <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                    {p.sku}
                  </p>
                  <div className="mt-3 flex items-center justify-between">
                    <span className="font-display text-sm font-bold">
                      {formatCurrency(p.selling_price)}
                    </span>
                    <Badge
                      variant={p.quantity <= 5 ? "outline" : "secondary"}
                      className="text-xs"
                    >
                      {p.quantity} left
                    </Badge>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Cart */}
        <Card className="h-fit lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShoppingCart className="h-4 w-4 text-muted-foreground" />
              Current sale
              {cart.length > 0 && (
                <Badge variant="secondary">{cart.length} items</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {cart.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Cart is empty — tap a product to add it.
              </p>
            ) : (
              <ul className="space-y-3">
                {cart.map((line) => (
                  <li key={line.product.id} className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {line.product.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatCurrency(line.product.selling_price)} each
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => changeQty(line.product.id, -1)}
                        aria-label="Decrease quantity"
                      >
                        <Minus className="h-3 w-3" />
                      </Button>
                      <span className="w-6 text-center text-sm font-medium">
                        {line.qty}
                      </span>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => changeQty(line.product.id, 1)}
                        aria-label="Increase quantity"
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                    <span className="w-16 text-right text-sm font-medium">
                      {formatCurrency(line.qty * line.product.selling_price)}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground"
                      onClick={() =>
                        setCart((prev) =>
                          prev.filter((l) => l.product.id !== line.product.id),
                        )
                      }
                      aria-label="Remove from cart"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}

            <Separator className="my-4" />

            <div className="space-y-2">
              <Label htmlFor="customer">Customer name (optional)</Label>
              <Input
                id="customer"
                value={customer}
                onChange={(e) => setCustomer(e.target.value)}
                placeholder="Walk-in customer"
              />
            </div>

            <div className="mt-4 flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Total</span>
              <span className="font-display text-xl font-bold">
                {formatCurrency(total)}
              </span>
            </div>

            <Button
              className="mt-4 w-full"
              disabled={cart.length === 0 || checkout.isPending}
              onClick={() => checkout.mutate()}
            >
              {checkout.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Complete sale
            </Button>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
