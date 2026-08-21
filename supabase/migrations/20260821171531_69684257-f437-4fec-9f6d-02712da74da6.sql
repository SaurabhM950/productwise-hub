-- ROLES
CREATE TYPE public.app_role AS ENUM ('admin', 'manager', 'staff');

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL DEFAULT 'staff',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.can_manage(_user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin','manager'));
$$;

CREATE POLICY "profiles_select_own" ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.can_manage(auth.uid()));
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());

CREATE POLICY "user_roles_select" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- signup trigger: profile + role (first user becomes admin)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  user_count INT;
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'), NEW.email)
  ON CONFLICT (id) DO NOTHING;

  SELECT count(*) INTO user_count FROM public.user_roles;
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, CASE WHEN user_count = 0 THEN 'admin'::public.app_role ELSE 'staff'::public.app_role END)
  ON CONFLICT (user_id, role) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- SUPPLIERS
CREATE TABLE public.suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name TEXT NOT NULL,
  contact_person TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.suppliers TO authenticated;
GRANT ALL ON public.suppliers TO service_role;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "suppliers_select" ON public.suppliers FOR SELECT TO authenticated USING (true);
CREATE POLICY "suppliers_insert" ON public.suppliers FOR INSERT TO authenticated WITH CHECK (public.can_manage(auth.uid()));
CREATE POLICY "suppliers_update" ON public.suppliers FOR UPDATE TO authenticated USING (public.can_manage(auth.uid()));
CREATE POLICY "suppliers_delete" ON public.suppliers FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER suppliers_updated BEFORE UPDATE ON public.suppliers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- PRODUCTS
CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  sku TEXT NOT NULL UNIQUE,
  barcode TEXT,
  category TEXT NOT NULL DEFAULT 'General',
  brand TEXT,
  purchase_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  selling_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  low_stock_threshold INTEGER NOT NULL DEFAULT 10,
  supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX products_category_idx ON public.products(category);
CREATE INDEX products_barcode_idx ON public.products(barcode);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "products_select" ON public.products FOR SELECT TO authenticated USING (true);
CREATE POLICY "products_insert" ON public.products FOR INSERT TO authenticated WITH CHECK (public.can_manage(auth.uid()));
CREATE POLICY "products_update" ON public.products FOR UPDATE TO authenticated USING (true);
CREATE POLICY "products_delete" ON public.products FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER products_updated BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- PURCHASES
CREATE TABLE public.purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  invoice_number TEXT,
  status TEXT NOT NULL DEFAULT 'received',
  total_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchases TO authenticated;
GRANT ALL ON public.purchases TO service_role;
ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "purchases_select" ON public.purchases FOR SELECT TO authenticated USING (true);
CREATE POLICY "purchases_insert" ON public.purchases FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "purchases_update" ON public.purchases FOR UPDATE TO authenticated USING (public.can_manage(auth.uid()));
CREATE POLICY "purchases_delete" ON public.purchases FOR DELETE TO authenticated USING (public.can_manage(auth.uid()));

