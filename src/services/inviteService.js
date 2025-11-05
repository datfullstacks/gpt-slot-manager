import fetch from 'node-fetch';

class InviteService {
    constructor() {
        this.baseUrl = 'https://chatgpt.com/backend-api/accounts';
        this.userAgents = [
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
            "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36"
        ];
    }

    getRandomUserAgent() {
        return this.userAgents[Math.floor(Math.random() * this.userAgents.length)];
    }

    async sendInvites(accountId, accessToken, emailAddresses, resendEmails = true) {
        const url = `${this.baseUrl}/${accountId}/invites`;
        
        // Random user agent per request
        const userAgent = this.getRandomUserAgent();
        
        // Standard headers based on your curl
        const headers = {
            'accept': '*/*',
            'accept-language': 'en-US,en;q=0.9',
            'authorization': `Bearer ${accessToken}`,
            'chatgpt-account-id': accountId,
            'content-type': 'application/json',
            'origin': 'https://chatgpt.com',
            'referer': 'https://chatgpt.com/',
            'sec-fetch-dest': 'empty',
            'sec-fetch-mode': 'cors',
            'sec-fetch-site': 'same-origin',
            'user-agent': userAgent
        };

        const payload = {
            email_addresses: emailAddresses,
            role: 'standard-user',
            resend_emails: resendEmails
        };

        console.log(`📧 Sending invites to ${emailAddresses.length} emails for account ${accountId}...`);

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error(`Invite failed with status ${response.status}:`, errorText);
                throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
            }

            const data = await response.json();
            console.log(`✅ Invites sent successfully:`, data);
            
