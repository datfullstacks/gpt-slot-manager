import { WebSocketServer } from 'ws';
import jwt from 'jsonwebtoken';
import Account from '../models/accountModel.js';
import CurlService from '../services/curlService.js';
import InviteService from '../services/inviteService.js';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

class WebSocketService {
    constructor(server) {
        this.wss = new WebSocketServer({ server, path: '/ws' });
        this.curlService = new CurlService();
        this.inviteService = new InviteService();
        this.clients = new Map(); // userId -> ws connection
        this.accountTimers = new Map(); // accountId -> timeout handle
        this.userAccountTimers = new Map(); // userId -> Set of accountIds
        
        this.wss.on('connection', this.handleConnection.bind(this));
        console.log('✅ WebSocket server initialized on /ws');
    }

    handleConnection(ws, req) {
        console.log('🔌 New WebSocket connection');
        
        ws.on('message', async (message) => {
            try {
                const data = JSON.parse(message.toString());
                await this.handleMessage(ws, data);
            } catch (error) {
                console.error('WebSocket message error:', error);
                ws.send(JSON.stringify({ 
                    type: 'error', 
                    message: error.message 
                }));
            }
        });

        ws.on('close', () => {
            // Remove client from map and clear all account timers
            for (const [userId, client] of this.clients.entries()) {
                if (client === ws) {
                    this.stopAllAccountTimers(userId);
                    this.clients.delete(userId);
                    console.log(`🔌 Client disconnected: ${userId}`);
                    break;
                }
            }
        });

        ws.on('error', (error) => {
            console.error('WebSocket error:', error);
        });
    }

    async handleMessage(ws, data) {
        const { type, token } = data;

        // Verify JWT token
        let userId;
        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            userId = decoded.userId;
        } catch (error) {
            ws.send(JSON.stringify({ 
                type: 'error', 
                message: 'Invalid token' 
            }));
            return;
        }

