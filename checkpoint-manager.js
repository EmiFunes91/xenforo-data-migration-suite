/**
 * Checkpoint Manager for XenForo Migration
 * Manages progress tracking and recovery for long-running operations
 */

const fs = require('fs').promises;
const path = require('path');

class CheckpointManager {
  constructor(options = {}) {
    this.checkpointFile = options.checkpointFile || 'migration-checkpoint.json';
    this.backupDir = options.backupDir || 'checkpoints';
    this.maxBackups = options.maxBackups || 5;
  }

  /**
   * Save current progress checkpoint
   * @param {Object} data - Checkpoint data
   * @param {string} data.operation - Operation type (scrape, migrate, etc.)
   * @param {number} data.lastProcessedId - Last processed ID
   * @param {string} data.lastProcessedDate - Last processed date
   * @param {number} data.totalProcessed - Total records processed
   * @param {Array} data.errors - Array of errors encountered
   * @param {Object} data.metadata - Additional metadata
   */
  async saveCheckpoint(data) {
    const checkpoint = {
      timestamp: new Date().toISOString(),
      operation: data.operation,
      lastProcessedId: data.lastProcessedId,
      lastProcessedDate: data.lastProcessedDate,
      totalProcessed: data.totalProcessed || 0,
      errors: data.errors || [],
      metadata: data.metadata || {},
      status: 'in_progress',
      version: '1.0.0'
    };

    try {
      // Ensure backup directory exists
      await this.ensureBackupDir();
      
      // Save current checkpoint
      await fs.writeFile(this.checkpointFile, JSON.stringify(checkpoint, null, 2));
      
      // Create timestamped backup
      await this.createBackup(checkpoint);
      
      console.log(`✅ Checkpoint saved: ${data.totalProcessed} records processed`);
      return checkpoint;
    } catch (error) {
      console.error(`❌ Failed to save checkpoint: ${error.message}`);
      throw error;
    }
  }

