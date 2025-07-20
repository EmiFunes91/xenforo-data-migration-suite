// test-conversation-page.js
// Test script to check if we can access conversation page and detect form elements

require('dotenv').config();
const puppeteer = require('puppeteer');
const path = require('path');
const puppeteerUtils = require('./utils/puppeteerUtils');

async function testConversationPage() {
  console.log('Testing conversation page access...');
  
  const browser = await puppeteer.launch({ headless: false });
  const page = await browser.newPage();
  
  // Add HTTP Basic Auth
  await page.authenticate({
    username: process.env.HTACCESS_USERNAME,
    password: process.env.HTACCESS_PASSWORD
  });
  
  try {
    // Load cookies
    console.log('Loading cookies...');
    await puppeteerUtils.loadCookies(page, path.join(__dirname, 'cookies-messenger.json'));
    
    // Go to forum homepage first
    console.log('Going to forum homepage...');
    await page.goto(process.env.FORUM_URL, { waitUntil: 'networkidle2', timeout: 60000 });
    
    // Check if we're logged in
    const loginStatus = await page.evaluate(() => {
      const userLink = document.querySelector('.p-navgroup-link--user, .user-nav');
      return {
        isLoggedIn: !!userLink,
        username: userLink ? userLink.textContent.trim() : null
      };
    });
    
    console.log('Login status:', loginStatus);
    
    if (!loginStatus.isLoggedIn) {
      console.error('Not logged in!');
      return;
    }
    
    // Test with a specific user
    const testUser = 'test1';
    console.log(`Testing conversation page for user: ${testUser}`);
    
    // Go to direct message page
    const conversationUrl = `${process.env.FORUM_URL}direct-messages/add?to=${testUser}`;
    console.log('Navigating to:', conversationUrl);
    
    await page.goto(conversationUrl, { waitUntil: 'networkidle2', timeout: 60000 });
    
    // Take screenshot
    await page.screenshot({ path: 'debug-conversation-test.png' });
    
    // Check page content
    const pageInfo = await page.evaluate(() => {
      return {
        title: document.title,
        url: window.location.href,
        hasForm: !!document.querySelector('form'),
        formAction: document.querySelector('form')?.action || 'no action',
        hasError: document.body.textContent.includes('Oops!') || document.body.textContent.includes('error'),
        errorText: document.querySelector('.blockMessage--error, .error')?.textContent || null
      };
    });
    
    console.log('Page info:', pageInfo);
    
    if (pageInfo.hasError) {
      console.error('Error page detected:', pageInfo.errorText);
      return;
    }
    
    // Wait a moment for any dynamic content
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Detect form fields
    const formFields = await page.evaluate(() => {
      const allInputs = Array.from(document.querySelectorAll('input, textarea'));
      console.log('All form elements found:', allInputs.map(el => ({
        tag: el.tagName,
        type: el.type,
        name: el.name,
        id: el.id,
        placeholder: el.placeholder,
        className: el.className
      })));
      
      const titleInput = document.querySelector('input[name="title"], input[name="subject"], input[placeholder*="subject" i], input[placeholder*="title" i]');
      const messageInput = document.querySelector('textarea[name="message"], textarea[name="content"], .js-editor, .messageEditor');
      const submitBtn = document.querySelector('button[type="submit"], input[type="submit"], .js-submit');
      
      return {
        titleSelector: titleInput ? (titleInput.id ? `#${titleInput.id}` : titleInput.name ? `input[name="${titleInput.name}"]` : 'input[type="text"]') : null,
        messageSelector: messageInput ? (messageInput.id ? `#${messageInput.id}` : messageInput.name ? `textarea[name="${messageInput.name}"]` : 'textarea') : null,
        submitSelector: submitBtn ? (submitBtn.id ? `#${submitBtn.id}` : 'button[type="submit"]') : null,
        allInputs: allInputs.map(el => ({ tag: el.tagName, type: el.type, name: el.name, id: el.id, placeholder: el.placeholder }))
      };
    });
    
    console.log('Form fields detected:', formFields);
    
    // Try to fill form if fields are found
    if (formFields.titleSelector && formFields.messageSelector) {
      console.log('Attempting to fill form...');
      
      await page.type(formFields.titleSelector, 'Test Subject');
      console.log('Title filled');
      
      await page.type(formFields.messageSelector, 'This is a test message.');
      console.log('Message filled');
      
      // Take screenshot after filling
      await page.screenshot({ path: 'debug-filled-form-test.png' });
      
      if (formFields.submitSelector) {
        console.log('Attempting to submit form...');
        await page.click(formFields.submitSelector);
        await new Promise(resolve => setTimeout(resolve, 3000));
        console.log('Form submitted');
      }
    } else {
      console.log('Could not find required form fields');
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await browser.close();
  }
}

testConversationPage().catch(console.error); 