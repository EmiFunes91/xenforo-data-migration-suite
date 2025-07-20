/**
 * Visual Validator for XenForo Migration
 * Validates visual formatting, data integrity, and BBCode conversion
 */

const mysql = require('mysql2/promise');
const { Pool } = require('pg');
const fs = require('fs').promises;
const path = require('path');

class VisualValidator {
  constructor(options = {}) {
    this.options = {
      mysqlConfig: {
        host: process.env.MYSQL_HOST,
        port: process.env.MYSQL_PORT,
        user: process.env.MYSQL_USER,
        password: process.env.MYSQL_PASSWORD,
        database: process.env.MYSQL_DATABASE,
      },
      pgConfig: {
        host: process.env.PG_HOST,
        port: process.env.PG_PORT,
        user: process.env.PG_USER,
        password: process.env.PG_PASSWORD,
        database: process.env.PG_DATABASE,
      },
      ...options
    };
    
    this.report = {
      timestamp: new Date().toISOString(),
      summary: {
        totalPosts: 0,
        postsWithImages: 0,
        postsWithCode: 0,
        postsWithQuotes: 0,
        postsWithLinks: 0,
        spacingIssues: 0,
        formattingIssues: 0,
        bbcodeIssues: 0,
        dataIntegrityIssues: 0
      },
      details: {
        spacingIssues: [],
        formattingIssues: [],
        bbcodeIssues: [],
        dataIntegrityIssues: []
      },
      recommendations: [],
      quality: {
        score: 0,
        grade: 'F'
      }
    };
  }

  /**
   * Run complete validation
   * @param {Object} options - Validation options
   * @returns {Object} Validation report
   */
  async runValidation(options = {}) {
    console.log('🔍 Starting comprehensive validation...');
    
    const startTime = Date.now();
    
    try {
      // Initialize database connections
      await this.initializeConnections();
      
      // Run different validation types
      if (options.visual !== false) {
        await this.validateVisualFormatting();
      }
      
      if (options.data !== false) {
        await this.validateDataIntegrity();
      }
      
      if (options.format !== false) {
        await this.validateBBCodeFormatting();
      }
      
      // Calculate quality score
      this.calculateQualityScore();
      
      // Generate recommendations
      this.generateRecommendations();
      
      const duration = Date.now() - startTime;
      this.report.duration = `${duration}ms`;
      
      console.log('✅ Validation completed');
      console.log(`📊 Quality Score: ${this.report.quality.score}/100 (${this.report.quality.grade})`);
      
      return this.report;
      
    } catch (error) {
      console.error(`❌ Validation failed: ${error.message}`);
      throw error;
    } finally {
      await this.closeConnections();
    }
  }

  /**
   * Initialize database connections
   */
  async initializeConnections() {
    try {
      this.mysqlPool = await mysql.createPool(this.options.mysqlConfig);
      this.pgPool = new Pool(this.options.pgConfig);
      
      console.log('🔗 Database connections established');
    } catch (error) {
      throw new Error(`Failed to connect to databases: ${error.message}`);
    }
  }

  /**
   * Close database connections
   */
  async closeConnections() {
    if (this.mysqlPool) {
      await this.mysqlPool.end();
    }
    if (this.pgPool) {
      await this.pgPool.end();
    }
  }

