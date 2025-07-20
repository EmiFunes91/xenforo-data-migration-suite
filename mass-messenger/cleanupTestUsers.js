// cleanupTestUsers.js
// Professional script to clean up test accounts and messages in XenForo using Puppeteer

require('dotenv').config();
const puppeteer = require('puppeteer');
const path = require('path');
const { log, logError, logResult, EXEC_ID } = require('./utils/logger');
const fileUtils = require('./utils/fileUtils');
const puppeteerUtils = require('./utils/puppeteerUtils');

// Configurable settings
const config = {
  forumUrl: 'https://forum.johnnydoe.is/',
  userPrefix: 'testuser', // Test user prefix
  password: 'TestPassword123!', // Password used during registration
  adminUsername: '', // If admin login is required for deletion
  adminPassword: '', // If admin login is required for deletion
  deleteUsers: false, // true = delete, false = deactivate/ban
  delaySeconds: 5
};

async function login(page, username, password) {
  await page.goto(config.forumUrl + 'login', { waitUntil: 'networkidle2' });
  await page.type('input[name="login"]', username);
  await page.type('input[name="password"]', password);
  await Promise.all([
    page.click('button[type="submit"]'),
    page.waitForNavigation({ waitUntil: 'networkidle2' })
  ]);
}

async function deactivateUser(page, username) {
  // Go to the user's profile and look for deactivate/ban option
  await page.goto(`${config.forumUrl}members/${username}.0/`, { waitUntil: 'networkidle2' });
  // This depends on permissions and XenForo interface
  // Example: look for "Ban" or "Deactivate" button
  const banBtn = await page.$('a[data-xf-click="ban-user"]');
  if (banBtn) {
    await banBtn.click();
    await page.waitForSelector('input[name="ban_length"]');
    await page.type('input[name="ban_length"]', 'Permanent');
    await page.type('textarea[name="ban_reason"]', 'Cleanup test user');
    await Promise.all([
      page.click('button[type="submit"]'),
      page.waitForNavigation({ waitUntil: 'networkidle2' })
    ]);
    logResult(`User deactivated/banned: ${username}`, 'cleanup');
  } else {
    logError(`Deactivate/ban option not found for: ${username}`, 'cleanup');
  }
}

async function deleteUser(page, username) {
  // Go to the admin panel and search for the user
  // This flow requires admin permissions and may vary by XenForo version
  await page.goto(`${config.forumUrl}admin.php?users/`, { waitUntil: 'networkidle2' });
  await page.type('input[name="username"]', username);
  await page.keyboard.press('Enter');
  await waitMs(2000);
  const userLink = await page.$(`a:contains('${username}')`);
  if (userLink) {
    await userLink.click();
    await page.waitForSelector('button[data-xf-click="delete"]');
    await Promise.all([
      page.click('button[data-xf-click="delete"]'),
      page.waitForNavigation({ waitUntil: 'networkidle2' })
    ]);
    logResult(`User deleted: ${username}`, 'cleanup');
  } else {
    logError(`User not found for deletion: ${username}`, 'cleanup');
  }
}

// Utilidad profesional para esperar milisegundos
async function waitMs(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  log('--- Automated cleanup of test accounts started ---', 'info', 'cleanup');
  const browser = await puppeteer.launch({ headless: false });
  const page = await browser.newPage();
  await page.authenticate({
    username: process.env.HTACCESS_USERNAME,
    password: process.env.HTACCESS_PASSWORD
  });

  // Read users from users.json
  let users = [];
  let usersPath = path.join(__dirname, 'users.json');
  try {
    users = fileUtils.readJson(usersPath);
  } catch {
    log('users.json not found. Nothing to clean.', 'info', 'cleanup');
    await browser.close();
    log('--- Automated cleanup finished (no users.json) ---', 'info', 'cleanup');
    return;
  }
  // Filter only test users
  users = users.filter(u => u.username && u.username.startsWith(config.userPrefix));

  log(`Test users found for cleanup: ${users.length}`, 'info', 'cleanup');
  if (users.length > 0) {
    log(`List of users to clean: ${users.map(u => u.username).join(', ')}`, 'info', 'cleanup');
  } else {
    log('No test users found for cleanup.', 'info', 'cleanup');
    await browser.close();
    // Delete users.json if exists
    try { require('fs').unlinkSync(usersPath); } catch {}
    log('--- Automated cleanup finished (no test users) ---', 'info', 'cleanup');
    return;
  }

  // Login as admin if deleting users
  if (config.deleteUsers && config.adminUsername && config.adminPassword) {
    await login(page, config.adminUsername, config.adminPassword);
  }

  const MAX_RETRIES = 3;
  const WAIT_ON_CAPTCHA_OR_429 = 300; // 5 minutes
  const WAIT_ON_TRANSIENT = 10; // 10 seconds
  let cleaned = [];
  let failed = [];
  for (const user of users) {
    let retryCount = 0;
    let success = false;
    while (retryCount < MAX_RETRIES && !success) {
      try {
        log(`Attempt ${retryCount + 1}: Cleaning user: ${user.username}`, 'info', 'cleanup');
        await puppeteerUtils.retry(async () => {
          if (config.deleteUsers) {
            await deleteUser(page, user.username);
          } else {
            await login(page, user.username, config.password);
            await deactivateUser(page, user.username);
          }
        }, 2, WAIT_ON_TRANSIENT, (err, n) => logError(`Transient error cleaning ${user.username} (attempt ${n}): ${err.message}`, 'cleanup'));
        cleaned.push(user.username);
        success = true;
      } catch (err) {
        retryCount++;
        if (err.message && err.message.includes('Captcha')) {
          logError(`Captcha detected cleaning ${user.username}. Waiting ${WAIT_ON_CAPTCHA_OR_429} seconds before retrying.`, 'cleanup');
          await puppeteerUtils.wait(WAIT_ON_CAPTCHA_OR_429);
        } else if (err.message && err.message.includes('429')) {
          logError(`HTTP 429 Too Many Requests cleaning ${user.username}. Waiting ${WAIT_ON_CAPTCHA_OR_429} seconds before retrying.`, 'cleanup');
          await puppeteerUtils.wait(WAIT_ON_CAPTCHA_OR_429);
        } else {
          logError(`Error cleaning ${user.username} (attempt ${retryCount}): ${err.message}`, 'cleanup');
          await puppeteerUtils.wait(WAIT_ON_TRANSIENT);
        }
      }
    }
    if (!success) {
      logError(`Definitive failure cleaning ${user.username} after ${MAX_RETRIES} attempts.`, 'cleanup');
      failed.push(user.username);
    }
    log(`Waiting ${config.delaySeconds} seconds before next user...`, 'info', 'cleanup');
    await puppeteerUtils.wait(config.delaySeconds);
  }

  log(`Users cleaned successfully: ${cleaned.length > 0 ? cleaned.join(', ') : 'None'}`, 'info', 'cleanup');
  if (failed.length > 0) {
    logError(`Users that could NOT be cleaned: ${failed.join(', ')}`, 'cleanup');
  }

  await browser.close();
  // Delete users.json after successful cleanup
  try { require('fs').unlinkSync(usersPath); } catch {}
  log('--- Automated cleanup finished ---', 'info', 'cleanup');
}

main(); 