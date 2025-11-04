/**
 * Generate Secure Access Codes Script
 * 
 * This script generates random 16-character access codes for admin distribution.
 * Codes are stored in MongoDB and admin can view them via MongoDB Compass.
 * 
 * Usage:
 *   npm run generate-codes -- --count 10 --max-uses 1 --description "Batch 1"
 *   node scripts/generate-access-codes.js --count 5 --expires-in 30
 * 
 * Options:
 *   --count <number>        Number of codes to generate (default: 1)
 *   --max-uses <number>     Maximum uses per code (default: 1)
 *   --description <string>  Description/batch name (default: "Generated on [date]")
 *   --expires-in <days>     Days until expiration (default: null = no expiration)
 */

import dotenv from 'dotenv';
import mongoose from 'mongoose';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// Import AccessCode model
import AccessCode from '../src/models/accessCodeModel.js';

/**
 * Generate cryptographically secure random code
 * @param {number} length - Length of the code (default: 16)
 * @returns {string} - Random alphanumeric code
 */
function generateSecureCode(length = 16) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No confusing chars: I, O, 0, 1
    let code = '';
    
    // Use crypto.randomInt for cryptographically secure random numbers
    for (let i = 0; i < length; i++) {
        const randomIndex = crypto.randomInt(0, chars.length);
        code += chars[randomIndex];
    }
    
    return code;
}

/**
 * Check if code already exists in database
 * @param {string} code - Code to check
 * @returns {Promise<boolean>} - True if exists
 */
async function codeExists(code) {
    const existing = await AccessCode.findOne({ code });
    return !!existing;
}

/**
 * Generate multiple unique access codes
 * @param {number} count - Number of codes to generate
 * @param {number} maxUses - Maximum uses per code
 * @param {string} description - Batch description
 * @param {number|null} expiresInDays - Days until expiration (null = no expiration)
 */
async function generateCodes(count = 1, maxUses = 1, description = null, expiresInDays = null) {
    try {
        // Connect to MongoDB
        console.log('🔌 Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });
        console.log('✅ Connected to MongoDB\n');

        // Default description
        const defaultDescription = `Generated on ${new Date().toLocaleString('vi-VN')}`;
        const finalDescription = description || defaultDescription;

        // Calculate expiration date
        let expiresAt = null;
        if (expiresInDays) {
            expiresAt = new Date();
            expiresAt.setDate(expiresAt.getDate() + expiresInDays);
        }

        console.log('⚙️  Configuration:');
        console.log(`   Count: ${count}`);
        console.log(`   Max Uses: ${maxUses}`);
        console.log(`   Description: ${finalDescription}`);
        console.log(`   Expires: ${expiresAt ? expiresAt.toLocaleString('vi-VN') : 'Never'}\n`);

        const generatedCodes = [];
        let attempts = 0;
        const maxAttempts = count * 10; // Prevent infinite loop

        console.log('🔐 Generating access codes...\n');

        while (generatedCodes.length < count && attempts < maxAttempts) {
            attempts++;
            
            // Generate unique code
            const code = generateSecureCode(16);
            
            // Check if already exists
            if (await codeExists(code)) {
                console.log(`⚠️  Code ${code} already exists, regenerating...`);
                continue;
            }

            // Create new access code
            const accessCode = new AccessCode({
                code,
                maxUses,
                description: finalDescription,
                expiresAt,
                isActive: true
            });

            await accessCode.save();
            generatedCodes.push(code);

            console.log(`✅ [${generatedCodes.length}/${count}] ${code}`);
        }

        if (generatedCodes.length < count) {
            console.log(`\n⚠️  Warning: Only generated ${generatedCodes.length}/${count} codes after ${maxAttempts} attempts`);
        }

        console.log('\n' + '='.repeat(60));
        console.log('📋 GENERATED ACCESS CODES');
        console.log('='.repeat(60));
        console.log(`Total: ${generatedCodes.length} codes\n`);

        generatedCodes.forEach((code, index) => {
            console.log(`${(index + 1).toString().padStart(2, '0')}. ${code}`);
        });

        console.log('\n' + '='.repeat(60));
        console.log('📊 Summary:');
        console.log('='.repeat(60));
        console.log(`✅ Successfully generated: ${generatedCodes.length}`);
        console.log(`📦 Max uses per code: ${maxUses}`);
        console.log(`📝 Description: ${finalDescription}`);
        console.log(`⏰ Expires: ${expiresAt ? expiresAt.toLocaleString('vi-VN') : 'Never'}`);
        console.log('\n💡 View codes in MongoDB Compass:');
        console.log('   Database: account_manager');
        console.log('   Collection: accesscodes');
        console.log('   Filter: { "isActive": true }\n');

        await mongoose.connection.close();
        console.log('✅ Database connection closed');

    } catch (error) {
        console.error('\n❌ Error generating codes:', error.message);
        await mongoose.connection.close();
        process.exit(1);
    }
}

// Parse command line arguments
function parseArgs() {
    const args = process.argv.slice(2);
    const options = {
        count: 1,
        maxUses: 1,
        description: null,
        expiresInDays: null
    };

    for (let i = 0; i < args.length; i++) {
        switch (args[i]) {
            case '--count':
                options.count = parseInt(args[++i], 10);
                break;
            case '--max-uses':
                options.maxUses = parseInt(args[++i], 10);
                break;
            case '--description':
                options.description = args[++i];
                break;
            case '--expires-in':
                options.expiresInDays = parseInt(args[++i], 10);
                break;
            case '--help':
                console.log(`
Generate Secure Access Codes

Usage:
  npm run generate-codes -- --count 10 --max-uses 1 --description "Batch 1"
  node scripts/generate-access-codes.js --count 5 --expires-in 30

Options:
  --count <number>        Number of codes to generate (default: 1)
  --max-uses <number>     Maximum uses per code (default: 1)
  --description <string>  Description/batch name (default: "Generated on [date]")
  --expires-in <days>     Days until expiration (default: null = no expiration)
  --help                  Show this help message

Examples:
  # Generate 10 single-use codes
  npm run generate-codes -- --count 10

  # Generate 5 codes that expire in 30 days
  npm run generate-codes -- --count 5 --expires-in 30

  # Generate codes with custom description
  npm run generate-codes -- --count 3 --description "VIP Users Batch 1"
                `);
                process.exit(0);
        }
    }

    return options;
}

// Main execution
(async () => {
    try {
        const options = parseArgs();
        await generateCodes(
            options.count,
            options.maxUses,
            options.description,
            options.expiresInDays
        );
    } catch (error) {
        console.error('Fatal error:', error);
        process.exit(1);
    }
})();