  /**
   * Validate visual formatting
   */
  async validateVisualFormatting() {
    console.log('👁️ Validating visual formatting...');
    
    try {
      // Get posts from MariaDB (XenForo)
      const [posts] = await this.mysqlPool.query(`
        SELECT id, content, username, created_at 
        FROM replies 
        ORDER BY id DESC 
        LIMIT 1000
      `);
      
      this.report.summary.totalPosts = posts.length;
      
      for (const post of posts) {
        this.validatePost(post);
      }
      
      console.log(`   📊 Analyzed ${posts.length} posts`);
      console.log(`   🖼️ Posts with images: ${this.report.summary.postsWithImages}`);
      console.log(`   💻 Posts with code: ${this.report.summary.postsWithCode}`);
      console.log(`   💬 Posts with quotes: ${this.report.summary.postsWithQuotes}`);
      console.log(`   🔗 Posts with links: ${this.report.summary.postsWithLinks}`);
      
    } catch (error) {
      console.error(`   ❌ Visual validation failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Validate individual post
   * @param {Object} post - Post data
   */
  validatePost(post) {
    const content = post.content || '';
    
    // Count different content types
    if (content.includes('[img]') || content.includes('<img')) {
      this.report.summary.postsWithImages++;
    }
    
    if (content.includes('[code]') || content.includes('<pre>')) {
      this.report.summary.postsWithCode++;
    }
    
    if (content.includes('[quote]') || content.includes('<blockquote>')) {
      this.report.summary.postsWithQuotes++;
    }
    
    if (content.includes('[url]') || content.includes('<a ')) {
      this.report.summary.postsWithLinks++;
    }
    
    // Check for spacing issues
    if (this.hasSpacingIssues(content)) {
      this.report.summary.spacingIssues++;
      this.report.details.spacingIssues.push({
        postId: post.id,
        username: post.username,
        issue: 'Spacing problem detected'
      });
    }
    
    // Check for formatting issues
    if (this.hasFormattingIssues(content)) {
      this.report.summary.formattingIssues++;
      this.report.details.formattingIssues.push({
        postId: post.id,
        username: post.username,
        issue: 'Formatting problem detected'
      });
    }
  }

  /**
   * Check for spacing issues
   * @param {string} content - Post content
   * @returns {boolean} True if issues found
   */
  hasSpacingIssues(content) {
    const issues = [
      /\n{4,}/, // Múltiples líneas vacías
      /\s{3,}/, // Múltiples espacios
      /^\s+$/,  // Líneas solo con espacios
      /\t/,     // Tabs (no recomendados)
    ];
    
    return issues.some(pattern => pattern.test(content));
  }

  /**
   * Check for formatting issues
   * @param {string} content - Post content
   * @returns {boolean} True if issues found
   */
  hasFormattingIssues(content) {
    const issues = [
      /\[b\]\s*\[\/b\]/, // Tags vacíos
      /\[i\]\s*\[\/i\]/,
      /\[url\].*?\[\/url\]/, // URLs sin texto
      /\[img\].*?\[\/img\]/, // Imágenes sin src
      /\[quote\].*?\[\/quote\]/, // Quotes vacíos
    ];
    
    return issues.some(pattern => pattern.test(content));
  }

  /**
   * Validate BBCode formatting
   */
  async validateBBCodeFormatting() {
    console.log('🎨 Validating BBCode formatting...');
    
    try {
      const [posts] = await this.mysqlPool.query(`
        SELECT id, content, username 
        FROM replies 
        WHERE content LIKE '%[%' OR content LIKE '%]%'
        ORDER BY id DESC 
        LIMIT 500
      `);
      
      for (const post of posts) {
        this.validateBBCode(post);
      }
      
      console.log(`   📊 Analyzed ${posts.length} posts with BBCode`);
      console.log(`   ⚠️ BBCode issues: ${this.report.summary.bbcodeIssues}`);
      
    } catch (error) {
      console.error(`   ❌ BBCode validation failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Validate BBCode in post
   * @param {Object} post - Post data
   */
  validateBBCode(post) {
    const content = post.content || '';
    
    // Check for malformed BBCode
    const bbcodeIssues = [
      {
        pattern: /\[([^\]]*)\](?!.*\[\/\1\])/g, // Opening tag without closing
        name: 'Unclosed BBCode tag'
      },
      {
        pattern: /\[\/([^\]]*)\](?!.*\[\1[^\]]*\])/g, // Closing tag without opening
        name: 'Unopened BBCode closing tag'
      },
      {
        pattern: /\[([^\]]*)\].*?\[\/\1\].*?\[\/\1\]/g, // Duplicate closing tags
        name: 'Duplicate closing BBCode tag'
      }
    ];
    
