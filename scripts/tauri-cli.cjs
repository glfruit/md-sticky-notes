// 绕过 @tauri-apps/cli 官方入口的 argv 解析：
// 本环境的 Node 运行时二进制名不是 "node"，官方 tauri.js 会把二进制路径误当成子命令。
// 这里直接调用 napi 的 run(args, binName)，参数原样透传。
const cli = require('../node_modules/@tauri-apps/cli/main.js')

cli
  .run(process.argv.slice(2), 'tauri')
  .catch((err) => {
    console.error(err && err.message ? err.message : err)
    process.exit(1)
  })
