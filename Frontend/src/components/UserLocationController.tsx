import { useEffect, useRef, useState } from "react";
import { useStore } from "../store";

type LocationPromptState =
  | "prompt"
  | "requesting"
  | "error"
  | "unsupported"
  | "dismissed"
  | "granted";

type UserLocationControllerProps = {
  enabled: boolean;
};

const CURRENT_LOCATION_ID = "current-location";
const GEOLOCATION_PERMISSION_DENIED = 1;
const GEOLOCATION_POSITION_UNAVAILABLE = 2;
const GEOLOCATION_TIMEOUT = 3;

function buildCurrentLocationSelection(coords: GeolocationCoordinates) {
  return {
    id: CURRENT_LOCATION_ID,
    name: "Current location",
    kind: "current_location",
    latitude: Number(coords.latitude.toFixed(6)),
    longitude: Number(coords.longitude.toFixed(6)),
  };
}

function getLocationErrorMessage(error: GeolocationPositionError): string {
  switch (error.code) {
    case GEOLOCATION_PERMISSION_DENIED:
      return "Location access was denied in the browser, so the map cannot follow your position yet.";
    case GEOLOCATION_POSITION_UNAVAILABLE:
      return "The browser could not determine your location right now. Please try again in a moment.";
    case GEOLOCATION_TIMEOUT:
      return "Location lookup took too long. Please try again.";
    default:
      return "The app could not read your location from the browser.";
  }
}

export function UserLocationController({
  enabled,
}: UserLocationControllerProps) {
  const setSelectedLocation = useStore((state) => state.setSelectedLocation);
  const bumpLocationFocusToken = useStore((state) => state.bumpLocationFocusToken);
  const [promptState, setPromptState] = useState<LocationPromptState>("prompt");
  const [message, setMessage] = useState<string | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const latestCoordsRef = useRef<GeolocationCoordinates | null>(null);

  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null && "geolocation" in navigator) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  const startLiveTracking = () => {
    if (!("geolocation" in navigator) || watchIdRef.current !== null) {
      return;
    }

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        latestCoordsRef.current = position.coords;
        const nextLocation = buildCurrentLocationSelection(position.coords);
        const currentSelection = useStore.getState().selectedLocation;

        if (!currentSelection || currentSelection.kind === "current_location") {
          setSelectedLocation(nextLocation);
        }
      },
      (error) => {
        if (error.code === GEOLOCATION_PERMISSION_DENIED) {
          setPromptState("error");
          setMessage(getLocationErrorMessage(error));
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 300000,
      },
    );
  };

  const handleAllowLocation = () => {
    if (!enabled) {
      return;
    }

    if (promptState === "granted" && latestCoordsRef.current) {
      setSelectedLocation(buildCurrentLocationSelection(latestCoordsRef.current));
      bumpLocationFocusToken();
      return;
    }

    if (!("geolocation" in navigator)) {
      setPromptState("unsupported");
      setMessage("This browser does not support location access, so automatic map centering is unavailable.");
      return;
    }

    setPromptState("requesting");
    setMessage(null);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        latestCoordsRef.current = position.coords;
        setSelectedLocation(buildCurrentLocationSelection(position.coords));
        bumpLocationFocusToken();
        setPromptState("granted");
        setMessage(null);
        startLiveTracking();
      },
      (error) => {
        setPromptState("error");
        setMessage(getLocationErrorMessage(error));
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 300000,
      },
    );
  };

  const handleDismiss = () => {
    setPromptState("dismissed");
    setMessage(null);
  };

  if (!enabled) {
    return null;
  }

  const title =
    promptState === "unsupported"
      ? "Location tracking unavailable"
      : promptState === "error"
        ? "Location access needs attention"
        : "Use your current location?";

  const body =
    message ??
    "Allow browser location access and the app will center the map on your current position when you open it.";

  const showPrompt = promptState !== "dismissed" && promptState !== "granted";
  const buttonLabel =
    promptState === "requesting"
      ? "LOCATING"
      : promptState === "granted"
        ? "MY LOCATION"
        : "ENABLE LOCATION";

  return (
    <>
      <button
        type="button"
        className={`my-location-btn ${promptState === "granted" ? "my-location-btn--active" : ""}`}
        onClick={handleAllowLocation}
        disabled={promptState === "requesting"}
        title="My Location"
        aria-label="Center the map on my location"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="my-location-btn__icon"
        >
          <circle cx="12" cy="12" r="10" />
          <circle cx="12" cy="12" r="3" />
          <line x1="12" y1="1" x2="12" y2="4" />
          <line x1="12" y1="20" x2="12" y2="23" />
          <line x1="1" y1="12" x2="4" y2="12" />
          <line x1="20" y1="12" x2="23" y2="12" />
        </svg>
      </button>

      {showPrompt && (
        <div className="location-consent-card" role="dialog" aria-live="polite" aria-label="Location access prompt">
          <div className="location-consent-card__icon">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              width="20"
              height="20"
            >
              <circle cx="12" cy="12" r="10" />
              <circle cx="12" cy="12" r="3" />
              <line x1="12" y1="1" x2="12" y2="4" />
              <line x1="12" y1="20" x2="12" y2="23" />
              <line x1="1" y1="12" x2="4" y2="12" />
              <line x1="20" y1="12" x2="23" y2="12" />
            </svg>
          </div>
          <div className="location-consent-card__kicker">Live Position</div>
          <h2 className="location-consent-card__title">{title}</h2>
          <p className="location-consent-card__copy">{body}</p>

          <div className="location-consent-card__actions">
            <button
              type="button"
              className="location-consent-card__btn location-consent-card__btn--primary"
              onClick={handleAllowLocation}
              disabled={promptState === "requesting" || promptState === "unsupported"}
            >
              {promptState === "requesting" ? "Locating..." : promptState === "error" ? "Try Again" : "Allow Location"}
            </button>
            <button
              type="button"
              className="location-consent-card__btn location-consent-card__btn--ghost"
              onClick={handleDismiss}
            >
              Not Now
            </button>
          </div>
        </div>
      )}
    </>
  );
}
