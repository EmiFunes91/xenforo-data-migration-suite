// Forum Migration Script: Postgres → XenForo MariaDB
// ---------------------------------------------------
// This script migrates forum data from a local PostgreSQL instance into a XenForo MariaDB database.
// It is idempotent and can be re-run to import only new data. Batch processing and error logging are included.

require('dotenv').config();
const { Pool } = require('pg');
const mysql = require('mysql2/promise');
const winston = require('winston');
const cheerio = require('cheerio');

// ----------------------
// Logger setup
// ----------------------
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message }) => `${timestamp} [${level}]: ${message}`)
  ),
  transports: [new winston.transports.Console()]
});

// ----------------------
// Load environment variables
// ----------------------
const {
  PG_HOST, PG_PORT, PG_USER, PG_PASSWORD, PG_DATABASE,
  MYSQL_HOST, MYSQL_PORT, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DATABASE
} = process.env;

// ----------------------
// PostgreSQL connection pool
// ----------------------
const pgPool = new Pool({
  host: PG_HOST,
  port: PG_PORT,
  user: PG_USER,
  password: PG_PASSWORD,
  database: PG_DATABASE,
});

// ----------------------
// MariaDB connection pool (initialized later)
// ----------------------
let mysqlPool;
/**
 * Initialize the MariaDB connection pool.
 */
async function initMySQL() {
  mysqlPool = await mysql.createPool({
    host: MYSQL_HOST,
    port: MYSQL_PORT,
    user: MYSQL_USER,
    password: MYSQL_PASSWORD,
    database: MYSQL_DATABASE,
    waitForConnections: true,
    connectionLimit: 20, // Increased for better performance
    queueLimit: 0
  });
}

// ----------------------
// HTML to BBCode conversion
// ----------------------
/**
 * Convert HTML content to XenForo-compatible BBCode.
 * @param {string} html - The HTML string to convert.
 * @returns {string} - The converted BBCode string.
 */
function convertHtmlToBBCode(html) {
  const $ = cheerio.load(html);

  // Replace <br> with newlines
  $('br').replaceWith('\n');

  // Convert <ul><li> to [list][*]
  $('ul').each((_, ul) => {
    const listItems = $(ul).find('li').map((_, li) => `[*] ${$(li).text()}`).get().join('\n');
    $(ul).replaceWith(`[list]\n${listItems}\n[/list]`);
  });

  // Bold tags
  $('b, strong').each((_, el) => {
    $(el).replaceWith(`[b]${$(el).text()}[/b]`);
  });

  // Italic tags
  $('i, em').each((_, el) => {
    $(el).replaceWith(`[i]${$(el).text()}[/i]`);
  });

  // Links
  $('a').each((_, el) => {
    const href = $(el).attr('href');
    const text = $(el).text();
    $(el).replaceWith(`[url=${href}]${text}[/url]`);
  });

  // Flatten remaining <div>, <span>, etc. – just unwrap
  $('div, span').each((_, el) => {
    $(el).replaceWith($(el).html());
  });

  // Return the cleaned-up BBCode
  return $.root().text().trim();
}

// ----------------------
// Batch INSERT helper function
// ----------------------
/**
 * Insert records in batches for performance and error handling.
 * Falls back to individual inserts on batch failure.
 */
async function batchInsert(tableName, columns, values, batchSize = 1000) {
  if (values.length === 0) return;
  
  const columnList = columns.join(', ');
  const placeholders = `(${columns.map(() => '?').join(', ')})`;
  
  for (let i = 0; i < values.length; i += batchSize) {
    const batch = values.slice(i, i + batchSize);
    const batchPlaceholders = batch.map(() => placeholders).join(', ');
    const flatValues = batch.flat();
    
    try {
      await mysqlPool.query(
        `INSERT INTO ${tableName} (${columnList}) VALUES ${batchPlaceholders}`,
        flatValues
      );
      logger.info(`Batch inserted ${batch.length} records into ${tableName}`);
    } catch (err) {
      logger.error(`Failed to batch insert into ${tableName}: ${err.message}`);
      // Fallback to individual inserts for this batch
      for (const value of batch) {
        try {
          await mysqlPool.query(
            `INSERT INTO ${tableName} (${columnList}) VALUES (${columns.map(() => '?').join(', ')})`,
            value
          );
        } catch (individualErr) {
          logger.error(`Failed to insert individual record: ${individualErr.message}`);
        }
      }
    }
  }
}

// ----------------------
// Idempotency checks
// ----------------------
/**
 * Get a set of existing IDs from the target table to avoid duplicates.
 */
