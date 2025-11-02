// Temporary in-memory storage for testing without Firebase
class InMemoryStorage {
    constructor() {
        this.accounts = new Map();
        console.log('⚠️ Using IN-MEMORY storage (data will be lost on restart)');
    }

    async save(email, data) {
        this.accounts.set(email, {
            ...data,
            email,
            createdAt: new Date()
        });
        return this.accounts.get(email);
    }

    async findByEmail(email) {
        return this.accounts.get(email) || null;
    }

    async findAll() {
        return Array.from(this.accounts.values()).map(acc => ({
            id: acc.email,
            email: acc.email,
            accessToken: acc.accessToken,
            additionalHeaders: acc.additionalHeaders || {}
        }));
    }

    async update(email, updates) {
        const existing = this.accounts.get(email);
        if (existing) {
            this.accounts.set(email, { ...existing, ...updates });
            return this.accounts.get(email);
        }
        return null;
    }

    async delete(email) {
        return this.accounts.delete(email);
    }
}

export default new InMemoryStorage();
