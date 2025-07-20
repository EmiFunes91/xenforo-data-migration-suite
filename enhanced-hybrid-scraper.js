const puppeteer = require('puppeteer');
const fs = require('fs');
const readline = require('readline');
const { integrateWithMainScraper } = require('./integrated-posts-extractor');
const { generateUserInsertSQL, generateUserOptionInsertSQL, generateThreadInsertSQL } = require('./user-registration-calculator');

const LOGIN_URL = 'https://www.offshorecorptalk.com/login';
const USERNAME = 'emilio.ifunes@hotmail.es';
const PASSWORD = 'iiVS3m965D6!tuJ';

const CHECKPOINT_FILE = 'checkpoint.json';
const CHECKPOINT_INTERVAL = 10; // Guardar cada 10 hilos

// Crear interfaz para leer input del usuario
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function askQuestion(question) {
    return new Promise((resolve) => {
        rl.question(question, (answer) => {
            resolve(answer);
        });
    });
}

function saveCheckpoint(state) {
    fs.writeFileSync(CHECKPOINT_FILE, JSON.stringify(state, null, 2));
    console.log(`💾 Checkpoint guardado en ${CHECKPOINT_FILE}`);
}

function loadCheckpoint() {
    if (fs.existsSync(CHECKPOINT_FILE)) {
        try {
            const data = fs.readFileSync(CHECKPOINT_FILE, 'utf8');
            return JSON.parse(data);
        } catch (e) {
            console.log('⚠️  Error leyendo el checkpoint, se ignorará.');
        }
    }
    return null;
}

// Function to retry navigation with exponential backoff
async function retryNavigation(page, url, options = {}, maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            await page.goto(url, { 
                waitUntil: 'networkidle2', 
                timeout: 60000,
                ...options 
            });
            return; // Success
        } catch (error) {
            console.log(`⚠️  Navigation attempt ${attempt} failed for ${url}: ${error.message}`);
            if (attempt === maxRetries) {
                throw error; // Re-throw on final attempt
            }
            // Wait before retry with exponential backoff
            const waitTime = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
            console.log(`⏳ Retrying in ${waitTime}ms...`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }
    }
}

