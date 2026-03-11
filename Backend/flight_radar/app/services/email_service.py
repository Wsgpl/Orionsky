"""SMTP-backed outbound email helpers."""
from __future__ import annotations

import asyncio
import logging
import smtplib
import ssl
from email.message import EmailMessage
from email.utils import formataddr

from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


def _build_message(
    recipient: str,
    subject: str,
    text_body: str,
    html_body: str,
) -> EmailMessage:
    if not settings.SMTP_FROM_EMAIL:
        raise RuntimeError("SMTP_FROM_EMAIL is not configured")

    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = formataddr((settings.SMTP_FROM_NAME, settings.SMTP_FROM_EMAIL))
    message["To"] = recipient
    message.set_content(text_body)
    message.add_alternative(html_body, subtype="html")
    return message


def _send_message(message: EmailMessage) -> None:
    if not settings.SMTP_HOST:
        raise RuntimeError("SMTP_HOST is not configured")

    context = ssl.create_default_context()

    if settings.SMTP_USE_SSL:
        with smtplib.SMTP_SSL(
            settings.SMTP_HOST,
            settings.SMTP_PORT,
            timeout=settings.SMTP_TIMEOUT_SECONDS,
            context=context,
        ) as client:
            if settings.SMTP_USERNAME and settings.SMTP_PASSWORD:
                client.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD)
            client.send_message(message)
        return

    with smtplib.SMTP(
        settings.SMTP_HOST,
        settings.SMTP_PORT,
        timeout=settings.SMTP_TIMEOUT_SECONDS,
    ) as client:
        client.ehlo()
        if settings.SMTP_USE_STARTTLS:
            client.starttls(context=context)
            client.ehlo()
        if settings.SMTP_USERNAME and settings.SMTP_PASSWORD:
            client.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD)
        client.send_message(message)


async def send_verification_email(
    *,
    recipient: str,
    recipient_name: str,
    verification_url: str,
) -> None:
    subject = "Confirm your FlightRadar account"
    text_body = (
        f"Hello {recipient_name},\n\n"
        "Please confirm your account by opening the link below:\n"
        f"{verification_url}\n\n"
        "If you did not request this account, you can ignore this email.\n"
    )
    html_body = f"""
    <html>
      <body style="font-family: Arial, sans-serif; color: #10243a; line-height: 1.5;">
        <p>Hello {recipient_name},</p>
        <p>Please confirm your FlightRadar account by opening the link below:</p>
        <p><a href="{verification_url}">{verification_url}</a></p>
        <p>If you did not request this account, you can ignore this email.</p>
      </body>
    </html>
    """
    message = _build_message(recipient, subject, text_body, html_body)
    await asyncio.to_thread(_send_message, message)
    logger.info("Verification email sent", extra={"recipient": recipient})
