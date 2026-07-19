"""
CLINNA AI — Brand-specific authentication knowledge.
Verbatim expert prompts per brand, preserved for future wiring into the pipeline.
"""
import re
import unicodedata

# ─── Known-brand whitelist ─────────────────────────────────────────
# Used to gate estimated_retail_price_usd / brand_markup: a brand name the
# model returns must exist here, or those two fields are nulled server-side.
# This is a real-world "does this brand exist" check — separate in purpose
# from BRAND_PROMPTS above, which only holds deep-dive authentication prompts
# for a handful of brands. Keep this list broad (streetwear / heritage /
# outdoor / luxury / denim) since it directly controls what gets a retail
# estimate.
KNOWN_BRANDS: set[str] = {
    # Avant-garde / archive fashion
    "maison margiela", "margiela", "rick owens", "drkshdw", "lilies", "tecuatl",
    "number nine", "number (n)ine", "raf simons", "jil sander", "dior homme",
    "helmut lang", "yohji yamamoto", "y's", "y-3", "comme des garcons", "cdg",
    "ann demeulemeester", "dries van noten", "issey miyake", "a.p.c.",
    "junya watanabe", "sacai", "undercover", "kapital", "visvim", "neighborhood",
    "wtaps", "our legacy", "lemaire", "acne studios", "thom browne",

    # Streetwear
    "stussy", "supreme", "palace", "bape", "a bathing ape", "kith", "off-white",
    "fear of god", "essentials", "fear of god essentials", "chrome hearts",
    "aime leon dore", "noah", "vlone", "anti social social club",
    "askyurself", "vetements", "yeezy",

    # Sport / outdoor
    "nike", "adidas", "arc'teryx", "veilance", "patagonia",
    "the north face", "columbia", "champion", "reebok", "puma", "new balance",
    "converse", "vans", "timberland", "dr. martens",

    # Heritage / workwear / denim
    "carhartt", "carhartt wip", "levi's", "wrangler", "lee",
    "ralph lauren", "polo ralph lauren", "tommy hilfiger", "calvin klein",

    # Luxury houses
    "hermes", "louis vuitton", "gucci", "prada", "bottega veneta",
    "balenciaga", "saint laurent", "ysl", "celine", "loewe", "burberry",
    "moncler", "givenchy", "versace", "dolce & gabbana",
    "balmain", "diesel", "stone island", "cp company",

    # Avant-garde / archive fashion — additions
    "kiko kostadinov", "han kjobenhavn", "sterling ruby",
    "enfants riches deprimes", "erd",

    # Streetwear — additions
    "gallery dept", "gallery department", "a cold wall", "acw",
    "corteiz", "crtz", "sp5der", "denim tears",
}

_NON_ALNUM_RE = re.compile(r"[^a-z0-9\s]")
_WHITESPACE_RE = re.compile(r"\s+")

# Letters with no NFKD canonical decomposition (not "base + combining mark",
# so unicodedata.combining() can't strip them) — must be mapped by hand or
# names like "Kjøbenhavn" / "Ærø" never normalize down to ASCII.
_MANUAL_CHAR_MAP = str.maketrans({
    "ø": "o", "Ø": "O",
    "đ": "d", "Đ": "D",
    "ł": "l", "Ł": "L",
    "æ": "ae", "Æ": "AE",
    "œ": "oe", "Œ": "OE",
    "ß": "ss",
})


def _normalize_brand(name: str) -> str:
    """Lowercase, strip accents/punctuation, collapse whitespace — so
    'Arc'teryx', 'ARCTERYX', 'arc teryx', and 'Han Kjøbenhavn' /
    'Han Kjobenhavn' all compare equal."""
    mapped = name.translate(_MANUAL_CHAR_MAP)
    decomposed = unicodedata.normalize("NFKD", mapped.lower())
    stripped = "".join(c for c in decomposed if not unicodedata.combining(c))
    no_punct = _NON_ALNUM_RE.sub(" ", stripped)
    return _WHITESPACE_RE.sub(" ", no_punct).strip()


_KNOWN_BRANDS_NORMALIZED: set[str] = {_normalize_brand(b) for b in KNOWN_BRANDS}


def is_known_brand(brand: str) -> bool:
    """True if `brand` matches a real, known fashion brand in KNOWN_BRANDS."""
    if not brand:
        return False
    normalized = _normalize_brand(brand)
    if not normalized or normalized == "unknown":
        return False
    return normalized in _KNOWN_BRANDS_NORMALIZED


