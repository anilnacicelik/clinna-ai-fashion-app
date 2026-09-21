/**
 * CLINNA AI — User-facing strings
 * All display text lives here. To add a language, add a parallel object and swap at runtime.
 * English-only for MVP. DO NOT add translation logic here.
 *
 * Usage:  import { strings as S } from '../i18n/strings';
 *         <Text>{S.common.logoutBtn}</Text>
 *         <Text>{S.common.scansLeft(3)}</Text>
 */

export const strings = {

  // ─── Shared across 2+ screens ─────────────────────────────────────────────
  common: {

    // Buttons
    logoutBtn:        '[ LOGOUT ]',
    signInBtn:        '[ SIGN IN ]',
    deleteAccountBtn: '[ DELETE ACCOUNT ]',
    cancelBtn:        '[ CANCEL ]',
    retryBtn:         '[ RETRY ]',
    okBtn:            '[ OK ]',

    // Brand wordmark — HomeScreen + AuthScreen
    wordmark: 'Clinna',

    // Scan counter badge — HomeScreen + HistoryScreen
    scansLeft: (n: number) => `[ ${n} SCANS LEFT ]`,

    // Network / API errors surfaced to the user — kept free of raw
    // URLs/env var names; technical detail still goes to console.error in api.ts
    // (originate in api.ts; can appear from any screen using the analysis API)
    errors: {
      systemBusy:         (retryAfter: number) => `System is busy. Retry in ${retryAfter}s.`,
      invalidResponse:    'Invalid response from server.',
      backendUnreachable: 'CANNOT REACH THE SERVER — CHECK YOUR CONNECTION AND TRY AGAIN.',
      requestTimeout:     'REQUEST TIMED OUT — TRY AGAIN.',
      serverError:        'SOMETHING WENT WRONG ON OUR END. PLEASE TRY AGAIN.',
      unexpected:         'AN UNEXPECTED ERROR OCCURRED. PLEASE TRY AGAIN.',
    },

  },

  // ─── Per-screen sections ──────────────────────────────────────────────────
  // Populated one screen at a time during Phase 2 migration.

  auth: {
    wordmark:          'Clinna',
    tagline:           'ARCHIVE ANALYSIS ENGINE',

    tabSignIn:         'SIGN IN',
    createAccount:     'CREATE ACCOUNT',   // tab label + primary CTA for signup mode

    labelFullName:     'FULL NAME',
    labelEmail:        'EMAIL ADDRESS',
    labelPassword:     'PASSWORD',

    placeholderName:   'your name',
    placeholderEmail:  'name@domain.com',
    placeholderPass:   '••••••••',

    showPass:          'SHOW',
    hidePass:          'HIDE',

    ctaLogin:          'ENTER THE ARCHIVE',
    ctaLoading:        '...',

    closeBtn:          '[ CLOSE ]',
    // Shown above the form when the user was sent here by a gated action
    gateNote:          'SIGN IN TO CONTINUE',

    errorNetwork:      'NETWORK ERROR',
    errorWeakPassword: 'PASSWORD MUST CONTAIN AT LEAST ONE LETTER AND ONE NUMBER',
    infoCheckEmail:    'CHECK YOUR EMAIL FOR CONFIRMATION LINK',

    forgotPassword:    'FORGOT PASSWORD?',
    resetSent:         'CHECK YOUR EMAIL — reset link sent',
    enterEmailFirst:   'Enter your email first',
    errorResetFailed:  'COULD NOT SEND RESET EMAIL — TRY AGAIN LATER',

    marketingConsent:     'SEND ME PRODUCT UPDATES',
    marketingConsentNote: 'Optional. Unsubscribe anytime.',

    errorFmt:          (msg: string) => `[ ERROR: ${msg} ]`,
    infoFmt:           (msg: string) => `[ ${msg} ]`,
  },
  home: {
    // Positioning line, sits directly under the wordmark where the old
    // 'ARCHIVE · ANALYZE · VALUE' subtitle was.
    subtitle:        'Before you buy it, scan it.',
    historyBtn:      'ARCHIVE HISTORY',
    analyzeBtn:      'ANALYZE',
    sampleBtn:       '[ VIEW SAMPLE REPORT ]',

    // v2 — primary CTA is the in-store "before you buy" scan; the two
    // long-form modes drop to a secondary row underneath it.
    buyBtn:          'SCAN BEFORE YOU BUY',
    fullAnalysisBtn: 'FULL ANALYSIS',
    listingBtn:      'VINTED LISTING',
    feedbackBtn:     '[ FEEDBACK ]',
  },
  camera: {
    hintBeforeCapture: 'Fit the full garment in frame · no other objects',
    // Before-you-buy: tag price step, shown after the photo and before the
    // scan is sent. Optional — SKIP runs the same scan without a price.
    tagPriceTitle:     'TAG PRICE',
    tagPriceLabel:     'PRICE ON THE TAG',
    tagPriceNote:      'Optional. Skip it and you still get the production cost estimate.',
    tagPricePlaceholder: '0',
    tagPriceContinue:  'CONTINUE',
    tagPriceSkip:      '[ SKIP ]',
    buyModeLabel:      'BEFORE YOU BUY',
    hintAfterCapture:  'Full garment in frame? Retake if cut off.',
    syncIssueTitle:    '[ SYNC ISSUE ]',
    syncIssueScan:     'YOUR SCAN COUNT COULD NOT BE UPDATED. CHECK YOUR CONNECTION — YOUR REPORT IS STILL READY.',
    syncIssueCredit:   'YOUR CREDIT COULD NOT BE DEDUCTED. CHECK YOUR CONNECTION — YOUR REPORT IS STILL READY.',
  },
  result:  {
    notFashionTitle: 'NOT A FASHION ITEM',
    notFashionNote:  'No fashion item detected. This scan has been counted.',

    // Sample mode — hardcoded example report, no session, no scan spent
    sampleTitle:       'SAMPLE',
    sampleBannerTitle: 'SAMPLE REPORT',
    sampleBannerNote:  'Example output from a Detailed Scan. Not your item — no photo was analysed and no scan was used.',
    samplePlaceholder: 'PRODUCT PHOTO',
    sampleGateNote:    'Saving to your archive and sharing a cost card need an account.',
    // Kept short — both render at wide tracking inside full-width buttons,
    // and must not wrap on a 320pt screen.
    sampleSignInBtn:   'SIGN IN TO SAVE',
    sampleRunBtn:      'SCAN YOUR OWN ITEM →',
  },
  buy: {
    title:            'BEFORE YOU BUY',
    // Headline formats — "~" stays: every number here is an estimate.
    headlineWithPrice: (price: string, cost: string) => `${price} → ~${cost} TO MAKE`,
    headlineCostOnly:  (cost: string) => `~${cost} TO MAKE`,
    markupLine:        (pct: number) => `${pct}% OF THE PRICE IS MARKUP`,
    // Shown instead of the markup line when the tag price is at or below the
    // estimated production cost — no markup to report, and no judgement made.
    nearCostLine:      'PRICED CLOSE TO PRODUCTION COST',
    breakdownOpen:     '[ + BREAKDOWN ]',
    breakdownClose:    '[ – BREAKDOWN ]',
    labelMaterial:     'MATERIAL',
    labelLabor:        'LABOR (CMT)',
    labelBrand:        'BRAND',
    shareBtn:          '[ SHARE ]',
    sharePreparing:    '[ PREPARING... ]',
    fullReportBtn:     '[ FULL REPORT ]',
    feedbackBtn:       '[ FEEDBACK ]',
    disclaimer:        'AI estimate from a single photo — production cost only, not a valuation or buying advice.',
    notFashionTitle:   'NOT A FASHION ITEM',
    notFashionNote:    'No fashion item detected. This scan has been counted.',
    tryAgainBtn:       'TRY AGAIN →',
  },

  archive: {
    // Every successful scan is filed automatically — the row is a status, not
    // a button. REMOVE is the only action left on it.
    savedLabel:   '[ SAVED TO ARCHIVE ]',
    savingLabel:  '[ SAVING TO ARCHIVE... ]',
    failedLabel:  '[ NOT SAVED — TAP TO RETRY ]',
    removedLabel: '[ REMOVED FROM ARCHIVE ]',
    removeBtn:    '[ REMOVE ]',
    removingBtn:  '[ ... ]',
    removeTitle:  '[ REMOVE FROM ARCHIVE ]',
    removeBody:   'THIS SCAN WILL BE REMOVED FROM YOUR ARCHIVE. THIS CANNOT BE UNDONE.',
    removeFailedTitle: '[ REMOVE FAILED ]',
    removeFailedBody:  'COULD NOT REMOVE THIS SCAN. CHECK YOUR CONNECTION AND TRY AGAIN.',
    modeBuy:      'BUY',
    modeFull:     'FULL',
    modeListing:  'LISTING',
    tagPriceMeta: (price: string) => `TAG ${price}`,
    markupMeta:   (pct: number) => `${pct}% MARKUP`,
  },

  feedback: {
    title:        'FEEDBACK',
    intro:        'Tell us what is missing, broken, or confusing. We read every message.',
    label:        'YOUR MESSAGE',
    placeholder:  'What would make this better?',
    sendBtn:      '[ SEND ]',
    sendingBtn:   '[ SENDING... ]',
    sentBtn:      '[ THANKS — WE READ EVERY MESSAGE ]',
    closeBtn:     '[ CLOSE ]',
    errorEmpty:   'WRITE SOMETHING FIRST.',
    errorFailed:  'COULD NOT SEND YOUR MESSAGE. CHECK YOUR CONNECTION AND TRY AGAIN.',
  },

  history: {},
  paywall: {
    storeUnavailable: 'STORE NOT AVAILABLE — TRY AGAIN LATER.',
    purchaseFailed:   'PURCHASE FAILED — PLEASE TRY AGAIN.',
    restoreFailed:    'RESTORE FAILED — PLEASE TRY AGAIN.',
  },

} as const;
