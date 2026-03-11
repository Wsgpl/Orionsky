.PHONY: install dev lint typecheck test test-cov docker-build docker-up docker-down auth-hash preflight clean

install:
	pip install -r requirements.txt

dev:
	uvicorn app.main:app --reload --host 0.0.0.0 --port 8000 --log-level debug

lint:
	ruff check app/ tests/
	ruff format --check app/ tests/

typecheck:
	mypy app/ --ignore-missing-imports

test:
	pytest tests/ -v

test-cov:
	pytest tests/ --cov=app --cov-report=html --cov-report=term-missing

docker-build:
	docker build -t flightradar-api:latest .

docker-up:
	docker-compose up -d

docker-down:
	docker-compose down

docker-logs:
	docker-compose logs -f api

auth-hash:
	python -c "from passlib.context import CryptContext; import getpass; pwd=getpass.getpass('Password: '); print(CryptContext(schemes=['bcrypt'], deprecated='auto').hash(pwd))"

preflight:
	python scripts/preflight.py --target production

clean:
	find . -type d -name __pycache__ -exec rm -rf {} +
	find . -name "*.pyc" -delete
	rm -rf .pytest_cache .mypy_cache .ruff_cache htmlcov .coverage
