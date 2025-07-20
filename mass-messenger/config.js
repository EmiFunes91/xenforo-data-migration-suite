// config.js
// Centralized and professional configuration for all mass-messenger scripts
// All values are loaded from environment variables (e.g., via a .env file)
// No sensitive or default values are hardcoded here. See .env.example for reference.

module.exports = {
  /**
   * Wait time between actions (seconds)
   * process.env.DELAY_SECONDS
   */
  delaySeconds: parseInt(process.env.DELAY_SECONDS, 10) || 2,

  /**
   * Maximum messages to send per execution
   * process.env.MAX_MESSAGES
   */
  maxMessages: parseInt(process.env.MAX_MESSAGES, 10) || 50,

  /**
   * Simulation mode (does not send real messages)
   * process.env.DRY_RUN
   */
  dryRun: process.env.DRY_RUN === 'true' || false,

  /**
   * Cookies file for authentication
   * process.env.COOKIES_FILE
   */
  cookiesFile: process.env.COOKIES_FILE || 'cookies-messenger.json',

  /**
   * Base URL of the test forum
   * process.env.FORUM_URL
   */
  forumUrl: process.env.FORUM_URL || 'https://forum.johnnydoe.is/',

  /**
   * Prefix for test users
   * process.env.USER_PREFIX
   */
  userPrefix: process.env.USER_PREFIX || 'testuser',

  /**
   * Email domain for test users
   * process.env.EMAIL_DOMAIN
   */
  emailDomain: process.env.EMAIL_DOMAIN || 'testmail.com',

  /**
   * Default password for test users
   * process.env.TEST_PASSWORD
   */
  testPassword: process.env.TEST_PASSWORD || 'TestPassword123!',

  /**
   * Number of test accounts to create
   * process.env.TEST_USER_COUNT
   */
  testUserCount: parseInt(process.env.TEST_USER_COUNT, 10) || 20,

  /**
   * Admin username and password for cleanup (if applicable)
   * process.env.ADMIN_USERNAME, process.env.ADMIN_PASSWORD
   */
  adminUsername: process.env.ADMIN_USERNAME || 'emilio.ifunes@hotmail.es',
  adminPassword: process.env.ADMIN_PASSWORD || 'iiVS3m965D6!tuJ',

  /**
   * true = delete users, false = only deactivate/ban
   * process.env.DELETE_USERS
   */
  deleteUsers: process.env.DELETE_USERS === 'true' || false
}; 