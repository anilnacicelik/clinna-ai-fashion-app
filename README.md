# Clinna

**AI-powered authentication and cost analysis for archive & streetwear fashion.**

Point your camera at a garment — Clinna identifies the piece, estimates what it actually cost to produce, and gives an honest authenticity read based on what's visible.

---

## Why I built this

I come at this as a thrifter and archive fashion collector. When you find a piece secondhand, you want to *know* it — not just whether it's real, but its story: what era it's from, how it was made, what it originally cost, and what it's worth now. That depth is half the reason people love archive fashion in the first place. But getting there usually means hours of forum-digging and cross-referencing. I wanted to compress that into a single photo: point, scan, and get the piece's identity, construction, and economics at a glance. Clinna is my attempt to give every thrifter that kind of instant, deep read.

---

## What it does

- **Identification** — recognizes brand, model, and era from a photo, across everything from common labels (Nike, Adidas) to niche archive pieces (Rick Owens, Maison Margiela, Raf Simons).
- **Cost breakdown** — estimates production cost from fabric, construction, and hardware (independent of brand), then contrasts it with brand premium and resale value.
- **Authenticity pre-check** — an honest AI first-pass that flags visible signals; explicitly NOT a guarantee.

---

## Scan modes

- **Quick Scan** — a single photo for a fast read. (`POST /api/v1/analyze`)
- **Deep Auth** — up to three photos of the same item (full garment + interior label + wash/care tag) cross-referenced for a more confident authentication. (`POST /api/v1/analyze/deep`)
- **Accessory (ACC)** — a mode tuned for accessories (footwear, bags, belts, jewelry), focusing on hardware, maker's marks, and construction. Uses the same `/analyze/deep` endpoint with `scan_mode=acc`.

---

## Screenshots

![Home](./screenshots/01-home.png)
![Authentic result](./screenshots/02-result-authentic.png)
![Evidence & economics](./screenshots/03-evidence-economics.png)
![Evidence detail](./screenshots/03-evidence.png)
![Capture](./screenshots/04-capture.png)

---

## Tech stack

- **Mobile:** Expo (React Native), TypeScript
- **Backend:** FastAPI (Python)
- **AI:** Google Gemini 2.5 Flash (`gemini-2.5-flash`)
- **Auth / storage / DB:** Supabase

---

## Architecture

```
Mobile (Expo) → FastAPI → Gemini 2.5 Flash (vision)
                   ↕
        Supabase (auth, storage, scan history)
```

A photo is captured on-device, sent to the FastAPI backend, analyzed by Gemini against a tightly constrained prompt, and returned as a structured report rendered in a "wash-tag receipt" UI.

---

## Engineering highlights

- **An honest "NOT VERIFIABLE" state.** Early on, any item without a visible brand mark scored 0 and rendered as "INAUTHENTIC" — wrongly labeling unbranded thrift pieces as fake. I separated "no brand to verify" from "likely fake" with a dedicated neutral state (`legit_probability_score = -1`) that flows consistently through the schema, the prompt, and the UI.
- **Anti-hallucination prompt design.** The model only names a brand when there's a visible label, hardware signature, or unmistakable design detail — otherwise it says UNKNOWN. When a silhouette resembles a known brand but no mark is visible, it says so and guides the user to add a label photo instead of guessing.
- **A 35-second timeout bug.** Every image request was failing instantly. A timeout value intended as 35 seconds was being interpreted as 35 milliseconds at a lower layer — killing requests before they began. The fix was removing the SDK-level timeout entirely and enforcing a 40-second `asyncio.wait_for` ceiling instead, well under iOS's 75-second network limit.
- **Brand-independent cost estimation.** Production cost is derived from fabric, construction, and hardware — not the brand — so the cost breakdown works even on unbranded pieces.

---

## Getting started

### Prerequisites

- Python 3.11+
- Node.js 18+
- [Expo Go](https://expo.dev/go) on your phone (or an iOS/Android emulator)
- A [Gemini API key](https://aistudio.google.com/app/apikey) and a [Supabase](https://supabase.com) project

---

### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate    # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

Copy the example env file and fill in your keys:

```bash
cp .env.example .env
```

`.env` variables:

```
GEMINI_API_KEY=your_gemini_api_key_here
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_ANON_KEY=your_supabase_anon_key_here
```

Start the server:

```bash
python run.py
```

API runs at `http://localhost:8000`. Interactive docs at `http://localhost:8000/docs`.

---

### Mobile

```bash
cd mobile
npm install
```

Copy the example env file and fill in your values:

```bash
cp .env.example .env
```

`.env` variables:

```
EXPO_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key_here
EXPO_PUBLIC_BACKEND_URL=http://localhost:8000
```

> On a physical device, replace `localhost` with your machine's local IP address (e.g. `http://192.168.1.x:8000`).

Start the app:

```bash
npx expo start
```

Scan the QR code with Expo Go, or press `a` for Android emulator / `i` for iOS simulator.

---

## Note

This is a portfolio project demonstrating a full-stack, AI-integrated mobile application — not a published commercial product.

---

## Contact

Built by **Naci Çelik** — clinch147258369@gmail.com
