# Watchdog Command Receiver

Standalone Feishu/Lark IM command receiver for local watchdog commands.

[中文文档](./README.zh-CN.md)

This service is intentionally independent from Hermes, OpenClaw, and any future service. It receives Feishu bot messages, checks local policy, resolves commands from config, executes the configured argv without a shell, writes an audit record, and replies to the chat.

## Commands

```text
/watchdog help
/watchdog help zh
/watchdog restart <target> <subject>
/wd help
/wd help zh
/wd restart <target> <subject>
```

Example targets in `config.example.json`:

```text
/wd restart hermes all
/wd restart hermes gateway
/wd restart hermes cloudflared
/wd restart openclaw gateway
```

## Language

English is the default. Set `language` in the config to change the default reply language:

```json
{
  "language": "zh-CN"
}
```

Users can also override help language per message:

```text
/wd help en
/wd help zh
```

Supported values are `en` and `zh-CN`.

## Configuration

Copy `config.example.json` to:

```bash
mkdir -p "$HOME/.watchdog-command-receiver/config"
cp config.example.json "$HOME/.watchdog-command-receiver/config/config.json"
```

Edit the copy with:

- Feishu App ID and App Secret
- allowed sender IDs
- allowed chat IDs
- target argv entries
- optional default `language`

Targets are fully config-driven. Removing Hermes, OpenClaw, or any future gateway means deleting that target from config; no code change is required.

## Feishu Setup

Create a Feishu/Lark custom app, enable bot capability, grant message receive/send permissions, subscribe to `im.message.receive_v1`, and choose long-connection event delivery. Long connection keeps this local service private and avoids exposing a public callback URL.

The app secret and local `.env` files must stay outside git. This repository ignores `.env` by default.

## Local Simulation

```bash
npm run simulate -- --config config.example.json --sender ou_admin --chat oc_ops "/wd help"
npm run simulate -- --config config.example.json --sender ou_admin --chat oc_ops "/wd help zh"
```

## Install

```bash
npm install
bash scripts/install-launchagent.sh
```

Default paths:

- Runtime: `$HOME/.watchdog-command-receiver/runtime/current`
- Config: `$HOME/.watchdog-command-receiver/config/config.json`
- Log: `$HOME/.watchdog-command-receiver/logs/receiver.log`
- Audit: `$HOME/.watchdog-command-receiver/audit/audit.jsonl`

## Verify

```bash
npm test
npm run check
```