BRAND_PROMPTS: dict[str, str] = {

    "stussy": """
Authenticate this Stüssy garment. Examine:

LOGO & GRAPHICS
- Script logo: authentic pieces have fluid, slightly irregular letterforms; fakes often look too perfect or too thin
- Stock No. 8-ball / tribal prints: check color saturation and registration alignment
- Screen print hand: look for proper ink bleed and texture, not flat digital look

TAGS & LABELS
- Woven label color: pre-2000 tags use a specific off-white linen texture
- Font on care instructions: authentic uses a specific condensed sans-serif
- Country of manufacture: early 90s = USA/Canada; mid-90s onward = various

CONSTRUCTION
- Stitch density on seams: authentic ~12 stitches per inch
- Hem finish: chain stitch on vintage, serged on modern
- Fabric weight: authentic Stüssy hoodies are notably heavyweight for their era

ERA DETECTION CLUES
- 1980s: bold script, USA made
- 1990s: International Tribe tag era, 100% cotton heavy fleece
- 2000s: smaller logos, more refined graphics
""",

    "rick_owens": """
Authenticate this Rick Owens / DRKSHDW garment. Examine:

LABEL & BRANDING
- Main label font: authentic uses a very specific condensed uppercase sans-serif; spacing between letters is tight and even
- DRKSHDW vs mainline: DRKSHDW label is slightly different weight and placement
- Label placement: always at center back neck, never off-center
- Washing instructions label: authentic uses a specific label stock with a distinctive texture

HARDWARE
- Zippers: Rick Owens uses high-grade metal zippers (often Lampo or custom); check pull weight and engraving
- Snaps and rivets: heavy, matte-finished metal; fakes use lightweight or shiny hardware
- Drawstring ends: specific tip finish, not generic

CONSTRUCTION & CUT
- Seam allowance: Rick Owens has exceptionally clean, wide seam allowances
- Lining quality: often unexpected luxury linings in unexpected places
- Asymmetry: intentional asymmetrical cuts are precise, not accidental
- DRKSHDW is cotton-dominant; mainline often uses avant-garde materials

FABRIC QUALITY
- DRKSHDW signature: heavy cotton, often slightly slubby texture; fakes feel thin or too smooth
- Observe drape: authentic pieces hang in a specific way due to construction weighting
""",

    "vintage_nike": """
Authenticate this vintage Nike garment. Examine:

TAG DATING (critical for vintage authentication)
- Single-line tag (no washing instructions): pre-1971
- Hang tag with swoosh: 1972-1978 era
- Blue tag era: 1978-1986 (look for specific Helvetica font)
- White/grey tag era: 1986-1994
- Check country of origin for era consistency

SWOOSH
- Pre-1985: swoosh is thicker, slightly different curvature at tail
- Screen print vs embroidery: know which was used for which product/era
- Color matching: vintage colorways use specific Pantone codes that fakes often miss

STITCHING & CONSTRUCTION
- Authentic vintage Nike uses specific thread colors that age in a particular way
- Collar ribbing texture and weight
- Raglan vs set-in sleeve construction varies by era and model

COLORWAY AUTHENTICATION
- Research the specific colorway: was it ever produced? Check Nike archives
- Fades and wash patterns on aged pieces should be consistent with the fabric type
- Newer dyes on 'vintage' pieces are a major red flag

GRAPHICS (if applicable)
- Cracked screen print on authentic vintage = expected; but check crack pattern (even/authentic vs forced)
- Embroidered logos: check thread density and backing
""",

    "arcteryx": """
Authenticate this Arc'teryx garment. Examine:

THE BIRD LOGO
- Archaeopteryx skeleton logo: lines should be clean, consistent weight, anatomically correct
- Embroidery (if present): tight, no loose threads, correct thread color for colorway
- Heat transfer (on shells): smooth edges, no bubbling or peeling at corners
- Size and placement: check against known authentic positions for that specific model

ZIPPERS
- Arc'teryx uses EXCLUSIVELY YKK Vislon or Lampo zippers on authentic pieces; never generic
- Check the YKK molding on zipper teeth: clean, consistent, no flashing
- Gore-Tex zipper pulls: specific weight and finish
- Pit zip placement and function: precise on authentic pieces

SEAM TAPE (critical for Gore-Tex shells)
- WelDING seams: look through the garment toward light; seam tape should be perfectly bonded with no gaps
- Tape width: consistent throughout; fakes often have variable width
- Color of tape: specific to the colorway; check inside the garment

CONSTRUCTION DETAILS
- Helmet-compatible hood: specific geometry and adjustment system by model
- Pocket placement: precise and functional; fakes often have slightly off measurements
- Trim and binding: Arc'teryx uses specific binding tape on edges
- Weight: authentic pieces have a specific hand feel due to Gore-Tex laminate

LABELS
- Main label: woven, specific font, placement in left seam or center back
- Care label: specific format, country of manufacture matches era
- Model/colorway label: check against Arc'teryx database for that season
""",
}
