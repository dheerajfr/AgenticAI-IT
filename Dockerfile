FROM python:3.10-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Install python requirements
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application files
COPY . .

# Move default database to fallback location for volume pre-population
RUN mkdir -p /data && \
    if [ -f services/source.db ]; then cp services/source.db /app/default_source.db; fi

# Expose gateway port
EXPOSE 8000

# Set environment variables
ENV DATABASE_PATH=/data/source.db
ENV PORT=8000

# Start script to initialize DB and run gateway
CMD sh -c "if [ ! -f /data/source.db ] && [ -f /app/default_source.db ]; then cp /app/default_source.db /data/source.db; fi && uvicorn gateway:app --host 0.0.0.0 --port 8000"
