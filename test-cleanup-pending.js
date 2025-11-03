// Test Auto Cleanup Pending Invites
// Run: node test-cleanup-pending.js

import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:3000/api';

// Replace with your actual token
const TOKEN = 'your-jwt-token-here';

async function testCleanupPendingInvites() {
    console.log('🧪 Testing Auto Cleanup Pending Invites\n');
    console.log('='.repeat(80));

    try {
        // 1. Get all accounts
        console.log('\n📋 Step 1: Getting all accounts...');
        const accountsResponse = await fetch(`${BASE_URL}/accounts`, {
            headers: {
                'Authorization': `Bearer ${TOKEN}`
            }
        });

        if (!accountsResponse.ok) {
            throw new Error(`Failed to get accounts: ${accountsResponse.status}`);
        }

        const accounts = await accountsResponse.json();
        console.log(`✅ Found ${accounts.length} accounts`);

        if (accounts.length === 0) {
            console.log('❌ No accounts found. Please add accounts first.');
            return;
        }

        const testAccount = accounts[0];
        console.log(`\n🎯 Testing with account: ${testAccount.email}`);
        console.log(`   Account ID: ${testAccount.accountId}`);
        console.log(`   Allowed Members: ${testAccount.allowedMembers.length}`);
        if (testAccount.allowedMembers.length > 0) {
            console.log(`   Members: ${testAccount.allowedMembers.join(', ')}`);
        }

        // 2. Get pending invites
        console.log('\n📋 Step 2: Getting pending invites...');
        const pendingResponse = await fetch(`${BASE_URL}/accounts/${testAccount._id}/pending-invites`, {
            headers: {
                'Authorization': `Bearer ${TOKEN}`
            }
        });

        if (!pendingResponse.ok) {
            throw new Error(`Failed to get pending invites: ${pendingResponse.status}`);
        }

        const pendingData = await pendingResponse.json();
        console.log(`✅ Found ${pendingData.total} pending invites`);

        if (pendingData.invites && pendingData.invites.length > 0) {
            console.log('\n   Current Pending Invites:');
            pendingData.invites.forEach(invite => {
                const email = invite.email_address || invite.email;
                const isAllowed = testAccount.allowedMembers.includes(email);
                console.log(`   ${isAllowed ? '✅' : '❌'} ${email} ${isAllowed ? '(allowed)' : '(UNAUTHORIZED - will be deleted)'}`);
            });
        } else {
            console.log('   ℹ️  No pending invites found');
        }

        // 3. Run cleanup
        console.log('\n🧹 Step 3: Running cleanup...');
        const cleanupResponse = await fetch(`${BASE_URL}/accounts/${testAccount._id}/cleanup-pending-invites`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${TOKEN}`
            }
        });

        if (!cleanupResponse.ok) {
            throw new Error(`Failed to cleanup: ${cleanupResponse.status}`);
        }

        const cleanupResult = await cleanupResponse.json();
        console.log(`✅ Cleanup completed!`);
        console.log(`   Message: ${cleanupResult.message}`);
        
        if (cleanupResult.deleted && cleanupResult.deleted.length > 0) {
            console.log(`\n   🗑️  Deleted ${cleanupResult.deleted.length} unauthorized pending invites:`);
            cleanupResult.deleted.forEach(email => {
                console.log(`      ❌ ${email}`);
            });
        } else {
            console.log('\n   ✅ No unauthorized pending invites to delete');
        }

        if (cleanupResult.failed && cleanupResult.failed.length > 0) {
            console.log(`\n   ⚠️  Failed to delete ${cleanupResult.failed.length} invites:`);
            cleanupResult.failed.forEach(fail => {
                console.log(`      ❌ ${fail.email}: ${fail.error}`);
            });
        }

        // 4. Test cleanup all accounts
        console.log('\n' + '='.repeat(80));
        console.log('\n🧹 Step 4: Testing cleanup ALL accounts...');
        const cleanupAllResponse = await fetch(`${BASE_URL}/accounts/cleanup-all-pending-invites`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${TOKEN}`
            }
        });

        if (!cleanupAllResponse.ok) {
            throw new Error(`Failed to cleanup all: ${cleanupAllResponse.status}`);
        }

        const cleanupAllResult = await cleanupAllResponse.json();
        console.log(`✅ Cleanup all completed!`);
        console.log(`   Total Accounts: ${cleanupAllResult.total_accounts}`);
        console.log(`   Total Deleted: ${cleanupAllResult.total_deleted}`);
        console.log(`   Total Failed: ${cleanupAllResult.total_failed}`);

        if (cleanupAllResult.results) {
            console.log('\n   📊 Results per account:');
            cleanupAllResult.results.forEach(result => {
                const deletedCount = result.deleted?.length || 0;
                const failedCount = result.failed?.length || 0;
                console.log(`      ${result.account}: ${deletedCount} deleted, ${failedCount} failed`);
            });
        }

        // 5. Test send invites with auto-cleanup
        console.log('\n' + '='.repeat(80));
        console.log('\n📧 Step 5: Testing send invites with auto-cleanup...');
        
        if (testAccount.allowedMembers.length === 0) {
            console.log('⚠️  No allowed members to invite. Skipping this test.');
        } else {
            const sendInvitesResponse = await fetch(`${BASE_URL}/accounts/${testAccount._id}/send-invites`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${TOKEN}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    emails: testAccount.allowedMembers,
                    autoCleanup: true  // Enable auto-cleanup
                })
            });

            if (!sendInvitesResponse.ok) {
                const errorText = await sendInvitesResponse.text();
                console.log(`⚠️  Send invites failed: ${errorText}`);
            } else {
                const sendResult = await sendInvitesResponse.json();
                console.log(`✅ Invites sent!`);
                console.log(`   Invited: ${sendResult.invited_count}`);
                
                if (sendResult.cleanup) {
                    console.log(`   Auto-Cleanup: ${sendResult.cleanup.deleted} deleted, ${sendResult.cleanup.failed} failed`);
                    if (sendResult.cleanup.emails_deleted && sendResult.cleanup.emails_deleted.length > 0) {
                        console.log(`   Cleaned emails: ${sendResult.cleanup.emails_deleted.join(', ')}`);
                    }
                }
            }
        }

        console.log('\n' + '='.repeat(80));
        console.log('\n✅ ALL TESTS COMPLETED!\n');
        console.log('💡 TIP: WebSocket will auto-cleanup every 30 seconds when connected.\n');

    } catch (error) {
        console.error('\n❌ Test failed:', error.message);
        console.error('\n📝 Make sure:');
        console.error('   1. Server is running (npm start)');
        console.error('   2. You have a valid TOKEN');
        console.error('   3. You have accounts in the database');
    }
}

// Run tests
testCleanupPendingInvites();
