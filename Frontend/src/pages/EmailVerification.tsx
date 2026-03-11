import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../services/api";

export default function EmailVerification() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("Confirming your email address...");
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (!token) {
        setStatus("error");
        setMessage("Verification token is missing.");
        return;
      }

      try {
        const response = await api.verifyEmail(token);
        if (cancelled) {
          return;
        }
        setStatus("success");
        setMessage(response.message);
        setEmail(response.email);
      } catch (err) {
        if (cancelled) {
          return;
        }
        setStatus("error");
        setMessage(getErrorMessage(err, "Email verification failed."));
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <div className="portal-page">
      <div className="portal-card">
        <div className="portal-kicker">Verification</div>
        <h1 className="portal-title">Email Confirmation</h1>
        <p className="portal-copy">{message}</p>
        {email && <div className="portal-alert portal-alert--success">{email}</div>}

        <div className="portal-actions">
          {status === "success" ? (
            <button
              className="portal-btn"
              onClick={() => navigate(`/auth?mode=login${email ? `&email=${encodeURIComponent(email)}` : ""}`)}
              type="button"
            >
              Go To Login
            </button>
          ) : (
            <button className="portal-btn" onClick={() => navigate("/auth?mode=register")} type="button">
              Back To Register
            </button>
          )}
          <button className="portal-btn portal-btn--ghost" onClick={() => navigate("/radar")} type="button">
            Radar
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
