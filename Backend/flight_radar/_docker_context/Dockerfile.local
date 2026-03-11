# ─────────────────────────────────────────────────────────────
#  Stage 1: builder — install deps into a clean venv
# ─────────────────────────────────────────────────────────────
FROM python:3.12.3-slim AS builder

WORKDIR /build

# System deps for bcrypt / cryptography native wheels
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential libffi-dev && \
    rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN python -m venv /venv && \
    /venv/bin/pip install --upgrade pip wheel && \
    /venv/bin/pip install --no-cache-dir -r requirements.txt

# ─────────────────────────────────────────────────────────────
#  Stage 2: runtime — minimal image, no build tools
# ─────────────────────────────────────────────────────────────
FROM python:3.12.3-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/venv/bin:$PATH"

WORKDIR /app

# Non-root user for security
RUN addgroup --system appgroup && adduser --system --ingroup appgroup appuser

COPY --from=builder /venv /venv
COPY app/ ./app/
COPY gunicorn.conf.py .

RUN chown -R appuser:appgroup /app
USER appuser

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health/live')"

CMD ["gunicorn", "-c", "gunicorn.conf.py", "app.main:app"]
