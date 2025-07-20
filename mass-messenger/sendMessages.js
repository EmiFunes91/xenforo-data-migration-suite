// sendMessages.js
// Main script for mass private messaging in XenForo using Puppeteer

require('dotenv').config();

const path = require('path');
const puppeteer = require('puppeteer');
const config = require('./config');
const { log, logError, logResult, EXEC_ID } = require('./utils/logger');
const puppeteerUtils = require('./utils/puppeteerUtils');
const fileUtils = require('./utils/fileUtils');

async function main() {
  log('--- Mass Messenger execution started ---', 'info', 'send');

  // 1. Load users
  let users = [];
  try {
    users = fileUtils.readJson(path.join(__dirname, 'users.json'));
    log(`Loaded ${users.length} users from users.json`, 'info', 'send');
  } catch (err) {
    log(`Error loading users.json: ${err.message}`, 'error', 'send');
    process.exit(1);
  }

  // 2. Load sent messages log
  let sentMessages = [];
  try {
    sentMessages = fileUtils.readJson(path.join(__dirname, 'sent_messages.json'));
  } catch (err) {
    log('No sent_messages.json found, starting fresh.', 'info', 'send');
  }
  const sentUsernames = new Set(sentMessages.map(m => m.username));

  // 3. Load message template
  let template = '';
  try {
    template = fileUtils.readText(path.join(__dirname, 'message_template.txt'));
    log('Loaded message template.', 'info', 'send');
  } catch (err) {
    log(`Error loading message_template.txt: ${err.message}`, 'error', 'send');
    process.exit(1);
  }

  // 4. Prepare Puppeteer and load cookies
  let browser, page;
  try {
    browser = await puppeteer.launch({ headless: false });
    page = await browser.newPage();
    await page.authenticate({
      username: process.env.HTACCESS_USERNAME,
      password: process.env.HTACCESS_PASSWORD
    });
    if (!config.dryRun) {
      log(`Loading cookies from: ${config.cookiesFile}`, 'info', 'send');
      await puppeteerUtils.loadCookies(page, path.join(__dirname, config.cookiesFile));
      await page.goto(config.forumUrl, { waitUntil: 'networkidle2' });
      log('Puppeteer browser launched, cookies loaded, and initial page loaded.', 'info', 'send');
    } else {
      log('Dry-run mode: skipping browser and cookies loading. No real messages will be sent.', 'info', 'send');
    }
  } catch (err) {
    log(`Error launching Puppeteer or loading cookies: ${err.message}`, 'error', 'send');
    process.exit(1);
  }

  // 5. Main sending loop
  let sentCount = 0;
  const MAX_RETRIES = 3;
  const WAIT_ON_CAPTCHA_OR_429 = 300; // 5 minutos
  const WAIT_ON_TRANSIENT = 10;
  
  for (const user of users) {
    if (sentUsernames.has(user.username)) {
      log(`Skipping ${user.username}: already messaged.`, 'info', 'send');
      continue;
    }
    if (sentCount >= config.maxMessages) {
      log(`Max messages per run (${config.maxMessages}) reached. Stopping.`, 'info', 'send');
      break;
    }
    
    // Prepare message with placeholders
    const body = template.replace('{username}', user.username);
    let retryCount = 0;
    let success = false;
    
    while (retryCount < MAX_RETRIES && !success) {
      if (config.dryRun) {
        log(`[DRY RUN] Would post reply to ${user.username}`, 'info', 'send');
        success = true;
        break;
      }
      
      try {
        log(`Attempt ${retryCount + 1}: Accessing profile for ${user.username}`, 'info', 'send');
        if (!user.id) throw new Error('User id not found in users.json');
        
        const profileUrl = `${config.forumUrl}members/${user.username}.${user.id}/`;
        await page.goto(profileUrl, { waitUntil: 'networkidle2' });
        log(`Profile loaded for ${user.username}: ${profileUrl}`, 'info', 'send');
        await page.screenshot({ path: `debug-profile-${user.username}.png` });
        
        // 2. Wait for the profile post form
        const editorSelector = 'textarea[name="message_html"]';
        const postButtonSelector = 'button.button--icon--reply.button--primary[type="submit"]';
        
        log(`Looking for profile post editor for ${user.username}`, 'info', 'send');
        await page.waitForSelector(editorSelector, { timeout: 10000 });
        await page.screenshot({ path: `debug-profile-editor-${user.username}.png` });
        
        await page.type(editorSelector, body);
        log(`Message typed in profile post editor for ${user.username}`, 'info', 'send');
        
        // Verificar que el botón Post esté presente y habilitado
        const postButtonExists = await page.$(postButtonSelector);
        if (!postButtonExists) {
          logError(`No Post button found for ${user.username}. Saving HTML for debugging.`, 'send');
          const html = await page.content();
          const fs = require('fs');
          fs.writeFileSync(`debug-no-post-button-${user.username}.html`, html);
          await page.screenshot({ path: `debug-no-post-button-${user.username}.png` });
          throw new Error('No Post button found');
        }
        
        const isDisabled = await page.$eval(postButtonSelector, btn => btn.disabled);
        if (isDisabled) {
          logError(`Post button is disabled for ${user.username}. Saving HTML for debugging.`, 'send');
          const html = await page.content();
          const fs = require('fs');
          fs.writeFileSync(`debug-disabled-post-button-${user.username}.html`, html);
          await page.screenshot({ path: `debug-disabled-post-button-${user.username}.png` });
          throw new Error('Post button is disabled');
        }
        
        // Guardar la URL actual antes del clic
        const currentUrl = page.url();
        
        // Hacer clic en el botón Post
        await page.click(postButtonSelector);
        log(`Post button clicked for ${user.username}, reloading profile para verificar posteo...`, 'info', 'send');

        // Esperar un poco para que el post se procese
        await page.waitForTimeout(3000);
        await page.goto(profileUrl, { waitUntil: 'networkidle2' });
        log(`Profile reloaded for ${user.username}, verificando si el mensaje fue publicado...`, 'info', 'send');

        // Buscar el mensaje en el muro del usuario
        const messageFound = await page.evaluate((body) => {
          // Buscar todos los posts en el muro/perfil
          const posts = Array.from(document.querySelectorAll('.message-body, .message-cell, .profilePost-message'));
          return posts.some(post => post.textContent && post.textContent.trim() === body.trim());
        }, body);

        if (messageFound) {
          logResult(`Profile post verificado para ${user.username}`, 'send');
        } else {
          throw new Error('No se encontró el mensaje en el muro tras recargar el perfil');
        }
        
        await page.screenshot({ path: `debug-profile-posted-${user.username}.png` });
        
        // Add to sent messages log
        sentMessages.push({ username: user.username, timestamp: new Date().toISOString() });
        fileUtils.writeJson(path.join(__dirname, 'sent_messages.json'), sentMessages);
        log(`Message posted for ${user.username}. Total sent: ${++sentCount}`, 'info', 'send');
        
        success = true;
      } catch (err) {
        retryCount++;
        log(`Error sending message to ${user.username} (Attempt ${retryCount}/${MAX_RETRIES}): ${err.message}`, 'error', 'send');
        if (retryCount < MAX_RETRIES) {
          log(`Retrying in ${WAIT_ON_CAPTCHA_OR_429 / 1000} seconds...`, 'info', 'send');
          await page.waitForTimeout(WAIT_ON_CAPTCHA_OR_429);
        }
      }
    }
  }

  log('--- Mass Messenger execution finished ---', 'info', 'send');
  await browser.close();
}

main();