async function getExistingIds(tableName, idColumn, ids) {
  if (ids.length === 0) return new Set();
  
  const placeholders = ids.map(() => '?').join(', ');
  const [rows] = await mysqlPool.query(
    `SELECT ${idColumn} FROM ${tableName} WHERE ${idColumn} IN (${placeholders})`,
    ids
  );
  return new Set(rows.map(row => row[idColumn]));
}

// Helper: get latest date from MySQL for a table/column
async function getLatestDateFromMySQL(table, dateColumn) {
  try {
    const [rows] = await mysqlPool.query(
      `SELECT MAX(${dateColumn}) as latest FROM ${table}`
    );
    return rows[0].latest;
  } catch (err) {
    logger.warn(`Could not get latest date for ${table}.${dateColumn}: ${err.message}`);
    return null;
  }
}

// ----------------------
// Migration Functions
// ----------------------
// Each function migrates a specific table. They are idempotent and use batch processing.

/**
 * Utility to check if a value contains the offshorecorptalk.com domain.
 * @param {string} value
 * @returns {boolean}
 */
function containsOCTDomain(value) {
  return typeof value === 'string' && value.includes('offshorecorptalk.com');
}

/**
 * Utility to cleanse a string by removing the offshorecorptalk.com domain from URLs/content.
 * @param {string} value
 * @returns {string}
 */
function cleanseOCTDomain(value) {
  if (typeof value !== 'string') return value;
  // Remove the domain from URLs, but keep the rest of the text
  return value.replace(/https?:\/\/(www\.)?offshorecorptalk\.com/g, '');
}

/**
 * Migrate users from Postgres to MariaDB.
 */
async function migrateUsers() {
  logger.info('Migrating users...');
  const latestDate = await getLatestDateFromMySQL('users', 'created_at');
  logger.info(`Latest user created_at in MySQL: ${latestDate}`);
  const { rows: users } = await pgPool.query(
    'SELECT * FROM users WHERE created_at > $1',
    [latestDate || '1970-01-01']
  );
  const existingIds = await getExistingIds('users', 'id', users.map(u => u.id));
  // Exclude users whose link contains the domain
  const newUsers = users.filter(user =>
    !existingIds.has(user.id) && !containsOCTDomain(user.link)
  ).map(user => ({
    ...user,
    link: cleanseOCTDomain(user.link),
    avatar: cleanseOCTDomain(user.avatar),
    title: cleanseOCTDomain(user.title),
    location: cleanseOCTDomain(user.location)
  }));
  const skipped = users.length - newUsers.length;
  if (newUsers.length > 0) {
    const columns = ['id', 'username', 'link', 'title', 'avatar', 'created_at', 'updated_at', 'joined_at', 'badges', 'last_seen_at', 'link_is_accessible', 'location', 'age'];
    const values = newUsers.map(user => [
      user.id, user.username, user.link, user.title, user.avatar, 
      user.created_at, user.updated_at, user.joined_at, user.badges, 
      user.last_seen_at, user.link_is_accessible, user.location, user.age
    ]);
    await batchInsert('users', columns, values);
  }
  logger.info(`Users migrated: ${newUsers.length}, skipped: ${skipped}`);
  return users.reduce((map, user) => { map[user.id] = user.id; return map; }, {});
}

/**
 * Migrate forums from Postgres to MariaDB.
 */
async function migrateForums() {
  logger.info('Migrating forums...');
  const { rows: forums } = await pgPool.query('SELECT * FROM forums');
  const existingIds = await getExistingIds('forums', 'id', forums.map(f => f.id));
  // Exclude forums whose link contains the domain
  const newForums = forums.filter(forum =>
    !existingIds.has(forum.id) && !containsOCTDomain(forum.link)
  ).map(forum => ({
    ...forum,
    link: cleanseOCTDomain(forum.link),
    name: cleanseOCTDomain(forum.name)
  }));
  const skipped = forums.length - newForums.length;
  if (newForums.length > 0) {
    const columns = ['id', 'name', 'link', 'threads_pages_count', 'parent_forum_id'];
    const values = newForums.map(forum => [
      forum.id, forum.name, forum.link, forum.threads_pages_count, forum.parent_forum_id
    ]);
    await batchInsert('forums', columns, values);
  }
  logger.info(`Forums migrated: ${newForums.length}, skipped: ${skipped}`);
  return forums.reduce((map, forum) => { map[forum.id] = forum.id; return map; }, {});
}

/**
 * Migrate threads from Postgres to MariaDB.
 */
