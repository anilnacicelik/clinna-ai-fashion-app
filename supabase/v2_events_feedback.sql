-- ================================================================
-- CLINNA v2 — "BEFORE YOU BUY"
-- events + feedback tabloları ve scans tablosuna v2 kolonları
-- ================================================================
--
-- BU DOSYAYI SUPABASE SQL EDITOR'DA ELLE ÇALIŞTIR.
-- Idempotent'tir: birden fazla kez çalıştırmak güvenlidir.
--
-- Çalıştırılmadan önce de uygulama çöker değil, sadece:
--   · analytics olayları kaydedilmez (console.warn ile geçilir)
--   · feedback gönderimi kullanıcıya dostça hata verir
--   · arşiv kaydı mode/tag_price olmadan yazılır (services/archive.ts
--     eksik kolonu yakalayıp eski kolon setiyle tekrar dener)
--   · HistoryScreen v2 kolonları olmayan select'e düşer
--
-- GÜVENLİK MODELİ (her iki yeni tablo için aynı):
--   · RLS AÇIK
--   · INSERT: authenticated sadece kendi user_id'si ile,
--             anon sadece user_id IS NULL ile
--   · SELECT / UPDATE / DELETE: istemciye İZİN YOK.
--     Veriyi sadece service_role (Supabase Dashboard, sunucu
--     tarafı işler) okuyabilir — RLS'i bypass eder.
-- ================================================================


-- ════════════════════════════════════════════════════════════════
-- 1. events — ürün analitiği
-- ════════════════════════════════════════════════════════════════
-- Kişisel veri YOK: user_id (varsa), olay adı, küçük props JSON,
-- platform ve app_version. E-posta / isim / fotoğraf / serbest
-- metin bu tabloya ASLA yazılmaz — bkz. mobile/src/services/analytics.ts

CREATE TABLE IF NOT EXISTS public.events (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id     UUID        REFERENCES auth.users(id) ON DELETE CASCADE,
  event       TEXT        NOT NULL,
  props       JSONB       NOT NULL DEFAULT '{}'::jsonb,
  platform    TEXT,
  app_version TEXT
);

-- Dashboard'da en çok yapılacak iki sorgu: tarihe ve olay adına göre.
CREATE INDEX IF NOT EXISTS events_created_at_idx ON public.events (created_at DESC);
CREATE INDEX IF NOT EXISTS events_event_idx      ON public.events (event, created_at DESC);

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

-- Oturumu olan kullanıcı sadece kendi user_id'si ile yazabilir.
DROP POLICY IF EXISTS "events_insert_authenticated" ON public.events;
CREATE POLICY "events_insert_authenticated"
  ON public.events FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Oturumsuz (guest) kullanıcı sadece user_id NULL ile yazabilir —
-- başkasının id'sini uyduramaz.
DROP POLICY IF EXISTS "events_insert_anon" ON public.events;
CREATE POLICY "events_insert_anon"
  ON public.events FOR INSERT TO anon
  WITH CHECK (user_id IS NULL);

-- SELECT / UPDATE / DELETE politikası BİLEREK YOK.
-- RLS açıkken politikası olmayan işlem reddedilir; ayrıca grant
-- seviyesinde de kapatıyoruz (Supabase'in public şema için verdiği
-- varsayılan geniş grant'ları geri alarak).
REVOKE ALL ON TABLE public.events FROM anon, authenticated;
GRANT INSERT ON TABLE public.events TO anon, authenticated;


-- ════════════════════════════════════════════════════════════════
-- 2. feedback — uygulama içi geri bildirim
-- ════════════════════════════════════════════════════════════════
-- message kullanıcının yazdığı serbest metindir; bu tablo BU AMAÇLA
-- vardır. events tablosuna serbest metin gitmez.

CREATE TABLE IF NOT EXISTS public.feedback (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id     UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  message     TEXT        NOT NULL CHECK (char_length(message) BETWEEN 1 AND 2000),
  platform    TEXT,
  app_version TEXT
);

CREATE INDEX IF NOT EXISTS feedback_created_at_idx ON public.feedback (created_at DESC);

ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "feedback_insert_authenticated" ON public.feedback;
CREATE POLICY "feedback_insert_authenticated"
  ON public.feedback FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "feedback_insert_anon" ON public.feedback;
CREATE POLICY "feedback_insert_anon"
  ON public.feedback FOR INSERT TO anon
  WITH CHECK (user_id IS NULL);

REVOKE ALL ON TABLE public.feedback FROM anon, authenticated;
GRANT INSERT ON TABLE public.feedback TO anon, authenticated;


-- ════════════════════════════════════════════════════════════════
-- 3. scans — v2 arşiv kolonları
-- ════════════════════════════════════════════════════════════════
-- Yeni depolama yok: arşiv hâlâ public.scans + scans_images bucket.
-- Sadece taramanın hangi modda yapıldığı ve buy modunda etiket
-- fiyatı ekleniyor.
--
--   mode        'buy' | 'full' | 'listing'
--               v2 öncesi satırlarda NULL kalır; istemci NULL'ı
--               'full' sayar (scan_mode = 'listing' olanlar hariç).
--   tag_price   Kullanıcının mağazada etiketten girdiği fiyat (USD).
--               Sadece buy modunda dolu; SKIP denmişse NULL.
--   markup_pct  round((tag_price - üretim maliyeti) / tag_price * 100)
--               HistoryScreen bunu raporu tekrar açmadan gösterebilsin
--               diye satıra yazılır. Markup hesaplanamıyorsa NULL.

ALTER TABLE public.scans
  ADD COLUMN IF NOT EXISTS mode       TEXT,
  ADD COLUMN IF NOT EXISTS tag_price  NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS markup_pct INTEGER;

-- Beklenmeyen bir değer yazılmasın; NULL serbest (eski satırlar).
ALTER TABLE public.scans DROP CONSTRAINT IF EXISTS scans_mode_check;
ALTER TABLE public.scans
  ADD CONSTRAINT scans_mode_check
  CHECK (mode IS NULL OR mode IN ('buy', 'full', 'listing'));

-- scans üzerindeki RLS ve "Users see own scans" politikası
-- DEĞİŞMEDİ — bkz. mobile/services/complete_setup.sql.


-- ════════════════════════════════════════════════════════════════
-- 4. KONTROL
-- ════════════════════════════════════════════════════════════════
-- Çalıştırdıktan sonra bunlarla doğrulayabilirsin:
--
--   SELECT column_name, data_type
--   FROM information_schema.columns
--   WHERE table_schema = 'public' AND table_name = 'scans'
--     AND column_name IN ('mode', 'tag_price', 'markup_pct');
--
--   SELECT tablename, policyname, cmd, roles
--   FROM pg_policies
--   WHERE schemaname = 'public' AND tablename IN ('events', 'feedback');
--
--   SELECT event, count(*) FROM public.events GROUP BY 1 ORDER BY 2 DESC;
--   SELECT created_at, message FROM public.feedback ORDER BY 1 DESC LIMIT 50;
