"""
email_utils.py
==============
Shared email-sending helper using Gmail OAuth2 (not SMTP basic auth).

Dev Redirect Switch
-------------------
Set  DEV_EMAIL_REDIRECT=1  in .env to redirect **every** outbound email
to karthik8a39@gmail.com, regardless of the `recipient` argument passed
by any caller.  Set to 0 (or omit) to send to the real recipient.

This switch is purely additive — it does not touch any other business
logic.  When disabled the function behaves exactly as if it were not there.
"""

from __future__ import annotations

import os
import json
import urllib.request
import urllib.parse
import base64
from pathlib import Path
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Optional

# ── Load .env automatically so credentials are available even when the
#    gateway or test runner hasn't explicitly called load_dotenv() ─────────────
try:
    from dotenv import load_dotenv as _load_dotenv
    # Walk up from this file's location to find the .env at the repo root
    _env_path = Path(__file__).parent.parent / ".env"
    if _env_path.exists():
        _load_dotenv(dotenv_path=_env_path, override=False)  # override=False keeps real env vars
except ImportError:
    pass  # python-dotenv not installed; rely on env vars being set externally
# ─────────────────────────────────────────────────────────────────────────────

# ── Dev-redirect constants ────────────────────────────────────────────────────
_DEV_REDIRECT_EMAIL = "karthik8a39@gmail.com"  # hardcoded – do not change


def _dev_redirect_enabled() -> bool:
    """Return True when the dev-redirect switch is ON (DEV_EMAIL_REDIRECT=1)."""
    return os.environ.get("DEV_EMAIL_REDIRECT", "0").strip() == "1"


# ── Gmail OAuth2 token refresh ────────────────────────────────────────────────

def _get_access_token() -> str:
    """
    Exchange the stored refresh token for a short-lived access token via
    Google's token endpoint.  Raises RuntimeError on failure.
    """
    client_id     = os.environ.get("GMAIL_CLIENT_ID", "")
    client_secret = os.environ.get("GMAIL_CLIENT_SECRET", "")
    refresh_token = os.environ.get("GMAIL_REFRESH_TOKEN", "")

    if not all([client_id, client_secret, refresh_token]):
        raise RuntimeError(
            "Gmail OAuth2 credentials are not fully configured. "
            "Check GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET and GMAIL_REFRESH_TOKEN in .env."
        )

    payload = urllib.parse.urlencode({
        "client_id":     client_id,
        "client_secret": client_secret,
        "refresh_token": refresh_token,
        "grant_type":    "refresh_token",
    }).encode()

    req = urllib.request.Request(
        "https://oauth2.googleapis.com/token",
        data=payload,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )

    with urllib.request.urlopen(req) as resp:
        data = json.loads(resp.read().decode())

    access_token = data.get("access_token")
    if not access_token:
        raise RuntimeError(f"Failed to obtain Gmail access token: {data}")

    return access_token


# ── Core send function ─────────────────────────────────────────────────────────

def send_email(
    recipient: str,
    subject:   str,
    body:      str,
    html_body: Optional[str] = None,
) -> dict:
    """
    Send an email via the Gmail API using OAuth2.

    Parameters
    ----------
    recipient : str
        The intended recipient address.
    subject   : str
        Email subject line.
    body      : str
        Plain-text body.
    html_body : str | None
        Optional HTML body.  When provided a multipart/alternative message
        is sent; otherwise a plain-text message is sent.

    Returns
    -------
    dict with keys:
        status      – "success" | "simulated"
        recipient   – address the email was actually sent to
        redirected  – True if the dev-redirect switch re-routed the email
        message     – human-readable summary
    """
    sender_email = os.environ.get("GMAIL_SENDER_EMAIL", "")

    # ── Dev-redirect logic ────────────────────────────────────────────────────
    redirected        = False
    original_recipient = recipient

    if _dev_redirect_enabled():
        recipient  = _DEV_REDIRECT_EMAIL   # override – only this line changes who gets the mail
        redirected = True
        print(
            f"[DEV_EMAIL_REDIRECT=1] Redirecting email originally for "
            f"<{original_recipient}> -> <{recipient}>"
        )
    # ─────────────────────────────────────────────────────────────────────────

    # Build MIME message
    if html_body:
        msg = MIMEMultipart("alternative")
        msg.attach(MIMEText(body, "plain"))
        msg.attach(MIMEText(html_body, "html"))
    else:
        msg = MIMEText(body, "plain")

    msg["Subject"] = subject
    msg["From"]    = sender_email
    msg["To"]      = recipient

    # Encode as base64url for the Gmail API
    raw_bytes   = msg.as_bytes()
    raw_b64url  = base64.urlsafe_b64encode(raw_bytes).decode().rstrip("=")

    # Get a fresh access token and call the Gmail send endpoint
    access_token = _get_access_token()

    api_payload  = json.dumps({"raw": raw_b64url}).encode()
    api_req = urllib.request.Request(
        "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
        data=api_payload,
        headers={
            "Authorization": f"Bearer {access_token}",
            "Content-Type":  "application/json",
        },
        method="POST",
    )

    with urllib.request.urlopen(api_req) as resp:
        resp_data = json.loads(resp.read().decode())

    summary = (
        f"Email sent to <{recipient}> (redirected from <{original_recipient}>)"
        if redirected
        else f"Email sent to <{recipient}>"
    )

    print(f"[email_utils] {summary} | Gmail message id: {resp_data.get('id')}")

    return {
        "status":     "success",
        "recipient":  recipient,
        "redirected": redirected,
        "message":    summary,
    }
