#!/usr/bin/env bash
set -euo pipefail
python3 -m pip install -U chromadb
python3 -m chroma run --host localhost --port 8000 --path ../data/chroma
