#!/usr/bin/env bash
# Instala o backup de produção no macOS (2x ao dia: 12:00 e 18:00).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LABEL="com.formighieri.backup-prod-db"
AGENT_DIR="$HOME/Library/LaunchAgents"
PLIST="$AGENT_DIR/${LABEL}.plist"
SCRIPT="$ROOT/scripts/backup-prod-db.sh"
ENV_EXAMPLE="$ROOT/scripts/backup-prod-db.env.example"
ENV_FILE="$ROOT/scripts/backup-prod-db.env"
LOG_OUT="$HOME/Library/Logs/formighieri-backup-prod-db.out.log"
LOG_ERR="$HOME/Library/Logs/formighieri-backup-prod-db.err.log"
UID_NUM="$(id -u)"

chmod +x \
    "$SCRIPT" \
    "$ROOT/scripts/restore-prod-db.sh" \
    "$ROOT/scripts/compare-schema-counts.py" \
    "$ROOT/scripts/remap-dump-schema.py" \
    "$ROOT/scripts/supabase-session-url.py" \
    "$ROOT/scripts/uninstall-prod-db-backup.sh"

if [[ ! -f "$ENV_FILE" ]]; then
    cp "$ENV_EXAMPLE" "$ENV_FILE"
    echo "Criei $ENV_FILE — abra o arquivo e preencha SUPABASE_DB_URL_PROD antes de confiar no agendamento."
    echo
fi

mkdir -p "$AGENT_DIR" "$HOME/Library/Logs"

cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${LABEL}</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/bin/env</string>
        <string>bash</string>
        <string>${SCRIPT}</string>
    </array>
    <key>WorkingDirectory</key>
    <string>${ROOT}</string>
    <key>StartCalendarInterval</key>
    <array>
        <dict>
            <key>Hour</key>
            <integer>12</integer>
            <key>Minute</key>
            <integer>0</integer>
        </dict>
        <dict>
            <key>Hour</key>
            <integer>18</integer>
            <key>Minute</key>
            <integer>0</integer>
        </dict>
    </array>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/opt/homebrew/opt/libpq/bin:/opt/homebrew/bin:/usr/local/opt/libpq/bin:/usr/local/bin:/usr/bin:/bin</string>
    </dict>
    <key>StandardOutPath</key>
    <string>${LOG_OUT}</string>
    <key>StandardErrorPath</key>
    <string>${LOG_ERR}</string>
    <key>RunAtLoad</key>
    <false/>
</dict>
</plist>
EOF

if launchctl bootout "gui/${UID_NUM}/${LABEL}" >/dev/null 2>&1; then
    :
fi
launchctl bootstrap "gui/${UID_NUM}" "$PLIST"
launchctl enable "gui/${UID_NUM}/${LABEL}" >/dev/null 2>&1 || true

echo "Agendamento instalado: ${LABEL}"
echo "Horários: 12:00 e 18:00 (horário deste Mac)."
echo "Dump:     ~/Formighieri/backups/prod-db/"
echo "          (também restaura no DEV, schema prod_backup, e confere COUNT(*))"
echo "Logs:     ~/Formighieri/backups/prod-db/formighieri-prod-*.log"
echo "          $LOG_OUT"
echo "          $LOG_ERR"
echo
echo "Teste agora:"
echo "  $SCRIPT"
echo
echo "Para desinstalar:"
echo "  $ROOT/scripts/uninstall-prod-db-backup.sh"