async function migrateThreads() {
  logger.info('Migrating threads...');
  const latestDate = await getLatestDateFromMySQL('threads', 'created_at');
  logger.info(`Latest thread created_at in MySQL: ${latestDate}`);
  const { rows: threads } = await pgPool.query(
    'SELECT * FROM threads WHERE created_at > $1',
    [latestDate || '1970-01-01']
  );
  const existingIds = await getExistingIds('threads', 'id', threads.map(t => t.id));
  // Exclude threads whose link or name contains the domain
  const newThreads = threads.filter(thread =>
    !existingIds.has(thread.id) && !containsOCTDomain(thread.link) && !containsOCTDomain(thread.name)
  ).map(thread => ({
    ...thread,
    link: cleanseOCTDomain(thread.link),
    name: cleanseOCTDomain(thread.name),
    tags: cleanseOCTDomain(thread.tags)
  }));
  const skipped = threads.length - newThreads.length;
  if (newThreads.length > 0) {
    const columns = ['id', 'name', 'link', 'replies', 'views', 'created_by_user_id', 'created_at', 'forum_id', 'forum_page_number', 'replies_pages_count', 'tags'];
    const values = newThreads.map(thread => [
      thread.id, thread.name, thread.link, thread.replies, thread.views,
      thread.created_by_user_id, thread.created_at, thread.forum_id,
      thread.forum_page_number, thread.replies_pages_count, thread.tags
    ]);
    await batchInsert('threads', columns, values);
  }
  logger.info(`Threads migrated: ${newThreads.length}, skipped: ${skipped}`);
  return threads.reduce((map, thread) => { map[thread.id] = thread.id; return map; }, {});
}

/**
 * Migrate replies from Postgres to MariaDB.
 */
async function migrateReplies() {
  logger.info('Migrating replies...');
  const latestDate = await getLatestDateFromMySQL('replies', 'created_at');
  logger.info(`Latest reply created_at in MySQL: ${latestDate}`);
  const { rows: replies } = await pgPool.query(
    'SELECT * FROM replies WHERE created_at > $1',
    [latestDate || '1970-01-01']
  );
  const existingIds = await getExistingIds('replies', 'id', replies.map(r => r.id));
  // Exclude replies whose content or link contains the domain
  const newReplies = replies.filter(reply =>
    !existingIds.has(reply.id) && !containsOCTDomain(reply.content) && !containsOCTDomain(reply.link)
  ).map(reply => ({
    ...reply,
    content: cleanseOCTDomain(reply.content),
    link: cleanseOCTDomain(reply.link)
  }));
  const skipped = replies.length - newReplies.length;
  if (newReplies.length > 0) {
    const columns = ['id', 'user_id', 'thread_id', 'content', 'created_at', 'thread_page_number', 'link'];
    const values = newReplies.map(reply => [
      reply.id, reply.user_id, reply.thread_id, reply.content,
      reply.created_at, reply.thread_page_number, reply.link
    ]);
    await batchInsert('replies', columns, values);
  }
  logger.info(`Replies migrated: ${newReplies.length}, skipped: ${skipped}`);
  return replies.reduce((map, reply) => { map[reply.id] = reply.id; return map; }, {});
}

/**
 * Migrate addresses from Postgres to MariaDB.
 */
async function migrateAddresses() {
  logger.info('Migrating addresses...');
  const latestDate = await getLatestDateFromMySQL('addresses', 'created_at');
  logger.info(`Latest address created_at in MySQL: ${latestDate}`);
  const { rows: addresses } = await pgPool.query(
    'SELECT * FROM addresses WHERE created_at > $1',
    [latestDate || '1970-01-01']
  );
  
  // Get existing address IDs
  const existingIds = await getExistingIds('addresses', 'id', addresses.map(a => a.id));
  
  // Filter out existing addresses
  const newAddresses = addresses.filter(address => !existingIds.has(address.id));
  const skipped = addresses.length - newAddresses.length;
  
  if (newAddresses.length > 0) {
    const columns = ['id', 'entity_id', 'address', 'city', 'state', 'country', 'postal_code', 'created_at', 'updated_at'];
    const values = newAddresses.map(address => [
      address.id, address.entity_id, address.address, address.city,
      address.state, address.country, address.postal_code, address.created_at, address.updated_at
    ]);
    
    await batchInsert('addresses', columns, values);
  }
  
  logger.info(`Addresses migrated: ${newAddresses.length}, skipped: ${skipped}`);
  return addresses.reduce((map, address) => { map[address.id] = address.id; return map; }, {});
}

/**
 * Migrate entities from Postgres to MariaDB.
 */
