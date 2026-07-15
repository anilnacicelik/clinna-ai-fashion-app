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

    errorNetwork:      'NETWORK ERROR',
    errorWeakPassword: 'PASSWORD MUST CONTAIN AT LEAST ONE LETTER AND ONE NUMBER',
    infoCheckEmail:    'CHECK YOUR EMAIL FOR CONFIRMATION LINK',

    marketingConsent:     'SEND ME PRODUCT UPDATES',
    marketingConsentNote: 'Optional. Unsubscribe anytime.',

    errorFmt:          (msg: string) => `[ ERROR: ${msg} ]`,
    infoFmt:           (msg: string) => `[ ${msg} ]`,
  },
  home: {
    subtitle:        'ARCHIVE · ANALYZE · VALUE',
    historyBtn:      'ARCHIVE HISTORY',
    analyzeBtn:      'ANALYZE',
  },
  camera: {
    hintBeforeCapture: 'Fit the full garment in frame · no other objects',
    hintAfterCapture:  'Full garment in frame? Retake if cut off.',
    syncIssueTitle:    '[ SYNC ISSUE ]',
    syncIssueScan:     'YOUR SCAN COUNT COULD NOT BE UPDATED. CHECK YOUR CONNECTION — YOUR REPORT IS STILL READY.',
    syncIssueCredit:   'YOUR CREDIT COULD NOT BE DEDUCTED. CHECK YOUR CONNECTION — YOUR REPORT IS STILL READY.',
  },
  result:  {},
  history: {},
  paywall: {
    storeUnavailable: 'STORE NOT AVAILABLE — TRY AGAIN LATER.',
    purchaseFailed:   'PURCHASE FAILED — PLEASE TRY AGAIN.',
    restoreFailed:    'RESTORE FAILED — PLEASE TRY AGAIN.',
  },

} as const;