CREATE TABLE public.purchase_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id UUID NOT NULL REFERENCES public.purchases(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_items TO authenticated;
GRANT ALL ON public.purchase_items TO service_role;
ALTER TABLE public.purchase_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "purchase_items_select" ON public.purchase_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "purchase_items_insert" ON public.purchase_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "purchase_items_delete" ON public.purchase_items FOR DELETE TO authenticated USING (public.can_manage(auth.uid()));

-- SALES
CREATE TABLE public.sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_name TEXT NOT NULL DEFAULT 'Walk-in customer',
  payment_status TEXT NOT NULL DEFAULT 'paid',
  total_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales TO authenticated;
GRANT ALL ON public.sales TO service_role;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sales_select" ON public.sales FOR SELECT TO authenticated USING (true);
CREATE POLICY "sales_insert" ON public.sales FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "sales_update" ON public.sales FOR UPDATE TO authenticated USING (public.can_manage(auth.uid()));
CREATE POLICY "sales_delete" ON public.sales FOR DELETE TO authenticated USING (public.can_manage(auth.uid()));

CREATE TABLE public.sale_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id UUID NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sale_items TO authenticated;
GRANT ALL ON public.sale_items TO service_role;
ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sale_items_select" ON public.sale_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "sale_items_insert" ON public.sale_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "sale_items_delete" ON public.sale_items FOR DELETE TO authenticated USING (public.can_manage(auth.uid()));

-- STOCK MOVEMENTS
CREATE TABLE public.stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  change INTEGER NOT NULL,
  reason TEXT NOT NULL,
  reference_id UUID,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX stock_movements_product_idx ON public.stock_movements(product_id, created_at DESC);
GRANT SELECT, INSERT ON public.stock_movements TO authenticated;
GRANT ALL ON public.stock_movements TO service_role;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "stock_movements_select" ON public.stock_movements FOR SELECT TO authenticated USING (true);
CREATE POLICY "stock_movements_insert" ON public.stock_movements FOR INSERT TO authenticated WITH CHECK (true);

-- STOCK AUTOMATION
CREATE OR REPLACE FUNCTION public.apply_purchase_item()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.products SET quantity = quantity + NEW.quantity WHERE id = NEW.product_id;
  INSERT INTO public.stock_movements (product_id, change, reason, reference_id, created_by)
  VALUES (NEW.product_id, NEW.quantity, 'purchase', NEW.purchase_id, auth.uid());
  UPDATE public.purchases p SET total_amount = (
    SELECT COALESCE(SUM(quantity * unit_price), 0) FROM public.purchase_items WHERE purchase_id = p.id
  ) WHERE p.id = NEW.purchase_id;
  RETURN NEW;
END; $$;
CREATE TRIGGER purchase_items_apply AFTER INSERT ON public.purchase_items
FOR EACH ROW EXECUTE FUNCTION public.apply_purchase_item();

CREATE OR REPLACE FUNCTION public.apply_sale_item()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  available INTEGER;
  pname TEXT;
BEGIN
  SELECT quantity, name INTO available, pname FROM public.products WHERE id = NEW.product_id FOR UPDATE;
  IF available IS NULL THEN
    RAISE EXCEPTION 'Product not found';
  END IF;
  IF available < NEW.quantity THEN
    RAISE EXCEPTION 'Insufficient stock for %: % available, % requested', pname, available, NEW.quantity;
  END IF;
  UPDATE public.products SET quantity = quantity - NEW.quantity WHERE id = NEW.product_id;
  INSERT INTO public.stock_movements (product_id, change, reason, reference_id, created_by)
  VALUES (NEW.product_id, -NEW.quantity, 'sale', NEW.sale_id, auth.uid());
  UPDATE public.sales s SET total_amount = (
    SELECT COALESCE(SUM(quantity * unit_price), 0) FROM public.sale_items WHERE sale_id = s.id
  ) WHERE s.id = NEW.sale_id;
  RETURN NEW;
END; $$;
CREATE TRIGGER sale_items_apply AFTER INSERT ON public.sale_items
FOR EACH ROW EXECUTE FUNCTION public.apply_sale_item();

-- DEMO DATA
INSERT INTO public.suppliers (id, company_name, contact_person, phone, email, address) VALUES
 ('11111111-1111-1111-1111-111111111101','Apex Electronics Co.','Priya Nair','+91 98200 11223','orders@apexelec.com','Plot 42, MIDC, Pune, MH'),
 ('11111111-1111-1111-1111-111111111102','Northline Tools Ltd.','Marcus Webb','+44 20 7946 0912','sales@northlinetools.co.uk','17 Cannon Way, Leeds, UK'),
 ('11111111-1111-1111-1111-111111111103','Shenzhen Optical Labs','Chen Wei','+86 755 8899 1200','wei@szoptical.cn','Bldg 6, Nanshan, Shenzhen');

INSERT INTO public.products (id, name, sku, barcode, category, brand, purchase_price, selling_price, quantity, low_stock_threshold, supplier_id) VALUES
 ('22222222-2222-2222-2222-222222222201','Wireless Mouse Pro','MOU101','8901234500011','Electronics','Nero',14.00,25.00,150,20,'11111111-1111-1111-1111-111111111101'),
 ('22222222-2222-2222-2222-222222222202','Mechanical Keyboard TKL','KB990','8901234500028','Electronics','Titan',96.00,189.00,8,15,'11111111-1111-1111-1111-111111111101'),
 ('22222222-2222-2222-2222-222222222203','27" IPS Monitor','MON270','8901234500035','Displays','Ultrasync',180.00,289.00,42,10,'11111111-1111-1111-1111-111111111103'),
 ('22222222-2222-2222-2222-222222222204','USB-C Docking Station','DOCK03','8901234500042','Accessories','Vantage',140.00,299.00,0,5,'11111111-1111-1111-1111-111111111101'),
 ('22222222-2222-2222-2222-222222222205','Torque Wrench 1/2"','TWR120','8901234500059','Tools','Northline',38.00,72.00,64,12,'11111111-1111-1111-1111-111111111102'),
 ('22222222-2222-2222-2222-222222222206','Fiber Optic Coupler','OPT900','8901234500066','Components','SZ Optics',110.00,189.50,11,15,'11111111-1111-1111-1111-111111111103'),
 ('22222222-2222-2222-2222-222222222207','Thermal Probe Sensor','SEN104','8901234500073','Components','SZ Optics',8.50,15.25,320,50,'11111111-1111-1111-1111-111111111103'),
 ('22222222-2222-2222-2222-222222222208','Laptop Stand Aluminium','STD011','8901234500080','Accessories','Vantage',18.00,39.00,96,20,'11111111-1111-1111-1111-111111111102');

INSERT INTO public.purchases (id, supplier_id, invoice_number, status, total_amount, notes, created_at) VALUES
 ('33333333-3333-3333-3333-333333333301','11111111-1111-1111-1111-111111111101','INV-AP-2291','received',0,'Quarterly restock', now() - interval '9 days'),
 ('33333333-3333-3333-3333-333333333302','11111111-1111-1111-1111-111111111102','INV-NL-0442','received',0,'Tools replenishment', now() - interval '3 days');

INSERT INTO public.sales (id, customer_name, payment_status, total_amount, created_at) VALUES
 ('44444444-4444-4444-4444-444444444401','Redwood Retail Pvt Ltd','paid',0, now() - interval '6 days'),
 ('44444444-4444-4444-4444-444444444402','Walk-in customer','paid',0, now() - interval '1 day'),
 ('44444444-4444-4444-4444-444444444403','Blue Harbour Offices','pending',0, now());

INSERT INTO public.purchase_items (purchase_id, product_id, quantity, unit_price) VALUES
 ('33333333-3333-3333-3333-333333333301','22222222-2222-2222-2222-222222222201',100,14.00),
 ('33333333-3333-3333-3333-333333333301','22222222-2222-2222-2222-222222222203',20,180.00),
 ('33333333-3333-3333-3333-333333333302','22222222-2222-2222-2222-222222222205',40,38.00);

INSERT INTO public.sale_items (sale_id, product_id, quantity, unit_price) VALUES
 ('44444444-4444-4444-4444-444444444401','22222222-2222-2222-2222-222222222201',25,25.00),
 ('44444444-4444-4444-4444-444444444401','22222222-2222-2222-2222-222222222203',4,289.00),
 ('44444444-4444-4444-4444-444444444402','22222222-2222-2222-2222-222222222207',30,15.25),
 ('44444444-4444-4444-4444-444444444403','22222222-2222-2222-2222-222222222208',12,39.00);