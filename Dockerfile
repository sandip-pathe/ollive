FROM python:3.11-slim
WORKDIR /app

COPY apps/api/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY apps/api/app ./app
COPY packages ./packages

EXPOSE 8000
CMD ["/bin/sh", "-c", "if [ \"${SERVICE_ROLE:-api}\" = \"worker\" ]; then exec python packages/worker/enricher.py; else exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}; fi"]