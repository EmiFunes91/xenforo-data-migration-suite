const axios = require('axios');
const cheerio = require('cheerio');
const { wrapper } = require('axios-cookiejar-support');
const { CookieJar } = require('tough-cookie');
const fs = require('fs').promises;
const path = require('path');

const BASE_URL = 'https://www.offshorecorptalk.com';
const LOGIN_URL = `${BASE_URL}/login/login`;
const BACKUP_CODE = '636882647';
const USERNAME = 'emilio.ifunes@hotmail.es';
const PASSWORD = 'iiVS3m965D6!tuJ';

const jar = new CookieJar();
const client = wrapper(axios.create({
  jar,
  withCredentials: true,
  headers: { 
    'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
  }
}));

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Scraper unificado para OCT - Combina todas las funcionalidades
 * - Login robusto con 2FA
 * - Exploración de foros generales
 * - Acceso a contenido premium
 * - Extracción de threads y posts
 * - Generación de dumps SQL
 */
class UnifiedOCTScraper {
  constructor() {
    this.isLoggedIn = false;
    this.sessionData = {};
    this.rateLimitDelay = 1500;
    this.maxRetries = 3;
    this.extractedData = {
      forums: [],
      threads: [],
      posts: [],
      users: new Map(),
      premiumContent: [],
      resources: [],
      privateMessages: []
    };
  }

  /**
   * Login robusto con 2FA
   */
  async login() {
    try {
      console.log('🔐 Iniciando login...');
      
      const loginPage = await client.get(LOGIN_URL);
      const $ = cheerio.load(loginPage.data);
      const csrfToken = $('input[name="_xfToken"]').val();
      
      if (!csrfToken) {
        throw new Error('CSRF token no encontrado');
      }
      
      const loginPayload = new URLSearchParams({
        login: USERNAME,
        password: PASSWORD,
        remember: '1',
        _xfToken: csrfToken,
        _xfRedirect: BASE_URL
      });
      
      const loginResponse = await client.post(LOGIN_URL, loginPayload, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          Referer: LOGIN_URL
        },
        maxRedirects: 0,
        validateStatus: status => status === 200 || status === 302 || status === 303
      });
      
      if (loginResponse.status === 302 || loginResponse.status === 303) {
        const redirectLocation = loginResponse.headers.location;
        if (redirectLocation && redirectLocation.includes('/two-step')) {
          await this.handle2FA();
        }
      }
      
      const homepage = await client.get(BASE_URL);
      const $$$ = cheerio.load(homepage.data);
      const usernameText = $$$('.p-navgroup-link--user').text().trim();
      