  /**
   * Load the latest checkpoint
   * @returns {Object|null} Checkpoint data or null if not found
   */
  async loadCheckpoint() {
    try {
      const data = await fs.readFile(this.checkpointFile, 'utf8');
      const checkpoint = JSON.parse(data);
      
      // Validate checkpoint format
      if (!this.validateCheckpoint(checkpoint)) {
        console.warn('⚠️ Invalid checkpoint format, starting fresh');
        return null;
      }
      
      return checkpoint;
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.log('ℹ️ No checkpoint found, starting fresh');
        return null;
      }
      console.error(`❌ Failed to load checkpoint: ${error.message}`);
      return null;
    }
  }

  /**
   * Resume from checkpoint if available
   * @param {string} operation - Operation type to resume
   * @returns {Object|null} Checkpoint data or null if not resuming
   */
  async resumeFromCheckpoint(operation) {
    const checkpoint = await this.loadCheckpoint();
    
    if (checkpoint && 
        checkpoint.operation === operation && 
        checkpoint.status === 'in_progress') {
      
      console.log(`🔄 Resuming ${operation} from checkpoint:`);
      console.log(`   📊 Total processed: ${checkpoint.totalProcessed}`);
      console.log(`   🆔 Last ID: ${checkpoint.lastProcessedId}`);
      console.log(`   📅 Last date: ${checkpoint.lastProcessedDate}`);
      console.log(`   ⏰ Timestamp: ${checkpoint.timestamp}`);
      
      if (checkpoint.errors.length > 0) {
        console.log(`   ⚠️ Previous errors: ${checkpoint.errors.length}`);
      }
      
      return checkpoint;
    }
    
    return null;
  }

  /**
   * Mark checkpoint as completed
   * @param {Object} data - Final data
   */
  async completeCheckpoint(data = {}) {
    try {
      const checkpoint = await this.loadCheckpoint();
      if (checkpoint) {
        checkpoint.status = 'completed';
        checkpoint.completedAt = new Date().toISOString();
        checkpoint.finalStats = {
          totalProcessed: data.totalProcessed || checkpoint.totalProcessed,
          totalErrors: data.totalErrors || checkpoint.errors.length,
          duration: data.duration || 'unknown'
        };
        
        await fs.writeFile(this.checkpointFile, JSON.stringify(checkpoint, null, 2));
        console.log(`✅ Checkpoint marked as completed`);
      }
    } catch (error) {
      console.error(`❌ Failed to complete checkpoint: ${error.message}`);
    }
  }

  /**
   * Clear checkpoint (start fresh)
   */
  async clearCheckpoint() {
    try {
      await fs.unlink(this.checkpointFile);
      console.log('🗑️ Checkpoint cleared');
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.error(`❌ Failed to clear checkpoint: ${error.message}`);
      }
    }
  }

  /**
   * Get checkpoint statistics
   * @returns {Object} Statistics about checkpoints
   */
  async getCheckpointStats() {
    try {
      const checkpoint = await this.loadCheckpoint();
      if (!checkpoint) {
        return { exists: false };
      }
      
      return {
        exists: true,
        operation: checkpoint.operation,
        status: checkpoint.status,
        totalProcessed: checkpoint.totalProcessed,
        lastProcessedId: checkpoint.lastProcessedId,
        lastProcessedDate: checkpoint.lastProcessedDate,
        errors: checkpoint.errors.length,
        age: this.getAge(checkpoint.timestamp)
      };
    } catch (error) {
      return { exists: false, error: error.message };
    }
  }

  /**
   * Create backup of checkpoint
   * @param {Object} checkpoint - Checkpoint data
   */
  async createBackup(checkpoint) {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupFile = path.join(this.backupDir, `checkpoint-${timestamp}.json`);
      
      await fs.writeFile(backupFile, JSON.stringify(checkpoint, null, 2));
      
      // Clean old backups
      await this.cleanOldBackups();
    } catch (error) {
      console.warn(`⚠️ Failed to create backup: ${error.message}`);
    }
  }

  /**
   * Clean old backup files
   */
  async cleanOldBackups() {
    try {
      const files = await fs.readdir(this.backupDir);
      const backupFiles = files
        .filter(file => file.startsWith('checkpoint-') && file.endsWith('.json'))
        .map(file => ({
          name: file,
          path: path.join(this.backupDir, file),
          time: fs.stat(path.join(this.backupDir, file)).then(stat => stat.mtime.getTime())
        }))
        .sort((a, b) => b.time - a.time);
      
      // Keep only the most recent backups
      for (let i = this.maxBackups; i < backupFiles.length; i++) {
        await fs.unlink(backupFiles[i].path);
      }
    } catch (error) {
      console.warn(`⚠️ Failed to clean old backups: ${error.message}`);
    }
  }

  /**
   * Ensure backup directory exists
   */
  async ensureBackupDir() {
    try {
      await fs.access(this.backupDir);
    } catch (error) {
      await fs.mkdir(this.backupDir, { recursive: true });
    }
  }

  /**
   * Validate checkpoint format
   * @param {Object} checkpoint - Checkpoint to validate
   * @returns {boolean} True if valid
   */
  validateCheckpoint(checkpoint) {
    const required = ['timestamp', 'operation', 'lastProcessedId', 'status'];
    return required.every(field => checkpoint.hasOwnProperty(field));
  }

  /**
   * Get age of timestamp
   * @param {string} timestamp - ISO timestamp
   * @returns {string} Human readable age
   */
  getAge(timestamp) {
    const age = Date.now() - new Date(timestamp).getTime();
    const minutes = Math.floor(age / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days} days ago`;
    if (hours > 0) return `${hours} hours ago`;
    if (minutes > 0) return `${minutes} minutes ago`;
    return 'just now';
  }

  /**
   * Add error to checkpoint
   * @param {Error} error - Error to add
   * @param {Object} context - Error context
   */
  async addError(error, context = {}) {
    try {
      const checkpoint = await this.loadCheckpoint();
      if (checkpoint) {
        checkpoint.errors.push({
          message: error.message,
          stack: error.stack,
          context,
          timestamp: new Date().toISOString()
        });
        
        await fs.writeFile(this.checkpointFile, JSON.stringify(checkpoint, null, 2));
      }
    } catch (err) {
      console.error(`❌ Failed to add error to checkpoint: ${err.message}`);
    }
  }
}

module.exports = CheckpointManager; 