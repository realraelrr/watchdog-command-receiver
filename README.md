# Watchdog Command Receiver

Standalone Feishu IM command receiver for local watchdog commands.

This service is intentionally independent from Hermes, OpenClaw, and any future service. It receives Feishu bot messages, checks local policy, resolves the command from config, executes the configured argv without a shell, writes an audit record, and replies to the chat.

## Commands

```text
/watchdog help
/watchdog list
/watchdog restart <target> <subject>
/wd help
/wd list
/wd restart <target> <subject>
confirm <token>
```

Example targets in `config.example.json`:

```text
/wd restart hermes gateway
/wd restart hermes cloudflared
/wd restart hermes all
/wd restart openclaw gateway
```

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

Targets are fully config-driven. Removing Hermes or OpenClaw means deleting that target from config; no code change is required.

## Feishu Setup

Create a Feishu/Lark custom app, enable bot capability, grant message receive/send permissions, subscribe to `im.message.receive_v1`, and choose long-connection event delivery. Long connection keeps this local service private and avoids exposing a public callback URL.

## Local Simulation

```bash
npm run simulate -- --config config.example.json --sender ou_admin --chat oc_ops "/wd list"
```

## Install

```bash
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
