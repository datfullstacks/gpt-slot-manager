/**
 * Migration Script for Old Users
 * Generates access codes for existing users who don't have one
 */

import mongoose from 'mongoose';
import User from '../src/models/userModel.js';
import crypto from 'crypto';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// Generate 16-char access code
function generateAccessCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No confusing chars
    let code = '';
    for (let i = 0; i < 16; i++) {
        const randomIndex = crypto.randomInt(0, chars.length);
        code += chars[randomIndex];
    }
    return code;
}

async function migrateOldUsers() {
    try {
        // Connect to MongoDB
        console.log('🔗 Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });
        console.log('✅ Connected to MongoDB\n');

        console.log('🔄 Starting migration for old users...\n');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

        // Find all users without accessCode
        const oldUsers = await User.find({ 
            $or: [
                { accessCode: null },
                { accessCode: { $exists: false } },
                { accessCode: '' }
            ]
        });

        console.log(`📊 Found ${oldUsers.length} users without accessCode\n`);

        if (oldUsers.length === 0) {
            console.log('✅ No users need migration!');
            await mongoose.disconnect();
            return;
        }

        let migratedCount = 0;
        const migrationLog = [];

        for (const user of oldUsers) {
            // Generate 16-char code
            const accessCode = generateAccessCode();
            
            // Update user
            user.accessCode = accessCode;
            
            // Initialize codeAttempts if not exists
            if (!user.codeAttempts) {
                user.codeAttempts = {
                    failed: 0,
                    lastAttempt: null,
                    history: []
                };
            }
            
            // Reset ban status (give them a fresh start)
            user.isBanned = false;
            user.bannedAt = null;
            user.banReason = null;
            
            await user.save();
            
            migratedCount++;
            
            const logEntry = {
                username: user.username,
                email: user.email,
                accessCode: accessCode,
                isVerified: user.isCodeVerified,
                createdAt: user.createdAt,
                migratedAt: new Date()
            };
            
            migrationLog.push(logEntry);
            
            console.log(`✅ [${migratedCount}/${oldUsers.length}] Migrated user: ${user.username}`);
            console.log(`   📧 Email: ${user.email}`);
            console.log(`   🔑 Generated Code: ${accessCode}`);
            console.log(`   ${user.isCodeVerified ? '✅' : '❌'} Verified: ${user.isCodeVerified}`);
            console.log(`   📅 Registered: ${user.createdAt.toLocaleDateString('vi-VN')}`);
            console.log('');
        }

        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`\n🎉 Migration completed! ${migratedCount} users migrated.\n`);

        // Print summary table
        console.log('📋 MIGRATION SUMMARY:\n');
        console.log('┌────────────────┬────────────────────────────┬──────────────────┬──────────┐');
        console.log('│ USERNAME       │ EMAIL                      │ ACCESS CODE      │ VERIFIED │');
        console.log('├────────────────┼────────────────────────────┼──────────────────┼──────────┤');

        migrationLog.forEach(log => {
            const username = log.username.padEnd(14).substring(0, 14);
            const email = log.email.padEnd(26).substring(0, 26);
            const code = log.accessCode;
            const verified = log.isVerified ? '✅ Yes  ' : '❌ No   ';
            console.log(`│ ${username} │ ${email} │ ${code} │ ${verified}│`);
        });

        console.log('└────────────────┴────────────────────────────┴──────────────────┴──────────┘\n');

        // Print instructions
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('\n📌 HƯỚNG DẪN CHO ADMIN:\n');
        console.log('1️⃣  Mở MongoDB Compass');
        console.log('2️⃣  Kết nối: mongodb+srv://...');
        console.log('3️⃣  Database: account_manager');
        console.log('4️⃣  Collection: users');
        console.log('5️⃣  Tìm user theo username hoặc email');
        console.log('6️⃣  Copy field "accessCode" (16 ký tự)');
        console.log('7️⃣  Gửi code cho user qua email/chat\n');

        console.log('📌 HƯỚNG DẪN CHO USER:\n');
        console.log('1️⃣  Đăng nhập với username/password');
        console.log('2️⃣  Hệ thống sẽ yêu cầu nhập Access Code');
        console.log('3️⃣  Nhập code 16 ký tự mà admin cung cấp');
        console.log('4️⃣  ✅ Xác thực thành công!\n');

        console.log('⚠️  LƯU Ý:\n');
        console.log('   • Mỗi user chỉ có 3 lần thử nhập code');
        console.log('   • Nhập sai 3 lần → Account bị khóa vĩnh viễn');
        console.log('   • Code không phân biệt chữ hoa/thường');
        console.log('   • Code dài 16 ký tự\n');

        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

        // Save migration log to file
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
        const logFilePath = path.resolve(__dirname, `../migration-log-${timestamp}.json`);
        fs.writeFileSync(logFilePath, JSON.stringify(migrationLog, null, 2));
        console.log(`💾 Migration log saved to: ${path.basename(logFilePath)}\n`);

        // Print email template
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('\n📧 EMAIL TEMPLATE:\n');
        console.log('Subject: 🔐 Access Code cho tài khoản GPT Slot Manager\n');
        console.log('Xin chào [USERNAME],\n');
        console.log('Hệ thống đã được nâng cấp bảo mật.');
        console.log('Mã truy cập của bạn: [ACCESS_CODE]\n');
        console.log('Đăng nhập và nhập mã để tiếp tục sử dụng.\n');
        console.log('⚠️ Lưu ý: 3 lần thử, nhập sai 3 lần = khóa vĩnh viễn\n');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

        await mongoose.disconnect();
        console.log('👋 Disconnected from MongoDB\n');

    } catch (error) {
        console.error('\n❌ Migration error:', error.message);
        console.error(error);
        await mongoose.disconnect();
        process.exit(1);
    }
}

// Run migration
migrateOldUsers();
