-- ================================================================
-- CLINNA — Full Migration (Profiles + Credits & Pro System)
-- Supabase Dashboard → SQL Editor'de çalıştır
-- Sıra önemlidir: önce profiles, sonra credits eklenir.
-- ================================================================

-- ════════════════════════════════════════════════════════════════
-- BÖLÜM 1: PROFILES (profiles_migration.sql)
-- ════════════════════════════════════════════════════════════════

-- ── 1. profiles tablosu ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profiles (
  id          UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  scans_left  INTEGER     NOT NULL DEFAULT 3,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 2. Row Level Security ────────────────────────────────────────
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_select_own" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "profiles_insert_own" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

-- ── 3. Yeni kayıt olan kullanıcıya otomatik profil oluştur ──────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.profiles (id, scans_left)
  VALUES (NEW.id, 3)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ── 4. Atomik decrement RPC ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.decrement_scans_left()
RETURNS INTEGER
LANGUAGE SQL
SECURITY DEFINER
AS $$
  UPDATE public.profiles
  SET scans_left = GREATEST(0, scans_left - 1)
  WHERE id = auth.uid()
  RETURNING scans_left;
$$;

-- ── 5. Mevcut kullanıcılara profil oluştur ───────────────────────
INSERT INTO public.profiles (id, scans_left)
SELECT id, 3
FROM auth.users
ON CONFLICT (id) DO NOTHING;


-- ════════════════════════════════════════════════════════════════
-- BÖLÜM 2: CREDITS & PRO SYSTEM (credits_migration.sql)
-- ════════════════════════════════════════════════════════════════

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

-- Trigger zaten yukarıda oluşturuldu; fonksiyon güncellendi.

-- ── 4. use_credit() ─────────────────────────────────────────────
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

-- ── 7. RLS policies (idempotent) ────────────────────────────────
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
