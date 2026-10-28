#!/usr/bin/env sh
# Nightly backup of the database and private file storage. Schedule with cron, e.g.:
#   15 2 * * * cd /opt/usm-orbit && ./deploy/backup.sh >> /var/log/usm-orbit-backup.log 2>&1
set -eu
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
DEST=${BACKUP_DIR:-/var/backups/usm-orbit}
mkdir -p "$DEST"
docker compose exec -T db pg_dump -U orbit -d orbit --format=custom > "$DEST/db-$STAMP.dump"
docker compose run --rm --no-deps --user root -v "$DEST":/backup --entrypoint sh app -c "tar czf /backup/storage-$STAMP.tgz -C /data storage"
find "$DEST" -type f -mtime +${RETENTION_DAYS:-14} -delete
echo "Backup complete: $STAMP"
