-- ================================================================
-- CLINNA v2.0.1 — scans_images bucket'ını PRIVATE yap
-- ================================================================
--
-- BU DOSYAYI SUPABASE SQL EDITOR'DA ELLE ÇALIŞTIR.
-- Idempotent'tir: birden fazla kez çalıştırmak güvenlidir.
--
-- NE YAPAR
--   1. scans_images bucket'ını public = false yapar. /object/public/...
--      adresleri artık çalışmaz; fotoğraflar sadece imzalı (signed) URL
--      ile açılır.
--   2. storage.objects üzerinde scans_images'a dokunan TÜM eski
--      politikaları kaldırır ("Public read scans_images" dahil — bu
--      kural sahibe bakmadığı için anon anahtarla bütün klasörler
--      listelenebiliyordu). Dashboard'dan elle eklenmiş olanlar da
--      adından bağımsız olarak temizlenir.
--   3. Tek bir sahiplik kuralıyla yeniden kurar: yolun ilk parçası
--      (<user_id>/<scan_id>/photo.jpg → <user_id>) auth.uid() olmalı.
--        SELECT  — kendi fotoğraflarını okuyabilir / imzalayabilir
--        INSERT  — sadece kendi klasörüne yükleyebilir
--        DELETE  — sadece kendi fotoğrafını silebilir (arşivden REMOVE)
--      UPDATE yok: uygulama upsert kullanmıyor.
--
-- NEYİ BOZMAZ
--   · Dosyalar silinmez, taşınmaz.
--   · service_role (backend, hesap silme) RLS'e takılmaz.
--   · v2.0.1 istemcisi eski public URL'li kayıtları da açar: URL'den
--     depolama yolunu çıkarıp imzalar (mobile/src/services/scanImages.ts).
--
-- NEYİ BOZAR (bilinçli)
--   · Mağazadaki eski sürümler (v1.0, v2.0.0 build 11) arşiv
--     küçük resimlerini public URL ile gösteriyor. Bu dosya
--     çalıştıktan sonra o sürümlerde küçük resimler boş görünür
--     (uygulama çökmez, Image bileşeni sadece boş kalır). Tarama,
--     arşive kayıt ve yükleme ÇALIŞMAYA DEVAM EDER.
--
-- ÇALIŞTIRMA SIRASI
--   Kod deploy'undan BAĞIMSIZ. Backend bu bucket'a sadece hesap
--   silmede service_role ile dokunuyor. Gizlilik açığı canlıda
--   olduğu için ne kadar erken o kadar iyi; eski sürümlerdeki
--   küçük resim kaybı kabul edilen bedel.
-- ================================================================


-- ── 1. Bucket private ────────────────────────────────────────────
UPDATE storage.buckets
SET    public = false
WHERE  id = 'scans_images';


-- ── 2. scans_images'a dokunan bütün eski politikaları kaldır ─────
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname
    FROM   pg_policies
    WHERE  schemaname = 'storage'
      AND  tablename  = 'objects'
      AND  (coalesce(qual, '') LIKE '%scans_images%'
            OR coalesce(with_check, '') LIKE '%scans_images%')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', pol.policyname);
  END LOOP;
END $$;


-- ── 3. Sahiplik kuralları ────────────────────────────────────────
DROP POLICY IF EXISTS "scans_images_select_own" ON storage.objects;
CREATE POLICY "scans_images_select_own"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'scans_images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "scans_images_insert_own" ON storage.objects;
CREATE POLICY "scans_images_insert_own"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'scans_images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "scans_images_delete_own" ON storage.objects;
CREATE POLICY "scans_images_delete_own"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'scans_images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );


-- ── 4. KONTROL ───────────────────────────────────────────────────
-- Çalıştırdıktan sonra:
--
--   SELECT id, public FROM storage.buckets WHERE id = 'scans_images';
--     → public = false
--
--   SELECT policyname, cmd, roles FROM pg_policies
--   WHERE schemaname = 'storage' AND tablename = 'objects';
--     → scans_images için sadece *_select_own / *_insert_own / *_delete_own
--
-- Anon anahtarla listeleme artık boş dönmeli (daha önce 9 klasör dönüyordu):
--   curl -X POST "$SUPABASE_URL/storage/v1/object/list/scans_images" \
--     -H "apikey: $ANON" -H "Authorization: Bearer $ANON" \
--     -H "Content-Type: application/json" -d '{"prefix":""}'
--     → []
