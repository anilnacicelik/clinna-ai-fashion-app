-- ================================================================
-- CLINNA — Complete Setup (idempotent, tek dosya)
-- Supabase Dashboard → SQL Editor'de çalıştır.
--
-- Bu dosya full_migration.sql + credits_migration.sql +
-- security_hardening_migration.sql + marketing_consent_migration.sql +
-- supabase_migration.sql + fix_rls_permissions.sql'in tamamını TEK
-- idempotent script'te birleştirir. Sıfır DB'de de, kısmen kurulu
-- bir DB'de de güvenle çalıştırılabilir (CREATE OR REPLACE / IF NOT
-- EXISTS / DROP ... IF EXISTS kullanılıyor).
--
-- NEDEN BU DOSYA VAR: "ERROR: 42883: function decrement_scans_left()
-- does not exist" hatası, security_hardening_migration.sql'in bu
-- fonksiyonu silmesinden DEĞİL — full_migration.sql'in bu Supabase
-- projesinde hiç çalıştırılmamış olmasından kaynaklanıyordu.
-- Bundan sonra tek doğruluk kaynağı bu dosya olsun.
-- ================================================================


-- ════════════════════════════════════════════════════════════════
-- 1. TABLOLAR
-- ════════════════════════════════════════════════════════════════

