#!/usr/bin/env bash
# worktree 并行会话管理（#15）：一票一现场，放仓库外 sibling 目录，多张票（功能 × 重构）互不踩工作区。
# 用法：
#   bash scripts/wt.sh new fix/12-dup-task    # 从最新 origin/main 建分支+现场，自动 npm ci
#   bash scripts/wt.sh ls                     # 列出全部现场
#   bash scripts/wt.sh rm fix-12-dup-task     # 删现场；已合并分支随手删，未合并分支保留并提示
# 说明：
#   - 目录：../md-sticky-notes-wt/<分支名 / 转 ->。放仓外是因为主仓 eslint . 无 ignores
#     配置，仓内嵌套源码会被扫到；仓外与主仓工具链彻底隔离。
#   - 现场独立 node_modules（npm ci 自动跑，约 1 分钟，磁盘 +236M/现场）。
#   - .env（updater 签名密钥）不进 git：现场里跑 build-desktop.sh 前先从主仓 cp 过去。
#   - 动 Rust 的票避免并行（cargo target 4.7G/份）；确需并行时
#     export CARGO_TARGET_DIR=<主仓>/src-tauri/target 共享，cargo 目录锁会让并发编译排队。
#   - dev/preview 端口自动递增（3000→3001…），localStorage 按端口隔离：演示数据天然不互踩。
set -euo pipefail
# 锚定主仓：脚本可能被主仓或现场副本调用，先按 $0（相对调用 cwd 解析）定位脚本所在仓，
# 再经 git 公共目录（worktree 共享 .git）换算到主仓根——现场根恒为主仓 sibling 的
# ../md-sticky-notes-wt（从现场仓根直算会嵌套 md-sticky-notes-wt/md-sticky-notes-wt 错位）
SCRIPT_REPO="$(cd "$(dirname "$0")/.." && pwd)"
MAIN_ROOT="$(dirname "$(git -C "${SCRIPT_REPO}" rev-parse --path-format=absolute --git-common-dir)")"
cd "${MAIN_ROOT}"

WT_ROOT="$(dirname "${MAIN_ROOT}")/md-sticky-notes-wt"

cmd="${1:-}"
case "${cmd}" in
  new)
    branch="${2:?用法: wt.sh new <type>/<issue>-<slug>，如 fix/12-dup-task}"
    name="${branch//\//-}"
    wt="${WT_ROOT}/${name}"
    if [ -e "${wt}" ]; then
      echo "现场已存在：${wt}（wt.sh ls 查看）" >&2
      exit 1
    fi
    git fetch origin main
    git worktree add "${wt}" -b "${branch}" origin/main
    echo "==> 现场就绪：${wt}"
    echo "==> npm ci（独立 node_modules，约 1 分钟）…"
    (cd "${wt}" && npm ci)
    echo "==> 完成。并行会话在此目录起：cd ${wt}"
    echo "    现场里跑桌面构建前先：cp ${PWD}/.env ${wt}/"
    ;;
  ls)
    git worktree list
    ;;
  rm)
    name="${2:?用法: wt.sh rm <现场名>，见 wt.sh ls 输出的目录名尾段}"
    wt="${WT_ROOT}/${name}"
    if [ ! -e "${wt}" ]; then
      # 现场目录已不在（#21：gh pr merge --delete-branch 会连远程/本地分支与 worktree 一起清）：
      # 幂等收尾——先从元数据认领分支（目录没了 porcelain 仍列出），prune 后按既有语义处理残留分支
      branch="$(git worktree list --porcelain | awk -v wt="${wt}" '
        $1 == "worktree" { cur = substr($0, 10) } # 路径可含空格，porcelain 不加引号，取整行余部
        $1 == "branch" && cur == wt { sub(/^refs\/heads\//, "", $2); print $2 }')"
      git worktree prune
      if [ -n "${branch}" ]; then
        if git branch -d "${branch}" 2>/dev/null; then
          echo "==> 现场已被清理（gh --delete-branch？）；残留分支 ${branch} 已删"
        else
          echo "==> 现场已被清理；分支 ${branch} 未合并故保留，确认丢弃手动：git branch -D ${branch}（须用户确认）"
        fi
      else
        echo "==> 现场已被清理（gh --delete-branch？），无残留分支，无操作"
      fi
      rmdir "${WT_ROOT}" 2>/dev/null || true # 父目录空则顺手清，还有其它现场则保留
      exit 0
    fi
    branch="$(git -C "${wt}" branch --show-current)"
    if ! git worktree remove "${wt}"; then
      echo "删除被拒（现场有未提交/未跟踪改动？确认丢弃后手动：git worktree remove --force ${wt}）" >&2
      exit 1
    fi
    if git branch -d "${branch}" 2>/dev/null; then
      echo "==> 现场与分支 ${branch} 已删"
    else
      echo "==> 现场已删；分支 ${branch} 未合并故保留，确认丢弃手动：git branch -D ${branch}（须用户确认）"
    fi
    rmdir "${WT_ROOT}" 2>/dev/null || true # 父目录空则顺手清，还有其它现场则保留
    ;;
  *)
    echo "用法: wt.sh {new <type>/<issue>-<slug> | ls | rm <现场名>}" >&2
    exit 1
    ;;
esac
