import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../services/api";
import { useStore } from "../store";

function safeNextPath(value: string | null): string {
  if (!value || !value.startsWith("/")) {
    return "/radar";
  }
  return value;
}

export default function AuthPortal() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const authSession = useStore((s) => s.authSession);
  const setAuthSession = useStore((s) => s.setAuthSession);
  const mode = searchParams.get("mode") === "register" ? "register" : "login";
  const nextPath = useMemo(() => safeNextPath(searchParams.get("next")), [searchParams]);

  const [name, setName] = useState("");
  const [email, setEmail] = useState(searchParams.get("email") ?? "");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);

  const setMode = (nextMode: "login" | "register") => {
    const next = new URLSearchParams(searchParams);
    next.set("mode", nextMode);
    setSearchParams(next);
    setError(null);
    setNotice(null);
  };

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      setError("Enter your email and password.");
      return;
    }

    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      await api.loginUser(email.trim().toLowerCase(), password);
      setAuthSession(api.getSession());
      navigate(nextPath, { replace: true });
    } catch (err) {
      setError(getErrorMessage(err, "Login failed."));
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async () => {
    if (!name.trim() || !email.trim() || !password.trim()) {
      setError("Complete all registration fields.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const response = await api.registerUser(name.trim(), email.trim().toLowerCase(), password);
      setPendingEmail(response.status === "pending_verification" ? response.email : null);
      setNotice(
        response.status === "pending_verification"
          ? `${response.message}. Check ${response.email} and open the confirmation link before logging in.`
          : `${response.message} You can sign in as ${response.email} now.`
      );
      setPassword("");
      setConfirmPassword("");
      const next = new URLSearchParams(searchParams);
      next.set("mode", "login");
      next.set("email", response.email);
      setSearchParams(next);
    } catch (err) {
      setError(getErrorMessage(err, "Registration failed."));
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    const targetEmail = (pendingEmail ?? email).trim().toLowerCase();
    if (!targetEmail) {
      setError("Enter your email address first.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await api.resendVerification(targetEmail);
      setPendingEmail(response.email);
      setNotice(`${response.message}. A new confirmation link was sent to ${response.email}.`);
    } catch (err) {
      setError(getErrorMessage(err, "Verification email could not be resent."));
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    api.clearSession();
    setAuthSession(null);
  };

  if (authSession) {
    return (
      <div className="portal-page">
        <div className="portal-card">
          <div className="portal-kicker">Account</div>
          <h1 className="portal-title">Session Active</h1>
          <p className="portal-copy">
            Signed in as {authSession.name || authSession.email || authSession.subject}.
          </p>
          <div className="portal-actions">
            <button className="portal-btn" onClick={() => navigate(nextPath)}>
              Continue
            </button>
            <button className="portal-btn portal-btn--ghost" onClick={handleLogout}>
              Logout
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="portal-page">
      <div className="portal-card">
        <div className="portal-kicker">Access</div>
        <h1 className="portal-title">Sign In Or Register</h1>
        <p className="portal-copy">
          Create an account to unlock the user guide and saved mission history. Some deployments require email
          confirmation before login.
        </p>

        <div className="portal-tabs">
          <button
            className={`portal-tab ${mode === "login" ? "portal-tab--active" : ""}`}
            onClick={() => setMode("login")}
            type="button"
          >
            Login
          </button>
          <button
            className={`portal-tab ${mode === "register" ? "portal-tab--active" : ""}`}
            onClick={() => setMode("register")}
            type="button"
          >
            Register
          </button>
        </div>

        {mode === "register" && (
          <input
            className="portal-input"
            placeholder="Full name"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        )}

        <input
          className="portal-input"
          placeholder="Email address"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <input
          className="portal-input"
          placeholder={mode === "register" ? "Create password" : "Password"}
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />

        {mode === "register" && (
          <input
            className="portal-input"
            placeholder="Confirm password"
            type="password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
          />
        )}

        {error && <div className="portal-alert portal-alert--danger">{error}</div>}
        {notice && <div className="portal-alert portal-alert--success">{notice}</div>}

        <div className="portal-actions">
          <button
            className="portal-btn"
            onClick={() => void (mode === "login" ? handleLogin() : handleRegister())}
            disabled={loading}
            type="button"
          >
            {loading ? "Please Wait" : mode === "login" ? "Login" : "Create Account"}
          </button>
          <button className="portal-btn portal-btn--ghost" onClick={() => navigate("/radar")} type="button">
            Back
          </button>
        </div>

        <div className="portal-subactions">
          <button className="portal-link" onClick={() => void handleResend()} type="button" disabled={loading}>
            Resend verification email
          </button>
        </div>
      </div>
    </div>
  );
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === "object" && error !== null) {
    const maybeAxios = error as {
      response?: {
        data?: {
          detail?: string;
        };
      };
      message?: string;
    };
    if (maybeAxios.response?.data?.detail) {
      return maybeAxios.response.data.detail;
    }
    if (maybeAxios.message) {
      return maybeAxios.message;
    }
  }
  return fallback;
}
