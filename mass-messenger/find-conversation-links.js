// find-conversation-links.js
// Script to find conversation/private message links in the forum

require('dotenv').config();
const puppeteer = require('puppeteer');
const path = require('path');
const puppeteerUtils = require('./utils/puppeteerUtils');

async function findConversationLinks() {
  console.log('Finding conversation links...');
  
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
    
    // Take screenshot of homepage
    await page.screenshot({ path: 'debug-homepage.png' });
    
    // Find all navigation links
    const navLinks = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a[href*="conversation"], a[href*="message"], a[href*="inbox"], a[href*="pm"]'));
      return links.map(link => ({
        text: link.textContent.trim(),
        href: link.href,
        className: link.className,
        title: link.title
      }));
    });
    
    console.log('Conversation-related links found:', navLinks);
    
    // Find all links in the navigation
    const allNavLinks = await page.evaluate(() => {
      const navElements = document.querySelectorAll('nav a, .p-nav a, .navigation a, .menu a');
      return Array.from(navElements).map(link => ({
        text: link.textContent.trim(),
        href: link.href,
        className: link.className
      }));
    });
    
    console.log('All navigation links:', allNavLinks);
    
    // Look for user menu or dropdown
    const userMenu = await page.evaluate(() => {
      const userLinks = document.querySelectorAll('.p-navgroup-link--user, .user-nav, .user-menu a');
      return Array.from(userLinks).map(link => ({
        text: link.textContent.trim(),
        href: link.href,
        className: link.className
      }));
    });
    
    console.log('User menu links:', userMenu);
    
    // Try to find a way to start a conversation
    // Look for any link that might lead to messaging
    const messagingLinks = await page.evaluate(() => {
      const keywords = ['message', 'conversation', 'inbox', 'pm', 'chat', 'send'];
      const allLinks = Array.from(document.querySelectorAll('a'));
      
      return allLinks
        .filter(link => {
          const text = link.textContent.toLowerCase();
          const href = link.href.toLowerCase();
          return keywords.some(keyword => text.includes(keyword) || href.includes(keyword));
        })
        .map(link => ({
          text: link.textContent.trim(),
          href: link.href,
          className: link.className
        }));
    });
    
    console.log('Potential messaging links:', messagingLinks);
    
    // Try to go to user profile page to see if there's a "Send Message" button
    console.log('Trying to access user profile...');
    await page.goto(`${process.env.FORUM_URL}members/test1.1/`, { waitUntil: 'networkidle2', timeout: 60000 });
    
    await page.screenshot({ path: 'debug-user-profile.png' });
    
    const profileLinks = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a'));
      return links
        .filter(link => {
          const text = link.textContent.toLowerCase();
          return text.includes('message') || text.includes('send') || text.includes('contact');
        })
        .map(link => ({
          text: link.textContent.trim(),
          href: link.href,
          className: link.className
        }));
    });
    
    console.log('Profile messaging links:', profileLinks);
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await browser.close();
  }
}

findConversationLinks().catch(console.error); 