async function migrateEntities() {
  logger.info('Migrating entities...');
  const latestDate = await getLatestDateFromMySQL('entities', 'created_at');
  logger.info(`Latest entity created_at in MySQL: ${latestDate}`);
  const { rows: entities } = await pgPool.query(
    'SELECT * FROM entities WHERE created_at > $1',
    [latestDate || '1970-01-01']
  );
  
  // Get existing entity IDs
  const existingIds = await getExistingIds('entities', 'id', entities.map(e => e.id));
  
  // Filter out existing entities
  const newEntities = entities.filter(entity => !existingIds.has(entity.id));
  const skipped = entities.length - newEntities.length;
  
  if (newEntities.length > 0) {
    const columns = ['id', 'name', 'type', 'jurisdiction', 'registration_number', 'incorporation_date', 'status', 'source_url', 'created_at', 'updated_at'];
    const values = newEntities.map(entity => [
      entity.id, entity.name, entity.type, entity.jurisdiction,
      entity.registration_number, entity.incorporation_date, entity.status,
      entity.source_url, entity.created_at, entity.updated_at
    ]);
    
    await batchInsert('entities', columns, values);
  }
  
  logger.info(`Entities migrated: ${newEntities.length}, skipped: ${skipped}`);
  return entities.reduce((map, entity) => { map[entity.id] = entity.id; return map; }, {});
}

/**
 * Migrate missing_users from Postgres to MariaDB.
 */
async function migrateMissingUsers() {
  logger.info('Migrating missing_users...');
  const { rows: missingUsers } = await pgPool.query('SELECT * FROM missing_users');
  
  // Get existing missing user IDs
  const existingIds = await getExistingIds('missing_users', 'id', missingUsers.map(u => u.id));
  
  // Filter out existing missing users
  const newMissingUsers = missingUsers.filter(user => !existingIds.has(user.id));
  const skipped = missingUsers.length - newMissingUsers.length;
  
  if (newMissingUsers.length > 0) {
    const columns = ['id', 'user_real_id', 'was_parsed'];
    const values = newMissingUsers.map(user => [
      user.id, user.user_real_id, user.was_parsed
    ]);
    
    await batchInsert('missing_users', columns, values);
  }
  
  logger.info(`Missing users migrated: ${newMissingUsers.length}, skipped: ${skipped}`);
  return missingUsers.reduce((map, user) => { map[user.id] = user.id; return map; }, {});
}

/**
 * Migrate johnny_time_windows from Postgres to MariaDB.
 */
async function migrateJonyTimeWinds() {
  logger.info('Migrating johnny_time_windows...');
  const latestDate = await getLatestDateFromMySQL('johnny_time_windows', 'older_than_date');
  logger.info(`Latest johnny_time_windows older_than_date in MySQL: ${latestDate}`);
  const { rows: windows } = await pgPool.query(
    'SELECT * FROM johnny_time_windows WHERE older_than_date > $1',
    [latestDate || '1970-01-01']
  );
  
  // Get existing window IDs
  const existingIds = await getExistingIds('johnny_time_windows', 'id', windows.map(w => w.id));
  
  // Filter out existing windows
  const newWindows = windows.filter(window => !existingIds.has(window.id));
  const skipped = windows.length - newWindows.length;
  
  if (newWindows.length > 0) {
    const columns = ['id', 'link', 'older_than_date'];
    const values = newWindows.map(window => [
      window.id, window.link, window.older_than_date
    ]);
    
    await batchInsert('johnny_time_windows', columns, values);
  }
  
  logger.info(`Johnny time windows migrated: ${newWindows.length}, skipped: ${skipped}`);
  return windows.reduce((map, window) => { map[window.id] = window.id; return map; }, {});
}

/**
 * Migrate __drizzle_migrations from Postgres to MariaDB.
 */
async function migrateDrizzleMigrations() {
  logger.info('Migrating __drizzle_migrations...');
  const latestDate = await getLatestDateFromMySQL('__drizzle_migrations', 'created_at');
  console.log("latestDate: ", latestDate)
  logger.info(`Latest __drizzle_migrations created_at in MySQL: ${latestDate}`);
  const { rows: drizzles } = await pgPool.query(
    'SELECT * FROM __drizzle_migrations WHERE created_at > $1',
    [latestDate || 0]
  );
  
  // Get existing drizzle IDs
  const existingIds = await getExistingIds('__drizzle_migrations', 'id', drizzles.map(d => d.id));
  
  // Filter out existing drizzles
  const newDrizzles = drizzles.filter(drizzle => !existingIds.has(drizzle.id));
  const skipped = drizzles.length - newDrizzles.length;
  
  if (newDrizzles.length > 0) {
    const columns = ['id', 'hash', 'created_at'];
    const values = newDrizzles.map(drizzle => [
      drizzle.id, drizzle.hash, drizzle.created_at
    ]);
    
    await batchInsert('__drizzle_migrations', columns, values);
  }
  
  logger.info(`Drizzle migrations migrated: ${newDrizzles.length}, skipped: ${skipped}`);
  return drizzles.reduce((map, drizzle) => { map[drizzle.id] = drizzle.id; return map; }, {});
}

