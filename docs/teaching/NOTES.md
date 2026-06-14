# NOTES.md

## 用户环境

- 平台: macOS,使用 **OrbStack** 作为 Docker 引擎
- Docker 引擎: OrbStack 自带(不需要 Docker Desktop)
- Docker CLI 共存:
  - `/opt/homebrew/bin/docker` 29.5.3 — Homebrew 装,PATH 最前,实际在用
  - `/usr/local/bin/docker` 29.4.0 — OrbStack 自带的软链(指向 `/Applications/OrbStack.app/Contents/MacOS/xbin/docker`),不删,因为是 OrbStack 设计的自洽产物
- Docker Compose v2 plugin: 通过 `~/.docker/cli-plugins/docker-compose` 软链指向 Homebrew 装出来的二进制,Docker CLI 才能扫到
- `.zshrc` 里加了 `export PATH="/opt/homebrew/bin:$PATH"`,控制 PATH 顺序
- 现状: 单一权威 = Homebrew;OrbStack 软链作为"伴生",不冲突

## 教学小教训

- `find -type f` 只看普通文件,会漏掉 symlink。要查"所有可执行/可调用入口"用 `ls -la` 或 `find -type l` + 单独列文件
- 看到 `/usr/local/bin/...` 上的"老版本"不要立刻推断是 Docker Desktop 残留,**先 `ls -la` 看 symlink 目标**,再判断来历

## 用户偏好

- 沟通语言: 中文为主,代码/术语用英文
- 学习风格: 边学边改项目(learn-by-doing),**每节 lesson 至少要有一次 git commit 作为交付物**
  - commit 必须真实落到文件(不是"我会改"的口头承诺)
  - commit message 用 conventional commits 风格(`feat:` / `fix:` / `chore:` / `docs:` / `refactor:`)
  - 每节课末尾明确给出"commit 一句话描述 + 改动文件清单 + 验证命令"
  - 不需要用户自己起 commit message,我会在 lesson 末尾给出
- Node.js 基础: 完全空白,所有"为什么 Node 这样"的底层问题都不能跳过
- 第一阶段锚点: 可观测性三件套(Pino / request id / AllExceptionsFilter)+ 健康检查 + Swagger

## 已完成的 commit 候选(用户行为清单)

- 0001: `apps/gateway/src/main.ts` 加了一行 `console.log('cwd:', process.cwd(), 'env.PORT:', process.env.PORT);`(**未 commit,等攒一起 commit**)
- 安装 `@types/express`(`pnpm add -wD @types/express` — **未 commit**)
- 改 `.zshrc` 加 PATH(**不应该 commit,这是用户级配置,不是项目代码**)
- 软链 `~/.docker/cli-plugins/docker-compose`(**不应该 commit**)

