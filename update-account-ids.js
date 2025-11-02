import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import connectDB from './src/config/database.js';
import Account from './src/models/accountModel.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '.env') });

async function updateAccountIds() {
    try {
        await connectDB();
        
        console.log('🔧 CẬP NHẬT ACCOUNT IDs');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        
        // Lấy tất cả accounts
        const accounts = await Account.find({});
        
        console.log(`Tìm thấy ${accounts.length} accounts\n`);
        
        for (const account of accounts) {
            console.log(`📧 ${account.email}`);
            console.log(`   Old Account ID: ${account.accountId}`);
            
            // Nếu account ID không phải UUID format, set về null để auto-fetch
            const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(account.accountId);
            
            if (!isUUID) {
                account.accountId = null;
                await account.save();
                console.log(`   ✅ Updated to: null (sẽ auto-fetch khi process)`);
            } else {
                console.log(`   ✅ Đã đúng format UUID`);
            }
            console.log('');
        }
        
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('✅ Hoàn tất cập nhật!');
        console.log('');
        console.log('💡 Lưu ý:');
        console.log('   - Account ID phải là UUID format');
        console.log('   - Ví dụ: 17dc4860-eff7-434e-bada-9a09fbdbac88');
        console.log('   - Nếu để null, hệ thống sẽ tự động lấy khi gọi API');
        console.log('');
        
        process.exit(0);
    } catch (error) {
        console.error('❌ Lỗi:', error.message);
        process.exit(1);
    }
}

updateAccountIds();
