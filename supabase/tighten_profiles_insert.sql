-- ================================================================
-- CLINNA v2.0.1 — profiles_insert_own kuralını sıkılaştır
-- ================================================================
--
-- BU DOSYAYI SUPABASE SQL EDITOR'DA ELLE ÇALIŞTIR.
-- Idempotent'tir: birden fazla kez çalıştırmak güvenlidir.
--
-- SORUN
--   Eski kural sadece "id = auth.uid()" kontrol ediyordu. Profil satırı
--   olmayan bir kullanıcı kendi satırını credits = 9999, is_pro = true
--   gibi değerlerle ekleyebilirdi. (Normalde kayıt tetikleyicisi satırı
--   oluşturduğu için INSERT çakışıp başarısız olur; ama tetikleyici bir
--   kez bile atlanırsa kapı açık kalıyordu.)
--
-- YENİ KURAL
--   Kullanıcı kendi satırını SADECE varsayılan haklarla ekleyebilir:
--     credits = 0, is_pro = false, pro_expires_at IS NULL,
--     scans_left 0..2 (yeni kullanıcı varsayılanı 2),
--     total_scans_used = 0.
--
-- NEYİ BOZMAZ
--   mobile/src/hooks/useScansLeft.ts:27 satır yoksa
--   { id, scans_left: 2 } upsert ediyor — bu satır yeni kurala uyar.
--   (Not: get_user_entitlement() satır yokken hata değil sıfırlı bir
--   nesne döndüğü için o dal pratikte hiç çalışmıyor. Satırı olmayan
--   kullanıcının satırını artık backend consume_scan_credit() ilk
--   taramada varsayılanlarla oluşturuyor.)
--   Kayıt tetikleyicisi (handle_new_user) SECURITY DEFINER olduğu için
--   RLS'e takılmaz.
--
-- ÇALIŞTIRMA SIRASI
--   Bağımsız — istediğin zaman.
-- ================================================================

DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
CREATE POLICY "profiles_insert_own" ON public.profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = id
    AND credits = 0
    AND is_pro = false
    AND pro_expires_at IS NULL
    AND scans_left BETWEEN 0 AND 2
    AND total_scans_used = 0
  );

-- KONTROL:
--   SELECT policyname, cmd, with_check FROM pg_policies
--   WHERE schemaname = 'public' AND tablename = 'profiles';
