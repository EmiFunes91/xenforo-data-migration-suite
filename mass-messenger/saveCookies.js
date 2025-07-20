// saveCookies.js
// Professional script to save XenForo session cookies for automated messaging

require('dotenv').config();
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

// Diagnóstico avanzado de variables de entorno
console.log('DEBUG: process.env.ADMIN_PASSWORD (raw):', JSON.stringify(process.env.ADMIN_PASSWORD));
console.log('DEBUG: length:', process.env.ADMIN_PASSWORD ? process.env.ADMIN_PASSWORD.length : 0);
console.log('DEBUG: process.env.ADMIN_USERNAME:', process.env.ADMIN_USERNAME);
console.log('DEBUG: process.env.FORUM_URL:', process.env.FORUM_URL);
console.log('DEBUG: process.env.HTACCESS_USERNAME:', process.env.HTACCESS_USERNAME);
console.log('DEBUG: process.env.HTACCESS_PASSWORD:', process.env.HTACCESS_PASSWORD);
console.log('DEBUG: Looking for .env at:', path.resolve(process.cwd(), '.env'));

(async () => {
  const browser = await puppeteer.launch({ headless: false, ignoreHTTPSErrors: true });
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

  // Authenticate HTTP Basic (htaccess)
  if (process.env.HTACCESS_USERNAME && process.env.HTACCESS_PASSWORD) {
    await page.authenticate({
      username: process.env.HTACCESS_USERNAME,
      password: process.env.HTACCESS_PASSWORD
    });
    console.log('HTTP Basic authentication completed.');
  }

  // Go to login page
  const forumUrl = process.env.FORUM_URL;
  await page.goto(forumUrl + 'login', { waitUntil: 'networkidle2', timeout: 120000 });

  // Detect login form and selectors robustly
  const loginSelectors = await page.evaluate(() => {
    function getSelector(el) {
      if (el.id) return `#${el.id}`;
      if (el.name) return `input[name="${el.name}"]`;
      if (el.type === 'password') return 'input[type="password"]';
      if (el.type === 'email') return 'input[type="email"]';
      if (el.type === 'text') return 'input[type="text"]';
      return el.tagName.toLowerCase();
    }
    // Buscar el formulario de login
    const loginForm = document.querySelector('form[action*="login"]');
    if (!loginForm) return { userSelector: null, passSelector: null, submitSelector: null };
    const userInput = loginForm.querySelector('input[type="text"], input[type="email"]');
    const passInput = loginForm.querySelector('input[type="password"]');
    const submitBtn = loginForm.querySelector('button[type="submit"], input[type="submit"]');
    return {
      userSelector: userInput ? getSelector(userInput) : null,
      passSelector: passInput ? getSelector(passInput) : null,
      submitSelector: submitBtn ? getSelector(submitBtn) : null
    };
  });

  if (!loginSelectors.userSelector || !loginSelectors.passSelector || !loginSelectors.submitSelector) {
    console.error('Login fields not detected. Please check the login page HTML.');
    await browser.close();
    process.exit(1);
  }

  console.log('Login selectors detected:', loginSelectors);

  // Log credentials being used (mask password)
  console.log('Using credentials:', {
    username: process.env.ADMIN_USERNAME,
    password: process.env.ADMIN_PASSWORD ? '*'.repeat(process.env.ADMIN_PASSWORD.length) : ''
  });

  // Fill login form
  await page.type(loginSelectors.userSelector, process.env.ADMIN_USERNAME);
  await page.type(loginSelectors.passSelector, process.env.ADMIN_PASSWORD);
  await Promise.all([
    page.click(loginSelectors.submitSelector),
    page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 })
  ]);
  console.log('Logged in to XenForo.');

  // Wait for user to verify login (in case of captcha or 2FA)
  await new Promise(res => setTimeout(res, 2000));
  // Optionally, you can add a manual pause here if you expect 2FA or captcha

  // Save cookies
  const cookies = await page.cookies();
  const cookiesPath = path.join(__dirname, 'cookies-messenger.json');
  fs.writeFileSync(cookiesPath, JSON.stringify(cookies, null, 2));
  console.log('Cookies saved to cookies-messenger.json');

  await browser.close();
})(); 