    for (const issue of bbcodeIssues) {
      if (issue.pattern.test(content)) {
        this.report.summary.bbcodeIssues++;
        this.report.details.bbcodeIssues.push({
          postId: post.id,
          username: post.username,
          issue: issue.name
        });
        break; // Only count once per post
      }
    }
  }

  /**
   * Validate data integrity
   */
  async validateDataIntegrity() {
    console.log('📊 Validating data integrity...');
    
    try {
      // Compare user counts
      const [mysqlUsers] = await this.mysqlPool.query('SELECT COUNT(*) as count FROM users');
      const pgUsers = await this.pgPool.query('SELECT COUNT(*) as count FROM users');
      
      const mysqlCount = mysqlUsers[0].count;
      const pgCount = pgUsers.rows[0].count;
      
      if (Math.abs(mysqlCount - pgCount) > 10) { // Allow small difference
        this.report.summary.dataIntegrityIssues++;
        this.report.details.dataIntegrityIssues.push({
          issue: 'User count mismatch',
          mysql: mysqlCount,
          postgres: pgCount,
          difference: Math.abs(mysqlCount - pgCount)
        });
      }
      
      // Compare post counts
      const [mysqlPosts] = await this.mysqlPool.query('SELECT COUNT(*) as count FROM replies');
      const pgPosts = await this.pgPool.query('SELECT COUNT(*) as count FROM replies');
      
      const mysqlPostCount = mysqlPosts[0].count;
      const pgPostCount = pgPosts.rows[0].count;
      
      if (Math.abs(mysqlPostCount - pgPostCount) > 50) { // Allow small difference
        this.report.summary.dataIntegrityIssues++;
        this.report.details.dataIntegrityIssues.push({
          issue: 'Post count mismatch',
          mysql: mysqlPostCount,
          postgres: pgPostCount,
          difference: Math.abs(mysqlPostCount - pgPostCount)
        });
      }
      
      console.log(`   👥 Users: MySQL=${mysqlCount}, PG=${pgCount}`);
      console.log(`   💬 Posts: MySQL=${mysqlPostCount}, PG=${pgPostCount}`);
      console.log(`   ⚠️ Data integrity issues: ${this.report.summary.dataIntegrityIssues}`);
      
    } catch (error) {
      console.error(`   ❌ Data integrity validation failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Calculate quality score
   */
  calculateQualityScore() {
    const total = this.report.summary.totalPosts;
    if (total === 0) {
      this.report.quality.score = 0;
      this.report.quality.grade = 'F';
      return;
    }
    
    // Calculate issues per post
    const spacingRate = this.report.summary.spacingIssues / total;
    const formattingRate = this.report.summary.formattingIssues / total;
    const bbcodeRate = this.report.summary.bbcodeIssues / total;
    const dataIntegrityRate = this.report.summary.dataIntegrityIssues / total;
    
    // Weight different issues
    const score = 100 - (
      spacingRate * 20 +      // Spacing issues: 20% weight
      formattingRate * 30 +   // Formatting issues: 30% weight
      bbcodeRate * 40 +       // BBCode issues: 40% weight
      dataIntegrityRate * 10  // Data integrity: 10% weight
    );
    
    this.report.quality.score = Math.round(Math.max(0, score));
    this.report.quality.grade = this.getGrade(this.report.quality.score);
  }

  /**
   * Get letter grade from score
   * @param {number} score - Quality score
   * @returns {string} Letter grade
   */
  getGrade(score) {
    if (score >= 90) return 'A';
    if (score >= 80) return 'B';
    if (score >= 70) return 'C';
    if (score >= 60) return 'D';
    return 'F';
  }

  /**
   * Generate recommendations
   */
  generateRecommendations() {
    const recommendations = [];
    
    if (this.report.summary.spacingIssues > 0) {
      recommendations.push({
        priority: 'Medium',
        action: 'Fix spacing issues in posts',
        count: this.report.summary.spacingIssues,
        impact: 'Improves readability'
      });
    }
    
    if (this.report.summary.formattingIssues > 0) {
      recommendations.push({
        priority: 'High',
        action: 'Fix formatting issues in posts',
        count: this.report.summary.formattingIssues,
        impact: 'Improves visual consistency'
      });
    }
    
    if (this.report.summary.bbcodeIssues > 0) {
      recommendations.push({
        priority: 'Critical',
        action: 'Fix malformed BBCode tags',
        count: this.report.summary.bbcodeIssues,
        impact: 'Prevents display errors'
      });
    }
    
    if (this.report.summary.dataIntegrityIssues > 0) {
      recommendations.push({
        priority: 'Critical',
        action: 'Investigate data integrity issues',
        count: this.report.summary.dataIntegrityIssues,
        impact: 'Ensures data consistency'
      });
    }
    
    if (this.report.summary.postsWithImages === 0) {
      recommendations.push({
        priority: 'Medium',
        action: 'Verify image conversion process',
        count: 0,
        impact: 'Ensures images are properly migrated'
      });
    }
    
    this.report.recommendations = recommendations;
  }

  /**
   * Save report to file
   * @param {string} filename - Output filename
   */
  async saveReport(filename = null) {
    if (!filename) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      filename = `validation-report-${timestamp}.json`;
    }
    
    try {
      await fs.writeFile(filename, JSON.stringify(this.report, null, 2));
      console.log(`📄 Report saved to: ${filename}`);
      return filename;
    } catch (error) {
      console.error(`❌ Failed to save report: ${error.message}`);
      throw error;
    }
  }

  /**
   * Generate HTML report
   * @param {string} filename - Output filename
   */
  async generateHTMLReport(filename = null) {
    if (!filename) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      filename = `validation-report-${timestamp}.html`;
    }
    
    const html = this.generateHTML();
    
    try {
      await fs.writeFile(filename, html);
      console.log(`📄 HTML report saved to: ${filename}`);
      return filename;
    } catch (error) {
      console.error(`❌ Failed to save HTML report: ${error.message}`);
      throw error;
    }
  }

  /**
   * Generate HTML content
   * @returns {string} HTML report
   */
  generateHTML() {
    return `
<!DOCTYPE html>
<html>
<head>
    <title>XenForo Migration Validation Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .header { text-align: center; border-bottom: 2px solid #007cba; padding-bottom: 20px; margin-bottom: 30px; }
        .score { font-size: 48px; font-weight: bold; margin: 20px 0; }
        .grade-a { color: #28a745; }
        .grade-b { color: #17a2b8; }
        .grade-c { color: #ffc107; }
        .grade-d { color: #fd7e14; }
        .grade-f { color: #dc3545; }
        .metric { background: #f8f9fa; padding: 15px; margin: 10px 0; border-radius: 5px; border-left: 4px solid #007cba; }
        .metric h3 { margin: 0 0 10px 0; color: #333; }
        .issue { background: #fff3cd; padding: 10px; margin: 5px 0; border-radius: 3px; border-left: 4px solid #ffc107; }
        .critical { border-left-color: #dc3545; background: #f8d7da; }
        .recommendation { background: #d1ecf1; padding: 10px; margin: 5px 0; border-radius: 3px; border-left: 4px solid #17a2b8; }
        .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin: 20px 0; }
        .summary-item { background: #e9ecef; padding: 15px; border-radius: 5px; text-align: center; }
        .summary-item h4 { margin: 0; color: #495057; }
        .summary-item .value { font-size: 24px; font-weight: bold; color: #007cba; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>XenForo Migration Validation Report</h1>
            <p>Generated on ${new Date(this.report.timestamp).toLocaleString()}</p>
            <div class="score grade-${this.report.quality.grade.toLowerCase()}">
                ${this.report.quality.score}/100 (${this.report.quality.grade})
            </div>
        </div>

        <div class="summary">
            <div class="summary-item">
                <h4>Total Posts</h4>
                <div class="value">${this.report.summary.totalPosts}</div>
            </div>
            <div class="summary-item">
                <h4>Posts with Images</h4>
                <div class="value">${this.report.summary.postsWithImages}</div>
            </div>
            <div class="summary-item">
                <h4>Posts with Code</h4>
                <div class="value">${this.report.summary.postsWithCode}</div>
            </div>
            <div class="summary-item">
                <h4>Posts with Quotes</h4>
                <div class="value">${this.report.summary.postsWithQuotes}</div>
            </div>
        </div>

        <div class="metric">
            <h3>Issues Found</h3>
            <p><strong>Spacing Issues:</strong> ${this.report.summary.spacingIssues}</p>
            <p><strong>Formatting Issues:</strong> ${this.report.summary.formattingIssues}</p>
            <p><strong>BBCode Issues:</strong> ${this.report.summary.bbcodeIssues}</p>
            <p><strong>Data Integrity Issues:</strong> ${this.report.summary.dataIntegrityIssues}</p>
        </div>

        <div class="metric">
            <h3>Recommendations</h3>
            ${this.report.recommendations.map(rec => `
                <div class="recommendation ${rec.priority.toLowerCase() === 'critical' ? 'critical' : ''}">
                    <strong>${rec.priority}:</strong> ${rec.action} (${rec.count} items)
                    <br><small>Impact: ${rec.impact}</small>
                </div>
            `).join('')}
        </div>

        <div class="metric">
            <h3>Report Details</h3>
            <p><strong>Duration:</strong> ${this.report.duration || 'Unknown'}</p>
            <p><strong>Quality Score:</strong> ${this.report.quality.score}/100</p>
            <p><strong>Grade:</strong> ${this.report.quality.grade}</p>
        </div>
    </div>
</body>
</html>`;
  }
}

/**
 * Run validation with CLI options
 * @param {Object} options - Validation options
 * @returns {Object} Validation report
 */
async function runValidation(options = {}) {
  const validator = new VisualValidator();
  const report = await validator.runValidation(options);
  
  // Save reports if output file specified
  if (options.outputFile) {
    await validator.saveReport(options.outputFile);
    await validator.generateHTMLReport(options.outputFile.replace('.json', '.html'));
  }
  
  return report;
}

module.exports = {
  VisualValidator,
  runValidation
}; 