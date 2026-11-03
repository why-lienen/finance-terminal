#!/bin/sh
# 解决 macOS 把未签名 electron 当成“恶意软件 / 无法验证的开发者”拦截的问题：
# 安装后自动 ① 去掉隔离标志 ② 本地即席签名(ad-hoc)，无需 Apple 开发者账号。
# 非 macOS 平台直接跳过。
if [ "$(uname)" != "Darwin" ]; then
  exit 0
fi

# 定位 Electron.app（本脚本在 desktop/scripts/，故 ../node_modules/electron/dist/Electron.app）
SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
APP="$SCRIPT_DIR/../node_modules/electron/dist/Electron.app"

if [ -d "$APP" ]; then
  xattr -cr "$APP" 2>/dev/null
  if codesign --force --deep --sign - "$APP" >/dev/null 2>&1; then
    echo "[setup] electron 已本地签名，可直接 npm run desktop 启动"
  else
    echo "[setup] 自动签名失败（可忽略）。若启动被拦截，手动执行："
    echo "        xattr -cr \"$APP\" && codesign --force --deep --sign - \"$APP\""
  fi
fi
