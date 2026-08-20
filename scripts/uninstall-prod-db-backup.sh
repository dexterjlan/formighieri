#!/usr/bin/env bash
# Remove o agendamento de backup de produção deste Mac.
set -euo pipefail

LABEL="com.formighieri.backup-prod-db"
PLIST="$HOME/Library/LaunchAgents/${LABEL}.plist"
UID_NUM="$(id -u)"

launchctl bootout "gui/${UID_NUM}/${LABEL}" >/dev/null 2>&1 || true
rm -f "$PLIST"

echo "Agendamento ${LABEL} removido."
echo "Os arquivos de backup em ~/Formighieri/backups/prod-db/ foram mantidos."
