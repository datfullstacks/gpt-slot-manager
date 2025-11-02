import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import connectDB from './src/config/database.js';
import User from './src/models/userModel.js';
import readline from 'readline';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '.env') });

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function question(query) {
    return new Promise(resolve => rl.question(query, resolve));
}

async function changePassword() {
    try {
        await connectDB();
        
        console.log('🔐 ĐỔI MẬT KHẨU USER');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        
        const username = await question('Nhập username hoặc email: ');
        
        const user = await User.findOne({
            $or: [
                { username: username.trim() },
                { email: username.trim() }
            ]
        });
        
        if (!user) {
            console.log('❌ Không tìm thấy user!');
            process.exit(1);
        }
        
        console.log(`✅ Tìm thấy user: ${user.username} (${user.email})\n`);
        
        const newPassword = await question('Nhập mật khẩu mới (tối thiểu 6 ký tự): ');
        
        if (newPassword.length < 6) {
            console.log('❌ Mật khẩu phải có ít nhất 6 ký tự!');
            process.exit(1);
        }
        
        const confirmPassword = await question('Xác nhận mật khẩu mới: ');
        
        if (newPassword !== confirmPassword) {
            console.log('❌ Mật khẩu xác nhận không khớp!');
            process.exit(1);
        }
        
        // Cập nhật mật khẩu (sẽ tự động hash bởi pre-save hook)
        user.password = newPassword;
        await user.save();
        
        console.log('\n✅ Đổi mật khẩu thành công!');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`👤 User: ${user.username}`);
        console.log(`📧 Email: ${user.email}`);
        console.log(`🔑 Mật khẩu mới: ${newPassword}`);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        
        rl.close();
        process.exit(0);
    } catch (error) {
        console.error('❌ Lỗi:', error.message);
        rl.close();
        process.exit(1);
    }
}

changePassword();
