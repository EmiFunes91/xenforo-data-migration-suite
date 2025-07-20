// fileUtils.js
// Utility functions for reading and writing files

const fs = require('fs');
const path = require('path');

/**
 * Read a JSON file and return its content.
 * @param {string} filePath
 * @returns {any}
 */
function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

/**
 * Write data to a JSON file.
 * @param {string} filePath
 * @param {any} data
 */
function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

/**
 * Read a text file and return its content.
 * @param {string} filePath
 * @returns {string}
 */
function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

/**
 * Write text to a file.
 * @param {string} filePath
 * @param {string} text
 */
function writeText(filePath, text) {
  fs.writeFileSync(filePath, text);
}

module.exports = {
  readJson,
  writeJson,
  readText,
  writeText
}; 