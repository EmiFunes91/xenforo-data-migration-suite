// registerTestUsers.js
// Professional script to create test accounts in XenForo using Puppeteer

require('dotenv').config();
const puppeteer = require('puppeteer');
const path = require('path');
const { log, logError, logResult, EXEC_ID } = require('./utils/logger');
const fileUtils = require('./utils/fileUtils');
const puppeteerUtils = require('./utils/puppeteerUtils');
const fs = require('fs');

// Configurable settings
const config = {
  forumUrl: 'https://forum.johnnydoe.is/', // Change if needed
  registerPath: 'register',
  userPrefix: 'testuser',
  emailDomain: 'testmail.com',
  password: 'TestPassword123!',
  count: 15, // Number of accounts to create (aumentado a 15)
  delaySeconds: 1 // Wait time between registrations (reducido para pruebas)
};

async function detectCaptcha(page) {
  return await page.$('iframe[src*="captcha"], .g-recaptcha, .h-captcha') !== null;
}

async function detectRegistrationSelectors(page) {
  // Esperar a que el formulario esté visible
  await page.waitForSelector('form', { visible: true, timeout: 30000 });
  return await page.evaluate(() => {
    function getSelector(el) {
      if (!el) return null;
      if (el.id) return `#${el.id}`;
      if (el.name) return `input[name="${el.name}"]`;
      if (el.getAttribute('autocomplete')) return `input[autocomplete="${el.getAttribute('autocomplete')}"]`;
      if (el.type) return `input[type="${el.type}"]`;
      return el.tagName.toLowerCase();
    }
    // Username: buscar por autocomplete, name o tipo
    let userInput = document.querySelector('input[autocomplete="username"]')
      || document.querySelector('input[name*="user" i]')
      || document.querySelector('input[type="text"]');
    // Email: buscar por autocomplete, name o tipo
    let emailInput = document.querySelector('input[autocomplete="email"]')
      || document.querySelector('input[name*="mail" i]')
      || document.querySelector('input[type="email"]');
    // Password: buscar por autocomplete, name o tipo
    let passInput = document.querySelector('input[autocomplete="new-password"]')
      || document.querySelector('input[type="password"]');
    // Confirm password: segundo input password si existe
    let passInputs = Array.from(document.querySelectorAll('input[type="password"]'));
    let passConfirmInput = passInputs.length > 1 ? passInputs[1] : null;
    // Submit button
    let submitBtn = document.querySelector('button[type="submit"]')
      || document.querySelector('input[type="submit"]')
      || document.querySelector('button');
    return {
      userSelector: getSelector(userInput),
      emailSelector: getSelector(emailInput),
      passSelector: getSelector(passInput),
      passConfirmSelector: getSelector(passConfirmInput),
      submitSelector: getSelector(submitBtn)
    };
  });
}

// Clean users.json before each test round
const usersPath = path.join(__dirname, 'users.json');
try { fs.unlinkSync(usersPath); } catch {}

// Helper to robustly wait and type, with retries
async function waitAndType(page, selector, value, delay = 40) {
  let attempts = 0;
  while (attempts < 3) {
    try {
      await page.waitForSelector(selector, { visible: true, timeout: 10000 });
      // Scroll to the field to ensure it's visible
      await page.evaluate(sel => {
        const el = document.querySelector(sel);
        if (el) el.scrollIntoView({ behavior: 'auto', block: 'center' });
      }, selector);
      // Extra: esperar a que no haya overlays visibles
      await page.waitForFunction(() => !document.querySelector('.overlay.is-active, .modal, .blockOverlay'), { timeout: 5000 }).catch(() => {});
      await page.evaluate(sel => { document.querySelector(sel).value = ''; }, selector); // Clear field
      await page.type(selector, value, { delay });
      // Validate that the value was written correctly
      const written = await page.$eval(selector, el => el.value);
      if (written !== value) {
        throw new Error(`Could not correctly write to field ${selector}. Expected: ${value}, Written: ${written}`);
      }
      return;
    } catch (err) {
      attempts++;
      if (attempts >= 3) {
        console.error(`Failed to write to selector ${selector} after 3 attempts: ${err.message}`);
        throw err;
      }
      await waitMs(500);
    }
  }
}

