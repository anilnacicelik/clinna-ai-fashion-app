-- ================================================================
-- CLINNA v2.0.1 — RevenueCat webhook: tekrar işleme koruması + iade
-- ================================================================
--
-- BU DOSYAYI SUPABASE SQL EDITOR'DA ELLE ÇALIŞTIR.
-- Idempotent'tir: birden fazla kez çalıştırmak güvenlidir.
--
-- NE YAPAR
--   1. public.webhook_events — işlenmiş RevenueCat olaylarının kaydı.
--      Birincil anahtar RevenueCat'in olay id'si (event.id). RevenueCat
--      zaman aşımı / 5xx sonrası aynı olayı tekrar gönderir; kayıt
--      varsa backend krediyi ikinci kez eklemez.
--   2. internal_claim_webhook_event(...)   → olayı kaydetmeyi dener;
--      ilk kez görülüyorsa true, daha önce işlendiyse false döner.
--   3. internal_release_webhook_event(id)  → işleme yarıda kalırsa
--      (ör. Supabase hatası) kaydı geri alır ki RevenueCat'in bir
--      sonraki denemesi tekrar işleyebilsin.
--   4. internal_remove_credits(user, amount) → iade edilen kredi
--      paketini geri alır; kredi 0'ın altına İNMEZ.
--
-- GÜVENLİK
--   Tablo RLS açık, politika yok, anon/authenticated'a hiçbir yetki
--   yok. Fonksiyonlar sadece service_role'e açık.
--
-- ÇALIŞTIRMA SIRASI
--   Backend deploy'undan önce ya da sonra — fark etmez. Backend bu
--   fonksiyonlar yokken eskisi gibi (korumasız) çalışır ve loglara
--   uyarı yazar. İade işleme de bu dosya çalışana kadar devre dışıdır
--   (internal_remove_credits yoksa olay 200 ile "skipped" döner).
-- ================================================================


-- ── 1. Tablo ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.webhook_events (
  event_id     TEXT        PRIMARY KEY,
  event_type   TEXT,
  app_user_id  TEXT,
  product_id   TEXT,
  received_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.webhook_events FROM anon, authenticated;


-- ── 2. Olayı sahiplen ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.internal_claim_webhook_event(
  p_event_id    TEXT,
  p_event_type  TEXT,
  p_app_user_id TEXT,
  p_product_id  TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inserted INTEGER;
BEGIN
  INSERT INTO public.webhook_events (event_id, event_type, app_user_id, product_id)
  VALUES (p_event_id, p_event_type, p_app_user_id, p_product_id)
  ON CONFLICT (event_id) DO NOTHING;
  GET DIAGNOSTICS inserted = ROW_COUNT;
  RETURN inserted > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.internal_claim_webhook_event(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.internal_claim_webhook_event(TEXT, TEXT, TEXT, TEXT) TO service_role;


-- ── 3. Yarıda kalan olayı geri bırak ─────────────────────────────
CREATE OR REPLACE FUNCTION public.internal_release_webhook_event(p_event_id TEXT)
RETURNS VOID
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.webhook_events WHERE event_id = p_event_id;
$$;

REVOKE ALL ON FUNCTION public.internal_release_webhook_event(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.internal_release_webhook_event(TEXT) TO service_role;


-- ── 4. İade edilen krediyi geri al (0'da durur) ──────────────────
CREATE OR REPLACE FUNCTION public.internal_remove_credits(p_user_id UUID, p_amount INT)
RETURNS VOID
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.profiles
  SET credits = GREATEST(0, credits - p_amount)
  WHERE id = p_user_id;
$$;

REVOKE ALL ON FUNCTION public.internal_remove_credits(UUID, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.internal_remove_credits(UUID, INT) TO service_role;


-- ── 5. KONTROL ───────────────────────────────────────────────────
--   SELECT event_id, event_type, product_id, received_at
--   FROM public.webhook_events ORDER BY received_at DESC LIMIT 20;
