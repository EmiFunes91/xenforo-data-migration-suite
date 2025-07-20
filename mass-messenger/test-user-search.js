// test-user-search.js
// Test script to search for users in the forum

require('dotenv').config();
const puppeteer = require('puppeteer');
const path = require('path');
const puppeteerUtils = require('./utils/puppeteerUtils');

async function testUserSearch() {
  console.log('Testing user search...');
  
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
    
    // Go to members page or search page
    console.log('Going to members/search page...');
    await page.goto(`${process.env.FORUM_URL}members/`, { waitUntil: 'networkidle2', timeout: 60000 });
    
    // Take screenshot
    await page.screenshot({ path: 'debug-members-page.png' });
    
    // Check page content
    const pageInfo = await page.evaluate(() => {
      return {
        title: document.title,
        url: window.location.href,
        hasSearchForm: !!document.querySelector('form[action*="search"]'),
        hasMemberList: !!document.querySelector('.structItem--member, .memberListItem')
      };
    });
    
    console.log('Members page info:', pageInfo);
    
    // Try to search for test1
    console.log('Searching for user test1...');
    
    // Look for search input
    const searchInput = await page.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll('input'));
      const searchInput = inputs.find(input => 
        input.type === 'text' && 
        (input.name === 'keywords' || input.placeholder?.toLowerCase().includes('search'))
      );
      return searchInput ? {
        selector: searchInput.id ? `#${searchInput.id}` : `input[name="${searchInput.name}"]`,
        name: searchInput.name,
        placeholder: searchInput.placeholder
      } : null;
    });
    
    console.log('Search input found:', searchInput);
    
    if (searchInput) {
      // Fill search form
      await page.type(searchInput.selector, 'test1');
      
      // Find and click search button
      const searchButton = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button, input[type="submit"]'));
        const searchBtn = buttons.find(btn => 
          btn.textContent?.toLowerCase().includes('search') || 
          btn.type === 'submit'
        );
        return searchBtn ? {
          selector: searchBtn.id ? `#${searchBtn.id}` : 'button[type="submit"]',
          text: searchBtn.textContent?.trim()
        } : null;
      });
      
      console.log('Search button found:', searchButton);
      
      if (searchButton) {
        await page.click(searchButton.selector);
        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 });
        
        // Take screenshot of search results
        await page.screenshot({ path: 'debug-search-results.png' });
        
        // Check search results
        const searchResults = await page.evaluate(() => {
          const results = Array.from(document.querySelectorAll('.structItem--member, .memberListItem, .userListItem'));
          return results.map(item => {
            const usernameEl = item.querySelector('.username, .userTitle');
            return usernameEl ? usernameEl.textContent.trim() : 'Unknown';
          });
        });
        
        console.log('Search results:', searchResults);
        
        // Check if test1 is in results
        const test1Found = searchResults.some(username => username.toLowerCase().includes('test1'));
        console.log('test1 found in search results:', test1Found);
      }
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await browser.close();
  }
}

testUserSearch().catch(console.error); 