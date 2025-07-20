#!/usr/bin/env node

/**
 * XenForo Migration CLI Tool
 * Professional command-line interface for OCT to XenForo migration
 */

const { Command } = require('commander');
const CheckpointManager = require('./checkpoint-manager');
const path = require('path');
const fs = require('fs').promises;

// Initialize CLI
const program = new Command();

program
  .name('xenforo-migration')
  .description('Professional XenForo Migration CLI Tool')
  .version('1.0.0');

// Global options
program
  .option('--verbose, -v', 'Enable verbose logging')
  .option('--config <file>', 'Configuration file path', '.env')
  .option('--checkpoint-file <file>', 'Checkpoint file path', 'migration-checkpoint.json');

// Checkpoint management commands
program
  .command('checkpoint')
  .description('Manage checkpoints')
  .option('--status', 'Show checkpoint status')
  .option('--clear', 'Clear checkpoint (start fresh)')
  .option('--backup', 'Create backup of current checkpoint')
  .action(async (options) => {
    const checkpointManager = new CheckpointManager({
      checkpointFile: program.opts().checkpointFile
    });

    if (options.status) {
      const stats = await checkpointManager.getCheckpointStats();
      if (stats.exists) {
        console.log('📊 Checkpoint Status:');
        console.log(`   Operation: ${stats.operation}`);
        console.log(`   Status: ${stats.status}`);
        console.log(`   Total Processed: ${stats.totalProcessed}`);
        console.log(`   Last ID: ${stats.lastProcessedId}`);
        console.log(`   Last Date: ${stats.lastProcessedDate}`);
        console.log(`   Errors: ${stats.errors}`);
        console.log(`   Age: ${stats.age}`);
      } else {
        console.log('ℹ️ No checkpoint found');
      }
    } else if (options.clear) {
      await checkpointManager.clearCheckpoint();
    } else if (options.backup) {
      const checkpoint = await checkpointManager.loadCheckpoint();
      if (checkpoint) {
        await checkpointManager.createBackup(checkpoint);
        console.log('✅ Checkpoint backup created');
      } else {
        console.log('ℹ️ No checkpoint to backup');
      }
    } else {
      console.log('Use --status, --clear, or --backup');
    }
  });

// Scraping command
program
  .command('scrape')
  .description('Scrape data from OffshoreCorpTalk')
  .option('--from-date <date>', 'Start date (YYYY-MM-DD)', '2025-05-09')
  .option('--to-date <date>', 'End date (YYYY-MM-DD)')
  .option('--dry-run', 'Test mode without saving')
  .option('--resume', 'Resume from checkpoint')
  .option('--clear-checkpoint', 'Clear checkpoint before starting')
  .option('--batch-size <size>', 'Batch size for processing', '1000')
  .option('--delay <ms>', 'Delay between requests (ms)', '1000')
  .action(async (options) => {
    console.log('🔍 Starting OCT scraping...');
    console.log(`📅 From: ${options.fromDate}`);
    console.log(`📅 To: ${options.toDate || 'now'}`);
    console.log(`🧪 Dry run: ${options.dryRun ? 'Yes' : 'No'}`);
    console.log(`🔄 Resume: ${options.resume ? 'Yes' : 'No'}`);
    console.log(`📦 Batch size: ${options.batchSize}`);
    console.log(`⏱️ Delay: ${options.delay}ms`);

    const checkpointManager = new CheckpointManager({
      checkpointFile: program.opts().checkpointFile
    });

    // Clear checkpoint if requested
    if (options.clearCheckpoint) {
      await checkpointManager.clearCheckpoint();
    }

    // Resume from checkpoint if requested
    let resumeData = null;
    if (options.resume) {
      resumeData = await checkpointManager.resumeFromCheckpoint('scrape');
    }

    try {
      // Import and run scraper
      const { runScraper } = require('./final-xenforo-gold-scraper');
      
      const scraperOptions = {
        fromDate: options.fromDate,
        toDate: options.toDate,
        dryRun: options.dryRun,
        batchSize: parseInt(options.batchSize),
        delay: parseInt(options.delay),
        resumeData,
        checkpointManager
      };

      await runScraper(scraperOptions);
      
      // Mark checkpoint as completed
      await checkpointManager.completeCheckpoint({
        totalProcessed: resumeData?.totalProcessed || 0,
        duration: 'completed'
      });

    } catch (error) {
      console.error(`❌ Scraping failed: ${error.message}`);
      
      // Add error to checkpoint
      await checkpointManager.addError(error, {
        operation: 'scrape',
        options: options
      });
      
      process.exit(1);
    }
  });