-- ── 1a. profiles ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profiles (
  id          UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  scans_left  INTEGER     NOT NULL DEFAULT 2,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS credits            INTEGER     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_pro             BOOLEAN     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pro_expires_at     TIMESTAMPTZ          DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS total_scans_used   INTEGER     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS marketing_consent  BOOLEAN     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS consent_updated_at TIMESTAMPTZ          DEFAULT NULL;

ALTER TABLE public.profiles
  ALTER COLUMN scans_left SET DEFAULT 2;

-- ── 1b. scans ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.scans (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      TIMESTAMPTZ DEFAULT now(),
  user_id         UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  brand           TEXT,
  collection_year TEXT,
  model_name      TEXT,
  legit_score     INTEGER,
  resell_value    TEXT,
  scan_mode       TEXT,
  image_url       TEXT
);

ALTER TABLE public.scans
  ADD COLUMN IF NOT EXISTS image_url TEXT;

-- Tablo bu dosyadan önce zaten oluşmuş olabilir — DEFAULT'u garanti et.
-- ("Users see own scans" WITH CHECK (auth.uid() = user_id) için gerekli;
--  client user_id göndermezse INSERT RLS'e takılıyordu.)
ALTER TABLE public.scans
  ALTER COLUMN user_id SET DEFAULT auth.uid();


-- ════════════════════════════════════════════════════════════════
-- 2. STORAGE BUCKET
-- ════════════════════════════════════════════════════════════════

INSERT INTO storage.buckets (id, name, public)
VALUES ('scans_images', 'scans_images', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Users upload own images" ON storage.objects;
CREATE POLICY "Users upload own images"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'scans_images'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
-- Client path: "<user_id>/<scanId>/photo.ext" (mobile/src/services/storageUpload.ts)

DROP POLICY IF EXISTS "Public read scans_images" ON storage.objects;
CREATE POLICY "Public read scans_images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'scans_images');


-- ════════════════════════════════════════════════════════════════
-- 3. ROW LEVEL SECURITY
-- ════════════════════════════════════════════════════════════════

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scans    ENABLE ROW LEVEL SECURITY;

-- ── profiles: SELECT + INSERT own row only ─────────────────────
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
CREATE POLICY "profiles_select_own" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
CREATE POLICY "profiles_insert_own" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- NOT: "profiles_update_own" BİLEREK YOK. credits / is_pro /
-- pro_expires_at / scans_left'e client'ın doğrudan UPDATE atması
-- yasak — tüm yazımlar aşağıdaki SECURITY DEFINER RPC'ler üzerinden,
-- her biri kendi auth.uid() satırına, kontrollü mantıkla yapılır.
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;

-- ── scans: kullanıcı sadece kendi kayıtlarını görür/yazar ───────
DROP POLICY IF EXISTS "Users see own scans" ON public.scans;
CREATE POLICY "Users see own scans"
  ON public.scans FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);


-- ════════════════════════════════════════════════════════════════
-- 4. YENİ KULLANICI TRIGGER'I
-- ════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, scans_left, credits, is_pro, total_scans_used)
  VALUES (NEW.id, 2, 0, false, 0)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Mevcut kullanıcılara profil oluştur (zaten kayıtlıysa dokunmaz)
INSERT INTO public.profiles (id, scans_left)
SELECT id, 2
FROM auth.users
ON CONFLICT (id) DO NOTHING;


-- ════════════════════════════════════════════════════════════════
-- 5. CLIENT-FACING RPC'LER (authenticated) — hepsi auth.uid() scoped
-- ════════════════════════════════════════════════════════════════

-- ── decrement_scans_left() ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.decrement_scans_left()
RETURNS INTEGER
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.profiles
  SET scans_left = GREATEST(0, scans_left - 1)
  WHERE id = auth.uid()
  RETURNING scans_left;
$$;

REVOKE ALL ON FUNCTION public.decrement_scans_left() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.decrement_scans_left() TO authenticated;

-- ── use_credit() ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.use_credit()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

REVOKE ALL ON FUNCTION public.use_credit() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.use_credit() TO authenticated;

-- ── is_pro_active() ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_pro_active()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

REVOKE ALL ON FUNCTION public.is_pro_active() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_pro_active() TO authenticated;

-- ── get_user_entitlement() ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_user_entitlement()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

REVOKE ALL ON FUNCTION public.get_user_entitlement() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_entitlement() TO authenticated;

-- ── set_marketing_consent(boolean) ─────────────────────────────────
-- Kullanıcı yalnızca kendi rızasını değiştirir — service_role kısıtı
-- yok, zararsız bir client-triggered işlem.
CREATE OR REPLACE FUNCTION public.set_marketing_consent(consent BOOLEAN)
RETURNS VOID
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.profiles
  SET marketing_consent  = consent,
      consent_updated_at = NOW()
  WHERE id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.set_marketing_consent(BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_marketing_consent(BOOLEAN) TO authenticated;


-- ════════════════════════════════════════════════════════════════
-- 6. SADECE service_role ÇAĞIRABİLEN DAHİLİ RPC'LER
--    (RevenueCat webhook — backend/routers/webhooks.py, service_role
--    key ile. credits/is_pro/pro_expires_at'e ulaşan TEK yol bunlar.)
-- ════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.internal_add_credits(p_user_id UUID, p_amount INT)
RETURNS VOID
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.profiles
  SET credits = credits + p_amount
  WHERE id = p_user_id;
$$;

REVOKE ALL ON FUNCTION public.internal_add_credits(UUID, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.internal_add_credits(UUID, INT) TO service_role;

CREATE OR REPLACE FUNCTION public.internal_set_pro(p_user_id UUID, p_expires_at TIMESTAMPTZ)
RETURNS VOID
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.profiles
  SET is_pro = true,
      pro_expires_at = GREATEST(COALESCE(pro_expires_at, p_expires_at), p_expires_at)
  WHERE id = p_user_id;
$$;

REVOKE ALL ON FUNCTION public.internal_set_pro(UUID, TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.internal_set_pro(UUID, TIMESTAMPTZ) TO service_role;

CREATE OR REPLACE FUNCTION public.internal_expire_pro(p_user_id UUID)
RETURNS VOID
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.profiles
  SET is_pro = false
  WHERE id = p_user_id;
$$;

REVOKE ALL ON FUNCTION public.internal_expire_pro(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.internal_expire_pro(UUID) TO service_role;


-- ════════════════════════════════════════════════════════════════
-- 7. DOĞRULAMA (opsiyonel — elle çalıştır)
-- ════════════════════════════════════════════════════════════════
-- Boş dönmeli (client'ın profiles'a doğrudan UPDATE hakkı olmamalı):
--   SELECT * FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'profiles_update_own';
--
-- authenticated + service_role hakları görünmeli:
--   SELECT proname, proacl FROM pg_proc WHERE proname IN
--     ('decrement_scans_left','use_credit','get_user_entitlement',
--      'is_pro_active','set_marketing_consent','internal_add_credits',
--      'internal_set_pro','internal_expire_pro');
--
-- Tüm politikalar görünmeli:
--   SELECT tablename, policyname FROM pg_policies
--   WHERE tablename IN ('profiles','scans','objects');
