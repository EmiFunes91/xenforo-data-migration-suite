// puppeteerUtils.js
// Utility functions for Puppeteer and XenForo

const fs = require('fs');

/**
 * Load cookies from a JSON file into the Puppeteer page.
 * @param {object} page - Puppeteer page instance
 * @param {string} cookiesPath - Path to cookies.json
 */
async function loadCookies(page, cookiesPath) {
  const cookies = JSON.parse(fs.readFileSync(cookiesPath, 'utf8'));
  await page.setCookie(...cookies);
}

/**
 * Send a private message to a user in XenForo.
 * @param {object} page - Puppeteer page instance
 * @param {object} user - User object (with username)
 * @param {string} subject - Message subject
 * @param {string} body - Message body
 * @param {string} forumUrl - Forum base URL
 */
async function sendPrivateMessage(page, user, subject, body, forumUrl) {
  // Go to the direct message compose page (without user parameter)
  await page.goto(`${forumUrl}direct-messages/add`, { waitUntil: 'networkidle2' });
  
  // Take a screenshot for debugging
  await page.screenshot({ path: `debug-message-page-${user.username}.png` });
  
  // Wait for the form to load
  await page.waitForSelector('form', { timeout: 10000 });
  
  // Get page title and URL for debugging
  const pageInfo = await page.evaluate(() => {
    return {
      title: document.title,
      url: window.location.href,
      hasForm: !!document.querySelector('form'),
      formAction: document.querySelector('form')?.action || 'no action'
    };
  });
  
  console.log('Page info:', pageInfo);
  
  // Detect form fields dynamically with more detailed logging
  const formFields = await page.evaluate(() => {
    // Log all input and textarea elements for debugging
    const allInputs = Array.from(document.querySelectorAll('input, textarea'));
    console.log('All form elements found:', allInputs.map(el => ({
      tag: el.tagName,
      type: el.type,
      name: el.name,
      id: el.id,
      placeholder: el.placeholder,
      className: el.className
    })));
    
    // Look for recipient field first
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
      submitSelector: submitBtn ? (submitBtn.id ? `#${submitBtn.id}` : 'button[type="submit"]') : null,
      allInputs: allInputs.map(el => ({ tag: el.tagName, type: el.type, name: el.name, id: el.id }))
    };
  });
  
  console.log('Form fields detected:', formFields);
  
  // Fill in the recipient first
  if (formFields.recipientSelector) {
    await page.type(formFields.recipientSelector, user.username);
    console.log('Recipient filled with:', user.username);
    // Wait a moment for autocomplete or validation
    await new Promise(resolve => setTimeout(resolve, 2000));
  } else {
    console.log('Warning: Could not find recipient field');
  }
  
  // Fill in the subject and body
  if (formFields.titleSelector) {
    await page.type(formFields.titleSelector, subject);
  } else {
    console.log('Warning: Could not find title/subject field');
  }
  
  if (formFields.messageSelector) {
    await page.type(formFields.messageSelector, body);
  } else {
    console.log('Warning: Could not find message field');
  }
  
  // Submit the form
  if (formFields.submitSelector) {
    await Promise.all([
      page.click(formFields.submitSelector),
      page.waitForNavigation({ waitUntil: 'networkidle2' })
    ]);
  } else {
    console.log('Warning: Could not find submit button');
  }
}

/**
 * Detect if a captcha is present on the page.
 * @param {object} page - Puppeteer page instance
 * @returns {Promise<boolean>}
 */
async function detectCaptcha(page) {
  return await page.$('iframe[src*="captcha"], .g-recaptcha, .h-captcha') !== null;
}

/**
 * Handle HTTP 429 (Too Many Requests) error.
 * @param {object} page - Puppeteer page instance
 * @param {number} waitSeconds - Seconds to wait before retrying
 */
async function handle429(page, waitSeconds = 300) {
  console.log(`429 detected. Waiting ${waitSeconds} seconds before retrying...`);
  await new Promise(res => setTimeout(res, waitSeconds * 1000));
}

/**
 * Espera una cantidad de segundos
 * @param {number} seconds
 */
async function wait(seconds) {
  return new Promise(res => setTimeout(res, seconds * 1000));
}

/**
 * Ejecuta una función con reintentos y espera entre intentos
 * @param {Function} fn - función async a ejecutar
 * @param {number} maxRetries
 * @param {number} waitSeconds
 * @param {Function} [onError] - callback en error
 */
async function retry(fn, maxRetries, waitSeconds, onError) {
  let lastError;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (onError) onError(err, i + 1);
      await wait(waitSeconds);
    }
  }
  throw lastError;
}

module.exports = {
  loadCookies,
  sendPrivateMessage,
  detectCaptcha,
  handle429,
  wait,
  retry
}; 