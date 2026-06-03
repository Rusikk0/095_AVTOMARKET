-- Защита от самостоятельного создания магазинов и регистрации
-- Выполните этот код в SQL Editor вашего проекта Supabase

-- 1. Блокировка самостоятельной регистрации на уровне Supabase Auth
-- (не позволяет создавать новых пользователей через публичный signUp)
ALTER ROLE authenticator SET statement_timeout = '30s';

-- Включаем настройку Supabase Auth: отключаем самостоятельную регистрацию
-- (выполните вручную: Supabase Dashboard → Authentication → Settings →
--  "Enable Email Signups" = OFF)

-- 2. Обновление функции create_store: только существующие админы могут создавать новые магазины
-- Первый магазин можно создать только через SQL Editor вручную
CREATE OR REPLACE FUNCTION public.create_store(p_name TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_store_id UUID;
  v_name TEXT;
  v_is_admin BOOLEAN;
  v_store_count INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_name := trim(p_name);
  IF v_name = '' THEN
    RAISE EXCEPTION 'Store name required';
  END IF;

  -- Проверяем: пользователь уже является админом какого-либо магазина?
  SELECT EXISTS (
    SELECT 1 FROM public.store_members
    WHERE user_id = auth.uid() AND role = 'admin' AND active = true
  ) INTO v_is_admin;

  -- Сколько всего магазинов в системе?
  SELECT COUNT(*) INTO v_store_count FROM public.stores;

  -- Разрешаем создание только если:
  -- 1) Пользователь уже админ (создаёт ещё один магазин)
  -- 2) В системе нет ни одного магазина (первичная настройка через SQL Editor)
  IF NOT v_is_admin AND v_store_count > 0 THEN
    RAISE EXCEPTION 'Только существующий администратор может создавать магазины. Обратитесь к администратору.';
  END IF;

  INSERT INTO public.stores (name, owner_id)
  VALUES (v_name, auth.uid())
  RETURNING id INTO v_store_id;

  INSERT INTO public.store_members (store_id, user_id, role, display_name)
  SELECT v_store_id, auth.uid(), 'admin',
    COALESCE((SELECT display_name FROM public.profiles WHERE id = auth.uid()), 'Администратор');

  RETURN v_store_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_store(TEXT) TO authenticated;
