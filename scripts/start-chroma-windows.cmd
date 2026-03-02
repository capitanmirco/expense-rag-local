@echo off
REM Requires Python + chromadb
py -m pip install -U chromadb
py -m chroma run --host localhost --port 8000 --path ..\data\chroma
