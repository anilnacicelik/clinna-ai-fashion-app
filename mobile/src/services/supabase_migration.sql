-- ════════════════════════════════════════════════════════════════
-- CLINNA — Supabase Migration
-- Supabase Dashboard → SQL Editor'e kopyalayıp çalıştır.
-- ════════════════════════════════════════════════════════════════

-- 1. "scans" tablosuna image_url sütunu ekle
--    (tablo yoksa önce oluştur)
CREATE TABLE IF NOT EXISTS scans (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      TIMESTAMPTZ DEFAULT now(),
  user_id         UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  brand           TEXT,
  collection_year TEXT,
  model_name      TEXT,
  legit_score     INTEGER,
  resell_value    TEXT,
  scan_mode       TEXT,
  image_url       TEXT    -- fotoğrafın public Storage URL'si
);

-- Tablo zaten varsa sadece sütunu ekle (hata vermez)
ALTER TABLE scans
  ADD COLUMN IF NOT EXISTS image_url TEXT;

-- 2. Row Level Security — kullanıcı sadece kendi kayıtlarını görsün
ALTER TABLE scans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users see own scans" ON scans;
CREATE POLICY "Users see own scans"
  ON scans FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ════════════════════════════════════════════════════════════════
-- 3. Storage bucket: "scans_images"
--    Dashboard → Storage → New Bucket ile de yapabilirsin.
--    SQL ile yapmak istersen:
-- ════════════════════════════════════════════════════════════════

INSERT INTO storage.buckets (id, name, public)
VALUES ('scans_images', 'scans_images', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policy: kullanıcı kendi klasörüne yükleyebilir
DROP POLICY IF EXISTS "Users upload own images" ON storage.objects;
CREATE POLICY "Users upload own images"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'scans_images'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Public okuma (fotoğrafları herkes görebilsin — image_url zaten public)
DROP POLICY IF EXISTS "Public read scans_images" ON storage.objects;
CREATE POLICY "Public read scans_images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'scans_images');
