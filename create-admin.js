import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import connectDB from './src/config/database.js';
import User from './src/models/userModel.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '.env') });

async function createAdmin() {
    try {
        await connectDB();
        
        // Thông tin admin mặc định
        const adminData = {
            username: 'admin',
            email: 'admin@system.com',
            password: 'admin123456', // Mật khẩu mặc định (nên đổi sau khi đăng nhập)
            accessCode: process.env.ADMIN_ACCESS_CODE || 'GPT2024SLOT',
            isCodeVerified: true, // Admin mặc định đã verified
            codeVerifiedAt: new Date()
        };
        
        // Kiểm tra xem admin đã tồn tại chưa
        const existingAdmin = await User.findOne({ 
            $or: [
                { username: adminData.username },
                { email: adminData.email }
            ]
        });
        
        if (existingAdmin) {
            console.log('⚠️  Tài khoản admin đã tồn tại!');
            console.log('   Username:', existingAdmin.username);
            console.log('   Email:', existingAdmin.email);
            console.log('   Ngày tạo:', existingAdmin.createdAt);
            process.exit(0);
        }
        
        // Tạo admin mới
        const admin = new User(adminData);
        await admin.save();
        
        console.log('✅ Tạo tài khoản admin thành công!');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('📋 Thông tin đăng nhập:');
        console.log('   Username: ' + adminData.username);
        console.log('   Email: ' + adminData.email);
        console.log('   Password: ' + adminData.password);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('🔑 Mã code truy cập: ' + adminData.accessCode);
        console.log('   (Admin mặc định đã được xác thực)');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('⚠️  LƯU Ý: Hãy đổi mật khẩu sau khi đăng nhập lần đầu!');
        console.log('');
        console.log('🌐 Truy cập: http://localhost:3001');
        
        process.exit(0);
    } catch (error) {
        console.error('❌ Lỗi khi tạo admin:', error.message);
        process.exit(1);
    }
}

createAdmin();