        if (type === 'subscribe') {
            // Store client connection
            this.clients.set(userId, ws);
            console.log(`✅ Client subscribed: ${userId}`);
            
            // Start per-account auto-refresh with staggered timing
            await this.startPerAccountRefresh(userId);
            
            ws.send(JSON.stringify({ 
                type: 'subscribed',
                message: 'Per-account auto-refresh started (staggered 30s intervals)' 
            }));
        } else if (type === 'unsubscribe') {
            this.stopAllAccountTimers(userId);
            this.clients.delete(userId);
            ws.send(JSON.stringify({ 
                type: 'unsubscribed',
                message: 'Auto-refresh stopped' 
            }));
        } else if (type === 'refresh') {
            // Manual refresh - trigger immediate check for all accounts
            await this.triggerImmediateRefreshAll(userId);
        }
    }

    /**
     * Start per-account refresh with staggered timing
     * Each account gets its own timer scheduled at different intervals
     */
    async startPerAccountRefresh(userId) {
        try {
            // Get all accounts for this user
            const accounts = await Account.find({ userId });
            
            if (accounts.length === 0) {
                console.log(`ℹ️  No accounts found for user ${userId}`);
                return;
            }

            // Initialize account tracking for this user
            if (!this.userAccountTimers.has(userId)) {
                this.userAccountTimers.set(userId, new Set());
            }

            // Stagger initial checks: Account 1 @ 0s, Account 2 @ 5s, Account 3 @ 10s, etc.
            accounts.forEach((account, index) => {
                const accountId = account._id.toString();
                const delaySeconds = index * 5; // Stagger by 5 seconds (was 30s)
                
                console.log(`⏰ Scheduling account ${index + 1}/${accounts.length} (${account.email}) - first check in ${delaySeconds}s`);
                
                // Track this account for the user
                this.userAccountTimers.get(userId).add(accountId);
                
                // Schedule first check
                this.scheduleAccountCheck(accountId, userId, delaySeconds);
            });

            console.log(`✅ Started staggered refresh for ${accounts.length} accounts (user: ${userId})`);
        } catch (error) {
            console.error(`Error starting per-account refresh for user ${userId}:`, error);
        }
    }

    /**
     * Schedule a check for a specific account
     * @param {string} accountId - Account database ID
     * @param {string} userId - User ID
     * @param {number} delaySeconds - Delay in seconds before check
     */
    scheduleAccountCheck(accountId, userId, delaySeconds = 30) {
        // Clear existing timer for this account
        if (this.accountTimers.has(accountId)) {
            clearTimeout(this.accountTimers.get(accountId));
            console.log(`🔄 Cleared existing timer for account ${accountId.slice(-6)}`);
        }

        // Schedule new check
        const timeoutHandle = setTimeout(async () => {
            console.log(`⏰ Timer fired for account ${accountId.slice(-6)} (userId: ${userId.slice(-6)})`);
            await this.checkSingleAccount(accountId, userId);
            
            // Schedule next check (30s from now) if client still connected
            const ws = this.clients.get(userId);
            if (ws && ws.readyState === 1) {
                console.log(`♻️  Re-scheduling account ${accountId.slice(-6)} in 30s`);
                this.scheduleAccountCheck(accountId, userId, 30);
            } else {
                console.log(`⚠️  Client disconnected, not re-scheduling ${accountId.slice(-6)}`);
            }
        }, delaySeconds * 1000);

        this.accountTimers.set(accountId, timeoutHandle);
        console.log(`✅ Timer set for account ${accountId.slice(-6)} - will fire in ${delaySeconds}s`);
    }

    /**
     * Check a single account and send update
     * @param {string} accountId - Account database ID
     * @param {string} userId - User ID
     */
    async checkSingleAccount(accountId, userId) {
        const ws = this.clients.get(userId);
        if (!ws || ws.readyState !== 1) {
            console.log(`⚠️  Client disconnected for account ${accountId.slice(-6)}, skipping check`);
            return;
        }

        try {
            console.log(`🔍 [START] Checking account: ${accountId.slice(-6)} (userId: ${userId.slice(-6)})`);
            
            // Get account from database
            const account = await Account.findById(accountId);
            if (!account) {
                console.error(`❌ Account not found: ${accountId}`);
                return;
            }

            let result;
            try {
                const data = await this.curlService.executeCurl(
                    account.accountId,
                    account.accessToken,
                    account.additionalHeaders || {}
                );
                
                // Reset error tracking on success
                if (account.sessionStatus !== 'active') {
                    await Account.findByIdAndUpdate(accountId, {
                        sessionStatus: 'active',
                        lastError: null,
                        errorCount: 0
                    });
                }
                
                // Prepare members list: include admin as a visible member and calculate counts accordingly
                const adminEmail = account.email ? account.email.toLowerCase() : '';
                const allMembers = data.items || [];

                // Non-admin members (actual user members)
                const nonAdminMembers = allMembers.filter(m => {
                    const memberEmail = (m.email || '').toLowerCase();
                    return memberEmail && memberEmail !== adminEmail;
                });

                // AUTO-CLEANUP 1: Delete unauthorized members (not in allowedMembers)
                const allowedEmailsLower = (account.allowedMembers || []).map(e => e.toLowerCase());
                const unauthorizedMembers = nonAdminMembers.filter(m => {
                    const memberEmail = (m.email || '').toLowerCase();
                    return !allowedEmailsLower.includes(memberEmail);
                });

                // Delete unauthorized members in background (don't wait)
                if (unauthorizedMembers.length > 0) {
                    console.log(`🧹 [${account.email}] Found ${unauthorizedMembers.length} unauthorized members, auto-deleting...`);
                    for (const member of unauthorizedMembers) {
                        try {
                            await this.curlService.deleteMember(
                                account.accountId,
                                member.id,
                                account.accessToken
                            );
                            console.log(`   ✅ Deleted member: ${member.email}`);
                        } catch (error) {
                            console.error(`   ❌ Failed to delete ${member.email}:`, error.message);
                        }
                    }
                }

                // AUTO-CLEANUP 2: Clean unauthorized pending invites (not in allowedMembers)
                this.autoCleanupPendingInvites(account, allowedEmailsLower)
                    .then(count => {
                        if (count > 0) {
                            console.log(`   🧹 Cleaned ${count} pending invites for ${account.email}`);
                        }
                    })
                    .catch(error => {
                        console.error(`   ❌ Failed to cleanup pending invites for ${account.email}:`, error.message);
                    });

                // Only keep authorized non-admin members (in allowedMembers)
                const authorizedNonAdminMembers = nonAdminMembers.filter(m => {
                    const memberEmail = (m.email || '').toLowerCase();
                    return allowedEmailsLower.includes(memberEmail);
                });

                // AUTO-LIMIT: If total members (admin + authorized) > 8, delete newest members
                const MAX_MEMBERS = 8;
                const totalCount = 1 + authorizedNonAdminMembers.length; // 1 for admin
                
                let finalAuthorizedMembers = authorizedNonAdminMembers;
                
                if (totalCount > MAX_MEMBERS) {
                    const excessCount = totalCount - MAX_MEMBERS;
                    console.log(`⚠️  [${account.email}] Total ${totalCount} members exceeds limit ${MAX_MEMBERS}. Deleting ${excessCount} newest members...`);
                    
                    // Sort by created_time DESC (newest first) to identify newest members
                    const sortedMembers = [...authorizedNonAdminMembers].sort((a, b) => {
                        const timeA = new Date(a.created_time || a.created_at || 0).getTime();
                        const timeB = new Date(b.created_time || b.created_at || 0).getTime();
                        return timeB - timeA; // DESC: newest first
                    });
                    
                    // Take first N members as excess (newest members)
                    const membersToDelete = sortedMembers.slice(0, excessCount);
                    
                    // Delete in background
                    for (const member of membersToDelete) {
                        try {
                            await this.curlService.deleteMember(
                                account.accountId,
                                member.id,
                                account.accessToken
                            );
                            console.log(`   ✅ Deleted newest member: ${member.email}`);
                        } catch (error) {
                            console.error(`   ❌ Failed to delete ${member.email}:`, error.message);
                        }
                    }
                    
                    // Keep only the remaining members (oldest members that fit in limit)
                    finalAuthorizedMembers = sortedMembers.slice(excessCount);
                }

                // Create an admin member representation so UI and counts include admin
                const adminMemberObj = account.email ? { id: 'admin', email: account.email, is_admin: true } : null;

                // Members to present: admin (if exists) + authorized non-admin members (limited to 7 max)
                const membersToShow = adminMemberObj ? [adminMemberObj, ...finalAuthorizedMembers] : [...finalAuthorizedMembers];

                result = {
                    _id: account._id.toString(),
                    name: account.name || 'Unnamed Account',
                    email: account.email,
                    accountId: account.accountId,
                    members_count: membersToShow.length, // include admin
                    members: membersToShow, // include admin as first item
                    allowedMembers: account.allowedMembers || [],
                    maxMembers: account.maxMembers || 7,
                    createdAt: account.createdAt,
                    updatedAt: account.updatedAt,
                    unauthorized_deleted: unauthorizedMembers.length,
                    nextCheckIn: 30, // Next check in 30 seconds
                    success: true
                };
            } catch (error) {
                result = {
                    _id: account._id,
                    name: account.name,
                    email: account.email,
                    accountId: account.accountId,
                    members_count: 0,
                    members: [],
                    allowedMembers: account.allowedMembers || [],
                    maxMembers: account.maxMembers || 7,
                    createdAt: account.createdAt,
                    updatedAt: account.updatedAt,
                    error: error.message,
                    nextCheckIn: 30, // Next check in 30 seconds
                    success: false
                };
                
                // Track 401 errors in database
                if (error.message.includes('401')) {
                    await Account.findByIdAndUpdate(accountId, {
                        sessionStatus: 'expired',
                        lastError: '401 Unauthorized - Session expired',
                        lastErrorTime: new Date(),
                        $inc: { errorCount: 1 }
                    });
                    console.log(`🔴 Account ${account.email} marked as EXPIRED (401)`);
                } else if (error.message.includes('422')) {
                    await Account.findByIdAndUpdate(accountId, {
                        sessionStatus: 'error',
                        lastError: '422 Invalid account',
                        lastErrorTime: new Date(),
                        $inc: { errorCount: 1 }
                    });
                } else {
                    await Account.findByIdAndUpdate(accountId, {
                        sessionStatus: 'error',
                        lastError: error.message,
                        lastErrorTime: new Date(),
                        $inc: { errorCount: 1 }
                    });
                }
            }

            // Send per-account update to WebSocket
            ws.send(JSON.stringify({
                type: 'account_update',
                accountId: accountId,
                data: result,
                timestamp: new Date().toISOString()
            }));

            console.log(`✅ [END] Sent update for account ${account.email} (${result.members_count} members)`);
        } catch (error) {
            console.error(`❌ [ERROR] Error checking account ${accountId.slice(-6)}:`, error);
            ws.send(JSON.stringify({
                type: 'account_error',
                accountId: accountId,
                message: 'Error checking account',
                error: error.message,
                timestamp: new Date().toISOString()
            }));
        }
    }

    /**
     * Trigger immediate refresh for all user's accounts
     * Used for manual refresh button
     */
    async triggerImmediateRefreshAll(userId) {
        try {
            const accounts = await Account.find({ userId });
            
            // Check all accounts immediately (no delay)
            for (const account of accounts) {
                const accountId = account._id.toString();
                await this.checkSingleAccount(accountId, userId);
                
                // Small delay between accounts to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
            
            console.log(`✅ Immediate refresh completed for ${accounts.length} accounts (user: ${userId})`);
        } catch (error) {
            console.error(`Error triggering immediate refresh for user ${userId}:`, error);
        }
    }

    /**
     * Stop all account timers for a user
     */
    stopAllAccountTimers(userId) {
        const accountIds = this.userAccountTimers.get(userId);
        if (accountIds) {
            for (const accountId of accountIds) {
                if (this.accountTimers.has(accountId)) {
                    clearTimeout(this.accountTimers.get(accountId));
                    this.accountTimers.delete(accountId);
                }
            }
            this.userAccountTimers.delete(userId);
            console.log(`⏹️  Stopped all account timers for user ${userId}`);
        }
    }

    async sendMembersCount(userId) {
        const ws = this.clients.get(userId);
        if (!ws || ws.readyState !== 1) { // 1 = OPEN
            return;
        }

        try {
            // Get all accounts for this user
            const accounts = await Account.find({ userId });
            
            if (accounts.length === 0) {
                ws.send(JSON.stringify({
                    type: 'members_update',
                    data: {
                        total_accounts: 0,
                        total_members: 0,
                        accounts: []
                    },
                    timestamp: new Date().toISOString()
                }));
                return;
            }

            // Fetch members from all accounts concurrently
            const results = [];
            for (const account of accounts) {
                try {
                    const data = await this.curlService.executeCurl(
                        account.accountId,
                        account.accessToken,
                        account.additionalHeaders || {}
                    );
                    
                    // Prepare members list: include admin as a visible member and calculate counts accordingly
                    const adminEmail = account.email ? account.email.toLowerCase() : '';
                    const allMembers = data.items || [];

                    // Non-admin members (actual user members)
                    const nonAdminMembers = allMembers.filter(m => {
                        const memberEmail = (m.email || '').toLowerCase();
                        return memberEmail && memberEmail !== adminEmail;
                    });

                    // AUTO-CLEANUP 1: Delete unauthorized members (not in allowedMembers)
                    const allowedEmailsLower = (account.allowedMembers || []).map(e => e.toLowerCase());
                    const unauthorizedMembers = nonAdminMembers.filter(m => {
                        const memberEmail = (m.email || '').toLowerCase();
                        return !allowedEmailsLower.includes(memberEmail);
                    });

                    // Delete unauthorized members in background (don't wait)
                    if (unauthorizedMembers.length > 0) {
                        console.log(`🧹 [${account.email}] Found ${unauthorizedMembers.length} unauthorized members, auto-deleting...`);
                        for (const member of unauthorizedMembers) {
                            try {
                                await this.curlService.deleteMember(
                                    account.accountId,
                                    member.id,
                                    account.accessToken
                                );
                                console.log(`   ✅ Deleted member: ${member.email}`);
                            } catch (error) {
                                console.error(`   ❌ Failed to delete ${member.email}:`, error.message);
                            }
                        }
                    }

                    // AUTO-CLEANUP 2: Clean unauthorized pending invites (not in allowedMembers)
                    // This runs in background without blocking the main flow
                    this.autoCleanupPendingInvites(account, allowedEmailsLower)
                        .then(count => {
                            if (count > 0) {
                                console.log(`   🧹 Cleaned ${count} pending invites for ${account.email}`);
                            }
                        })
                        .catch(error => {
                            console.error(`   ❌ Failed to cleanup pending invites for ${account.email}:`, error.message);
                        });

                    // Only keep authorized non-admin members (in allowedMembers)
                    const authorizedNonAdminMembers = nonAdminMembers.filter(m => {
                        const memberEmail = (m.email || '').toLowerCase();
                        return allowedEmailsLower.includes(memberEmail);
                    });

                    // AUTO-LIMIT: If total members (admin + authorized) > 8, delete newest members
                    const MAX_MEMBERS = 8;
                    const totalCount = 1 + authorizedNonAdminMembers.length; // 1 for admin
                    
                    let finalAuthorizedMembers = authorizedNonAdminMembers;
                    
                    if (totalCount > MAX_MEMBERS) {
                        const excessCount = totalCount - MAX_MEMBERS;
                        console.log(`⚠️  [${account.email}] Total ${totalCount} members exceeds limit ${MAX_MEMBERS}. Deleting ${excessCount} newest members...`);
                        
                        // Sort by created_time DESC (newest first) to identify newest members
                        const sortedMembers = [...authorizedNonAdminMembers].sort((a, b) => {
                            const timeA = new Date(a.created_time || a.created_at || 0).getTime();
                            const timeB = new Date(b.created_time || b.created_at || 0).getTime();
                            return timeB - timeA; // DESC: newest first
                        });
                        
                        // Take first N members as excess (newest members)
                        const membersToDelete = sortedMembers.slice(0, excessCount);
                        
                        // Delete in background
                        for (const member of membersToDelete) {
                            try {
                                await this.curlService.deleteMember(
                                    account.accountId,
                                    member.id,
                                    account.accessToken
                                );
                                console.log(`   ✅ Deleted newest member: ${member.email}`);
                            } catch (error) {
                                console.error(`   ❌ Failed to delete ${member.email}:`, error.message);
                            }
                        }
                        
                        // Keep only the remaining members (oldest members that fit in limit)
                        finalAuthorizedMembers = sortedMembers.slice(excessCount);
                    }

                    // Create an admin member representation so UI and counts include admin
                    const adminMemberObj = account.email ? { id: 'admin', email: account.email, is_admin: true } : null;

                    // Members to present: admin (if exists) + authorized non-admin members (limited to 7 max)
                    const membersToShow = adminMemberObj ? [adminMemberObj, ...finalAuthorizedMembers] : [...finalAuthorizedMembers];

                    results.push({
                        _id: account._id.toString(),
                        name: account.name || 'Unnamed Account',
                        email: account.email,
                        accountId: account.accountId,
                        members_count: membersToShow.length, // include admin
                        members: membersToShow, // include admin as first item
                        allowedMembers: account.allowedMembers || [],
                        maxMembers: account.maxMembers || 7,
                        createdAt: account.createdAt,
                        updatedAt: account.updatedAt,
                        unauthorized_deleted: unauthorizedMembers.length,
                        success: true
                    });
                } catch (error) {
                    results.push({
                        _id: account._id.toString(),
                        name: account.name || 'Unnamed Account',
                        email: account.email,
                        accountId: account.accountId,
                        members_count: 0,
                        members: [],
                        allowedMembers: account.allowedMembers || [],
                        maxMembers: account.maxMembers || 7,
                        createdAt: account.createdAt,
                        updatedAt: account.updatedAt,
                        error: error.message,
                        success: false
                    });
                }
            }

            // Calculate total
            const totalMembers = results
                .filter(r => r.success)
                .reduce((sum, r) => sum + r.members_count, 0);

            // Send update
            ws.send(JSON.stringify({
                type: 'members_update',
                data: {
                    total_accounts: accounts.length,
                    total_members: totalMembers,
                    accounts: results
                },
                timestamp: new Date().toISOString()
            }));

            console.log(`📊 Sent members update to user ${userId}: ${totalMembers} members across ${accounts.length} accounts`);
        } catch (error) {
            console.error(`Error fetching members for user ${userId}:`, error);
            ws.send(JSON.stringify({
                type: 'error',
                message: 'Error fetching members data',
                error: error.message
            }));
        }
    }

    startAutoRefresh(userId) {
        // Clear any existing interval
        if (this.clients.has(userId)) {
            const ws = this.clients.get(userId);
            if (ws.refreshInterval) {
                clearInterval(ws.refreshInterval);
            }

            // Set new interval (30 seconds)
            ws.refreshInterval = setInterval(async () => {
                const client = this.clients.get(userId);
                if (!client || client.readyState !== 1) {
                    clearInterval(ws.refreshInterval);
                    return;
                }
                await this.sendMembersCount(userId);
            }, 30000); // 30 seconds
        }
    }

    stopAutoRefresh(userId) {
        const ws = this.clients.get(userId);
        if (ws && ws.refreshInterval) {
            clearInterval(ws.refreshInterval);
            ws.refreshInterval = null;
        }
    }

    /**
     * Auto cleanup pending invites that are not in allowedMembers
     * Runs in background without blocking
     * Returns: number of cleaned invites
     */
    async autoCleanupPendingInvites(account, allowedEmailsLower) {
        try {
            // Get pending invites
            const result = await this.inviteService.getPendingInvites(
                account.accountId,
                account.accessToken
            );

            if (!result.success || !result.invites || result.invites.length === 0) {
                return 0; // No pending invites, nothing to do
            }

            // Find unauthorized pending invites (not in allowedMembers)
            const unauthorizedInvites = result.invites.filter(invite => {
                const inviteEmail = (invite.email_address || invite.email || '').toLowerCase();
                return inviteEmail && !allowedEmailsLower.includes(inviteEmail);
            });

            if (unauthorizedInvites.length === 0) {
                return 0; // All pending invites are authorized
            }

            console.log(`🧹 [${account.email}] Found ${unauthorizedInvites.length} unauthorized pending invites, auto-cleaning...`);

            let cleanedCount = 0;
            // Delete each unauthorized pending invite
            for (const invite of unauthorizedInvites) {
                try {
                    const emailToDelete = invite.email_address || invite.email;
                    await this.inviteService.deletePendingInvite(
                        account.accountId,
                        account.accessToken,
                        emailToDelete
                    );
                    console.log(`   ✅ Deleted pending invite: ${emailToDelete}`);
                    cleanedCount++;
                    
                    // Small delay to avoid rate limiting
                    await new Promise(resolve => setTimeout(resolve, 300));
                } catch (error) {
                    const emailToDelete = invite.email_address || invite.email;
                    console.error(`   ❌ Failed to delete pending invite ${emailToDelete}:`, error.message);
                }
            }
            
            return cleanedCount;
        } catch (error) {
            // Silent fail - just log the error
            console.error(`⚠️  [${account.email}] Error in auto-cleanup pending invites:`, error.message);
            return 0;
        }
    }
}

export default WebSocketService;
