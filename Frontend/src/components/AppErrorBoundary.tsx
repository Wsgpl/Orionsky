import { Component, type ErrorInfo, type ReactNode } from "react";

interface AppErrorBoundaryProps {
  children: ReactNode;
}

interface AppErrorBoundaryState {
  hasError: boolean;
}

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = {
    hasError: false,
  };

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[AeroIntel] Render error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "32px",
            background: "#d8e3ec",
            color: "#12324a",
            fontFamily: '"Orbitron", monospace',
          }}
        >
          <div
            style={{
              maxWidth: "520px",
              padding: "24px",
              borderRadius: "18px",
              background: "rgba(255,255,255,0.72)",
              border: "1px solid rgba(18,61,92,0.14)",
              boxShadow: "0 18px 48px rgba(33,63,92,0.12)",
            }}
          >
            <div style={{ fontSize: "11px", letterSpacing: "0.18em", color: "#6a8aaa", marginBottom: "10px" }}>
              UI RECOVERY
            </div>
            <div style={{ fontSize: "24px", letterSpacing: "0.08em", marginBottom: "12px" }}>
              The screen hit a rendering error
            </div>
            <div style={{ fontFamily: '"Orbitron", monospace', fontSize: "13px", lineHeight: 1.7, color: "#48657f" }}>
              Reload the page once. If it still happens, the latest frontend change has thrown a runtime error and we
              can trace it from the browser console instead of ending up on a blank screen.
            </div>
            <button
              type="button"
              onClick={() => window.location.reload()}
              style={{
                marginTop: "18px",
                padding: "10px 16px",
                borderRadius: "12px",
                background: "rgba(13,92,134,0.12)",
                border: "1px solid rgba(13,92,134,0.18)",
                color: "#0d5c86",
                fontSize: "11px",
                letterSpacing: "0.12em",
              }}
            >
              Reload
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
