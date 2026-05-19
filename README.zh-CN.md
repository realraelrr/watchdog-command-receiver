# Watchdog Command Receiver

面向 agent 的飞书/Lark IM 命令接收器，用于本地 watchdog 操作。

[English README](./README.md)

## 目的

接收飞书 bot 消息，校验发送者/会话，从配置解析命令，用无 shell 的 argv 执行，写审计记录，并回复会话。目标完全由配置驱动；Hermes/OpenClaw 只是示例，不是硬编码服务。

## 命令

```text
/wd help
/wd help en
/wd help zh
/wd restart <target> <subject>
/wd enable <target> auto
/wd disable <target> auto
/wd start <target> agent
/wd stop <target> agent
/wd status <target> auto
```

`/watchdog` 等价于 `/wd`。

示例配置命令：

```text
/wd restart hermes all
/wd restart hermes gateway
/wd restart hermes cloudflared
/wd restart openclaw gateway
/wd disable hermes auto
/wd enable hermes auto
/wd stop hermes agent
/wd start hermes agent
/wd status hermes auto
/wd disable openclaw auto
/wd enable openclaw auto
/wd stop openclaw agent
/wd start openclaw agent
/wd status openclaw auto
```

## 配置

```bash
mkdir -p "$HOME/.watchdog-command-receiver/config"
cp config.example.json "$HOME/.watchdog-command-receiver/config/config.json"
```

编辑副本：

- `feishu.appId`、`feishu.appSecret`
- `policy.allowedSenderIds`、`policy.allowedChatIds`、可选 `allowDirectMessages`
- `targets.<name>.commands.<action>.<subject>.argv`
- 可选 `language`：`en` 或 `zh-CN`

命令 argv 不经过 shell。删除配置里的 target 即可移除对应命令面。

## 飞书

使用飞书/Lark 自建应用，启用机器人能力，授予消息接收/发送权限，订阅 `im.message.receive_v1`，并使用长连接投递。App secret 和本地 `.env` 不要进 git。

## 运行

```bash
npm install
bash scripts/install-launchagent.sh
```

默认路径：

- Runtime: `$HOME/.watchdog-command-receiver/runtime/current`
- Config: `$HOME/.watchdog-command-receiver/config/config.json`
- Log: `$HOME/.watchdog-command-receiver/logs/receiver.log`
- Audit: `$HOME/.watchdog-command-receiver/audit/audit.jsonl`

## 模拟

```bash
npm run simulate -- --config config.example.json --sender ou_admin --chat oc_ops "/wd help"
npm run simulate -- --config config.example.json --sender ou_admin --chat oc_ops "/wd disable hermes auto"
```

## 验证

```bash
npm test
npm run check
```
