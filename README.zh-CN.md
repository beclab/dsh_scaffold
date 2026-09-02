# DSH Scaffold

[English](README.md) · [中文](README.zh-CN.md)

把 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) overlay 做成 chat，装到你的 Olares。你跟 agent 说目标，由 agent 执行。

这是模板：fork 后 clone **你的 fork** 再开发。

## 流程

1. Fork 本仓库，clone 你的 fork，用支持 skill 的 agent 打开。在 fork 上启用 Actions。
2. 本机终端：
   - `gh auth login`
   - `olares-cli profile login`
3. 需要 Node.js 22+、[GitHub CLI](https://cli.github.com/)、`olares-cli`、Olares ≥ 1.12.6。缺 `olares-cli` 时让 agent 安装。
4. 直接说要做什么，例如「装到我的 Olares」。

agent 会提交并推送，由 [`.github/workflows/image.yml`](.github/workflows/image.yml) 在 GitHub 上构建 `ghcr.io/<你>/<应用>:<chart 版本>`（推 `main`/`master`、打 `v*` tag，或 `gh workflow run image`），再 `olares-cli market upload` / 安装。镜像名来自 git `origin`。

某个镜像名**第一次**构建完成后，到 [GitHub → Packages](https://github.com/settings/packages) 把对应容器（默认 `dshscaffold`）设为 **Public**。之后同一包名保持公开。

## 可以跟 agent 说

| 你想做的 | 可以这样说 |
| --- | --- |
| 改应用名 | 「把这个 chat 叫 `mychat`」（第一次安装之前） |
| 标题、颜色、自称 | 「改一下品牌」 |
| 新能力 | 「加一个插件，做……」 |
| chat 自带 skill | 「加一个 skill，做……」 |
| 本地跑 | 「先本地跑起来」 |
| 装到 Olares | 「装到我的机器上」 |

本地跑：拷 `.env.example` 为 `.env`，设 `LLM_GATEWAY_URL`，然后 `npm install`、`npm run skills:sync`、`npm run build`、`npm run start`。

agent 步骤见 **[`__agent__/`](__agent__/)**。不要提交 `.cursor/`、`.claude/` 等生成目录。
