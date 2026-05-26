FROM python:3.11-slim
WORKDIR /app
COPY apps/api/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY packages/worker/enricher.py ./packages/worker/enricher.py
CMD ["python", "packages/worker/enricher.py"]
