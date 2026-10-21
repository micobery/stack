# Lightweight Python Alpine base image
FROM python:3.11-alpine

# Set working directory
WORKDIR /app

# Copy application files
COPY public /app/public
COPY server.py /app/server.py

# Ensure non-root user for security
RUN adduser -D -u 1000 appuser && chown -R appuser:appuser /app
USER appuser

# Cloud Run injects $PORT (default 8080)
ENV PORT=8080
EXPOSE 8080

# Run lightweight server
CMD ["python3", "server.py"]
