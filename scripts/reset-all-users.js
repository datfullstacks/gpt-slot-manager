/**
 * Reset All Users - Force Re-verification
 * This script will:
 * 1. Generate new access codes for ALL users
 * 2. Set isCodeVerified = false for everyone
 * 3. Reset attempt counters
 * 4. Unban all users (fresh start)
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
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 16; i++) {
        const randomIndex = crypto.randomInt(0, chars.length);
        code += chars[randomIndex];
    }
    return code;
}

async function resetAllUsers() {
    try {
        // Connect to MongoDB
        console.log('🔗 Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connected to MongoDB\n');

        console.log('🔄 Resetting ALL users with new access codes...\n');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

        // Get ALL users
        const allUsers = await User.find({});

        console.log(`📊 Found ${allUsers.length} total users\n`);

        if (allUsers.length === 0) {
            console.log('❌ No users found in database!');
            await mongoose.disconnect();
            return;
        }

        // Ask for confirmation
        console.log('⚠️  WARNING: This will reset ALL users!\n');
        console.log('   • Generate new access codes for everyone');
        console.log('   • Set isCodeVerified = false');
        console.log('   • Reset all attempt counters');
        console.log('   • Unban all accounts\n');

        let resetCount = 0;
        const resetLog = [];

        for (const user of allUsers) {
            // Generate NEW access code
            const newAccessCode = generateAccessCode();
            
            // Store old values for logging
            const oldCode = user.accessCode;
            const wasVerified = user.isCodeVerified;
            const wasBanned = user.isBanned;
            
            // Reset user completely
            user.accessCode = newAccessCode;
            user.isCodeVerified = false;  // Force re-verification
            user.codeVerifiedAt = null;
            
            // Reset attempts
            user.codeAttempts = {
                failed: 0,
                lastAttempt: null,
                history: []
            };
            
            // Unban if banned
            user.isBanned = false;
            user.bannedAt = null;
            user.banReason = null;
            
            await user.save();
            
            resetCount++;
            
            const logEntry = {
                username: user.username,
                email: user.email,
                oldAccessCode: oldCode || 'N/A',
                newAccessCode: newAccessCode,
                wasVerified: wasVerified,
                wasBanned: wasBanned,
                createdAt: user.createdAt,
                resetAt: new Date()
            };
            
            resetLog.push(logEntry);
            
            console.log(`🔄 [${resetCount}/${allUsers.length}] Reset user: ${user.username}`);
            console.log(`   📧 Email: ${user.email}`);
            console.log(`   🔑 NEW Access Code: ${newAccessCode}`);
            console.log(`   ${oldCode ? '🔄' : '✨'} Old Code: ${oldCode || 'None (new user)'}`);
            console.log(`   ${wasVerified ? '❌' : '⚪'} Was Verified: ${wasVerified ? 'YES → Reset to NO' : 'NO'}`);
            console.log(`   ${wasBanned ? '🔓' : '⚪'} Was Banned: ${wasBanned ? 'YES → Unbanned' : 'NO'}`);
            console.log('');
        }

        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`\n🎉 Reset completed! ${resetCount} users reset.\n`);

        // Print summary table
        console.log('📋 RESET SUMMARY:\n');
        console.log('┌────────────────┬────────────────────────────┬──────────────────┬──────────┐');
        console.log('│ USERNAME       │ EMAIL                      │ NEW ACCESS CODE  │ STATUS   │');
        console.log('├────────────────┼────────────────────────────┼──────────────────┼──────────┤');

        resetLog.forEach(log => {
            const username = log.username.padEnd(14).substring(0, 14);
            const email = log.email.padEnd(26).substring(0, 26);
            const code = log.newAccessCode;
            const status = log.wasBanned ? '🔓 Unbanned' : log.wasVerified ? '🔄 Reset' : '✨ New';
            console.log(`│ ${username} │ ${email} │ ${code} │ ${status.padEnd(8)} │`);
        });

        console.log('└────────────────┴────────────────────────────┴──────────────────┴──────────┘\n');

        // Statistics
        const bannedCount = resetLog.filter(u => u.wasBanned).length;
        const verifiedCount = resetLog.filter(u => u.wasVerified).length;
        const newCount = resetLog.filter(u => !u.oldAccessCode || u.oldAccessCode === 'N/A').length;

        console.log('📊 STATISTICS:\n');
        console.log(`   Total Users: ${resetCount}`);
        console.log(`   Previously Verified: ${verifiedCount} → Now require re-verification`);
        console.log(`   Previously Banned: ${bannedCount} → Now unbanned`);
        console.log(`   New Users: ${newCount}\n`);

        // Print instructions
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('\n📌 HƯỚNG DẪN CHO ADMIN:\n');
        console.log('1️⃣  TẤT CẢ users giờ phải verify lại');
        console.log('2️⃣  Mở MongoDB Compass → Collection: users');
        console.log('3️⃣  Tìm từng user và copy field "accessCode"');
        console.log('4️⃣  Gửi code mới cho từng user\n');

        console.log('📧 EMAIL TEMPLATE:\n');
        console.log('Subject: 🔐 [BẮT BUỘC] Cập nhật Access Code mới\n');
        console.log('Xin chào [USERNAME],\n');
        console.log('Hệ thống đã nâng cấp bảo mật toàn diện.');
        console.log('Mã truy cập mới của bạn: [NEW_ACCESS_CODE]\n');
        console.log('⚠️ BẮT BUỘC: Đăng nhập và nhập mã mới để tiếp tục sử dụng.');
        console.log('Mã cũ không còn hiệu lực.\n');
        console.log('Lưu ý: 3 lần thử, nhập sai 3 lần = khóa vĩnh viễn\n');

        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

        // Save reset log to file
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
        const logFilePath = path.resolve(__dirname, `../reset-all-users-${timestamp}.json`);
        fs.writeFileSync(logFilePath, JSON.stringify(resetLog, null, 2));
        console.log(`💾 Reset log saved to: ${path.basename(logFilePath)}\n`);

        // Print codes for easy copy-paste
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('\n📋 QUICK REFERENCE - NEW ACCESS CODES:\n');
        
        resetLog.forEach((log, index) => {
            console.log(`${(index + 1).toString().padStart(2, '0')}. ${log.username.padEnd(15)} → ${log.newAccessCode}`);
            console.log(`    Email: ${log.email}`);
            console.log('');
        });

        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

        await mongoose.disconnect();
        console.log('👋 Disconnected from MongoDB\n');

    } catch (error) {
        console.error('\n❌ Reset error:', error.message);
        console.error(error);
        await mongoose.disconnect();
        process.exit(1);
    }
}

// Run reset
console.log('\n⚠️  RESET ALL USERS - FORCE RE-VERIFICATION\n');
console.log('This will regenerate access codes for ALL users.');
console.log('Continuing in 3 seconds...\n');

setTimeout(() => {
    resetAllUsers();
}, 3000);
