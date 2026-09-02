# DSH Scaffold

[English](README.md) · [中文](README.zh-CN.md)

把 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 二次开发成 **你自己的 chat**，再装到 **你自己的 Olares** 上。你跟 agent 说目标，由 agent 去执行。

仓库里已经有一份能跑的 chat（dsh web、模型接线、DinD、`olares-cli`）。你起个名字，按需改品牌，然后让 agent 装到你的机器上。

这是一份 **模板**。先 fork 到你自己的 GitHub，再 clone **你的 fork**。不要把 `beclab/dsh_scaffold` 当成日常开发仓库。

Chat 镜像由 **GitHub Actions** 在你的 fork 上构建，发布到 GHCR（`ghcr.io/<你>/<应用>`）。笔记本 **不需要** Docker。agent 再用 `olares-cli` 上传 chart 并安装到你的 Olares。

编排逻辑在 [`.github/workflows/image.yml`](.github/workflows/image.yml)。它跑在你的 fork 上，所以改动必须**先提交并推送**：推 `main` 会构建镜像，打 `v*` tag 或手动运行 `image` workflow 也一样。

## 怎么开始

1. Fork 本仓库，clone 你的 fork，用 Cursor、Claude Code 或其它支持 skill 的 agent 打开那个文件夹。在 fork 上打开 Actions。
2. 在你自己的终端里登录（agent 不会代登）：
   - `gh auth login`
   - `olares-cli profile login`
3. 需要改名时把 `.env.example` 拷成 `.env`。`IMAGE_REPO` 可以留空。
4. 直接说你要做什么，例如：
   - 「帮我装 olares-cli」
   - 「我想做一个自己的 chat，装到我的 Olares」
   - 「改名字 / 标题 / 颜色」
   - 「先在本地跑起来」

你需要 Node.js 22+、`olares-cli`、GitHub，以及一台已装好的 Olares（≥ 1.12.6）。Docker 不是必须的。agent 会检查 Node、`olares-cli`、git 远端和 `gh`（`npm run preflight`）。**不要把密码、Desktop 地址、TOTP 打在聊天里。**

## 可以跟 agent 说什么

| 你想做的 | 可以这样说 |
| --- | --- |
| 不用默认的 `dshscaffold` | 「把这个 chat 叫 `mychat`」（第一次安装之前） |
| 标题、颜色、它怎么自称 | 「改一下品牌」 |
| 新能力 | 「加一个插件，做……」 |
| chat 里自带的 skill | 「加一个 skill，做……」 |
| 笔记本上先看一眼 | 「先本地跑起来」 |
| 装到你的 Olares | 「装到我的机器上」 |

文件改哪里、命令怎么跑，由 agent 按文档执行。你不必自己对着命令清单做。

## 给 agent 看的步骤

安装笔记本技能包、改 overlay、GitHub Actions 出镜像、上传、装到用户自己的 Olares——写在 **[docs/agent.md](docs/agent.md)**。那是给 agent 的操作说明，不是给你逐步点的清单。

不要提交 agent 生成的目录（`.cursor/`、`.claude/` 等）。
