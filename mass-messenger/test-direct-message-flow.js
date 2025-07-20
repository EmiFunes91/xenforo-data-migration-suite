// test-direct-message-flow.js
// Test script to send direct message using the forum's interface flow

require('dotenv').config();
const puppeteer = require('puppeteer');
const path = require('path');
const puppeteerUtils = require('./utils/puppeteerUtils');

async function testDirectMessageFlow() {
  console.log('Testing direct message flow...');
  
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
    
    // Go to forum homepage
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
    
    // Go to direct messages page
    console.log('Going to direct messages page...');
    await page.goto(`${process.env.FORUM_URL}direct-messages/`, { waitUntil: 'networkidle2', timeout: 60000 });
    
    await page.screenshot({ path: 'debug-direct-messages-page.png' });
    
    // Look for "Send direct message" link
    const sendMessageLink = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a'));
      const sendLink = links.find(link => 
        link.textContent.toLowerCase().includes('send direct message') ||
        link.href.includes('direct-messages/add')
      );
      return sendLink ? {
        text: sendLink.textContent.trim(),
        href: sendLink.href
      } : null;
    });
    
    console.log('Send message link found:', sendMessageLink);
    
    if (sendMessageLink) {
      // Click on "Send direct message"
      console.log('Clicking on Send direct message...');
      await page.click(`a[href*="direct-messages/add"]`);
      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 });
      
      await page.screenshot({ path: 'debug-send-message-page.png' });
      
      // Check page content
      const pageInfo = await page.evaluate(() => {
        return {
          title: document.title,
          url: window.location.href,
          hasForm: !!document.querySelector('form'),
          formAction: document.querySelector('form')?.action || 'no action'
        };
      });
      
      console.log('Send message page info:', pageInfo);
      
      // Look for recipient field
      const recipientField = await page.evaluate(() => {
        const inputs = Array.from(document.querySelectorAll('input'));
        const recipientInput = inputs.find(input => 
          input.name?.toLowerCase().includes('recipient') ||
          input.name?.toLowerCase().includes('to') ||
          input.placeholder?.toLowerCase().includes('recipient') ||
          input.placeholder?.toLowerCase().includes('to') ||
          input.placeholder?.toLowerCase().includes('user')
        );
        return recipientInput ? {
          selector: recipientInput.id ? `#${recipientInput.id}` : `input[name="${recipientInput.name}"]`,
          name: recipientInput.name,
          placeholder: recipientInput.placeholder
        } : null;
      });
      
      console.log('Recipient field found:', recipientField);
      
      if (recipientField) {
        // Fill recipient field
        await page.type(recipientField.selector, 'test1');
        console.log('Recipient filled with test1');
        
        // Wait a moment for autocomplete or validation
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Look for title and message fields
        const formFields = await page.evaluate(() => {
          const titleInput = document.querySelector('input[name="title"], input[name="subject"], input[placeholder*="subject" i], input[placeholder*="title" i]');
          const messageInput = document.querySelector('textarea[name="message"], textarea[name="content"], .js-editor, .messageEditor');
          const submitBtn = document.querySelector('button[type="submit"], input[type="submit"], .js-submit');
          
          return {
            titleSelector: titleInput ? (titleInput.id ? `#${titleInput.id}` : titleInput.name ? `input[name="${titleInput.name}"]` : 'input[type="text"]') : null,
            messageSelector: messageInput ? (messageInput.id ? `#${messageInput.id}` : messageInput.name ? `textarea[name="${messageInput.name}"]` : 'textarea') : null,
            submitSelector: submitBtn ? (submitBtn.id ? `#${submitBtn.id}` : 'button[type="submit"]') : null
          };
        });
        
        console.log('Form fields found:', formFields);
        
        // Fill form if fields are found
        if (formFields.titleSelector && formFields.messageSelector) {
          await page.type(formFields.titleSelector, 'Test Subject');
          console.log('Title filled');
          
          await page.type(formFields.messageSelector, 'This is a test message from the automated system.');
          console.log('Message filled');
          
          await page.screenshot({ path: 'debug-filled-message-form.png' });
          
          if (formFields.submitSelector) {
            console.log('Attempting to submit message...');
            await page.click(formFields.submitSelector);
            await new Promise(resolve => setTimeout(resolve, 5000));
            console.log('Message submitted');
            
            await page.screenshot({ path: 'debug-after-submit.png' });
          }
        }
      }
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await browser.close();
  }
}

testDirectMessageFlow().catch(console.error); 