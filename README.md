# Watchdog Command Receiver

Agent-facing Feishu/Lark IM command receiver for local watchdog actions.

[中文文档](./README.zh-CN.md)

Use it as the narrow command surface between a trusted chat operator and local
watchdog scripts. Commands are allowlisted in config, executed without a shell,
and written to an audit log.

## Purpose

Receive Feishu bot messages, authorize sender/chat, resolve a configured command, execute argv without a shell, audit the decision, and reply to the chat. Targets are config-driven; Hermes/OpenClaw are examples, not hard-coded services.

## Commands

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

`/watchdog` is equivalent to `/wd`.

Example configured commands:

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

## Config

```bash
mkdir -p "$HOME/.watchdog-command-receiver/config"
cp config.example.json "$HOME/.watchdog-command-receiver/config/config.json"
```

Edit the copy:

- `feishu.appId`, `feishu.appSecret`
- `policy.allowedSenderIds`, `policy.allowedChatIds`, optional `allowDirectMessages`
- `targets.<name>.commands.<action>.<subject>.argv`
- optional `language`: `en` or `zh-CN`

Command argv is executed without a shell. Remove a target from config to remove that command surface.

## Feishu

Use a Feishu/Lark custom app with bot capability, message receive/send permissions, `im.message.receive_v1`, and long-connection delivery. Keep app secret and local `.env` files out of git.

## Run

```bash
npm install
bash scripts/install-launchagent.sh
```

Default paths:

- Runtime: `$HOME/.watchdog-command-receiver/runtime/current`
- Config: `$HOME/.watchdog-command-receiver/config/config.json`
- Log: `$HOME/.watchdog-command-receiver/logs/receiver.log`
- Audit: `$HOME/.watchdog-command-receiver/audit/audit.jsonl`

## Simulate

```bash
npm run simulate -- --config config.example.json --sender ou_admin --chat oc_ops "/wd help"
npm run simulate -- --config config.example.json --sender ou_admin --chat oc_ops "/wd disable hermes auto"
```

## Verify

```bash
npm test
npm run check
```
