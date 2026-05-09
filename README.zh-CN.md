# Watchdog Command Receiver

用于本地 watchdog 命令的独立飞书/Lark IM 命令接收器。

[English README](./README.md)

这个服务刻意与 Hermes、OpenClaw 以及未来任何服务解耦。它接收飞书 bot 消息，执行本地策略校验，从配置中解析命令，用无 shell 的 argv 方式执行命令，写入审计记录，并把结果回复到会话。

## 命令

```text
/watchdog help
/watchdog help en
/watchdog restart <target> <subject>
/wd help
/wd help en
/wd restart <target> <subject>
```

`config.example.json` 中的示例目标：

```text
/wd restart hermes all
/wd restart hermes gateway
/wd restart hermes cloudflared
/wd restart openclaw gateway
```

## 语言

默认回复语言是英文。可以在配置中设置默认中文：

```json
{
  "language": "zh-CN"
}
```

用户也可以在 help 命令里临时指定语言：

```text
/wd help en
/wd help zh
```

支持的配置值是 `en` 和 `zh-CN`。

## 配置

把 `config.example.json` 复制到：

```bash
mkdir -p "$HOME/.watchdog-command-receiver/config"
cp config.example.json "$HOME/.watchdog-command-receiver/config/config.json"
```

然后在副本里填写：

- 飞书 App ID 和 App Secret
- 允许的发送者 ID
- 允许的会话 ID
- 目标命令 argv
- 可选默认 `language`

目标完全由配置驱动。以后不用 Hermes、OpenClaw 或任何其他 gateway，只需要从配置里删除对应 target，不需要改代码。

## 飞书设置

创建飞书/Lark 自建应用，启用机器人能力，授予消息接收和发送权限，订阅 `im.message.receive_v1`，并选择长连接事件投递。长连接可以让这个本地服务保持私有，不需要暴露公网回调 URL。

App Secret 和本地 `.env` 文件必须留在 git 之外。本仓库默认忽略 `.env`。

## 本地模拟

```bash
npm run simulate -- --config config.example.json --sender ou_admin --chat oc_ops "/wd help"
npm run simulate -- --config config.example.json --sender ou_admin --chat oc_ops "/wd help zh"
```

## 安装

```bash
npm install
bash scripts/install-launchagent.sh
```

默认路径：

- Runtime: `$HOME/.watchdog-command-receiver/runtime/current`
- Config: `$HOME/.watchdog-command-receiver/config/config.json`
- Log: `$HOME/.watchdog-command-receiver/logs/receiver.log`
- Audit: `$HOME/.watchdog-command-receiver/audit/audit.jsonl`

## 验证

```bash
npm test
npm run check
```
