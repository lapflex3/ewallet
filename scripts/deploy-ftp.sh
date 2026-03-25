#!/usr/bin/env bash
set -euo pipefail

: "${FTP_SERVER:?FTP_SERVER is required}"
: "${FTP_USERNAME:?FTP_USERNAME is required}"
: "${FTP_PASSWORD:?FTP_PASSWORD is required}"
: "${FTP_TARGET_DIR:?FTP_TARGET_DIR is required}"

npm run build:webapp >/dev/null

ROOT_DIR="dist/html5-portable/public"

echo "Deploying ${ROOT_DIR} to ftp://${FTP_SERVER}${FTP_TARGET_DIR}"

find "${ROOT_DIR}" -type d | while read -r dir; do
  rel="${dir#${ROOT_DIR}}"
  curl -sS --ftp-create-dirs -u "${FTP_USERNAME}:${FTP_PASSWORD}" "ftp://${FTP_SERVER}${FTP_TARGET_DIR}${rel}/" >/dev/null || true
done

find "${ROOT_DIR}" -type f | while read -r file; do
  rel="${file#${ROOT_DIR}/}"
  curl -sS --ftp-create-dirs -T "${file}" -u "${FTP_USERNAME}:${FTP_PASSWORD}" "ftp://${FTP_SERVER}${FTP_TARGET_DIR}${rel}" >/dev/null
  echo "Uploaded: ${rel}"
done

echo "FTP deploy completed."
