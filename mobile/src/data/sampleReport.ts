/**
 * CLINNA — sampleReport.ts
 * Hardcoded example report behind [ VIEW SAMPLE REPORT ] on HomeScreen.
 *
 * Purely local: no session, no backend call, no credit spend. It exists so a
 * visitor can see what the app produces before creating an account (App Review
 * expects the app to be browsable without registration).
 *
 * Every number here is illustrative, not a real analysis — ResultScreen labels
 * the screen as a sample so it can never be mistaken for a scan of the user's
 * own item.
 */

import { ArchiveReport } from '../services/api';

export const SAMPLE_REPORT: ArchiveReport = {
  archive_id: {
    brand:           'RICK OWENS',
    collection_year: 'FW22',
    model_name:      'Geobasket High-Top',
  },

  color_analysis: {
    colorblind_friendly_desc: 'Deep matte black with a cool undertone, off-white sole unit',
    hex:                      '#171717',
  },

  fabric_estimate: {
    composition:   'Full-grain calf leather upper · cotton twill lining · vulcanised rubber outsole',
    texture_notes: 'Upper reads as full-grain rather than corrected leather — the grain pattern is irregular and unrepeating. Lightly waxed hand, with a shallow break across the vamp consistent with limited wear.',
  },

  authenticity: {
    signals: [
      'Uniform grain across the quarter panels with no printed repeat — consistent with full-grain leather rather than a coated split.',
      'Sole is stitched and cemented; stitch pitch holds at roughly 7 per inch around the full perimeter.',
      'Eyelet hardware is matte gunmetal, seated flush, with no plating lift at the collar.',
      'Tongue label is heat-pressed with clean die-cut edges rather than woven and stitched.',
      'Toe spring and sole-stack height match the archive silhouette recorded for this model.',
      'Interior lining carries a two-line factory code stamp in the Vicenza format.',
    ],
  },

  financials: {
    material_cost_usd:         84,
    labor_cost_usd:            61,
    total_production_cost_usd: 145,
    confidence:                'medium',
    reasoning:                 'Estimate assumes Italian small-batch production, calf leather at wholesale hide pricing, and a vulcanised sole unit. Retail figure is the brand list price at launch, not resale.',
    estimated_retail_price_usd: 1_190,
    brand_markup:               8.2,
  },

  is_fashion_item: true,
  processing_ms:   4_820,
  scan_mode:       'deep_auth',
  image_count:     3,
};

/** Fixed receipt header values — a sample should look identical on every open. */
export const SAMPLE_REF_NUMBER = 'CLN-SAMPLE';
export const SAMPLE_TIMESTAMP  = '14/03/2025, 16:42';
