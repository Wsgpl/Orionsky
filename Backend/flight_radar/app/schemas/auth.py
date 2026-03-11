"""Auth request/response schemas."""
from __future__ import annotations

import re
from typing import Literal

from pydantic import BaseModel, Field, field_validator

EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class LoginRequest(BaseModel):
    username: str = Field(..., min_length=1)
    password: str = Field(..., min_length=1)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    subject: str
    role: Literal["admin", "user"]
    email: str | None = None
    name: str | None = None
    email_verified: bool = True


class RegisterRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=80)
    email: str = Field(..., min_length=5, max_length=254)
    password: str = Field(..., min_length=8, max_length=128)

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str) -> str:
        cleaned = " ".join(value.split())
        if len(cleaned) < 2:
            raise ValueError("Name must be at least 2 characters long")
        return cleaned

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str) -> str:
        cleaned = value.strip().lower()
        if not EMAIL_PATTERN.match(cleaned):
            raise ValueError("Enter a valid email address")
        return cleaned


class UserLoginRequest(BaseModel):
    email: str = Field(..., min_length=5, max_length=254)
    password: str = Field(..., min_length=1)

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str) -> str:
        cleaned = value.strip().lower()
        if not EMAIL_PATTERN.match(cleaned):
            raise ValueError("Enter a valid email address")
        return cleaned


class VerificationEmailRequest(BaseModel):
    email: str = Field(..., min_length=5, max_length=254)

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str) -> str:
        cleaned = value.strip().lower()
        if not EMAIL_PATTERN.match(cleaned):
            raise ValueError("Enter a valid email address")
        return cleaned


class RegistrationResponse(BaseModel):
    status: Literal["pending_verification", "registered"]
    message: str
    email: str
    expires_in: int


class VerifyEmailResponse(BaseModel):
    status: Literal["verified"]
    message: str
    email: str


class HealthLive(BaseModel):
    status: str
    version: str
    environment: str


class AircraftWorkerHealth(BaseModel):
    status: str
    age_seconds: float | None = None


class HealthReady(BaseModel):
    status: str
    redis: str
    opensky_circuit: str
    openmeteo_circuit: str
    awc_metar_circuit: str | None = None
    awc_taf_circuit: str | None = None
    awc_sigmet_circuit: str | None = None
    copernicus_cams_circuit: str | None = None
    copernicus_cems_circuit: str | None = None
    adsbexchange_circuit: str | None = None
    adsblol_circuit: str | None = None
    icao_aircraft_circuit: str | None = None
    aircraft_worker: AircraftWorkerHealth | None = None
