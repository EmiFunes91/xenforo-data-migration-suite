// restore_dump.js
// ---------------
// This script restores a PostgreSQL .dump file into a local PostgreSQL database instance.
// It checks if the target database exists, creates it if needed, and restores the dump file.
// All connection details are read from the .env file.

require('dotenv').config();
const { spawnSync, spawn } = require('child_process');
const path = require('path');

// Load PostgreSQL connection details from environment variables
const {
  PG_HOST, PG_PORT, PG_USER, PG_PASSWORD, PG_DATABASE
} = process.env;

// Path to the dump file to restore (edit this if your dump file has a different name)
const DUMP_FILE = path.resolve(__dirname, 'backup-19-june.dump');

/**
 * Helper to run a command synchronously and print its output.
 */
function runSync(cmd, args, env) {
  const result = spawnSync(cmd, args, { env, encoding: 'utf8' });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  return result.status;
}

// Prepare environment for PostgreSQL commands
const env = { ...process.env, PGPASSWORD: PG_PASSWORD };

// 1. Check if the target database exists
console.log(`Checking if database ${PG_DATABASE} exists...`);
const checkDb = spawnSync('psql', [
  '-h', PG_HOST,
  '-p', PG_PORT,
  '-U', PG_USER,
  '-lqt'
], { env, encoding: 'utf8' });

if (!checkDb.stdout.includes(PG_DATABASE)) {
  // Database does not exist, create it
  console.log(`Database ${PG_DATABASE} does not exist. Creating...`);
  const createDbStatus = runSync('createdb', [
    '-h', PG_HOST,
    '-p', PG_PORT,
    '-U', PG_USER,
    PG_DATABASE
  ], env);
  if (createDbStatus !== 0) {
    console.error('❌ Failed to create database.');
    process.exit(1);
  }
} else {
  console.log(`Database ${PG_DATABASE} exists.`);
}

// 2. Restore the dump file into the database
console.log(`Restoring ${DUMP_FILE} into database ${PG_DATABASE}...`);
const restore = spawn('pg_restore', [
  '-h', PG_HOST,
  '-p', PG_PORT,
  '-U', PG_USER,
  '-d', PG_DATABASE,
  DUMP_FILE
], { env });

// Print output and errors from pg_restore
restore.stdout.on('data', data => process.stdout.write(data));
restore.stderr.on('data', data => process.stderr.write(data));

// Handle completion
restore.on('close', code => {
  if (code === 0) {
    console.log('✅ Restore completed successfully.');
  } else {
    console.error(`❌ Restore failed with exit code ${code}.`);
  }
}); 