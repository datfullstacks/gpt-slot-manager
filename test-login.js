import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import connectDB from './src/config/database.js';
import User from './src/models/userModel.js';
import bcrypt from 'bcryptjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '.env') });

async function testLogin() {
    try {
        await connectDB();
        
        console.log('🔍 TEST ĐĂNG NHẬP');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        
        // Tìm admin user
        const adminUser = await User.findOne({ username: 'admin' });
        
        if (!adminUser) {
            console.log('❌ Không tìm thấy user admin!');
            console.log('Chạy: node create-admin.js để tạo admin\n');
            process.exit(1);
        }
        
        console.log('✅ Tìm thấy user:');
        console.log('   Username:', adminUser.username);
        console.log('   Email:', adminUser.email);
        console.log('   Password Hash:', adminUser.password.substring(0, 30) + '...');
        console.log('   Created:', adminUser.createdAt);
        console.log('');
        
        // Test các password
        const testPasswords = [
            'admin123456',
            'admin',
            '123456',
            'Admin123456'
        ];
        
        console.log('🧪 Testing passwords:');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        
        for (const testPass of testPasswords) {
            const isValid = await bcrypt.compare(testPass, adminUser.password);
            const status = isValid ? '✅ ĐÚNG' : '❌ SAI';
            console.log(`   "${testPass}" → ${status}`);
        }
        
        console.log('');
        
        // Test với method của model
        console.log('🧪 Testing với comparePassword method:');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        
        for (const testPass of testPasswords) {
            const isValid = await adminUser.comparePassword(testPass);
            const status = isValid ? '✅ ĐÚNG' : '❌ SAI';
            console.log(`   "${testPass}" → ${status}`);
        }
        
        console.log('');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('💡 Mật khẩu mặc định: admin123456');
        console.log('');
        
        process.exit(0);
    } catch (error) {
        console.error('❌ Lỗi:', error.message);
        process.exit(1);
    }
}

testLogin();
