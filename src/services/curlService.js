import pLimit from 'p-limit';

class CurlService {
    constructor() {
        this.baseUrl = "https://chatgpt.com/backend-api/accounts";
        // Danh sách user-agents khác nhau để tránh rate limit
        this.userAgents = [
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36",
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1.1 Safari/605.1.15",
            "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0",
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:109.0) Gecko/20100101 Firefox/121.0",
            "Mozilla/5.0 (X11; Linux x86_64; rv:109.0) Gecko/20100101 Firefox/121.0",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Edge/120.0.0.0"
        ];
        this.limit = pLimit(10); // Giới hạn 10 luồng đồng thời
    }

    // Hàm lấy user-agent ngẫu nhiên
    getRandomUserAgent() {
        return this.userAgents[Math.floor(Math.random() * this.userAgents.length)];
    }

    // Hàm lấy account ID từ session API
    async getAccountIdFromSession(accessToken) {
        try {
            const sessionUrl = 'https://chatgpt.com/backend-api/accounts/check';
            const response = await fetch(sessionUrl, {
                method: 'GET',
                headers: {
                    'authorization': `Bearer ${accessToken}`,
                    'accept': '*/*',
                    'user-agent': this.getRandomUserAgent()
                }
            });

            if (!response.ok) {
                throw new Error(`Failed to get session: ${response.status}`);
            }

            const data = await response.json();
            
            // Thử lấy account ID từ response
            if (data.account && data.account.account_id) {
                return data.account.account_id;
            }
            
            if (data.accounts && data.accounts.length > 0) {
                return data.accounts[0].account_id;
            }
            
            throw new Error('No account ID found in session response');
        } catch (error) {
            console.error('Error getting account ID from session:', error);
            throw error;
        }
    }

    async executeCurl(accountId, accessToken, additionalHeaders = {}) {
        // Nếu accountId không hợp lệ, thử lấy từ API session trước
        let finalAccountId = accountId;
        
        if (!accountId || accountId === 'unknown') {
            console.log(`⚠️  Account ID không có, đang lấy từ session...`);
            try {
                finalAccountId = await this.getAccountIdFromSession(accessToken);
                console.log(`✅ Đã lấy account ID: ${finalAccountId}`);
            } catch (error) {
                console.error(`❌ Không thể lấy account ID:`, error.message);
                throw new Error(`Account ID không hợp lệ và không thể tự động lấy: ${error.message}`);
            }
        }
        
        const url = `${this.baseUrl}/${finalAccountId}/users?offset=0&limit=25&query=`;
        const userAgent = this.getRandomUserAgent(); // User-agent khác nhau cho mỗi request
        const headers = {
            "accept": "*/*",
            "accept-language": "en-US,en;q=0.9,fr-FR;q=0.8,fr;q=0.7,vi;q=0.6",
            "authorization": `Bearer ${accessToken}`,
            "oai-client-version": "prod-9f5aa1f7b48d4577791d0e660bac1111ba132ee6",
            "oai-language": "en-US",
            "priority": "u=1, i",
            "referer": "https://chatgpt.com/admin/members",
            "sec-ch-ua": '"Google Chrome";v="141", "Not?A_Brand";v="8", "Chromium";v="141"',
            "sec-ch-ua-arch": '"x86"',
            "sec-ch-ua-bitness": '"64"',
            "sec-ch-ua-full-version": '"141.0.7390.123"',
            "sec-ch-ua-full-version-list": '"Google Chrome";v="141.0.7390.123", "Not?A_Brand";v="8.0.0.0", "Chromium";v="141.0.7390.123"',
            "sec-ch-ua-mobile": "?0",
            "sec-ch-ua-model": '""',
            "sec-ch-ua-platform": '"Windows"',
            "sec-ch-ua-platform-version": '"19.0.0"',
            "sec-fetch-dest": "empty",
            "sec-fetch-mode": "cors",
            "sec-fetch-site": "same-origin",
            "user-agent": userAgent, // Gán user-agent ngẫu nhiên
            ...Object.fromEntries(Object.entries(additionalHeaders).filter(([key]) => !key.toLowerCase().includes('cookie') && key !== 'oai-device-id'))
        };

        const options = {
            method: 'GET',
            headers: headers
        };

        // Retry logic (cơ bản, 3 lần nếu fail)
        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                const response = await fetch(url, options);
                if (!response.ok) {
                    if (response.status === 429) {
                        // Rate limit, sleep và retry
                        console.log(`⏳ Rate limited for account ${finalAccountId}, retry ${attempt}/3...`);
                        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
                        continue;
                    }
                    if (response.status === 422) {
                        // Unprocessable Entity - có thể là account ID sai
                        const errorText = await response.text();
                        console.error(`❌ 422 Error for account ${finalAccountId}:`, errorText);
                        throw new Error(`HTTP 422: Account ID có thể không đúng hoặc token hết hạn`);
                    }
                    if (response.status === 401) {
                        // Unauthorized - session expired
                        throw new Error(`HTTP 401: Session expired - need re-login`);
                    }
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                const data = await response.json();
                return data;
            } catch (error) {
                if (attempt === 3) {
                    console.error(`❌ Error executing curl for account ${finalAccountId} after 3 attempts:`, error);
                    throw error;
                }
                console.log(`⚠️  Attempt ${attempt} failed for ${finalAccountId}, retrying...`);
                await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
            }
        }
    }

    async executeMultipleCurls(accounts) {
        const results = [];
        const promises = accounts.map(account =>
            this.limit(() => this.executeCurl(account.id, account.accessToken, account.additionalHeaders || {}))
                .then(result => results.push({ accountId: account.id, data: result }))
                .catch(error => {
                    console.error(`Failed for account ${account.id}:`, error);
                    results.push({ accountId: account.id, error: error.message });
                })
        );

        await Promise.all(promises); // Chạy tất cả với concurrency = 10
        return results;
    }

    // Delete member from account
    async deleteMember(accountId, userId, accessToken) {
        try {
            const url = `${this.baseUrl}/${accountId}/users/${userId}`;
            
            console.log(`🗑️  Deleting member ${userId} from account ${accountId}...`);
            
            const response = await fetch(url, {
                method: 'DELETE',
                headers: {
                    'authorization': `Bearer ${accessToken}`,
                    'chatgpt-account-id': accountId,
                    'accept': '*/*',
                    'user-agent': this.getRandomUserAgent()
                }
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Failed to delete member: ${response.status} - ${errorText}`);
            }

            console.log(`✅ Successfully deleted member ${userId} from account ${accountId}`);
            
            return { success: true, userId, accountId };
        } catch (error) {
            console.error(`❌ Error deleting member ${userId} from account ${accountId}:`, error);
            throw error;
        }
    }
}

export default CurlService;