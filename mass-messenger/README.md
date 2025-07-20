# Mass Messenger for XenForo (Puppeteer)

This module allows you to automate the creation of test accounts, send private messages in bulk, and clean up test users on a XenForo forum using Puppeteer and session cookies.

## Structure
- `registerTestUsers.js`: Script to create test accounts automatically
- `sendMessages.js`: Main script to send bulk private messages
- `cleanupTestUsers.js`: Script to deactivate or delete test accounts
- `users.json`: List of target users (auto-populated by registration script)
- `message_template.txt`: Message template with placeholders
- `sent_messages.json`: Log of sent messages and errors
- `config.js`: Centralized configuration (supports environment variables)
- `utils/`: Utility functions (logging, file, Puppeteer helpers)
- `logs/`: Detailed logs per execution, organized by action and type

## Usage
1. Adjust `config.js` as needed or set environment variables for your workflow.
2. Run `registerTestUsers.js` to create test accounts (users will be saved to `users.json`).
3. Edit `message_template.txt` to customize the message content.
4. Run `sendMessages.js` to send messages in bulk to test users.
5. Run `cleanupTestUsers.js` to deactivate or delete test accounts after testing.
6. Review logs in the `logs/` folder for detailed execution, errors, and results.

## Requirements
- Node.js >= 16
- Puppeteer

## Best Practices & Security
- **Never use real user data or accounts for testing.** Only use test accounts created in the development environment.
- **Do not share this script, cookies, or credentials with third parties.**
- All logs are stored per execution and separated by action for easy auditing and debugging.
- The system implements robust error handling, automatic retries, and safe delays to avoid spamming or being blocked by the forum.
- All configuration can be managed via `config.js` or environment variables for CI/CD and reproducibility.
- Scripts are modular and can be extended for new test scenarios or forum versions.

## Warning
**This tool is for development and testing purposes only. Do not use in production environments or with real user data.**

---

For more details, see comments in each script and the configuration file. 