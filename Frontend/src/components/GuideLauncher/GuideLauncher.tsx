import { useNavigate } from "react-router-dom";
import { useStore } from "../../store";

export function GuideLauncher() {
  const navigate = useNavigate();
  const authSession = useStore((s) => s.authSession);

  const handleOpen = () => {
    if (authSession) {
      navigate("/guide");
      return;
    }

    navigate(`/auth?mode=login&next=${encodeURIComponent("/guide")}`);
  };

  return (
    <button
      type="button"
      className="guide-launcher"
      onClick={handleOpen}
      aria-label="Open user guide"
    >
      <span className="guide-launcher__icon" aria-hidden="true">
        UG
      </span>
      <span className="guide-launcher__content">
        <span className="guide-launcher__label">User Guide</span>
        <span className="guide-launcher__meta">{authSession ? "Open Help" : "Login Required"}</span>
      </span>
    </button>
  );
}
