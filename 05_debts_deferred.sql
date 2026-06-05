-- ============================================================
-- SANAQ — Долги и отложенные товары
-- Выполните в Supabase SQL Editor
-- ============================================================

-- ─── Должники ───
CREATE TABLE IF NOT EXISTS public.debtors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  rating TEXT NOT NULL DEFAULT 'good' CHECK (rating IN ('good', 'warning', 'bad')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_debtors_store ON public.debtors(store_id);

ALTER TABLE public.debtors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "debtors_select" ON public.debtors
  FOR SELECT TO authenticated USING (public.is_store_member(store_id));

CREATE POLICY "debtors_write" ON public.debtors
  FOR ALL TO authenticated
  USING (public.is_store_member(store_id))
  WITH CHECK (public.is_store_member(store_id));

-- ─── Записи долгов ───
CREATE TABLE IF NOT EXISTS public.debts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  debtor_id UUID NOT NULL REFERENCES public.debtors(id) ON DELETE CASCADE,
  product_code TEXT NOT NULL DEFAULT '',
  product_name TEXT NOT NULL,
  quantity NUMERIC(12, 2) NOT NULL DEFAULT 1,
  amount NUMERIC(14, 2) NOT NULL,
  cashier_name TEXT NOT NULL DEFAULT '',
  due_date DATE,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'paid', 'cancelled')),
  note TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_debts_store ON public.debts(store_id);
CREATE INDEX IF NOT EXISTS idx_debts_debtor ON public.debts(debtor_id);

ALTER TABLE public.debts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "debts_select" ON public.debts
  FOR SELECT TO authenticated USING (public.is_store_member(store_id));

CREATE POLICY "debts_write" ON public.debts
  FOR ALL TO authenticated
  USING (public.is_store_member(store_id))
  WITH CHECK (public.is_store_member(store_id));

-- ─── Отложенные товары ───
CREATE TABLE IF NOT EXISTS public.deferred_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  customer_name TEXT NOT NULL DEFAULT '',
  customer_phone TEXT NOT NULL DEFAULT '',
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  product_code TEXT NOT NULL DEFAULT '',
  product_name TEXT NOT NULL DEFAULT '',
  quantity NUMERIC(12, 2) NOT NULL DEFAULT 1,
  unit_price NUMERIC(14, 2) NOT NULL DEFAULT 0,
  total NUMERIC(14, 2) NOT NULL DEFAULT 0,
  cashier_name TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'cancelled')),
  note TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_deferred_store ON public.deferred_items(store_id);

ALTER TABLE public.deferred_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deferred_select" ON public.deferred_items
  FOR SELECT TO authenticated USING (public.is_store_member(store_id));

CREATE POLICY "deferred_write" ON public.deferred_items
  FOR ALL TO authenticated
  USING (public.is_store_member(store_id))
  WITH CHECK (public.is_store_member(store_id));