// ----------------------
// Table Creation Helper
// ----------------------
/**
 * Ensure required tables exist in the MariaDB database.
 */
async function ensureTables() {
  const tables = [
    {
      name: '__drizzle_migrations',
      schema: `
        CREATE TABLE IF NOT EXISTS \`__drizzle_migrations\` (
          id INT NOT NULL PRIMARY KEY,
          hash VARCHAR(255) NOT NULL,
          created_at BIGINT
        )
      `
    },
    {
      name: 'johnny_time_windows',
      schema: `
        CREATE TABLE IF NOT EXISTS \`johnny_time_windows\` (
          id INT NOT NULL PRIMARY KEY,
          link VARCHAR(255),
          older_than_date DATETIME
        )
      `
    },
    {
      name: 'missing_users',
      schema: `
        CREATE TABLE IF NOT EXISTS \`missing_users\` (
          id INT NOT NULL PRIMARY KEY,
          user_real_id INT,
          was_parsed BOOLEAN DEFAULT FALSE
        )
      `
    },
    {
      name: 'entities',
      schema: `
        CREATE TABLE IF NOT EXISTS \`entities\` (
          id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          type VARCHAR(100),
          jurisdiction VARCHAR(100),
          registration_number VARCHAR(100),
          incorporation_date TIMESTAMP,
          status VARCHAR(50),
          source_url TEXT,
          created_at TIMESTAMP,
          updated_at TIMESTAMP
        )
      `
    },
    {
      name: 'addresses',
      schema: `
        CREATE TABLE IF NOT EXISTS \`addresses\` (
          id INT NOT NULL PRIMARY KEY AUTO_INCREMENT,
          entity_id INT,
          address TEXT,
          city VARCHAR(100),
          state VARCHAR(100),
          country VARCHAR(100),
          postal_code VARCHAR(20),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
      `
    }
  ];
  
  for (const table of tables) {
    try {
      await mysqlPool.query(table.schema);
      logger.info(`Ensured table ${table.name} exists`);
    } catch (err) {
      logger.error(`Failed to create table ${table.name}: ${err.message}`);
    }
  }
}

// ----------------------
// BBCode Conversion Utility (Batch)
// ----------------------
/**
 * Convert all reply content from HTML to BBCode in batches.
 */
async function updateReplyContentToBBCodeBatch(batchSize = 500) {
  logger.info('Starting batched reply content conversion...');

  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const [rows] = await mysqlPool.query(
      'SELECT id, content FROM replies ORDER BY id LIMIT ? OFFSET ?',
      [batchSize, offset]
    );

    if (rows.length === 0) {
      hasMore = false;
      break;
    }

    const updates = rows.map(row => {
      const converted = convertHtmlToBBCode(row.content || '');
      return { id: row.id, content: converted };
    });

    const updatePromises = updates.map(({ id, content }) => {
      return mysqlPool.query('UPDATE replies SET content = ? WHERE id = ?', [content, id])
        .catch(err => {
          logger.error(`Failed to update reply ID ${id}: ${err.message}`);
        });
    });

    await Promise.all(updatePromises);

    logger.info(`Processed batch: ${offset} to ${offset + batchSize}`);
    offset += batchSize;
  }

  logger.info('Batched reply content conversion complete.');
}

// ----------------------
// Main Entrypoint
// ----------------------
/**
 * Main function to run the migration steps in order.
 */
async function main() {
  await initMySQL();
  // await ensureTables();
  
  // Uncomment the migrations you want to run
  await migrateUsers();
  // await migrateForums();
  // await migrateThreads();
  // await migrateReplies();
  // await migrateAddresses();
  // await migrateEntities();
  // await migrateMissingUsers();
  // await migrateJonyTimeWinds();
  // await migrateDrizzleMigrations();
  // await updateReplyContentToBBCodeBatch(1000);

  await pgPool.end();
  await mysqlPool.end();
  logger.info('Migration complete.');
}

main().catch(err => {
  logger.error(`Migration failed: ${err.message}`);
  process.exit(1);
});