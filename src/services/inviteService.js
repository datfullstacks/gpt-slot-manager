import fetch from 'node-fetch';

class InviteService {
    constructor() {
        this.baseUrl = 'https://chatgpt.com/backend-api/accounts';
    }

    async sendInvites(accountId, accessToken, emailAddresses, resendEmails = true) {
        const url = `${this.baseUrl}/${accountId}/invites`;
        
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
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36'
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

    async sendInvitesToMultipleAccounts(accounts, maxConcurrent = 5) {
        const pLimit = (await import('p-limit')).default;
        const limit = pLimit(maxConcurrent);

        const tasks = accounts.map(account => 
            limit(async () => {
                try {
                    // Filter emails: only send to allowed members
                    const emailsToInvite = account.allowedMembers || [];
                    
                    if (emailsToInvite.length === 0) {
                        return {
                            email: account.email,
                            accountId: account.accountId,
                            success: false,
                            error: 'No allowed members to invite',
                            invited_count: 0
                        };
                    }

                    const result = await this.sendInvites(
                        account.accountId,
                        account.accessToken,
                        emailsToInvite,
                        true
                    );

                    return {
                        email: account.email,
                        accountId: account.accountId,
                        success: true,
                        invited_count: result.invited_count,
                        data: result.data
                    };
                } catch (error) {
                    return {
                        email: account.email,
                        accountId: account.accountId,
                        success: false,
                        error: error.message,
                        invited_count: 0
                    };
                }
            })
        );

        return Promise.all(tasks);
    }
}

export default InviteService;
