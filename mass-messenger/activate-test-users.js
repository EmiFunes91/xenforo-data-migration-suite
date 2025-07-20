// activate-test-users.js
// Script to activate test users by making them log in for the first time

require('dotenv').config();
const puppeteer = require('puppeteer');

const config = {
  forumUrl: process.env.FORUM_URL || 'https://forum.johnnydoe.is/',
  userPrefix: 'test',
  password: 'TestPassword123!',
  count: 20
};

async function activateTestUsers() {
  console.log('Starting test user activation...');
  
  const browser = await puppeteer.launch({ headless: false });
  
  // Add HTTP Basic Auth
  const page = await browser.newPage();
  await page.authenticate({
    username: process.env.HTACCESS_USERNAME || '',
    password: process.env.HTACCESS_PASSWORD || ''
  });
  
  const activatedUsers = [];
  
  for (let i = 1; i <= config.count; i++) {
    const username = `${config.userPrefix}${i}`;
    const email = `${config.userPrefix}${i}@testmail.com`;
    
    console.log(`\n--- Activating user ${i}/${config.count}: ${username} ---`);
    
    try {
      // Create new page for each user
      const userPage = await browser.newPage();
      await userPage.authenticate({
        username: process.env.HTACCESS_USERNAME || '',
        password: process.env.HTACCESS_PASSWORD || ''
      });
      
      // Go to login page
      await userPage.goto(config.forumUrl + 'login', { waitUntil: 'networkidle2', timeout: 60000 });
      
      // Detect login form
      const loginSelectors = await userPage.evaluate(() => {
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
        console.error(`Could not detect login form for ${username}`);
        continue;
      }
      
      // Fill login form
      await userPage.type(loginSelectors.userSelector, username);
      await userPage.type(loginSelectors.passSelector, config.password);
      
      // Submit form
      await Promise.all([
        userPage.click(loginSelectors.submitSelector),
        userPage.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 })
      ]);
      
      // Check if login was successful
      const loginResult = await userPage.evaluate(() => {
        const userLink = document.querySelector('.p-navgroup-link--user, .user-nav');
        const errorMessage = document.querySelector('.blockMessage--error, .error');
        
        return {
          isLoggedIn: !!userLink,
          username: userLink ? userLink.textContent.trim() : null,
          hasError: !!errorMessage,
          errorText: errorMessage ? errorMessage.textContent.trim() : null
        };
      });
      
      if (loginResult.isLoggedIn) {
        console.log(`✅ ${username} logged in successfully`);
        
        // Go to homepage to complete activation
        await userPage.goto(config.forumUrl, { waitUntil: 'networkidle2', timeout: 60000 });
        
        // Wait a moment to ensure activation
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        activatedUsers.push(username);
      } else {
        console.error(`❌ ${username} login failed:`, loginResult.errorText || 'Unknown error');
      }
      
      // Close user page
      await userPage.close();
      
      // Wait between users
      await new Promise(resolve => setTimeout(resolve, 3000));
      
    } catch (error) {
      console.error(`❌ Error activating ${username}:`, error.message);
    }
  }
  
  await browser.close();
  
  console.log('\n--- Activation Summary ---');
  console.log(`Total users processed: ${config.count}`);
  console.log(`Successfully activated: ${activatedUsers.length}`);
  console.log('Activated users:', activatedUsers);
  
  return activatedUsers;
}

activateTestUsers().catch(console.error); 