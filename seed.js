import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Account from './src/models/accountModel.js';
import connectDB from './src/config/database.js';

dotenv.config();

const sampleAccounts = [
    {
        email: "admin1@chatgpt.com",
        accountId: "org-sample-id-001",
        accessToken: "eyJhbGciOiJkaXIiLCJlbmMiOiJBMjU2R0NNIn0..sample_token_1"
    },
    {
        email: "admin2@chatgpt.com",
        accountId: "org-sample-id-002",
        accessToken: "eyJhbGciOiJkaXIiLCJlbmMiOiJBMjU2R0NNIn0..sample_token_2"
    },
    {
        email: "admin3@chatgpt.com",
        accountId: "org-sample-id-003",
        accessToken: "eyJhbGciOiJkaXIiLCJlbmMiOiJBMjU2R0NNIn0..sample_token_3"
    },
    {
        email: "test@example.com",
        accountId: "org-test-id-123",
        accessToken: "eyJhbGciOiJkaXIiLCJlbmMiOiJBMjU2R0NNIn0..test_token"
    },
    {
        email: "demo@company.com",
        accountId: "org-demo-id-456",
        accessToken: "eyJhbGciOiJkaXIiLCJlbmMiOiJBMjU2R0NNIn0..demo_token"
    }
];

async function seedDatabase() {
    try {
        console.log('🌱 Starting database seeding...\n');
        
        // Connect to MongoDB
        await connectDB();
        
        // Clear existing accounts
        console.log('🗑️  Clearing existing accounts...');
        const deleteResult = await Account.deleteMany({});
        console.log(`   Deleted ${deleteResult.deletedCount} existing accounts\n`);
        
        // Insert sample accounts
        console.log('📝 Inserting sample accounts...');
        const insertedAccounts = await Account.insertMany(sampleAccounts);
        console.log(`   ✅ Inserted ${insertedAccounts.length} accounts\n`);
        
        // Display inserted accounts
        console.log('📋 Sample Accounts:');
        insertedAccounts.forEach((account, index) => {
            console.log(`\n${index + 1}. ${account.email}`);
            console.log(`   Account ID: ${account.accountId}`);
            console.log(`   Access Token: ${account.accessToken.substring(0, 50)}...`);
            console.log(`   Created At: ${account.createdAt}`);
        });
        
        console.log('\n\n🎉 Database seeding completed successfully!');
        console.log('\n💡 Next steps:');
        console.log('   1. Start server: node src/app.js');
        console.log('   2. Get accounts: curl.exe http://localhost:3001/api/accounts');
        console.log('   3. Process accounts: curl.exe -X POST http://localhost:3001/api/accounts/process');
        
        process.exit(0);
    } catch (error) {
        console.error('❌ Error seeding database:', error);
        process.exit(1);
    }
}

// Run seeding
seedDatabase();
