-- ================================================================
-- CLINNA — Credits & Pro System Migration
-- Supabase Dashboard → SQL Editor'de çalıştır
-- Önkoşul: profiles_migration.sql çalıştırılmış olmalı
-- ================================================================

-- ── 1. profiles tablosuna yeni kolonlar ─────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS credits          INTEGER     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_pro           BOOLEAN     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pro_expires_at   TIMESTAMPTZ          DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS total_scans_used INTEGER     NOT NULL DEFAULT 0;

-- ── 2. scans_left default: 3 → 2 ───────────────────────────────
ALTER TABLE public.profiles
  ALTER COLUMN scans_left SET DEFAULT 2;

-- ── 3. Yeni kullanıcı trigger'ını güncelle (scans_left=2) ───────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.profiles (id, scans_left, credits, is_pro, total_scans_used)
  VALUES (NEW.id, 2, 0, false, 0)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Trigger zaten varsa yeniden oluşturma gerekmez; fonksiyon güncellendi.

-- ── 4. use_credit() ─────────────────────────────────────────────
--    credits > 0 ise 1 azalt ve TRUE döndür; aksi hâlde FALSE.
CREATE OR REPLACE FUNCTION public.use_credit()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  rows_updated INTEGER;
BEGIN
  UPDATE public.profiles
  SET credits = credits - 1
  WHERE id = auth.uid()
    AND credits > 0;

  GET DIAGNOSTICS rows_updated = ROW_COUNT;
  RETURN rows_updated > 0;
END;
$$;

-- ── 5. is_pro_active() ──────────────────────────────────────────
--    is_pro = true VE pro_expires_at henüz geçmemişse TRUE döner.
CREATE OR REPLACE FUNCTION public.is_pro_active()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result BOOLEAN;
BEGIN
  SELECT (is_pro = true AND pro_expires_at > NOW())
  INTO result
  FROM public.profiles
  WHERE id = auth.uid();

  RETURN COALESCE(result, false);
END;
$$;

-- ── 6. get_user_entitlement() ───────────────────────────────────
--    {scans_left, credits, is_pro, is_pro_active} JSON döndürür.
--    Profil yoksa sıfır değerli JSON döner — asla hata vermez.
CREATE OR REPLACE FUNCTION public.get_user_entitlement()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  rec        RECORD;
  pro_active BOOLEAN;
BEGIN
  SELECT scans_left, credits, is_pro, pro_expires_at
  INTO rec
  FROM public.profiles
  WHERE id = auth.uid();

  IF NOT FOUND THEN
    RETURN json_build_object(
      'scans_left',    0,
      'credits',       0,
      'is_pro',        false,
      'is_pro_active', false
    );
  END IF;

  pro_active := rec.is_pro = true AND rec.pro_expires_at > NOW();

  RETURN json_build_object(
    'scans_left',    rec.scans_left,
    'credits',       rec.credits,
    'is_pro',        rec.is_pro,
    'is_pro_active', COALESCE(pro_active, false)
  );
END;
$$;

-- ── 7. RLS policies ─────────────────────────────────────────────
--    RLS profiles_migration.sql'de enable edildi.
--    Policies yoksa ekle; varsa dokunma.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'profiles'
      AND policyname = 'profiles_select_own'
  ) THEN
    CREATE POLICY "profiles_select_own" ON public.profiles
      FOR SELECT USING (auth.uid() = id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'profiles'
      AND policyname = 'profiles_insert_own'
  ) THEN
    CREATE POLICY "profiles_insert_own" ON public.profiles
      FOR INSERT WITH CHECK (auth.uid() = id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'profiles'
      AND policyname = 'profiles_update_own'
  ) THEN
    CREATE POLICY "profiles_update_own" ON public.profiles
      FOR UPDATE USING (auth.uid() = id);
  END IF;
END;
$$;
