-- ================================================================
-- CLINNA v2.0.1 — kredi kontrolü ve düşümü SUNUCUYA taşınıyor
-- ================================================================
--
-- BU DOSYAYI SUPABASE SQL EDITOR'DA ELLE ÇALIŞTIR.
-- Idempotent'tir. Tek transaction içinde çalışır: ya hepsi uygulanır
-- ya hiçbiri — sunucu düşümünün açılması ile istemci düşümünün
-- kapanması AYNI ANDA olur, arada çift düşüm penceresi kalmaz.
--
-- NE YAPAR
--   1. consume_scan_credit(user_id)  — backend, Gemini'yi çağırmadan
--      önce çağırır. Satırı kilitler (FOR UPDATE), sırayla bakar:
--        Pro aktif      → izin, düşüm YOK          source = 'pro'
--        scans_left > 0 → scans_left - 1            source = 'free'
--        credits > 0    → credits - 1               source = 'credit'
--        hiçbiri        → ok = false, error = 'no_credits'
--      Sıra, istemcinin eskiden kullandığı sırayla aynı
--      (CameraScreen: pro → scans_left → credit).
--   2. refund_scan_credit(user_id, source) — analiz başarısız olursa
--      (Gemini hatası, zaman aşımı, "moda ürünü değil") backend
--      tüketilen hakkı geri verir. 'pro' için hiçbir şey yapmaz.
--   3. ESKİ İSTEMCİ RPC'LERİNİ ETKİSİZLEŞTİRİR:
--      decrement_scans_left() ve use_credit() artık hiçbir şey
--      düşmez. Mağazadaki eski sürümler (v1.0, v2.0.0) tarama
--      bittikten sonra bunları çağırmaya devam ediyor; sunucu zaten
--      düştüğü için ikinci düşüm olmasın diye:
--        decrement_scans_left() → güncel scans_left'i döner
--        use_credit()           → true döner (eski istemci ekranda
--                                 krediyi bir azaltır; sunucu da
--                                 bir azaltmış olduğu için tutarlı)
--
-- ÇALIŞTIRMA SIRASI — ÖNEMLİ
--   1. Backend commit'i push edilip Railway deploy'u bittikten SONRA.
--      (Yeni backend bu fonksiyonlar yokken eski davranışla çalışır:
--      düşüm yapmaz, eski istemci kendi düşümünü yapar. Bu dosya
--      çalıştığı an sunucu yetkili olur.)
--   2. v2.0.1 build'i mağazaya çıkmadan ÖNCE. Yeni istemci kendi
--      düşümünü yapmıyor; bu dosya çalışmadan yeni build yayına
--      girerse kimse düşmez.
--
-- Backend çağrısı service_role ile yapılır; bu fonksiyonlara
-- istemciden (anon/authenticated) erişim YOK.
-- ================================================================

BEGIN;

-- ── 1. consume_scan_credit ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.consume_scan_credit(p_user_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec        RECORD;
  v_source   TEXT;
  pro_active BOOLEAN;
BEGIN
  -- Profil satırı normalde kayıt tetikleyicisiyle oluşur; yoksa
  -- varsayılanlarla (2 ücretsiz tarama) oluştur ki kullanıcı kilitli
  -- kalmasın.
  INSERT INTO public.profiles (id) VALUES (p_user_id)
  ON CONFLICT (id) DO NOTHING;

  SELECT scans_left, credits, is_pro, pro_expires_at
  INTO   rec
  FROM   public.profiles
  WHERE  id = p_user_id
  FOR UPDATE;

  pro_active := COALESCE(rec.is_pro = true AND rec.pro_expires_at > NOW(), false);

  IF pro_active THEN
    v_source := 'pro';
  ELSIF rec.scans_left > 0 THEN
    UPDATE public.profiles SET scans_left = scans_left - 1 WHERE id = p_user_id
    RETURNING scans_left INTO rec.scans_left;
    v_source := 'free';
  ELSIF rec.credits > 0 THEN
    UPDATE public.profiles SET credits = credits - 1 WHERE id = p_user_id
    RETURNING credits INTO rec.credits;
    v_source := 'credit';
  ELSE
    RETURN json_build_object(
      'ok',            false,
      'error',         'no_credits',
      'scans_left',    rec.scans_left,
      'credits',       rec.credits,
      'is_pro_active', false
    );
  END IF;

  RETURN json_build_object(
    'ok',            true,
    'source',        v_source,
    'scans_left',    rec.scans_left,
    'credits',       rec.credits,
    'is_pro_active', pro_active
  );
END;
$$;

REVOKE ALL ON FUNCTION public.consume_scan_credit(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_scan_credit(UUID) TO service_role;


-- ── 2. refund_scan_credit ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.refund_scan_credit(p_user_id UUID, p_source TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec RECORD;
BEGIN
  IF p_source = 'free' THEN
    UPDATE public.profiles SET scans_left = scans_left + 1 WHERE id = p_user_id;
  ELSIF p_source = 'credit' THEN
    UPDATE public.profiles SET credits = credits + 1 WHERE id = p_user_id;
  END IF;
  -- 'pro' ve bilinmeyen değerler: düşüm olmadı, iade de yok.

  SELECT scans_left, credits, is_pro, pro_expires_at
  INTO   rec
  FROM   public.profiles
  WHERE  id = p_user_id;

  RETURN json_build_object(
    'ok',            true,
    'scans_left',    COALESCE(rec.scans_left, 0),
    'credits',       COALESCE(rec.credits, 0),
    'is_pro_active', COALESCE(rec.is_pro = true AND rec.pro_expires_at > NOW(), false)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.refund_scan_credit(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refund_scan_credit(UUID, TEXT) TO service_role;


-- ── 3. Eski istemci RPC'leri — artık düşüm YAPMAZ ────────────────
-- İmza ve dönüş tipi aynı kalıyor ki eski sürümler hata almasın.
CREATE OR REPLACE FUNCTION public.decrement_scans_left()
RETURNS INTEGER
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT scans_left FROM public.profiles WHERE id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.decrement_scans_left() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.decrement_scans_left() TO authenticated;

CREATE OR REPLACE FUNCTION public.use_credit()
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT true;
$$;

REVOKE ALL ON FUNCTION public.use_credit() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.use_credit() TO authenticated;

COMMIT;


-- ── 4. KONTROL ───────────────────────────────────────────────────
--   SELECT proname, proacl FROM pg_proc
--   WHERE proname IN ('consume_scan_credit','refund_scan_credit',
--                     'decrement_scans_left','use_credit');
--     → consume/refund sadece service_role; eski ikisi authenticated
--
-- Backend loglarında, bu dosya çalışmadan önce görülen
--   "consume_scan_credit not installed — legacy mode"
-- uyarısı bu dosyadan sonra kaybolmalı.