async function enhancedHybridScraper() {
    console.log('🚀 Starting enhanced hybrid scraper (threads + posts)...');
    
    let browser, page;
    let forums = [];
    let allThreads = [];
    let allPosts = [];
    let errors = [];
    let startThreadIndex = 0;
    // Checkpoint: reanudar si existe
    const checkpoint = loadCheckpoint();
    if (checkpoint) {
        console.log('🔄 Checkpoint detectado. Reanudando desde el hilo', checkpoint.currentThreadIndex + 1);
        forums = checkpoint.forums;
        allThreads = checkpoint.threads;
        allPosts = checkpoint.posts;
        errors = checkpoint.errors;
        startThreadIndex = checkpoint.currentThreadIndex + 1;
    }
    
    browser = await puppeteer.launch({
        headless: false,
        defaultViewport: null,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security', '--disable-features=VizDisplayCompositor']
    });
    
    page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    // Set longer timeouts for better reliability
    page.setDefaultTimeout(60000); // 60 seconds
    page.setDefaultNavigationTimeout(60000); // 60 seconds
    
    try {
        // Step 1: Automatic login
        console.log('🔐 Step 1: Performing automatic login...');
        await retryNavigation(page, LOGIN_URL);
        
        // Detectar campos de login
        const loginSelectors = await page.evaluate(() => {
            const userInput = document.querySelector('input[type="text"], input[type="email"]');
            const passInput = document.querySelector('input[type="password"]');
            const submitBtn = document.querySelector('button[type="submit"], input[type="submit"]');
            
            return {
                userSelector: userInput ? getSelector(userInput) : null,
                passSelector: passInput ? getSelector(passInput) : null,
                submitSelector: submitBtn ? getSelector(submitBtn) : null
            };
            
            function getSelector(el) {
                if (el.id) return `#${el.id}`;
                if (el.name) return `input[name="${el.name}"]`;
                if (el.type === 'password') return 'input[type="password"]';
                if (el.type === 'email') return 'input[type="email"]';
                if (el.type === 'text') return 'input[type="text"]';
                return el.tagName.toLowerCase();
            }
        });
        
        if (!loginSelectors.userSelector || !loginSelectors.passSelector || !loginSelectors.submitSelector) {
            throw new Error('Login fields not detected');
        }
        
        console.log('📝 Login fields detected:', loginSelectors);
        
        // Llenar formulario y enviar
        await page.type(loginSelectors.userSelector, USERNAME);
        await page.type(loginSelectors.passSelector, PASSWORD);
        await page.click(loginSelectors.submitSelector);
        
        // Wait for navigation
        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 });
        console.log('✅ Login sent');
        
        // Step 2: Check for 2FA
        console.log('🔍 Step 2: Checking for 2FA...');
        
        const has2FA = await page.evaluate(() => {
            const twoFactorIndicators = [
                'two-factor',
                '2fa',
                'verification',
                'authenticator',
                'security code',
                'verification code'
            ];
            
            const pageText = document.body.textContent.toLowerCase();
            return twoFactorIndicators.some(indicator => pageText.includes(indicator));
        });
        
        if (has2FA) {
            console.log('🔐 2FA detected - waiting for manual code...');
            console.log('📱 Please check your authenticator and enter the code in the browser');
            console.log('⏳ Waiting for you to complete authentication...');
            
            await askQuestion('Press ENTER when you have completed 2FA and are logged in...');
            
            const loginStatus = await page.evaluate(() => {
                const userInfo = document.querySelector('.p-navgroup-linkText');
                return userInfo ? userInfo.textContent.trim() : 'Not found';
            });
            
            console.log(`👤 Account status: ${loginStatus}`);
            
            if (loginStatus === 'Log in') {
                console.log('❌ Login was not successful. Verifying...');
                await askQuestion('Was the login successful? (y/n): ');
            }
        } else {
            console.log('✅ No 2FA detected - verifying login...');
            
            const loginStatus = await page.evaluate(() => {
                const userInfo = document.querySelector('.p-navgroup-linkText');
                return userInfo ? userInfo.textContent.trim() : 'Not found';
            });
            
            console.log(`👤 Account status: ${loginStatus}`);
        }
        
        // Step 3: Thread scraping
        console.log('🚀 Step 3: Starting thread scraping...');
        
        // Navigate to main page to see available forums
        await retryNavigation(page, 'https://www.offshorecorptalk.com');
        
        // Extract forum list
        forums = await page.evaluate(() => {
            const forumLinks = document.querySelectorAll('a[href*="/forums/"]');
            const forums = [];
            
            forumLinks.forEach(link => {
                const href = link.getAttribute('href');
                const text = link.textContent.trim();
                if (href && text && !text.includes('Mark forums read')) {
                    forums.push({
                        title: text,
                        url: href.startsWith('http') ? href : `https://www.offshorecorptalk.com${href}`
                    });
                }
            });
            
            return forums; // Eliminar el límite de 10 foros
        });
        
        console.log(`📂 Forums found: ${forums.length}`);
        
        if (!forums.length) {
            // Solo extraer foros si no hay checkpoint
            // Navigate to main page to see available forums
            await retryNavigation(page, 'https://www.offshorecorptalk.com');
            
            // Extract forum list
            forums = await page.evaluate(() => {
                const forumLinks = document.querySelectorAll('a[href*="/forums/"]');
                const forums = [];
                
                forumLinks.forEach(link => {
                    const href = link.getAttribute('href');
                    const text = link.textContent.trim();
                    if (href && text && !text.includes('Mark forums read')) {
                        forums.push({
                            title: text,
                            url: href.startsWith('http') ? href : `https://www.offshorecorptalk.com${href}`
                        });
                    }
                });
                
                return forums; // Eliminar el límite de 10 foros
            });
            
            console.log(`📂 Forums found: ${forums.length}`);
        }
        
        // Extracción de threads
        for (let i = startThreadIndex; i < forums.length; i++) {
            const forum = forums[i];
            console.log(`\n🔍 Extracting threads from: ${forum.title} (${i + 1}/${forums.length})`);
            
            try {
                await retryNavigation(page, forum.url);
                
                // Extract ALL threads from this forum
                const threads = await page.evaluate((forumTitle) => {
                    const threadElements = document.querySelectorAll('.structItem--thread');
                    const threads = [];
                    
                    threadElements.forEach((thread, index) => {
                        // No limit - extract ALL threads
                        const titleElement = thread.querySelector('.structItem-title a');
                        const authorElement = thread.querySelector('.structItem-parts a');
                        const dateElement = thread.querySelector('.structItem-parts time');
                        
                        if (titleElement) {
                            threads.push({
                                title: titleElement.textContent.trim(),
                                url: titleElement.href,
                                author: authorElement ? authorElement.textContent.trim() : 'Unknown',
                                date: dateElement ? dateElement.getAttribute('datetime') : null,
                                forum: forumTitle
                            });
                        }
                    });
                    
                    return threads;
                }, forum.title);
                
                console.log(`🧵 Threads extracted: ${threads.length}`);
                allThreads.push(...threads);
                
                // Wait between requests
                await new Promise(resolve => setTimeout(resolve, 2000));
                
            } catch (error) {
                console.log(`❌ Error en hilo ${forum.title}: ${error.message}`);
                errors.push({forum: forum.title, url: forum.url, error: error.message, intento: 1}); // Solo un intento por hilo
            }
            // Guardar checkpoint cada X hilos
            if ((i + 1) % CHECKPOINT_INTERVAL === 0) {
                saveCheckpoint({
                    forums,
                    threads: allThreads,
                    posts: allPosts,
                    errors,
                    currentThreadIndex: i
                });
            }
        }
        
        console.log(`\n📊 Total threads extracted: ${allThreads.length}`);
        
        // Step 4: Post extraction
        console.log('\n🚀 Step 4: Starting post extraction...');
        
        // Ask user if they want to extract posts
        const extractPosts = await askQuestion('Do you want to extract posts from threads? (y/n): ');
        
        let completeData = {
            metadata: {
                generated_at: new Date().toISOString(),
                scraper_type: 'enhanced_hybrid_scraper',
                description: 'Data extracted with enhanced hybrid scraper (threads + posts)'
            },
            forums: forums,
            threads: allThreads,
            posts: [],
            users: []
        };
        
        if (extractPosts.toLowerCase() === 's' || extractPosts.toLowerCase() === 'si' || extractPosts.toLowerCase() === 'y' || extractPosts.toLowerCase() === 'yes') {
            console.log('📝 Starting post extraction...');
            
            // Configure extraction options
            const extractionOptions = {
                minDate: new Date('2025-05-09'),
                verbose: true,
                delay: 2000,
                timeout: 30000
            };
            
            // Integrate post extraction
            const postsResult = await integrateWithMainScraper(allThreads, page, extractionOptions);
            
            completeData.posts = postsResult.posts;
            completeData.errors = postsResult.errors || [];
            
            console.log(`\n✅ Post extraction completed:`);
            console.log(`   📝 Posts extracted: ${postsResult.posts.length}`);
            console.log(`   ⚠️  Errors: ${postsResult.errors.length}`);
        } else {
            console.log('⏭️ Skipping post extraction...');
        }
        
        // Step 5: Save data
        console.log('\n──────────────────────────────');
        console.log('💾 Step 5: Saving data...');
        console.log('──────────────────────────────');
        
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const jsonFile = `enhanced-scraped-data-${timestamp}.json`;
        const sqlFile = `enhanced-scraped-data-${timestamp}.sql`;
        
        fs.writeFileSync(jsonFile, JSON.stringify(completeData, null, 2));
        console.log(`📄 JSON saved to: ${jsonFile}`);
        
        // --- START PROFESSIONAL BEST PRACTICE BLOCK ---
        // Filter posts from May 9, 2025 onwards
        const MAY_9_2025 = new Date('2025-05-09T00:00:00Z').getTime() / 1000;
        const filteredPosts = (completeData.posts || []).filter(post => {
            let postDate = 0;
            if (typeof post.post_date === 'string') {
                const d = new Date(post.post_date);
                postDate = isNaN(d.getTime()) ? 0 : Math.floor(d.getTime() / 1000);
            } else if (typeof post.post_date === 'number') {
                postDate = post.post_date;
            }
            return postDate >= MAY_9_2025;
        });
        // Unique users
        const uniqueUsers = new Set();
        filteredPosts.forEach(post => uniqueUsers.add(post.post_author));
        (completeData.threads || []).forEach(thread => uniqueUsers.add(thread.author));
        // Unique threads by title+author+date, pero solo los que tengan al menos un post válido
        const validThreadKeys = new Set();
        filteredPosts.forEach(post => {
            const key = `${post.thread_title || ''}|${post.thread_author || post.post_author || ''}|${post.thread_date || ''}`;
            validThreadKeys.add(key);
        });
        const uniqueThreads = new Map();
        (completeData.threads || []).forEach(thread => {
            const key = `${thread.title}|${thread.author}|${thread.date}`;
            if (validThreadKeys.has(key)) {
                uniqueThreads.set(key, thread);
            }
        });
        // --- Generate safe, incremental, professional SQL ---
        let sqlContent = `-- XenForo Enhanced Hybrid Scraper Data Import\n`;
        sqlContent += `-- Incremental, idempotent, safe for production\n`;
        sqlContent += `-- Date: ${new Date().toISOString()}\n\n`;
        // USERS
        if (uniqueUsers.size > 0) {
            sqlContent += `-- Users\n`;
            uniqueUsers.forEach(username => {
                if (!username) return;
                const email = `${username.toLowerCase().replace(/[^a-z0-9]/g, '')}@oct-imported.com`;
                sqlContent += `INSERT INTO xf_user (username, email, language_id, style_id, timezone, visible, activity_visible, user_group_id, secondary_group_ids, display_style_group_id, permission_combination_id, message_count, question_solution_count, conversations_unread, register_date, last_activity, trophy_points, alerts_unviewed, alerts_unread, avatar_date, avatar_width, avatar_height, avatar_highdpi, avatar_optimized, gravatar, user_state, security_lock, is_moderator, is_admin, is_banned, reaction_score, vote_score, warning_points, is_staff, secret_key, privacy_policy_accepted, terms_accepted, ozzmodz_badges_badge_count, ozzmodz_badges_last_award_date)\n`;
                sqlContent += `SELECT\n`;
                sqlContent += `  '${username.replace(/'/g, "''")}',\n`;
                sqlContent += `  '${email}',\n`;
                sqlContent += `  1, 0, 'Europe/Madrid', 1, 1, 2, '', 2, 1, 0, 0, 0, UNIX_TIMESTAMP(), UNIX_TIMESTAMP(), 0, 0, 0, 0, 0, 0, 0, 0, '', 'valid', '', 0, 0, 0, 0, 0, 0, 0, '', 0, 0, 0, 0\n`;
                sqlContent += `WHERE NOT EXISTS (SELECT 1 FROM xf_user WHERE username = '${username.replace(/'/g, "''")}');\n`;
            });
            sqlContent += `\n`;
            uniqueUsers.forEach(username => {
                if (!username) return;
                sqlContent += `INSERT INTO xf_user_option (user_id, show_dob_year, show_dob_date, content_show_signature, receive_admin_email, email_on_conversation, push_on_conversation, is_discouraged, creation_watch_state, interaction_watch_state, alert_optout, push_optout, use_tfa, thuix_collapse_postbit, thuix_collapse_sidebar, thuix_collapse_sidebar_nav, thuix_font_size, siropu_ads_manager_view_ads, ozzmodz_badges_email_on_award)\n`;
                sqlContent += `SELECT user_id, 1, 1, 1, 1, 1, 1, 0, 'watch_no_email', 'watch_no_email', '', '', 0, 1, 0, 0, 0, 1, 1 FROM xf_user WHERE username = '${username.replace(/'/g, "''")}'\n`;
                sqlContent += `  AND NOT EXISTS (SELECT 1 FROM xf_user_option WHERE user_id = xf_user.user_id);\n`;
            });
            sqlContent += `\n`;
        }
        // THREADS
        if (uniqueThreads.size > 0) {
            sqlContent += `-- Threads\n`;
            uniqueThreads.forEach(thread => {
                if (!thread || !thread.title) return;
                const postDate = thread.date ? Math.floor(new Date(thread.date).getTime() / 1000) : Math.floor(Date.now() / 1000);
                sqlContent += `INSERT INTO xf_thread (node_id, title, reply_count, view_count, user_id, username, post_date, sticky, discussion_state, discussion_open, discussion_type, type_data, index_state, first_post_id, first_post_reaction_score, last_post_date, last_post_id, last_post_user_id, last_post_username, prefix_id, vote_count, featured)\n`;
                sqlContent += `SELECT\n`;
                sqlContent += `  1,\n`;
                sqlContent += `  '${thread.title.replace(/'/g, "''")}',\n`;
                sqlContent += `  0, 0,\n`;
                sqlContent += `  (SELECT user_id FROM xf_user WHERE username = '${thread.author.replace(/'/g, "''")}' LIMIT 1),\n`;
                sqlContent += `  '${thread.author.replace(/'/g, "''")}',\n`;
                sqlContent += `  ${postDate},\n`;
                sqlContent += `  0, 'visible', 1, 'discussion', NULL, 'default', NULL, 0, ${postDate}, NULL, NULL, '', 0, 0, 0\n`;
                sqlContent += `WHERE NOT EXISTS (SELECT 1 FROM xf_thread WHERE title = '${thread.title.replace(/'/g, "''")}' AND user_id = (SELECT user_id FROM xf_user WHERE username = '${thread.author.replace(/'/g, "''")}') AND post_date = ${postDate});\n`;
            });
            sqlContent += `\n`;
        }
        // POSTS
        if (filteredPosts.length > 0) {
            sqlContent += `-- Posts\n`;
            const postsSinHilo = [];
            const normalizeText = (text) => {
                return text.replace(/\s+/g, ' ').trim().toLowerCase();
            };
            const findThreadFlexible = (post, threads) => {
                const threadTitle = post.thread_title || '';
                const threadAuthor = post.thread_author || post.post_author || '';
                const threadDate = post.thread_date ? Math.floor(new Date(post.thread_date).getTime() / 1000) : 0;
                if (!threadTitle) return null;
                const normalizedTitle = normalizeText(threadTitle);
                const normalizedAuthor = normalizeText(threadAuthor);
                let thread = Array.from(threads.values()).find(t => 
                    normalizeText(t.title) === normalizedTitle &&
                    normalizeText(t.author) === normalizedAuthor &&
                    Math.abs(t.date ? Math.floor(new Date(t.date).getTime() / 1000) - threadDate : 0) < 3600
                );
                if (thread) return thread;
                thread = Array.from(threads.values()).find(t => 
                    normalizeText(t.title) === normalizedTitle &&
                    Math.abs(t.date ? Math.floor(new Date(t.date).getTime() / 1000) - threadDate : 0) < 86400
                );
                if (thread) return thread;
                const cleanTitle = normalizedTitle.replace(/[^\w\s]/g, '');
                thread = Array.from(threads.values()).find(t => {
                    const cleanThreadTitle = normalizeText(t.title).replace(/[^\w\s]/g, '');
                    return cleanThreadTitle === cleanTitle &&
                           Math.abs(t.date ? Math.floor(new Date(t.date).getTime() / 1000) - threadDate : 0) < 86400;
                });
                return thread;
            };
            filteredPosts.forEach(post => {
                if (!post || !post.post_content) return;
                let message = post.post_content
                    .replace(/<[^>]+>/g, ' ')
                    .replace(/\s+/g, ' ')
                    .replace(/'/g, "''")
                    .trim();
                let postDate = 0;
                if (typeof post.post_date === 'string') {
                    const d = new Date(post.post_date);
                    postDate = isNaN(d.getTime()) ? 0 : Math.floor(d.getTime() / 1000);
                } else if (typeof post.post_date === 'number') {
                    postDate = post.post_date;
                }
                const thread = findThreadFlexible(post, uniqueThreads);
                if (!thread) {
                    postsSinHilo.push({ 
                        post_id: post.post_id, 
                        post_author: post.post_author, 
                        thread_title: post.thread_title, 
                        thread_author: post.thread_author, 
                        thread_date: post.thread_date, 
                        post_date: post.post_date, 
                        message: post.post_content 
                    });
                    return;
                }
                const threadTitle = thread.title.replace(/'/g, "''");
                const threadAuthor = thread.author.replace(/'/g, "''");
                const threadDate = thread.date ? Math.floor(new Date(thread.date).getTime() / 1000) : Math.floor(Date.now() / 1000);
                sqlContent += `INSERT INTO xf_post (thread_id, user_id, username, post_date, message, ip_id, message_state, attach_count, position, type_data, reaction_score, reactions, reaction_users, vote_score, vote_count, warning_id, warning_message, last_edit_date, last_edit_user_id, edit_count, embed_metadata)\n`;
                sqlContent += `SELECT\n`;
                sqlContent += `  (SELECT thread_id FROM xf_thread WHERE title = '${threadTitle}' AND user_id = (SELECT user_id FROM xf_user WHERE username = '${threadAuthor}') AND post_date = ${threadDate} LIMIT 1),\n`;
                sqlContent += `  (SELECT user_id FROM xf_user WHERE username = '${(post.post_author || '').replace(/'/g, "''")} ' LIMIT 1),\n`;
                sqlContent += `  '${(post.post_author || '').replace(/'/g, "''")}',\n`;
                sqlContent += `  ${postDate},\n`;
                sqlContent += `  '${message}',\n`;
                sqlContent += `  0,\n`;
                sqlContent += `  'visible',\n`;
                sqlContent += `  0,\n`;
                sqlContent += `  0,\n`;
                sqlContent += `  NULL,\n`;
                sqlContent += `  0,\n`;
                sqlContent += `  NULL,\n`;
                sqlContent += `  NULL,\n`;
                sqlContent += `  0,\n`;
                sqlContent += `  0,\n`;
                sqlContent += `  NULL,\n`;
                sqlContent += `  NULL,\n`;
                sqlContent += `  0,\n`;
                sqlContent += `  NULL\n`;
                sqlContent += `WHERE NOT EXISTS (SELECT 1 FROM xf_post WHERE thread_id = (SELECT thread_id FROM xf_thread WHERE title = '${threadTitle}' AND user_id = (SELECT user_id FROM xf_user WHERE username = '${threadAuthor}') AND post_date = ${threadDate} LIMIT 1) AND user_id = (SELECT user_id FROM xf_user WHERE username = '${(post.post_author || '').replace(/'/g, "''")} ' LIMIT 1) AND post_date = ${postDate} AND message = '${message}');\n`;
            });
            sqlContent += `\n`;
            if (postsSinHilo.length > 0) {
                fs.writeFileSync('posts_sin_hilo.json', JSON.stringify(postsSinHilo, null, 2));
                console.log(`⚠️  ${postsSinHilo.length} posts no pudieron mapearse a un hilo y fueron registrados en posts_sin_hilo.json`);
            }
        }
        fs.writeFileSync(sqlFile, sqlContent);
        console.log(`🗄️  SQL saved to: ${sqlFile}`);
        
        // Resumen final profesional
        console.log('\n──────────────────────────────');
        console.log('📊 Extraction summary');
        console.log('──────────────────────────────');
        console.log(`✅ Forums processed: ${forums.length}`);
        console.log(`✅ Threads extracted: ${uniqueThreads.size}`);
        console.log(`✅ Posts extracted: ${filteredPosts.length}`);
        console.log(`👥 Users found: ${uniqueUsers.size}`);
        if (postsSinHilo && postsSinHilo.length > 0) {
            console.log(`⚠️  Posts without thread: ${postsSinHilo.length} (see posts_sin_hilo.json)`);
        } else {
            console.log('✅ All posts mapped to threads');
        }
        if (completeData.errors && completeData.errors.length > 0) {
            console.log(`⚠️  Errors: ${completeData.errors.length}`);
        } else {
            console.log('✅ No errors');
        }
        console.log('\n──────────────────────────────');
        console.log('🎉 Enhanced hybrid scraping completed successfully!');
        console.log('──────────────────────────────\n');
        
    } catch (error) {
        console.error('❌ Error in enhanced hybrid scraper:', error);
    } finally {
        rl.close();
        await browser.close();
    }
}

enhancedHybridScraper().catch(console.error); 