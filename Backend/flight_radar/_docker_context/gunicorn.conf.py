"""
Gunicorn configuration for production deployment.
Uvicorn workers handle async FastAPI correctly.
"""
import multiprocessing
import os

# Binding
bind = f"{os.getenv('HOST', '0.0.0.0')}:{os.getenv('PORT', '8000')}"

# Workers — Uvicorn async workers for FastAPI
worker_class = "uvicorn.workers.UvicornWorker"
workers = int(os.getenv("WORKERS", multiprocessing.cpu_count() * 2 + 1))
worker_tmp_dir = "/dev/shm"   # tmpfs for worker heartbeats

# Timeouts
timeout = int(os.getenv("WORKER_TIMEOUT", "120"))
graceful_timeout = 30
keepalive = 5

# Logging
accesslog = "-"   # stdout
errorlog = "-"    # stdout
loglevel = os.getenv("LOG_LEVEL", "info").lower()
access_log_format = '%(h)s "%(r)s" %(s)s %(b)s "%(D)sµs"'

# Resource limits
max_requests = 1000
max_requests_jitter = 100
limit_request_line = 8190
limit_request_fields = 100
