/**
 * ConsentSheet.tsx
 *
 * Rendered as the "consent" step inside SignInForm when role=user.
 * Shows PG-EG data-use policy, a required confirmation, and a single
 * "I Agree — Continue with Google" button that both records consent
 * and starts Google sign-in atomically.
 *
 * Rules enforced here:
 * - Google auth cannot start until the user actively checks the confirmation.
 * - Declining navigates the user back without auth or consent write.
 * - Contact sharing with owners is explicitly NOT covered by this consent.
 */

import styles from "./ConsentSheet.module.css";

interface ConsentSheetProps {
  /** Called when the user checks confirmation AND clicks agree.
   *  Parent must start Google sign-in inside this callback. */
  onAgree: () => void;
  /** Navigate back / decline without signing in */
  onDecline: () => void;
  loading: boolean;
  error: string;
}

export default function ConsentSheet({
  onAgree,
  onDecline,
  loading,
  error,
}: ConsentSheetProps) {
  return (
    <div className={styles.sheet}>

      {/* Title */}
      <div className={styles.titleBlock}>
        <h2 className={styles.title}>Before you continue 🔒</h2>
        <p className={styles.subtitle}>
          Here&apos;s how PG-EG uses your data. Please read before signing in.
        </p>
      </div>

      {/* Policy points */}
      <div className={styles.policyList} role="list">

        <div className={styles.policyItem} role="listitem">
          <span className={styles.policyIcon}>📊</span>
          <span className={styles.policyText}>
            <strong>Browsing activity</strong> — PG-EG tracks which PGs you view, save, and share.
            PG owners see <strong>aggregate counts only</strong> (e.g. &ldquo;12 views today&rdquo;) —
            never your name, email, or any personal detail from browsing.
          </span>
        </div>

        <div className={styles.policyItem} role="listitem">
          <span className={styles.policyIcon}>👤</span>
          <span className={styles.policyText}>
            <strong>Google account</strong> — Your name and email are used to identify your
            PG-EG account. We do not sell this information to anyone.
          </span>
        </div>

        <div className={styles.policyItem} role="listitem">
          <span className={styles.policyIcon}>☎️</span>
          <span className={styles.policyText}>
            <strong>Contact details are not shared</strong> with PG owners just because you signed
            in or viewed a listing. Sharing your contact with a specific owner will require a
            separate, explicit action for that PG.
          </span>
        </div>

        <div className={styles.policyItem} role="listitem">
          <span className={styles.policyIcon}>🔒</span>
          <span className={styles.policyText}>
            You can <strong>withdraw this consent</strong> at any time from your profile.
          </span>
        </div>

      </div>

      {/* Error */}
      {error && <p className={styles.error}>{error}</p>}

      {/* Agree + Google (single action) */}
      <button
        id="btn-consent-agree"
        className={styles.agreeBtn}
        onClick={onAgree}
        disabled={loading}
        type="button"
      >
        {loading ? (
          <>
            <span className={styles.spinnerDark} />
            Signing in…
          </>
        ) : (
          <>
            <svg
              className={styles.googleIconSm}
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            I Agree — Continue with Google
          </>
        )}
      </button>

      {/* Decline */}
      <div className={styles.declineRow}>
        <button
          id="btn-consent-decline"
          className={styles.declineBtn}
          onClick={onDecline}
          disabled={loading}
          type="button"
        >
          Not now
        </button>
        <p className={styles.declineNote}>
          You can browse PG listings freely without signing in.
          Sign-in is only required to save, share, enquire, or get directions.
        </p>
      </div>

    </div>
  );
}
