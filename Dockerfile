# Container image for the Ferman backend + web app (intent-only).
# The intent model is NOT baked into the image — it is downloaded from the
# Hugging Face Hub at startup via the INTENT_REPO env var, keeping the image
# small. Set SLOT_REPO too if you later want slot extraction.
FROM python:3.11-slim

WORKDIR /app

# libgomp1 is the OpenMP runtime PyTorch's CPU matmul needs at inference time.
# Without it the model loads but segfaults on the first forward pass.
RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# CPU-only PyTorch first (avoids pulling the multi-GB CUDA build). Pinned to
# match requirements.txt — see the note there about `==2.13.0` matching the
# `+cpu` local version, which is what stops the next step re-resolving torch.
RUN pip install --no-cache-dir torch==2.13.0 --index-url https://download.pytorch.org/whl/cpu

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# The whole backend/ folder (tests and dev requirements are excluded by
# .dockerignore), so a new module can never be forgotten here. backend/static,
# the web build, comes along when it exists.
COPY backend/ ./

# Most container hosts provide $PORT (e.g. 8080); default to 7860 for local runs.
EXPOSE 7860
CMD uvicorn main:app --host 0.0.0.0 --port ${PORT:-7860}
