#!/usr/bin/env node
// 打包脚本：把「盯盘终端」打成自包含的 macOS .app（无需 node / 公开网站 / Vite）。
//
// 流程：
//   1) 构建前端 web/dist（最新代码）
//   2) 暂存：把 desktop/ 内容复制到系统临时目录，并注入 api/ 与 web-dist/
//      （打包后 app 内路径为 ./api 与 ./web-dist，main.js / server.js 据此解析）
//   3) electron-packager 打 .app（输出到 desktop/）
//   4) 本地即席签名（ad-hoc），绕过 macOS 把未签名 app 当恶意软件拦截
//   5) 清理临时目录
//
// 用法：cd desktop && npm run pack
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const DESKTOP = path.join(__dirname, '..'); // desktop/scripts -> desktop
const ROOT = path.join(DESKTOP, '..'); // -> finance-terminal
const WEB = path.join(ROOT, 'web');
const API = path.join(ROOT, 'api');
const OUT = DESKTOP;

function sh(cmd, cwd) {
  console.log('\n▶ ' + cmd + (cwd ? '  (in ' + path.relative(ROOT, cwd) + ')' : ''));
  const r = spawnSync(cmd, { cwd, stdio: 'inherit', shell: true });
  if (r.status !== 0) {
    console.error('✗ 失败，退出码', r.status);
    process.exit(1);
  }
}

async function main() {
  // 1) 构建前端（含最新修复：30 分钟默认、响亮提示音、预警名称、透明/拖动样式）
  sh('npm run build', WEB);

  // 2) 准备暂存目录（放在系统临时目录，避免把 desktop 内的 .stage 又复制进自己）
  const STAGE = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-pack-'));
  try {
    // 复制 desktop 内容（排除 node_modules/.git/.cache）
    sh(`cp -R "${DESKTOP}/." "${STAGE}/"`, DESKTOP);
    for (const d of ['node_modules', '.git', '.cache', '.stage']) {
      fs.rmSync(path.join(STAGE, d), { recursive: true, force: true });
    }

    // 注入 api 与 web-dist（打包后 app 内即 ./api 与 ./web-dist）
    sh(`cp -R "${API}" "${path.join(STAGE, 'api')}"`);
    sh(`cp -R "${path.join(WEB, 'dist')}" "${path.join(STAGE, 'web-dist')}"`);

    // 3) 打包
    const packager = require('electron-packager');
    const pkg = JSON.parse(fs.readFileSync(path.join(DESKTOP, 'package.json'), 'utf8'));
    // 显式指定 electronVersion，避免在剔除了 node_modules 的暂存目录里解析不到 electron 模块
    let electronVersion = '31.7.7';
    try {
      electronVersion = require(path.join(DESKTOP, 'node_modules', 'electron', 'package.json')).version;
    } catch (_) {}
    const opts = {
      dir: STAGE,
      name: 'finance-terminal',
      platform: 'darwin',
      arch: 'arm64',
      overwrite: true,
      electronVersion,
      ignore: ['node_modules'],
      out: OUT,
      appVersion: pkg.version || '0.1.0',
      appCopyright: ' finance-terminal',
    };
    console.log('\n▶ electron-packager 打包中（首次需下载 Electron，请稍候）…');
    const appPaths = await packager(opts);
    console.log('打包产物：', appPaths);

    // 4) 本地即席签名，绕过 macOS 拦截（与 dev 的 setup-electron.sh 同思路）
    const appPath = appPaths && appPaths[0];
    if (appPath && process.platform === 'darwin') {
      sh(`xattr -cr "${appPath}"`);
      sh(`codesign --force --deep --sign - "${appPath}"`);
      console.log('✅ 已本地签名：', appPath);
    }
  } finally {
    // 5) 清理临时目录
    fs.rmSync(STAGE, { recursive: true, force: true });
  }

  console.log('\n🎉 完成。.app 位于：', OUT);
  console.log('   双击 finance-terminal-darwin-arm64/finance-terminal.app 即可运行（首次若被拦截，系统设置→隐私与安全→仍要打开）。');
}

main().catch((e) => {
  console.error('PACK ERROR', e);
  process.exit(1);
});
