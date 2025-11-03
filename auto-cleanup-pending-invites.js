import mongoose from 'mongoose';
import Account from './src/models/accountModel.js';
import InviteService from './src/services/inviteService.js';
import dotenv from 'dotenv';

dotenv.config();

const inviteService = new InviteService();

async function autoCleanupAllPendingInvites() {
    try {
        console.log('🚀 Starting auto cleanup of pending invites...\n');

        // Connect to MongoDB
        const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/account-manager';
        await mongoose.connect(mongoUri);
        console.log('✅ Connected to MongoDB\n');

        // Get all accounts from database
        const accounts = await Account.find({});
        
        if (accounts.length === 0) {
            console.log('❌ No accounts found in database');
            process.exit(0);
        }

        console.log(`📋 Found ${accounts.length} accounts to process\n`);
        console.log('='.repeat(80));

        let totalDeleted = 0;
        let totalFailed = 0;
        let accountsProcessed = 0;
        let accountsWithErrors = 0;

        for (const account of accounts) {
            try {
                console.log(`\n📧 Processing: ${account.name || 'Unnamed'} (${account.email})`);
                console.log(`   Account ID: ${account.accountId}`);
                console.log(`   Allowed Members: ${account.allowedMembers.length}`);
                
                if (account.allowedMembers.length > 0) {
                    console.log(`   Members List: ${account.allowedMembers.join(', ')}`);
                }

                // Run cleanup
                const result = await inviteService.cleanupPendingInvites(
                    account.accountId,
                    account.accessToken,
                    account.allowedMembers
                );

                if (result.deleted && result.deleted.length > 0) {
                    console.log(`   ✅ Deleted ${result.deleted.length} unauthorized pending invites:`);
                    result.deleted.forEach(email => {
                        console.log(`      ❌ ${email}`);
                    });
                    totalDeleted += result.deleted.length;
                } else {
                    console.log(`   ✅ No unauthorized pending invites found`);
                }

                if (result.failed && result.failed.length > 0) {
                    console.log(`   ⚠️  Failed to delete ${result.failed.length} invites:`);
                    result.failed.forEach(fail => {
                        console.log(`      ❌ ${fail.email}: ${fail.error}`);
                    });
                    totalFailed += result.failed.length;
                }

                accountsProcessed++;

                // Add delay between accounts to avoid rate limiting
                if (accountsProcessed < accounts.length) {
                    console.log(`   ⏳ Waiting 1 second before next account...`);
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }

            } catch (error) {
                console.error(`   ❌ Error processing ${account.email}:`, error.message);
                accountsWithErrors++;
            }
        }

        console.log('\n' + '='.repeat(80));
        console.log('\n📊 CLEANUP SUMMARY:');
        console.log(`   Total Accounts: ${accounts.length}`);
        console.log(`   Processed Successfully: ${accountsProcessed}`);
        console.log(`   With Errors: ${accountsWithErrors}`);
        console.log(`   Total Pending Invites Deleted: ${totalDeleted}`);
        console.log(`   Total Failed Deletions: ${totalFailed}`);
        console.log('\n✅ Auto cleanup completed!\n');

    } catch (error) {
        console.error('❌ Fatal error:', error);
        process.exit(1);
    } finally {
        await mongoose.connection.close();
        console.log('📡 MongoDB connection closed');
    }
}

// Run the script
autoCleanupAllPendingInvites();
