-- ================================================================
-- CLINNA — Fix RLS / Permissions Migration (TestFlight build 4)
-- Supabase Dashboard → SQL Editor'de çalıştır
-- (full_migration.sql, security_hardening_migration.sql ve
--  marketing_consent_migration.sql'den SONRA)
--
-- SORUN 1 — decrement_scans_left() / use_credit() her çağrıda hata
-- dönüyordu: bu iki fonksiyon full_migration.sql / credits_migration.sql
-- içinde CREATE FUNCTION ile oluşturulurken hiçbir zaman açık bir
-- GRANT EXECUTE almadı. security_hardening_migration.sql, internal_*
-- fonksiyonları için "REVOKE ALL FROM PUBLIC + GRANT TO service_role"
-- desenini getirdi ama decrement_scans_left/use_credit'e dokunmadı —
-- yani bu ikisi projede "varsayılan haklarına" bağlı kaldı. Bu migration
-- onları aynı sertleştirme deseniyle authenticated role'e AÇIKÇA
-- yetkilendiriyor, mevcut durumdan bağımsız olarak (idempotent).
--
-- SORUN 2 — "scans" tablosuna INSERT her zaman RLS ihlali veriyordu:
-- mobile/src/screens/ResultScreen.tsx → saveToArchive() satırı INSERT
-- ederken hiçbir zaman user_id set etmiyordu. scans.user_id kolonunun
-- DEFAULT'u da yok — yani eklenen satırda user_id = NULL oluyordu.
-- "Users see own scans" politikası WITH CHECK (auth.uid() = user_id)
-- gerektiriyor; auth.uid() asla NULL'a eşit olamayacağı için INSERT
-- RLS tarafından reddediliyordu (→ [ SAVE FAILED ]). Fix: user_id
-- kolonuna DEFAULT auth.uid() eklendi (client kodu da ayrıca artık
-- user_id'yi açıkça gönderiyor — bkz. ResultScreen.tsx değişikliği).
--
-- SORUN 3 — Storage upload'ı da aynı zincirin parçası değildi ama
-- ayrı bir bug barındırıyordu: "Users upload own images" politikası
-- (storage.foldername(name))[1] = auth.uid() bekliyor, ama
-- storageUpload.ts dosyası yükleme yolunu "scans/<scanId>/photo.ext"
-- olarak kuruyordu — ilk klasör segmenti sabit "scans" string'i,
-- kullanıcının auth.uid()'si DEĞİL. Bu yüzden upload RLS'i her zaman
-- reddediyordu (sessizce — saveToArchive dönüş değerini kontrol
-- etmediği için "SAVE FAILED" olarak DEĞİL, sessiz bir storage hatası
-- olarak görünüyordu). Politika zaten doğruydu; fix client tarafında
-- yapıldı: path artık "<user_id>/<scanId>/photo.ext". SQL değişikliği
-- gerekmiyor — burada sadece doğrulama için politika yeniden beyan
-- ediliyor (idempotent, davranış değişmiyor).
--
-- credits / is_pro / pro_expires_at'e client'ın DOĞRUDAN tablo
-- UPDATE'i hâlâ YASAK: "profiles_update_own" politikası bilerek geri
-- getirilMİYOR. scans_left/credits güncellemeleri sadece SECURITY
-- DEFINER RPC'ler (decrement_scans_left, use_credit) üzerinden,
-- yalnızca auth.uid() = id satırına, kontrollü mantıkla yapılabilir.
-- ================================================================

-- ── 1. decrement_scans_left() — authenticated açıkça yetkilendir ──
REVOKE ALL ON FUNCTION public.decrement_scans_left() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.decrement_scans_left() TO authenticated;

-- ── 2. use_credit() — authenticated açıkça yetkilendir ────────────
REVOKE ALL ON FUNCTION public.use_credit() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.use_credit() TO authenticated;

-- ── 3. get_user_entitlement() / is_pro_active() — savunma amaçlı,
--       aynı desenle açıkça belgelenip yetkilendiriliyor ───────────
REVOKE ALL ON FUNCTION public.get_user_entitlement() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_entitlement() TO authenticated;

REVOKE ALL ON FUNCTION public.is_pro_active() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_pro_active() TO authenticated;

-- ── 4. scans.user_id — INSERT sırasında client unutsa bile RLS'i
--       geçebilsin diye DEFAULT auth.uid() eklendi ────────────────
ALTER TABLE public.scans
  ALTER COLUMN user_id SET DEFAULT auth.uid();

-- ── 5. "scans" RLS politikası zaten doğruydu — sadece doğrulama
--       amaçlı yeniden beyan (idempotent, davranış aynı) ──────────
DROP POLICY IF EXISTS "Users see own scans" ON public.scans;
CREATE POLICY "Users see own scans"
  ON public.scans FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── 6. Storage politikası zaten doğruydu — sadece doğrulama
--       amaçlı yeniden beyan (idempotent, davranış aynı).
--       Client artık "<user_id>/<scanId>/photo.ext" yoluna yüklüyor. ─
DROP POLICY IF EXISTS "Users upload own images" ON storage.objects;
CREATE POLICY "Users upload own images"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'scans_images'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- ── 7. profiles.credits / is_pro / pro_expires_at direkt client
--       yazımı hâlâ kapalı — "profiles_update_own" bilerek YOK.
--       Aşağıdaki sorgu boş dönmeli: ──────────────────────────────
-- SELECT * FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'profiles_update_own';

-- ── 8. Doğrulama (opsiyonel) ───────────────────────────────────────
-- SELECT proname, proacl FROM pg_proc WHERE proname IN
--   ('decrement_scans_left', 'use_credit', 'get_user_entitlement', 'is_pro_active');
-- SELECT * FROM pg_policies WHERE tablename IN ('scans', 'objects');
