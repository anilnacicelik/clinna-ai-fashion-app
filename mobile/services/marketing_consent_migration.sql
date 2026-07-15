-- ================================================================
-- CLINNA — Marketing Consent Migration
-- Supabase Dashboard → SQL Editor'de çalıştır (full_migration.sql
-- ve security_hardening_migration.sql'den SONRA).
-- ================================================================

-- ── 1. profiles tablosuna consent kolonları ─────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS marketing_consent  BOOLEAN     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS consent_updated_at TIMESTAMPTZ          DEFAULT NULL;

-- ── 2. set_marketing_consent() — kullanıcı kendi rızasını günceller ──
-- auth.uid() ile scoped; client sadece kendi satırını değiştirebilir.
-- profiles_update_own politikası security_hardening_migration.sql'de
-- kaldırıldığı için client'ın doğrudan UPDATE yetkisi yok — bu RPC
-- SECURITY DEFINER olduğundan RLS'i bypass ederek yalnızca çağıranın
-- kendi satırını (auth.uid()) günceller.
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

-- Herhangi bir authenticated kullanıcı kendi rızasını değiştirebilmeli —
-- diğer RPC'lerden (decrement_scans_left vb.) farklı olarak burada
-- service_role kısıtlaması YOK, çünkü bu client-triggered, kullanıcının
-- kendi tercihini ayarladığı zararsız bir işlem.
GRANT EXECUTE ON FUNCTION public.set_marketing_consent(BOOLEAN) TO authenticated;