            return {
                success: true,
                data: data,
                invited_count: emailAddresses.length
            };
        } catch (error) {
            console.error('Error sending invites:', error);
            throw error;
        }
    }

    async sendInvitesToMultipleAccounts(accounts) {
        const results = [];
        
        console.log(`🔄 Sending invites to ${accounts.length} accounts SEQUENTIALLY...`);
        
        // Chạy TUẦN TỰ để tránh 403
        for (let i = 0; i < accounts.length; i++) {
            const account = accounts[i];
            
            try {
                console.log(`\n[${i + 1}/${accounts.length}] Processing account ${account.email}...`);
                
                // Filter emails: only send to allowed members
                const emailsToInvite = account.allowedMembers || [];
                
                if (emailsToInvite.length === 0) {
                    results.push({
                        email: account.email,
                        accountId: account.accountId,
                        success: false,
                        error: 'No allowed members to invite',
                        invited_count: 0
                    });
                    console.log(`⚠️  No allowed members for ${account.email}`);
                    continue;
                }

                const result = await this.sendInvites(
                    account.accountId,
                    account.accessToken,
                    emailsToInvite,
                    true
                );

                results.push({
                    email: account.email,
                    accountId: account.accountId,
                    success: true,
                    invited_count: result.invited_count,
                    data: result.data
                });
                
                console.log(`✅ [${i + 1}/${accounts.length}] Sent ${result.invited_count} invites for ${account.email}`);
                
            } catch (error) {
                console.error(`❌ [${i + 1}/${accounts.length}] Failed for ${account.email}:`, error.message);
                results.push({
                    email: account.email,
                    accountId: account.accountId,
                    success: false,
                    error: error.message,
                    invited_count: 0
                });
            }
            
            // Random delay 15-30 giây giữa các account (trừ account cuối cùng)
            if (i < accounts.length - 1) {
                const delay = Math.floor(Math.random() * 15000) + 15000; // 15000-30000ms (15-30s)
                console.log(`⏳ Waiting ${delay / 1000}s before next account...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }

        console.log(`\n✅ Completed sending invites to ${accounts.length} accounts`);
        return results;
    }

    async getPendingInvites(accountId, accessToken, offset = 0, limit = 100) {
        const url = `${this.baseUrl}/${accountId}/invites?offset=${offset}&limit=${limit}&query=`;
        
        const userAgent = this.getRandomUserAgent();
        
        const headers = {
            'accept': '*/*',
            'accept-language': 'en-US,en;q=0.9',
            'authorization': `Bearer ${accessToken}`,
            'chatgpt-account-id': accountId,
            'origin': 'https://chatgpt.com',
            'referer': 'https://chatgpt.com/',
            'sec-fetch-dest': 'empty',
            'sec-fetch-mode': 'cors',
            'sec-fetch-site': 'same-origin',
            'user-agent': userAgent
        };

        console.log(`📋 Fetching pending invites for account ${accountId}...`);

        try {
            const response = await fetch(url, {
                method: 'GET',
                headers: headers
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error(`Get pending invites failed with status ${response.status}:`, errorText);
                throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
            }

            const data = await response.json();
            console.log(`✅ Retrieved ${data.items?.length || 0} pending invites`);
            
            return {
                success: true,
                invites: data.items || [],
                total: data.total || 0
            };
        } catch (error) {
            console.error('Error fetching pending invites:', error);
            throw error;
        }
    }

    async deletePendingInvite(accountId, accessToken, emailAddress) {
        const url = `${this.baseUrl}/${accountId}/invites`;
        
        const userAgent = this.getRandomUserAgent();
        
        const headers = {
            'accept': '*/*',
            'accept-language': 'en-US,en;q=0.9',
            'authorization': `Bearer ${accessToken}`,
            'chatgpt-account-id': accountId,
            'content-type': 'application/json',
            'origin': 'https://chatgpt.com',
            'referer': 'https://chatgpt.com/',
            'sec-fetch-dest': 'empty',
            'sec-fetch-mode': 'cors',
            'sec-fetch-site': 'same-origin',
            'user-agent': userAgent
        };

        const payload = {
            email_address: emailAddress
        };

        console.log(`🗑️ Deleting pending invite for ${emailAddress} from account ${accountId}...`);

        try {
            const response = await fetch(url, {
                method: 'DELETE',
                headers: headers,
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error(`Delete invite failed with status ${response.status}:`, errorText);
                throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
            }

            console.log(`✅ Successfully deleted invite for ${emailAddress}`);
            
            return {
                success: true,
                email: emailAddress
            };
        } catch (error) {
            console.error('Error deleting pending invite:', error);
            throw error;
        }
    }

    async cleanupPendingInvites(accountId, accessToken, allowedMembers = [], gracePeriodMinutes = 5) {
        try {
            // Get all pending invites
            const pendingResult = await this.getPendingInvites(accountId, accessToken);
            
            if (!pendingResult.success || pendingResult.invites.length === 0) {
                return {
                    success: true,
                    message: 'No pending invites to cleanup',
                    deleted: [],
                    failed: []
                };
            }

            // Get current time
            const now = new Date();
            const gracePeriodMs = gracePeriodMinutes * 60 * 1000;

            // Filter invites that are NOT in allowedMembers AND past grace period
            const unauthorizedInvites = pendingResult.invites.filter(invite => {
                const inviteEmail = (invite.email_address || invite.email)?.toLowerCase();
                
                // Check if in allowedMembers
                const isAllowed = allowedMembers.some(allowed => allowed.toLowerCase() === inviteEmail);
                if (isAllowed) {
                    return false; // Keep it
                }

                // Check grace period (if invite has timestamp)
                if (invite.created_at || invite.invited_at) {
                    const inviteTime = new Date(invite.created_at || invite.invited_at);
                    const age = now - inviteTime;
                    
                    if (age < gracePeriodMs) {
                        console.log(`⏳ Skipping ${inviteEmail} - within grace period (${Math.round(age/1000)}s old)`);
                        return false; // Keep it - too new
                    }
                }

                // Not in allowedMembers and past grace period (or no timestamp) - delete it
                return true;
            });

            console.log(`🧹 Found ${unauthorizedInvites.length} unauthorized pending invites to cleanup (${pendingResult.invites.length} total)`);

            if (unauthorizedInvites.length === 0) {
                return {
                    success: true,
                    message: 'All pending invites are authorized or within grace period',
                    deleted: [],
                    failed: []
                };
            }

            // Delete each unauthorized invite with delay
            const deleted = [];
            const failed = [];

            for (const invite of unauthorizedInvites) {
                try {
                    const emailToDelete = invite.email_address || invite.email;
                    await this.deletePendingInvite(accountId, accessToken, emailToDelete);
                    deleted.push(emailToDelete);
                    
                    // Add 500ms delay between deletions
                    await new Promise(resolve => setTimeout(resolve, 500));
                } catch (error) {
                    const emailToDelete = invite.email_address || invite.email;
                    console.error(`Failed to delete invite for ${emailToDelete}:`, error.message);
                    failed.push({ email: emailToDelete, error: error.message });
                }
            }

            return {
                success: true,
                message: `Cleanup completed: ${deleted.length} deleted, ${failed.length} failed`,
                deleted,
                failed,
                gracePeriod: `${gracePeriodMinutes} minutes`
            };
        } catch (error) {
            console.error('Error during cleanup:', error);
            throw error;
        }
    }
}

export default InviteService;
