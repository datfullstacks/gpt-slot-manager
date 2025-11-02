import CurlService from './src/services/curlService.js';

const curlService = new CurlService();

// Test với 1 account thật
const testAccount = {
    id: "YOUR_ACCOUNT_ID_HERE",  // Thay bằng account ID thật từ ChatGPT
    accountId: "YOUR_ACCOUNT_ID_HERE",
    email: "your-email@example.com",
    accessToken: "YOUR_ACCESS_TOKEN_HERE"  // Thay bằng access token thật
};

console.log('🧪 Testing CurlService with real ChatGPT API...\n');
console.log('Account:', testAccount.email);
console.log('Account ID:', testAccount.accountId);
console.log('Token:', testAccount.accessToken.substring(0, 50) + '...\n');

console.log('Making API call to ChatGPT backend...');
console.log(`URL: https://chatgpt.com/backend-api/accounts/${testAccount.accountId}/users?offset=0&limit=25&query=\n`);

try {
    const result = await curlService.executeCurl(
        testAccount.accountId,
        testAccount.accessToken,
        {}
    );
    
    console.log('✅ SUCCESS! API Response:\n');
    console.log(JSON.stringify(result, null, 2));
    
    if (result.users && Array.isArray(result.users)) {
        console.log(`\n📊 Found ${result.users.length} users/members`);
        result.users.forEach((user, index) => {
            console.log(`\n${index + 1}. ${user.email || user.name || 'Unknown'}`);
            console.log(`   Role: ${user.role || 'N/A'}`);
            console.log(`   ID: ${user.id || 'N/A'}`);
        });
    }
    
} catch (error) {
    console.error('❌ ERROR:', error.message);
    console.error('\nFull error:', error);
    
    console.log('\n💡 Troubleshooting:');
    console.log('1. Make sure accountId is correct (check ChatGPT admin URL)');
    console.log('2. Make sure accessToken is valid (check browser DevTools > Network)');
    console.log('3. Check if your IP is whitelisted');
    console.log('4. Token might have expired - get a fresh one from browser');
}

process.exit(0);
