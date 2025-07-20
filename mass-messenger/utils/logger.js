// logger.js
// Enhanced professional logger: per-execution logs, separate folders, and support for error/result logs

const fs = require('fs');
const path = require('path');

// Unique execution identifier (compact ISO timestamp)
const EXEC_ID = process.env.EXEC_ID || new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14);

/**
 * Writes a message to the general execution log
 * @param {string} message
 * @param {string} [type] - Log type: 'info', 'error', 'result'
 * @param {string} [subdir] - Optional subfolder (e.g., 'register', 'cleanup', 'send')
 */
function log(message, type = 'info', subdir = '') {
  const date = new Date().toISOString().slice(0, 10);
  const baseDir = path.join(__dirname, '../logs', subdir);
  if (!fs.existsSync(baseDir)) fs.mkdirSync(baseDir, { recursive: true });
  const logFile = path.join(baseDir, `${date}_${EXEC_ID}_${type}.log`);
  fs.appendFileSync(logFile, `[${new Date().toISOString()}] ${message}\n`);
}

/**
 * Writes an error log
 * @param {string} message
 * @param {string} [subdir]
 */
function logError(message, subdir = '') {
  log(message, 'error', subdir);
}

/**
 * Writes a result log
 * @param {string} message
 * @param {string} [subdir]
 */
function logResult(message, subdir = '') {
  log(message, 'result', subdir);
}

module.exports = { log, logError, logResult, EXEC_ID }; 