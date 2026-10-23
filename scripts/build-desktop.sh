#!/usr/bin/env bash
# 本地桌面构建：自动载入 .env（updater 签名密钥等），再跑 tauri build。
# 用法：bash scripts/build-desktop.sh [tauri build 的额外参数]
# 说明：updater 公钥固化在 tauri.conf.json 后，所有构建都需要 TAURI_SIGNING_PRIVATE_KEY
#       环境变量（Tauri 不读 .env），本脚本负责把 .env 注入真实环境。
set -euo pipefail
cd "$(dirname "$0")/.."

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

exec npx tauri build "$@"
