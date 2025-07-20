# 🚀 XenForo Migration Tool

**Professional migration tool for importing data from OffshoreCorpTalk to XenForo**

[![Node.js](https://img.shields.io/badge/Node.js-16+-green.svg)](https://nodejs.org/)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/Version-1.0.0-orange.svg)](package.json)

## 📋 Overview

This professional-grade migration tool provides a complete solution for importing forum data from OffshoreCorpTalk (OCT) to XenForo. It features incremental scraping, robust checkpoint management, visual validation, and comprehensive reporting.

### ✨ Key Features

- ✅ **Incremental Scraping** with checkpoint recovery
- ✅ **Professional CLI** with Commander.js
- ✅ **Visual Validation** of migrated content
- ✅ **BBCode Conversion** from HTML
- ✅ **Data Integrity Checks** between databases
- ✅ **Comprehensive Reporting** (JSON + HTML)
- ✅ **Error Recovery** and logging
- ✅ **Backup Management** before operations

## 🏗️ Architecture

```
OCT (OffshoreCorpTalk) → Scraper → PostgreSQL → Migrator → XenForo (MariaDB)
                                    ↓
                              Checkpoints & Validation
```

## 🚀 Quick Start

### 1. Installation

```bash
# Clone the repository
git clone <repository-url>
cd xenforo-migration-tool

# Install dependencies
npm install

# Make CLI executable
chmod +x cli-migration.js
```

### 2. Configuration

Create a `.env` file with your database credentials:

```env
# PostgreSQL (Source)
PG_HOST=localhost
PG_PORT=5432
PG_USER=your_user
PG_PASSWORD=your_password
PG_DATABASE=your_database

# MariaDB/MySQL (XenForo)
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=your_user
MYSQL_PASSWORD=your_password
MYSQL_DATABASE=xenforo
```

### 3. Basic Usage

```bash
# Check status
node cli-migration.js status

# Scrape from OCT (with checkpoint)
node cli-migration.js scrape --from-date 2024-05-09 --resume

# Migrate to XenForo (with backup)
node cli-migration.js migrate --backup-before --resume

# Validate migrated data
node cli-migration.js validate --visual --format --output report.json
```

## 📖 Command Reference

### Scraping Commands

```bash
# Basic scraping
node cli-migration.js scrape --from-date 2024-05-09

# Scraping with options
node cli-migration.js scrape \
  --from-date 2024-05-09 \
  --to-date 2024-12-31 \
  --dry-run \
  --batch-size 500 \
  --delay 2000

# Resume from checkpoint
node cli-migration.js scrape --resume

# Clear checkpoint and start fresh
node cli-migration.js scrape --clear-checkpoint
```

### Migration Commands

```bash
# Basic migration
node cli-migration.js migrate

# Migration with backup
node cli-migration.js migrate --backup-before

# Validate only (no actual migration)
node cli-migration.js migrate --validate-only

# Migrate from specific ID
node cli-migration.js migrate --from-id 12345

# Resume from checkpoint
node cli-migration.js migrate --resume
```

### Validation Commands

```bash
# Full validation
node cli-migration.js validate --visual --data --format

# Visual validation only
node cli-migration.js validate --visual

# Save report to file
node cli-migration.js validate --visual --output validation-report.json
```

### Checkpoint Management

```bash
# Show checkpoint status
node cli-migration.js checkpoint --status

# Clear checkpoint
node cli-migration.js checkpoint --clear

# Create checkpoint backup
node cli-migration.js checkpoint --backup
```

### Status and Monitoring

```bash
# Show comprehensive status
node cli-migration.js status

# Show help
node cli-migration.js help
```

## 🔧 Advanced Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PG_HOST` | PostgreSQL host | localhost |
| `PG_PORT` | PostgreSQL port | 5432 |
| `PG_USER` | PostgreSQL user | - |
| `PG_PASSWORD` | PostgreSQL password | - |
| `PG_DATABASE` | PostgreSQL database | - |
| `MYSQL_HOST` | MariaDB host | localhost |
| `MYSQL_PORT` | MariaDB port | 3306 |
| `MYSQL_USER` | MariaDB user | - |
| `MYSQL_PASSWORD` | MariaDB password | - |
| `MYSQL_DATABASE` | MariaDB database | - |

### CLI Options

| Option | Description | Default |
|--------|-------------|---------|
| `--verbose, -v` | Enable verbose logging | false |
| `--config <file>` | Configuration file path | .env |
| `--checkpoint-file <file>` | Checkpoint file path | migration-checkpoint.json |

## 📊 Validation & Quality

The tool provides comprehensive validation including:

### Visual Validation
- ✅ Spacing and formatting checks
- ✅ Image tag validation
- ✅ Code block verification
- ✅ Quote structure analysis
- ✅ Link integrity checks

### Data Integrity
- ✅ User count comparison
- ✅ Post count verification
- ✅ Database consistency checks
- ✅ Referential integrity validation

### BBCode Quality
- ✅ Tag structure validation
- ✅ Malformed tag detection
- ✅ Conversion accuracy checks
- ✅ Formatting consistency

## 📈 Quality Metrics

The validation system provides a quality score (0-100) with letter grades:

- **A (90-100)**: Excellent quality
- **B (80-89)**: Good quality
- **C (70-79)**: Acceptable quality
- **D (60-69)**: Needs improvement
- **F (0-59)**: Poor quality

## 🔍 Troubleshooting

### Common Issues

#### 1. Database Connection Errors
```bash
# Check database connectivity
node cli-migration.js status

# Verify credentials in .env file
cat .env
```

#### 2. Checkpoint Issues
```bash
# Clear checkpoint and start fresh
node cli-migration.js checkpoint --clear

# Check checkpoint status
node cli-migration.js checkpoint --status
```

#### 3. Memory Issues
```bash
# Reduce batch size
node cli-migration.js scrape --batch-size 100

# Increase Node.js memory limit
node --max-old-space-size=4096 cli-migration.js scrape
```

#### 4. Rate Limiting
```bash
# Increase delay between requests
node cli-migration.js scrape --delay 3000
```

### Error Recovery

The tool includes automatic error recovery:

1. **Checkpoint Recovery**: Resume from last successful point
2. **Error Logging**: Detailed error tracking in checkpoints
3. **Backup Management**: Automatic backups before operations
4. **Graceful Degradation**: Continue processing despite individual failures

## 📁 File Structure

```
xenforo-migration-tool/
├── cli-migration.js          # Main CLI interface
├── checkpoint-manager.js     # Checkpoint management
├── visual-validator.js       # Validation system
├── final-xenforo-gold-scraper.js  # OCT scraper
├── migrate_pg_to_xf.js       # Migration engine
├── backup_mariadb.js         # Backup utility
├── restore_dump.js           # Restore utility
├── package.json              # Dependencies
├── README.md                 # This file
├── .env                      # Configuration (create this)
├── migration-checkpoint.json # Checkpoint file (auto-generated)
└── checkpoints/              # Checkpoint backups (auto-generated)
```

## 🧪 Testing

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run specific test file
npx jest visual-validator.test.js
```

## 📝 Logging

The tool uses Winston for professional logging:

- **Console Output**: Real-time progress and status
- **Error Logging**: Detailed error tracking
- **Checkpoint Logging**: Progress persistence
- **Validation Reports**: Comprehensive quality reports

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

For support and questions:

1. Check the troubleshooting section
2. Review the validation reports
3. Check checkpoint status
4. Create an issue with detailed error information

## 🔄 Version History

- **v1.0.0**: Initial release with checkpoint system, CLI, and validation
- **v0.9.0**: Beta version with basic migration functionality
- **v0.8.0**: Alpha version with scraper and migrator

---

## Scraper Usage (Node.js)

This project exports a main scraper function for use in CLI tools and automation scripts.

> **Note:**  
> The file `final-xenforo-gold-scraper.js` no longer runs any scraping logic automatically when imported.  
> You must explicitly call the exported `runScraper` function with the desired mode.
> 
> **Duplicate Handling:**  
> The migration tool uses `INSERT IGNORE` for `xf_post` to automatically skip duplicate `post_id` entries. This ensures robust, idempotent batch operations and allows safe re-runs without data corruption.
> 
> **404 Error Handling:**  
> During scraping, some thread or post URLs may return a 404 error (not found). This is expected for deleted or moved content and does not interrupt the migration. The process logs these events and continues with the next item.

### Import and Usage

```js
const { runScraper } = require('./final-xenforo-gold-scraper');

// Run the default batch posts scraper
await runScraper({ mode: 'batchPosts' });

// Other available modes:
await runScraper({ mode: 'forum' });
await runScraper({ mode: 'posts' });
await runScraper({ mode: 'batchUsers' });
await runScraper({ mode: 'batch' });
```

### Available Modes

- `batchPosts`: Scrapes posts in batch mode (default).
- `forum`: Scrapes forums.
- `posts`: Scrapes posts.
- `batchUsers`: Scrapes users in batch mode.
- `batch`: Runs a custom batch process.

> See the code comments in `final-xenforo-gold-scraper.js` for more details.