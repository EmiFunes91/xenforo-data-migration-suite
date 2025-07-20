// backup_mariadb.js
// ------------------
// This script creates a timestamped backup of your MariaDB (XenForo) database using mysqldump.
// It uses credentials from the .env file and outputs the backup file in the current directory.

require('dotenv').config();
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

// Generate a timestamped filename for the backup
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupFile = path.resolve(__dirname, `xenforo-backup-${timestamp}.sql`);

// Construct the mysqldump command using environment variables
const cmd = `mysqldump -h ${process.env.MYSQL_HOST} -P ${process.env.MYSQL_PORT} -u ${process.env.MYSQL_USER} -p'${process.env.MYSQL_PASSWORD}' ${process.env.MYSQL_DATABASE} > "${backupFile}"`;

console.log('Starting MariaDB backup...');

// Execute the backup command
exec(cmd, (error, stdout, stderr) => {
  if (error) {
    console.error('❌ Backup failed:', error.message);
    return;
  }
  if (stderr) {
    console.warn('⚠️  Warnings:', stderr);
  }
  console.log(`✅ Backup completed: ${backupFile}`);
});