// Migration command
program
  .command('migrate')
  .description('Migrate data to XenForo')
  .option('--validate-only', 'Only validate, no migration')
  .option('--backup-before', 'Create backup before migration')
  .option('--from-id <id>', 'Start from specific ID')
  .option('--resume', 'Resume from checkpoint')
  .option('--clear-checkpoint', 'Clear checkpoint before starting')
  .option('--batch-size <size>', 'Batch size for processing', '1000')
  .action(async (options) => {
    console.log('🔄 Starting migration...');
    console.log(`🔍 Validate only: ${options.validateOnly ? 'Yes' : 'No'}`);
    console.log(`💾 Backup before: ${options.backupBefore ? 'Yes' : 'No'}`);
    console.log(`🆔 From ID: ${options.fromId || 'beginning'}`);
    console.log(`🔄 Resume: ${options.resume ? 'Yes' : 'No'}`);
    console.log(`📦 Batch size: ${options.batchSize}`);

    const checkpointManager = new CheckpointManager({
      checkpointFile: program.opts().checkpointFile
    });

    // Clear checkpoint if requested
    if (options.clearCheckpoint) {
      await checkpointManager.clearCheckpoint();
    }

    // Resume from checkpoint if requested
    let resumeData = null;
    if (options.resume) {
      resumeData = await checkpointManager.resumeFromCheckpoint('migrate');
    }

    try {
      // Create backup if requested
      if (options.backupBefore) {
        console.log('💾 Creating backup...');
        const { exec } = require('child_process');
        const backupCmd = 'node backup_mariadb.js';
        
        await new Promise((resolve, reject) => {
          exec(backupCmd, (error, stdout, stderr) => {
            if (error) {
              console.error(`❌ Backup failed: ${error.message}`);
              reject(error);
            } else {
              console.log('✅ Backup completed');
              resolve();
            }
          });
        });
      }

      // Import and run migrator
      const { runMigration } = require('./migrate_pg_to_xf');
      
      const migrationOptions = {
        validateOnly: options.validateOnly,
        fromId: options.fromId ? parseInt(options.fromId) : null,
        batchSize: parseInt(options.batchSize),
        resumeData,
        checkpointManager
      };

      await runMigration(migrationOptions);
      
      // Mark checkpoint as completed
      await checkpointManager.completeCheckpoint({
        totalProcessed: resumeData?.totalProcessed || 0,
        duration: 'completed'
      });

    } catch (error) {
      console.error(`❌ Migration failed: ${error.message}`);
      
      // Add error to checkpoint
      await checkpointManager.addError(error, {
        operation: 'migrate',
        options: options
      });
      
      process.exit(1);
    }
  });

// Validation command
program
  .command('validate')
  .description('Validate migrated data')
  .option('--visual', 'Perform visual validation')
  .option('--data', 'Perform data integrity validation')
  .option('--format', 'Validate BBCode formatting')
  .option('--output <file>', 'Output validation report to file')
  .action(async (options) => {
    console.log('🔍 Starting validation...');
    console.log(`👁️ Visual: ${options.visual ? 'Yes' : 'No'}`);
    console.log(`📊 Data: ${options.data ? 'Yes' : 'No'}`);
    console.log(`🎨 Format: ${options.format ? 'Yes' : 'No'}`);

    try {
      // Import and run validator
      const { runValidation } = require('./visual-validator');
      
      const validationOptions = {
        visual: options.visual,
        data: options.data,
        format: options.format,
        outputFile: options.output
      };

      const report = await runValidation(validationOptions);
      
      console.log('✅ Validation completed');
      console.log(`📊 Report: ${JSON.stringify(report, null, 2)}`);

    } catch (error) {
      console.error(`❌ Validation failed: ${error.message}`);
      process.exit(1);
    }
  });