      if (usernameText) {
        console.log(`✅ Login exitoso como: ${usernameText}`);
        this.isLoggedIn = true;
        this.sessionData.username = usernameText;
        return true;
      } else {
        console.log('❌ Login falló');
        return false;
      }
      
    } catch (error) {
      console.error('❌ Error en login:', error.message);
      return false;
    }
  }

  /**
   * Manejar 2FA
   */
  async handle2FA() {
    try {
      const twoStepPage = await client.get(
        `${BASE_URL}/login/two-step?provider=backup&remember=1&_xfRedirect=${encodeURIComponent(BASE_URL)}`
      );
      
      const $$ = cheerio.load(twoStepPage.data);
      const twoFactorToken = $$('input[name="_xfToken"]').val();
      
      if (twoFactorToken) {
        const twoStepPayload = new URLSearchParams({
          provider: 'backup',
          code: BACKUP_CODE,
          trust: '1',
          remember: '1',
          confirm: '1',
          _xfToken: twoFactorToken,
          _xfRedirect: BASE_URL
        });
        
        const twoStepResponse = await client.post(`${BASE_URL}/login/two-step`, twoStepPayload, {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Origin': BASE_URL,
            'Referer': `${BASE_URL}/login/two-step`
          },
          maxRedirects: 0,
          validateStatus: status => [200, 302, 303].includes(status)
        });
        
        console.log('✅ 2FA completado');
      }
    } catch (error) {
      throw new Error(`Error en 2FA: ${error.message}`);
    }
  }

  /**
   * Explorar estructura general del sitio
   */
  async exploreSiteStructure() {
    console.log('🏗️ Explorando estructura general del sitio...');
    
    try {
      const response = await client.get(BASE_URL);
      const $ = cheerio.load(response.data);
      
      // Buscar enlaces a foros
      $('a[href*="/forums/"]').each((i, element) => {
        const $el = $(element);
        const href = $el.attr('href');
        const text = $el.text().trim();
        
        if (href && text) { // Procesar todos los foros
          this.extractedData.forums.push({
            title: text,
            url: href.startsWith('http') ? href : `${BASE_URL}${href}`,
            source: 'main_page'
          });
        }
      });
      
      console.log(`📊 Foros encontrados en página principal: ${this.extractedData.forums.length}`);
      
    } catch (error) {
      console.error('❌ Error explorando estructura:', error.message);
    }
  }

  /**
   * Explorar foros premium confirmados
   */
  async explorePremiumForums() {
    console.log('💎 Explorando foros premium...');
    
    const premiumForums = [
      { name: 'Secret Forums', url: `${BASE_URL}/forums/secret.123/` },
      { name: 'Premium Forums', url: `${BASE_URL}/forums/premium.123/` },
      { name: 'Mentor Forums', url: `${BASE_URL}/forums/mentor.123/` },
      { name: 'Gold Forums', url: `${BASE_URL}/forums/gold.123/` },
      { name: 'VIP Forums', url: `${BASE_URL}/forums/vip.123/` }
    ];

    for (const forum of premiumForums) {
      try {
        console.log(`🔍 Explorando: ${forum.name}`);
        const response = await client.get(forum.url);
        const $ = cheerio.load(response.data);
        
        const pageTitle = $('title').text().trim();
        console.log(`📄 Título: ${pageTitle}`);
        
        // Extraer threads del foro premium
        await this.extractForumThreads(forum.url, forum.name, true);
        
        await sleep(this.rateLimitDelay);
        
      } catch (error) {
        console.error(`❌ Error explorando ${forum.name}: ${error.message}`);
        continue;
      }
    }
  }

  /**
   * Explorar foros generales
   */
  async exploreGeneralForums() {
    console.log('📂 Explorando foros generales...');
    
    const generalForums = [
      { name: 'Foros principales', url: `${BASE_URL}/forums/` },
      { name: 'Recursos', url: `${BASE_URL}/resources/` },
      { name: 'Miembros', url: `${BASE_URL}/members/` },
      { name: 'Artículos', url: `${BASE_URL}/articles/` }
    ];

    for (const forum of generalForums) {
      try {
        console.log(`🔍 Explorando: ${forum.name}`);
        const response = await client.get(forum.url);
        const $ = cheerio.load(response.data);
        
        await this.extractForumThreads(forum.url, forum.name, false);
        
        await sleep(this.rateLimitDelay);
        
      } catch (error) {
        console.error(`❌ Error explorando ${forum.name}: ${error.message}`);
        continue;
      }
    }
  }

  /**
   * Extraer threads de un foro
   */
  async extractForumThreads(forumUrl, forumName, isPremium = false) {
    try {
      const response = await client.get(forumUrl);
      const $ = cheerio.load(response.data);
      
      // Buscar enlaces a threads
      $('a[href*="/threads/"]').each(async (i, element) => {
        const $el = $(element);
        const threadUrl = $el.attr('href');
        const threadTitle = $el.text().trim();
        
        if (threadUrl && threadTitle) { // Procesar todos los threads
          try {
            const fullThreadUrl = threadUrl.startsWith('http') ? threadUrl : `${BASE_URL}${threadUrl}`;
            console.log(`   📄 Procesando thread: ${threadTitle.substring(0, 50)}...`);
            
            const threadData = await this.extractThreadContent(fullThreadUrl, forumName, isPremium);
            
            if (threadData) {
              this.extractedData.threads.push(threadData.thread);
              this.extractedData.posts.push(...threadData.posts);
              
              // Extraer usuarios
              threadData.users.forEach(user => {
                this.extractedData.users.set(user.username, user);
              });
            }
            
            await sleep(this.rateLimitDelay);
            
          } catch (error) {
            console.log(`   ❌ Error extrayendo thread ${threadUrl}: ${error.message}`);
          }
        }
      });
      
    } catch (error) {
      console.error(`❌ Error extrayendo threads del foro ${forumName}: ${error.message}`);
    }
  }

  /**
   * Extraer contenido de un thread específico
   */
  async extractThreadContent(threadUrl, forumName, isPremium = false) {
    try {
      const response = await client.get(threadUrl);
      const $ = cheerio.load(response.data);
      
      // Extraer información del thread
      const threadTitle = $('.p-title-value, .thread-title').text().trim();
      const threadId = this.extractThreadId(threadUrl);
      const threadAuthor = $('.p-description .username, .thread-author').first().text().trim();
      const threadDate = $('.p-description .u-dt, .thread-date').first().text().trim();
      
      const thread = {
        thread_id: threadId,
        title: threadTitle,
        author: threadAuthor,
        created_date: threadDate,
        url: threadUrl,
        forum: forumName,
        is_premium: isPremium,
        source: 'unified_scraper'
      };
      
      // Extraer posts
      const posts = [];
      const users = new Map();
      
      $('.message, .post').each((i, element) => {
        const $post = $(element);
        const postId = $post.attr('id') || $post.data('post-id');
        const postAuthor = $post.find('.username, .author').text().trim();
        const postDate = $post.find('.u-dt, .date').text().trim();
        const postContent = $post.find('.message-body, .content').html() || $post.find('.bbWrapper').html();
        
        if (postAuthor && postContent) {
          const post = {
            post_id: postId || `post_${threadId}_${i}`,
            thread_id: threadId,
            author: postAuthor,
            content: postContent,
            created_date: postDate,
            forum: forumName,
            is_premium: isPremium
          };
          
          posts.push(post);
          
          // Extraer usuario
          if (postAuthor) {
            users.set(postAuthor, {
              username: postAuthor,
              posts_count: (users.get(postAuthor)?.posts_count || 0) + 1,
              is_premium: isPremium
            });
          }
        }
      });
      
      return { thread, posts, users: Array.from(users.values()) };
      
    } catch (error) {
      console.error(`❌ Error extrayendo thread ${threadUrl}: ${error.message}`);
      return null;
    }
  }

  /**
   * Buscar contenido en rangos específicos
   */
  async searchSpecificRanges() {
    console.log('🔍 Buscando contenido en rangos específicos...');
    
    const ranges = [
      { start: 100, end: 150 },
      { start: 151, end: 200 },
      { start: 201, end: 250 },
      { start: 251, end: 300 }
    ];

    for (const range of ranges) {
      for (let id = range.start; id <= range.end; id++) {
        const urls = [
          `${BASE_URL}/forums/archive.${id}/`,
          `${BASE_URL}/forums/secret.${id}/`,
          `${BASE_URL}/forums/premium.${id}/`,
          `${BASE_URL}/forums/mentor.${id}/`,
          `${BASE_URL}/forums/gold.${id}/`
        ];
        
        for (const url of urls) {
          try {
            const response = await client.get(url);
            const $ = cheerio.load(response.data);
            const title = $('title').text().trim();
            
            if (title && !title.includes('Error') && !title.includes('Not Found')) {
              console.log(`✅ Contenido encontrado: ${url} - ${title}`);
              
              await this.extractForumThreads(url, `Forum-${id}`, true);
              
              break; // Encontramos uno, pasamos al siguiente rango
            }
            
          } catch (error) {
            // Ignorar errores 404
            continue;
          }
        }
        
        await sleep(500);
      }
    }
  }

  /**
   * Extraer ID de thread de URL
   */
  extractThreadId(url) {
    const match = url.match(/threads\/([^\/]+)\.(\d+)/);
    return match ? match[2] : `thread_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Guardar resultados
   */
  async saveResults(filename = null) {
    if (!filename) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      filename = `unified-oct-data-${timestamp}.json`;
    }
    
    const data = {
      metadata: {
        generated_at: new Date().toISOString(),
        scraper_type: 'unified_oct_scraper',
        description: 'Datos extraídos usando scraper unificado - foros generales y premium'
      },
      forums: this.extractedData.forums,
      threads: this.extractedData.threads,
      posts: this.extractedData.posts,
      users: Array.from(this.extractedData.users.values()),
      premium_content: this.extractedData.premiumContent,
      resources: this.extractedData.resources,
      private_messages: this.extractedData.privateMessages
    };
    
    await fs.writeFile(filename, JSON.stringify(data, null, 2));
    console.log(`💾 Datos guardados en: ${filename}`);
    
    return data;
  }

  /**
   * Generar dump SQL para XenForo
   */
  async generateSQLDump(data, jsonFilename) {
    console.log('🗄️ Generando dump SQL para XenForo...');
    
    let sql = `-- XenForo Unified OCT Data Import
-- Generated from OCT using Unified Scraper
-- Date: ${new Date().toISOString()}

-- Users
INSERT INTO xf_user (username, email, register_date, last_activity, user_state) VALUES\n`;
    
    data.users.forEach((user, index) => {
      const email = `${user.username.replace(/[^a-zA-Z0-9]/g, '')}@unified.oct`;
      const registerDate = Math.floor(Date.now() / 1000) - (Math.random() * 86400 * 365);
      const lastActivity = Math.floor(Date.now() / 1000);
      
      sql += `('${user.username.replace(/'/g, "''")}', '${email}', ${registerDate}, ${lastActivity}, 'valid')`;
      if (index < data.users.length - 1) sql += ',\n';
    });
    
    sql += `;\n\n-- Threads\nINSERT INTO xf_thread (thread_id, title, user_id, node_id, first_post_id, last_post_id, reply_count, view_count, discussion_open, discussion_state, discussion_type, post_date, last_post_date) VALUES\n`;
    
    data.threads.forEach((thread, index) => {
      const userId = data.users.find(u => u.username === thread.author)?.user_id || 1;
      const postDate = Math.floor(new Date(thread.created_date || Date.now()).getTime() / 1000);
      const lastPostDate = postDate + (Math.random() * 86400 * 30);
      
      sql += `(${thread.thread_id}, '${thread.title.replace(/'/g, "''")}', ${userId}, 1, ${thread.thread_id}, ${thread.thread_id}, 0, 0, 1, 'visible', 'discussion', ${postDate}, ${lastPostDate})`;
      if (index < data.threads.length - 1) sql += ',\n';
    });
    
    sql += `;\n\n-- Posts\nINSERT INTO xf_post (post_id, thread_id, user_id, username, post_date, message, message_state, ip_id) VALUES\n`;
    
    data.posts.forEach((post, index) => {
      const userId = data.users.find(u => u.username === post.author)?.user_id || 1;
      const postDate = Math.floor(new Date(post.created_date || Date.now()).getTime() / 1000);
      const message = post.content.replace(/'/g, "''").replace(/<[^>]*>/g, ''); // Limpiar HTML
      
      sql += `(${post.post_id}, ${post.thread_id}, ${userId}, '${post.author.replace(/'/g, "''")}', ${postDate}, '${message}', 'visible', 1)`;
      if (index < data.posts.length - 1) sql += ',\n';
    });
    
    sql += ';';
    
    const sqlFilename = jsonFilename.replace('.json', '.sql');
    await fs.writeFile(sqlFilename, sql);
    console.log(`🗄️ SQL dump guardado en: ${sqlFilename}`);
    
    return sql;
  }

  /**
   * Ejecutar scraper completo
   */
  async run() {
    try {
      console.log('🚀 Iniciando Unified OCT Scraper...');
      
      // Login
      const loginSuccess = await this.login();
      if (!loginSuccess) {
        throw new Error('No se pudo hacer login');
      }
      
      // Explorar estructura general
      await this.exploreSiteStructure();
      
      // Explorar foros premium
      await this.explorePremiumForums();
      
      // Explorar foros generales
      await this.exploreGeneralForums();
      
      // Buscar en rangos específicos
      await this.searchSpecificRanges();
      
      // Guardar resultados
      const data = await this.saveResults();
      
      // Generar SQL
      await this.generateSQLDump(data, `unified-oct-data-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
      
      console.log('\n✅ Unified OCT Scraper completado exitosamente!');
      console.log(`📊 Resumen:`);
      console.log(`   Foros explorados: ${data.forums.length}`);
      console.log(`   Threads extraídos: ${data.threads.length}`);
      console.log(`   Posts extraídos: ${data.posts.length}`);
      console.log(`   Usuarios encontrados: ${data.users.length}`);
      console.log(`   Contenido premium: ${data.premium_content.length}`);
      
      return data;
      
    } catch (error) {
      console.error('❌ Error en Unified OCT Scraper:', error.message);
      throw error;
    }
  }
}

// Función principal
async function main() {
  const scraper = new UnifiedOCTScraper();
  
  try {
    await scraper.run();
  } catch (error) {
    console.error('❌ Error fatal:', error.message);
    process.exit(1);
  }
}

// Ejecutar si es el archivo principal
if (require.main === module) {
  main();
}

module.exports = UnifiedOCTScraper; 