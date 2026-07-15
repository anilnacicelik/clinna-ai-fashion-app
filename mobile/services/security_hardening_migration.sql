-- ================================================================
-- CLINNA — Security Hardening Migration
-- Supabase Dashboard → SQL Editor'de çalıştır (full_migration.sql'den SONRA)
--
-- SORUN: "profiles_update_own" RLS politikası WITH CHECK içermiyordu.
-- Herhangi bir kullanıcı kendi JWT'si + public anon key ile doğrudan
-- REST API'ye PATCH atarak credits/is_pro/pro_expires_at alanlarını
-- İSTEDİĞİ DEĞERE ayarlayabiliyordu (ödeme yapmadan sınırsız erişim).
-- mobile/src/services/purchases.ts bu tabloya client'tan doğrudan
-- yazıyordu — bu davranış artık kaldırıldı, tüm yazma işlemleri
-- backend/routers/webhooks.py (RevenueCat webhook, service_role key ile)
-- üzerinden yapılıyor.
-- ================================================================

-- ── 1. Client'ın profiles tablosuna doğrudan UPDATE atmasını engelle ──
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;

-- ── 2. Sadece service_role çağırabilen, sabit/doğrulanmış değerlerle
--       çalışan dahili RPC'ler ──────────────────────────────────────

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

-- ── 3. Doğrulama (opsiyonel) ─────────────────────────────────────
-- Aşağıdaki sorgu artık "profiles_update_own" için sonuç dönmemeli:
-- SELECT * FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'profiles_update_own';