// Status command
program
  .command('status')
  .description('Show migration status and statistics')
  .action(async () => {
    console.log('📊 Migration Status Report');
    console.log('========================');

    const checkpointManager = new CheckpointManager({
      checkpointFile: program.opts().checkpointFile
    });

    // Checkpoint status
    const stats = await checkpointManager.getCheckpointStats();
    if (stats.exists) {
      console.log('\n🔄 Checkpoint Status:');
      console.log(`   Operation: ${stats.operation}`);
      console.log(`   Status: ${stats.status}`);
      console.log(`   Total Processed: ${stats.totalProcessed}`);
      console.log(`   Last ID: ${stats.lastProcessedId}`);
      console.log(`   Last Date: ${stats.lastProcessedDate}`);
      console.log(`   Errors: ${stats.errors}`);
      console.log(`   Age: ${stats.age}`);
    } else {
      console.log('\nℹ️ No active checkpoint');
    }

    // Database status (if available)
    try {
      const { Pool } = require('pg');
      const mysql = require('mysql2/promise');
      
      // Check PostgreSQL
      const pgPool = new Pool({
        host: process.env.PG_HOST,
        port: process.env.PG_PORT,
        user: process.env.PG_USER,
        password: process.env.PG_PASSWORD,
        database: process.env.PG_DATABASE,
      });

      const pgResult = await pgPool.query('SELECT COUNT(*) as count FROM users');
      console.log(`\n📊 PostgreSQL Users: ${pgResult.rows[0].count}`);
      
      await pgPool.end();

      // Check MariaDB
      const mysqlPool = await mysql.createPool({
        host: process.env.MYSQL_HOST,
        port: process.env.MYSQL_PORT,
        user: process.env.MYSQL_USER,
        password: process.env.MYSQL_PASSWORD,
        database: process.env.MYSQL_DATABASE,
      });

      const [mysqlResult] = await mysqlPool.query('SELECT COUNT(*) as count FROM users');
      console.log(`📊 MariaDB Users: ${mysqlResult[0].count}`);
      
      await mysqlPool.end();

    } catch (error) {
      console.log('\n⚠️ Could not check database status:', error.message);
    }

    // File status
    try {
      const files = await fs.readdir('.');
      const dumpFiles = files.filter(f => f.endsWith('.sql') || f.endsWith('.dump'));
      
      if (dumpFiles.length > 0) {
        console.log('\n📁 Dump Files:');
        for (const file of dumpFiles) {
          const stats = await fs.stat(file);
          const size = (stats.size / 1024 / 1024).toFixed(2);
          console.log(`   ${file} (${size} MB)`);
        }
      }
    } catch (error) {
      console.log('\n⚠️ Could not check file status:', error.message);
    }
  });

// Help command
program
  .command('help')
  .description('Show detailed help')
  .action(() => {
    console.log(`
XenForo Migration CLI - Professional Tool

USAGE:
  node cli-migration.js <command> [options]

COMMANDS:
  scrape     Scrape data from OffshoreCorpTalk
  migrate    Migrate data to XenForo
  validate   Validate migrated data
  checkpoint Manage checkpoints
  status     Show migration status
  help       Show this help

EXAMPLES:
  # Scrape from May 9th with checkpoint
  node cli-migration.js scrape --from-date 2025-05-09 --resume

  # Migrate with backup
  node cli-migration.js migrate --backup-before --resume

  # Validate visual formatting
  node cli-migration.js validate --visual --format

  # Check status
  node cli-migration.js status

  # Clear checkpoint and start fresh
  node cli-migration.js checkpoint --clear

GLOBAL OPTIONS:
  --verbose, -v           Enable verbose logging
  --config <file>         Configuration file path
  --checkpoint-file <file> Checkpoint file path

For more information, visit: [documentation-url]
    `);
  });

// Error handling
program.exitOverride();

try {
  program.parse();
} catch (err) {
  if (err.code === 'commander.help') {
    console.log(program.helpInformation());
  } else {
    console.error(`❌ Error: ${err.message}`);
    process.exit(1);
  }
}

module.exports = { program }; 