// Professional utility to wait milliseconds
async function waitMs(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function registerUser(page, username, email, password) {
  await page.goto(config.forumUrl + config.registerPath, { waitUntil: 'networkidle2' });
  // Dynamically detect selectors
  const selectors = await detectRegistrationSelectors(page);
  console.log('DEBUG: Registration selectors detected:', selectors);
  if (!selectors.userSelector || !selectors.emailSelector || !selectors.passSelector || !selectors.submitSelector) {
    throw new Error('Not all required fields were detected in the registration form.');
  }
  // Fill the form robustly
  await waitAndType(page, selectors.userSelector, username);
  await waitMs(200);
  await waitAndType(page, selectors.emailSelector, email);
  await waitMs(200);
  await waitAndType(page, selectors.passSelector, password);
  if (selectors.passConfirmSelector) {
    await waitMs(200);
    await waitAndType(page, selectors.passConfirmSelector, password);
  }
  // Try to check the terms checkbox if it exists
  const terms = await page.$('input[type="checkbox"], input[name*="accept"], input[name*="terms"]');
  if (terms) {
    await page.evaluate(el => el.scrollIntoView({ behavior: 'auto', block: 'center' }), terms);
    await terms.click();
  }
  // Submit the form
  await page.evaluate(sel => {
    const btn = document.querySelector(sel);
    if (btn) btn.scrollIntoView({ behavior: 'auto', block: 'center' });
  }, selectors.submitSelector);
  await Promise.all([
    page.click(selectors.submitSelector),
    page.waitForNavigation({ waitUntil: 'networkidle2' })
  ]);
}

async function main() {
  log('--- Automated test account registration started ---', 'info', 'register');
  // Set window size to simulate a large, responsive browser
  const browser = await puppeteer.launch({ headless: false, defaultViewport: { width: 1400, height: 900 } });
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });
  await page.authenticate({
    username: process.env.HTACCESS_USERNAME,
    password: process.env.HTACCESS_PASSWORD
  });
  const createdUsers = [];

  const MAX_RETRIES = 3;
  const WAIT_ON_CAPTCHA_OR_429 = 300; // 5 minutes
  const WAIT_ON_TRANSIENT = 2; // 2 seconds (reducido para pruebas)
  for (let i = 1; i <= config.count; i++) {
    let username = `${config.userPrefix}${i}`;
    let email = `${config.userPrefix}${i}@${config.emailDomain}`;
    // Ensure unique user: if already exists, add random suffix
    if (createdUsers.find(u => u.username === username)) {
      const rand = Math.floor(Math.random() * 10000);
      username = `${config.userPrefix}${i}_${rand}`;
      email = `${config.userPrefix}${i}_${rand}@${config.emailDomain}`;
    }
    let retryCount = 0;
    let success = false;
    while (retryCount < MAX_RETRIES && !success) {
      try {
        log(`Attempt ${retryCount + 1}: Registering user: ${username} (${email})`, 'info', 'register');
        await puppeteerUtils.retry(async () => {
          await registerUser(page, username, email, config.password);
          if (await puppeteerUtils.detectCaptcha(page)) {
            throw new Error('Captcha detected');
          }
        }, 2, WAIT_ON_TRANSIENT, (err, n) => logError(`Transient error registering ${username} (attempt ${n}): ${err.message}`, 'register'));
        createdUsers.push({ username });
        logResult(`User created: ${username}`, 'register');
        success = true;
      } catch (err) {
        retryCount++;
        if (err.message && err.message.includes('Captcha')) {
          logError(`Captcha detected after registering ${username}. Waiting ${WAIT_ON_CAPTCHA_OR_429} seconds before retrying.`, 'register');
          await puppeteerUtils.wait(WAIT_ON_CAPTCHA_OR_429);
        } else if (err.message && err.message.includes('429')) {
          logError(`HTTP 429 Too Many Requests after registering ${username}. Waiting ${WAIT_ON_CAPTCHA_OR_429} seconds before retrying.`, 'register');
          await puppeteerUtils.wait(WAIT_ON_CAPTCHA_OR_429);
        } else if (err.message && err.message.includes('usuario ya usado')) {
          logError(`Username already used: ${username}. Generating new user.`, 'register');
          const rand = Math.floor(Math.random() * 10000);
          username = `${config.userPrefix}${i}_${rand}`;
          email = `${config.userPrefix}${i}_${rand}@${config.emailDomain}`;
        } else {
          logError(`Error registering ${username} (attempt ${retryCount}): ${err.message}`, 'register');
          await puppeteerUtils.wait(WAIT_ON_TRANSIENT);
        }
      }
    }
    if (!success) {
      logError(`Definitive failure registering ${username} after ${MAX_RETRIES} attempts.`, 'register');
    }
    if (i < config.count) {
      log(`Waiting ${config.delaySeconds} seconds before next registration...`, 'info', 'register');
      await puppeteerUtils.wait(config.delaySeconds);
    }
  }

  // Save generated users to users.json
  if (createdUsers.length > 0) {
    let existing = [];
    try { existing = fileUtils.readJson(usersPath); } catch {}
    const merged = [...existing, ...createdUsers];
    fileUtils.writeJson(usersPath, merged);
    logResult(`Users saved to users.json`, 'register');
  }

  await browser.close();
  log('--- Automated registration finished ---', 'info', 'register');
}

main(); 