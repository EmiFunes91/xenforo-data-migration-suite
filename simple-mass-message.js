// simple-mass-message.js
// Simple script to send one message to all users in XenForo

require('dotenv').config();
const puppeteer = require('puppeteer');

// Simple configuration using environment variables
const config = {
  forumUrl: process.env.FORUM_URL || 'https://forum.johnnydoe.is/', // Development forum URL
  username: process.env.ADMIN_USERNAME || 'emilio.ifunes@hotmail.es', // Admin username
  password: process.env.ADMIN_PASSWORD || 'iiVS3m965D6!tuJ', // Admin password
  message: 'This is a test message to all users from the automated system.' // Simple message to send
};

async function simpleMassMessage() {
  console.log('Starting simple mass message script...');
  
  const browser = await puppeteer.launch({ 
    headless: false, 
    defaultViewport: { width: 1400, height: 900 } 
  });
  
  const page = await browser.newPage();
  
  // Add HTTP Basic Auth if needed
  await page.authenticate({
    username: process.env.HTACCESS_USERNAME || '',
    password: process.env.HTACCESS_PASSWORD || ''
  });
  
  try {
    // Step 1: Login
    console.log('Logging in...');
    console.log('Navigating to:', config.forumUrl + 'login');
    await page.goto(config.forumUrl + 'login', { waitUntil: 'networkidle2', timeout: 60000 });
    
    // Take screenshot before filling form
    await page.screenshot({ path: 'debug-login-page.png' });
    
    // Wait a moment for the page to fully load
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Detect login form and selectors robustly (using proven strategy from saveCookies.js)
    const loginSelectors = await page.evaluate(() => {
      function getSelector(el) {
        if (el.id) return `#${el.id}`;
        if (el.name) return `input[name="${el.name}"]`;
        if (el.type === 'password') return 'input[type="password"]';
        if (el.type === 'email') return 'input[type="email"]';
        if (el.type === 'text') return 'input[type="text"]';
        if (el.type === 'submit') return 'input[type="submit"]';
        if (el.tagName === 'BUTTON') {
          if (el.className) {
            const classes = el.className.split(' ');
            // Buscar clases específicas de XenForo
            const specificClass = classes.find(cls => cls.includes('button--') || cls.includes('submit') || cls.includes('login'));
            if (specificClass) return `button.${specificClass}`;
            return `button.${classes[0]}`;
          }
          return 'button[type="submit"]';
        }
        return el.tagName.toLowerCase();
      }
      
      // Buscar el formulario de login específicamente
      const loginForm = document.querySelector('form[action*="login"]');
      if (!loginForm) {
        console.log('No login form found with action*="login"');
        return { userSelector: null, passSelector: null, submitSelector: null };
      }
      
      console.log('Login form found:', {
        action: loginForm.action,
        method: loginForm.method,
        className: loginForm.className
      });
      
      // Buscar campos dentro del formulario de login
      const userInput = loginForm.querySelector('input[type="text"], input[type="email"]');
      const passInput = loginForm.querySelector('input[type="password"]');
      
      // Debug: listar todos los botones en el formulario
      const allButtons = loginForm.querySelectorAll('button, input[type="submit"]');
      console.log('All buttons in login form:', Array.from(allButtons).map(btn => ({
        tag: btn.tagName,
        type: btn.type,
        text: btn.textContent?.trim(),
        className: btn.className,
        id: btn.id,
        name: btn.name
      })));
      
      const submitBtn = loginForm.querySelector('button[type="submit"], input[type="submit"]') || 
                       loginForm.querySelector('button:contains("Log in"), button:contains("Sign in"), button:contains("Login")') ||
                       loginForm.querySelector('.js-submit, .submit, .button') ||
                       loginForm.querySelector('.button--primary, .button--icon--login');
      
      return {
        userSelector: userInput ? getSelector(userInput) : null,
        passSelector: passInput ? getSelector(passInput) : null,
        submitSelector: submitBtn ? getSelector(submitBtn) : null,
        allButtons: Array.from(allButtons).map(btn => ({
          tag: btn.tagName,
          type: btn.type,
          text: btn.textContent?.trim(),
          className: btn.className,
          id: btn.id,
          name: btn.name
        }))
      };
    });
    
    console.log('Login selectors detected:', loginSelectors);
    console.log('All buttons in login form:', loginSelectors.allButtons);
    
    // Check if we found all required fields
    if (!loginSelectors.userSelector || !loginSelectors.passSelector || !loginSelectors.submitSelector) {
      console.error('Login fields not detected. Please check the login page HTML.');
      await page.screenshot({ path: 'debug-no-login-fields.png' });
      return;
    }
    
    // Fill login form using the detected selectors
    console.log('Filling username field:', loginSelectors.userSelector);
    await page.type(loginSelectors.userSelector, config.username);
    console.log('Username filled:', config.username);
    
    console.log('Filling password field:', loginSelectors.passSelector);
    await page.type(loginSelectors.passSelector, config.password);
    console.log('Password filled');
    
    // Take screenshot after filling form
    await page.screenshot({ path: 'debug-filled-form.png' });
    
    // Submit the form
    console.log('Clicking submit button:', loginSelectors.submitSelector);
    await Promise.all([
      page.click(loginSelectors.submitSelector),
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 })
    ]);
    console.log('Login form submitted');
    
    console.log('Login successful');
    
    // Step 2: Test with just one user first
    const testUser = 'test1';
    console.log(`Testing with user: ${testUser}`);
    
    // Go to conversation page
    await page.goto(`${config.forumUrl}conversations/add?to=${testUser}`, { waitUntil: 'networkidle2', timeout: 60000 });
    
    // Take screenshot for debugging
    await page.screenshot({ path: 'debug-conversation-page.png' });
    
    // Wait a moment and check what's on the page
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Check page content
    const pageContent = await page.evaluate(() => {
      return {
        title: document.title,
        url: window.location.href,
        hasForm: !!document.querySelector('form'),
        formElements: Array.from(document.querySelectorAll('input, textarea, button')).map(el => ({
          tag: el.tagName,
          type: el.type,
          name: el.name,
          id: el.id,
          placeholder: el.placeholder,
          className: el.className
        }))
      };
    });
    
    console.log('Page content:', pageContent);
    
    // Try to find and fill form fields
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
    
    // Try to fill and send
    if (formFields.titleSelector) {
      await page.type(formFields.titleSelector, 'Test Subject');
      console.log('Title filled');
    }
    
    if (formFields.messageSelector) {
      await page.type(formFields.messageSelector, config.message);
      console.log('Message filled');
    }
    
    if (formFields.submitSelector) {
      await page.click(formFields.submitSelector);
      await new Promise(resolve => setTimeout(resolve, 3000));
      console.log('Form submitted');
    }
    
    console.log('Test completed. Check debug-conversation-page.png for visual reference.');
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await browser.close();
  }
}

// Run the script
simpleMassMessage().catch(console.error); 