"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  RecaptchaVerifier,
  signInWithPhoneNumber,
  signInWithPopup,
  GoogleAuthProvider,
  ConfirmationResult,
} from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import styles from "./page.module.css";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

type Step = "details" | "otp";

export default function SignInForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { signIn, isAuthenticated, isLoading } = useAuth();

  const [step, setStep] = useState<Step>("details");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [confirmationResult, setConfirmationResult] =
    useState<ConfirmationResult | null>(null);

  const recaptchaRef = useRef<RecaptchaVerifier | null>(null);
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Redirect if already authenticated
  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      const from = searchParams.get("from") || "/dashboard";
      router.replace(from);
    }
  }, [isAuthenticated, isLoading, router, searchParams]);

  // Countdown timer for resend OTP
  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  // ─── Google Sign-In ────────────────────────────────────────────
  async function handleGoogleSignIn() {
    setError("");
    setGoogleLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const idToken = await result.user.getIdToken();

      const res = await fetch(`${API_URL}/api/auth/google`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Google sign-in failed");
      }

      const data = await res.json();
      signIn(data.token, data.owner, data.hasPG, data.pgId);

      if (data.hasPG) {
        router.replace("/dashboard");
      } else {
        router.replace("/add-pg");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("popup-closed-by-user") || msg.includes("cancelled-popup-request")) {
        // User closed popup — no error needed
      } else {
        setError(msg || "Google sign-in failed. Please try again.");
      }
    } finally {
      setGoogleLoading(false);
    }
  }

  // ─── Phone OTP ─────────────────────────────────────────────────
  function setupRecaptcha() {
    if (!recaptchaRef.current) {
      recaptchaRef.current = new RecaptchaVerifier(auth, "recaptcha-container", {
        size: "invisible",
      });
    }
    return recaptchaRef.current;
  }

  async function handleSendOTP(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (name.trim().length < 2) { setError("Please enter your full name"); return; }
    const digits = phone.replace(/\D/g, "");
    if (digits.length !== 10) { setError("Please enter a valid 10-digit mobile number"); return; }

    setSending(true);
    try {
      const verifier = setupRecaptcha();
      const result = await signInWithPhoneNumber(auth, `+91${digits}`, verifier);
      setConfirmationResult(result);
      setStep("otp");
      setCountdown(60);
      setTimeout(() => otpRefs.current[0]?.focus(), 100);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("too-many-requests")) {
        setError("Too many attempts. Please try again in a few minutes.");
      } else if (msg.includes("invalid-phone-number")) {
        setError("Invalid phone number. Please check and try again.");
      } else {
        setError("Failed to send OTP. Please try again.");
        console.error(err);
      }
      recaptchaRef.current = null;
    } finally {
      setSending(false);
    }
  }

  function handleOtpChange(index: number, value: string) {
    if (!/^\d*$/.test(value)) return;
    const newOtp = [...otp];
    newOtp[index] = value.slice(-1);
    setOtp(newOtp);
    setError("");
    if (value && index < 5) otpRefs.current[index + 1]?.focus();
    if (newOtp.every((d) => d !== "")) handleVerifyOTP(newOtp.join(""));
  }

  function handleOtpKeyDown(index: number, e: React.KeyboardEvent) {
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  }

  async function handleVerifyOTP(code?: string) {
    const otpCode = code || otp.join("");
    if (otpCode.length !== 6 || !confirmationResult) return;

    setVerifying(true);
    setError("");
    try {
      const userCredential = await confirmationResult.confirm(otpCode);
      const idToken = await userCredential.user.getIdToken();

      const res = await fetch(`${API_URL}/api/auth/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken, name: name.trim() }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Verification failed");
      }

      const data = await res.json();
      signIn(data.token, data.owner, data.hasPG, data.pgId);

      if (data.hasPG) {
        router.replace("/dashboard");
      } else {
        router.replace(searchParams.get("from") || "/add-pg");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("invalid-verification-code")) {
        setError("Wrong OTP. Please check and try again.");
      } else if (msg.includes("code-expired")) {
        setError("OTP expired. Please request a new one.");
      } else {
        setError(msg || "Verification failed. Please try again.");
        console.error(err);
      }
      setOtp(["", "", "", "", "", ""]);
      otpRefs.current[0]?.focus();
    } finally {
      setVerifying(false);
    }
  }

  function handleResendOTP() {
    setOtp(["", "", "", "", "", ""]);
    recaptchaRef.current = null;
    setStep("details");
    setCountdown(0);
    setConfirmationResult(null);
    setError("");
  }

  if (isLoading) return null;

  return (
    <main className={styles.main}>
      <div className={styles.orb1} />
      <div className={styles.orb2} />
      <div id="recaptcha-container" />

      <div className={styles.content}>
        {/* Logo */}
        <div className={`${styles.header} animate-fade-up`}>
          <div className={styles.logo}>
            <span className={styles.logoPG}>PG</span>
            <span className={styles.logoDash}>-</span>
            <span className={styles.logoEG}>EG</span>
          </div>
          <p className={styles.logoTagline}>PG Management, simplified.</p>
        </div>

        {step === "details" ? (
          <div className={`${styles.form} animate-fade-up delay-1`}>
            <div className={styles.titleBlock}>
              <h2 className={styles.title}>Welcome 👋</h2>
              <p className={styles.subtitle}>Sign in to manage your PG from anywhere.</p>
            </div>

            {/* ─── Google Button ─── */}
            <button
              type="button"
              className={styles.googleBtn}
              onClick={handleGoogleSignIn}
              disabled={googleLoading || sending}
              id="btn-google-signin"
            >
              {googleLoading ? (
                <span className={styles.btnLoading}>
                  <span className={styles.spinner} /> Signing in…
                </span>
              ) : (
                <>
                  <svg className={styles.googleIcon} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </svg>
                  Continue with Google
                </>
              )}
            </button>

            <div className={styles.divider}>
              <span className={styles.dividerLine} />
              <span className={styles.dividerText}>or sign in with phone</span>
              <span className={styles.dividerLine} />
            </div>

            {/* ─── Phone Form ─── */}
            <form onSubmit={handleSendOTP} className={styles.phoneForm}>
              <div className={styles.fields}>
                <div className={styles.field}>
                  <label className={styles.label} htmlFor="input-name">Your Name</label>
                  <input
                    id="input-name" type="text" className={styles.input}
                    placeholder="e.g. Rajesh Kumar" value={name}
                    onChange={(e) => setName(e.target.value)}
                    autoComplete="name" disabled={sending}
                  />
                </div>
                <div className={styles.field}>
                  <label className={styles.label} htmlFor="input-phone">Mobile Number</label>
                  <div className={styles.phoneRow}>
                    <div className={styles.countryCode}>🇮🇳 +91</div>
                    <input
                      id="input-phone" type="tel"
                      className={`${styles.input} ${styles.phoneInput}`}
                      placeholder="98765 43210" value={phone}
                      onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                      autoComplete="tel" inputMode="numeric" disabled={sending}
                    />
                  </div>
                </div>
              </div>

              {error && <p className={styles.error}>{error}</p>}

              <button type="submit" className={styles.primaryBtn} id="btn-send-otp" disabled={sending || googleLoading}>
                {sending ? (
                  <span className={styles.btnLoading}><span className={styles.spinner} /> Sending OTP…</span>
                ) : "Send OTP →"}
              </button>
            </form>
          </div>
        ) : (
          <div className={`${styles.form} animate-fade-up`}>
            <div className={styles.titleBlock}>
              <h2 className={styles.title}>Enter OTP</h2>
              <p className={styles.subtitle}>
                We sent a 6-digit code to <strong>+91 {phone}</strong>
              </p>
            </div>

            <div className={styles.otpRow}>
              {otp.map((digit, i) => (
                <input
                  key={i}
                  ref={(el) => { otpRefs.current[i] = el; }}
                  type="text" inputMode="numeric" maxLength={1}
                  className={`${styles.otpBox} ${digit ? styles.otpBoxFilled : ""}`}
                  value={digit}
                  onChange={(e) => handleOtpChange(i, e.target.value)}
                  onKeyDown={(e) => handleOtpKeyDown(i, e)}
                  disabled={verifying}
                  id={`otp-${i}`}
                />
              ))}
            </div>

            {verifying && (
              <div className={styles.verifyingState}>
                <span className={styles.spinner} /> Verifying…
              </div>
            )}

            {error && <p className={styles.error}>{error}</p>}

            <button
              className={styles.primaryBtn}
              onClick={() => handleVerifyOTP()}
              disabled={otp.join("").length !== 6 || verifying}
              id="btn-verify-otp"
            >
              Verify &amp; Continue →
            </button>

            <div className={styles.resendRow}>
              {countdown > 0 ? (
                <span className={styles.resendTimer}>Resend OTP in {countdown}s</span>
              ) : (
                <button className={styles.resendBtn} onClick={handleResendOTP} id="btn-resend-otp">
                  Resend OTP
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
