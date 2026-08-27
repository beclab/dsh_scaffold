# DSH Scaffold

[English](README.md) · [中文](README.zh-CN.md)

把 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 二次开发成 **你自己的 chat**，再装到 **你自己的 Olares** 上。你跟 agent 说目标，由 agent 去执行。

仓库里已经有一份能跑的 chat（dsh web、模型接线、DinD、`olares-cli`）。你起个名字，按需改品牌，然后让 agent 装到你的机器上。

## 怎么开始

1. 用 Cursor、Claude Code 或其它支持 skill 的 agent 打开这个文件夹。
2. 直接说你要做什么，例如：
   - 「帮我装 olares-cli 并登录」
   - 「我想做一个自己的 chat，装到我的 Olares」
   - 「改名字 / 标题 / 颜色」
   - 「先在本地跑起来」
3. agent 打开配置面板时，在面板里填。**不要把密码、Desktop 地址、TOTP 打在聊天里。**

```bash
npm run configure
```

面板会写入 gitignored 的 `.dsh/config.json`。之后 agent 只读这个文件，不再问这些项。

你需要 Node.js 22+、Docker，以及一台已装好的 Olares（≥ 1.12.6）。agent 会先检查 Node、`olares-cli`、Docker 和镜像打包脚本（`npm run preflight`）。缺 CLI 就先装；没装 Docker 会打开 Docker Desktop 安装页。`npm run configure` 会再查一遍，没齐不会启动。

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

安装笔记本技能包、配置、改 overlay、save + 上传、装到用户自己的 Olares——写在 **[docs/agent.md](docs/agent.md)**。那是给 agent 的操作说明，不是给你逐步点的清单。

不要提交 agent 生成的目录（`.cursor/`、`.claude/` 等）。
