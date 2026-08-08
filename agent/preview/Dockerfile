FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY shared/ ./shared/
COPY interview/ ./interview/
COPY demo/ ./demo/
COPY preview/ ./preview/

RUN python interview/agent.py download-files

CMD ["python", "preview/supervisor.py"]
