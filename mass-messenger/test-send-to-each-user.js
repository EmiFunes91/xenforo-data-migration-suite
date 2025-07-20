// test-send-to-each-user.js
// Test sending a direct message to each test user

require('dotenv').config();
const puppeteer = require('puppeteer');
const path = require('path');
const puppeteerUtils = require('./utils/puppeteerUtils');

process.on('unhandledRejection', (reason, p) => {
  console.error('UNHANDLED REJECTION:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err);
});

const users = Array.from({ length: 20 }, (_, i) => ({ username: `test${i + 1}` }));

const config = {
  forumUrl: process.env.FORUM_URL || 'https://forum.johnnydoe.is/',
  adminUsername: process.env.ADMIN_USERNAME,
  adminPassword: process.env.ADMIN_PASSWORD,
  subject: 'Test Subject',
  message: 'This is a test message from the automated system.'
};

async function login(page) {
  console.log('Navigating to login page...');
  await page.goto(config.forumUrl + 'login', { waitUntil: 'networkidle2', timeout: 60000 });
  // Detect login form
  const loginSelectors = await page.evaluate(() => {
    function getSelector(el) {
      if (el.id) return `#${el.id}`;
      if (el.name) return `input[name="${el.name}"]`;
      if (el.type === 'password') return 'input[type="password"]';
      if (el.type === 'email') return 'input[type="email"]';
      if (el.type === 'text') return 'input[type="text"]';
      return el.tagName.toLowerCase();
    }
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
    throw new Error('Login form fields not found');
  }
  await page.type(loginSelectors.userSelector, config.adminUsername);
  await page.type(loginSelectors.passSelector, config.adminPassword);
  await Promise.all([
    page.click(loginSelectors.submitSelector),
    page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 })
  ]);
  // Check login success
  const loginStatus = await page.evaluate(() => {
    const userLink = document.querySelector('.p-navgroup-link--user, .user-nav');
    return {
      isLoggedIn: !!userLink,
      username: userLink ? userLink.textContent.trim() : null
    };
  });
  if (!loginStatus.isLoggedIn) {
    throw new Error('Login failed: not logged in after submitting credentials');
  }
  console.log('Login successful as:', loginStatus.username);
}

async function sendToEachUser() {
  console.log('=== STARTING DIRECT MESSAGE TEST SCRIPT ===');
  let browser;
  try {
    browser = await puppeteer.launch({ headless: false });
    const page = await browser.newPage();
    console.log('Browser launched');
    await page.authenticate({
      username: process.env.HTACCESS_USERNAME,
      password: process.env.HTACCESS_PASSWORD
    });
    console.log('HTTP Basic authentication completed');
    // No cookies: always login
    await login(page);
    await page.goto(config.forumUrl, { waitUntil: 'networkidle2', timeout: 60000 });
    console.log('Forum homepage loaded');

    for (const user of users) {
      console.log(`\n--- Trying to send message to: ${user.username} ---`);
      try {
        await page.goto(`${config.forumUrl}direct-messages/add`, { waitUntil: 'networkidle2', timeout: 60000 });
        await new Promise(resolve => setTimeout(resolve, 1000));
        console.log('Direct message compose page loaded');
        const formFields = await page.evaluate(() => {
          const allInputs = Array.from(document.querySelectorAll('input, textarea'));
          const recipientInput = allInputs.find(input =>
            input.name?.toLowerCase().includes('recipient') ||
            input.name?.toLowerCase().includes('to') ||
            input.placeholder?.toLowerCase().includes('recipient') ||
            input.placeholder?.toLowerCase().includes('to') ||
            input.placeholder?.toLowerCase().includes('user')
          );
          const titleInput = document.querySelector('input[name="title"], input[name="subject"], input[placeholder*="subject" i], input[placeholder*="title" i]');
          const messageInput = document.querySelector('textarea[name="message"], textarea[name="content"], .js-editor, .messageEditor');
          const submitBtn = document.querySelector('button[type="submit"], input[type="submit"], .js-submit');
          return {
            recipientSelector: recipientInput ? (recipientInput.id ? `#${recipientInput.id}` : recipientInput.name ? `input[name="${recipientInput.name}"]` : 'input[type="text"]') : null,
            titleSelector: titleInput ? (titleInput.id ? `#${titleInput.id}` : titleInput.name ? `input[name="${titleInput.name}"]` : 'input[type="text"]') : null,
            messageSelector: messageInput ? (messageInput.id ? `#${messageInput.id}` : messageInput.name ? `textarea[name="${messageInput.name}"]` : 'textarea') : null,
            submitSelector: submitBtn ? (submitBtn.id ? `#${submitBtn.id}` : 'button[type="submit"]') : null
          };
        });
        console.log('Form fields detected:', formFields);
        if (formFields.recipientSelector) {
          await page.click(formFields.recipientSelector);
          await page.keyboard.down('Control');
          await page.keyboard.press('KeyA');
          await page.keyboard.up('Control');
          await page.type(formFields.recipientSelector, user.username);
          await new Promise(resolve => setTimeout(resolve, 1000));
          console.log('Recipient field filled');
        } else {
          throw new Error('Recipient field not found');
        }
        if (formFields.titleSelector) {
          await page.type(formFields.titleSelector, config.subject);
          console.log('Subject field filled');
        } else {
          throw new Error('Subject field not found');
        }
        if (formFields.messageSelector) {
          await page.type(formFields.messageSelector, config.message);
          console.log('Message field filled');
        } else {
          throw new Error('Message field not found');
        }
        if (formFields.submitSelector) {
          await page.click(formFields.submitSelector);
          await new Promise(resolve => setTimeout(resolve, 2000));
          const error = await page.evaluate(() => {
            const errorEl = document.querySelector('.blockMessage--error, .error');
            return errorEl ? errorEl.textContent.trim() : null;
          });
          if (error) {
            throw new Error('Send error: ' + error);
          }
          console.log(`✅ Message sent to ${user.username}`);
        } else {
          throw new Error('Submit button not found');
        }
      } catch (err) {
        console.error(`❌ Could not send to ${user.username}:`, err.message);
      }
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    console.log('=== END OF DIRECT MESSAGE TEST SCRIPT ===');
    await browser.close();
  } catch (err) {
    console.error('GLOBAL ERROR:', err);
    if (browser) await browser.close();
  }
}

sendToEachUser().catch(console.error); 