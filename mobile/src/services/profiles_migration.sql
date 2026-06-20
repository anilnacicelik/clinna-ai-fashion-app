-- ================================================================
-- CLINNA — Profiles + Kredi Sistemi Migration
-- Supabase Dashboard → SQL Editor'de çalıştır
-- ================================================================

-- 1. profiles tablosu
CREATE TABLE IF NOT EXISTS public.profiles (
  id          UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  scans_left  INTEGER     NOT NULL DEFAULT 3,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Row Level Security
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_select_own" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "profiles_insert_own" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

-- 3. Yeni kayıt olan kullanıcıya otomatik profil oluştur (3 hak)
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

-- 4. Atomik decrement RPC — uygulama bu fonksiyonu çağırır
--    GREATEST(0, ...) → negatife düşmez
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

-- 5. Mevcut kullanıcılara profil oluştur (zaten kayıtlıysa)
INSERT INTO public.profiles (id, scans_left)
SELECT id, 3
FROM auth.users
ON CONFLICT (id) DO NOTHING;
