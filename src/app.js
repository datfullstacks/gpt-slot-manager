import express from 'express';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer } from 'http';
import connectDB from './config/database.js';
import authRoutes from './routes/auth.js';
import accountsRoutes from './routes/accounts.js';
import WebSocketService from './services/websocketService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env') });

// Connect to MongoDB
await connectDB();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Serve static files from public directory
app.use(express.static(path.resolve(__dirname, '../public')));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/accounts', accountsRoutes);
console.log('Routes loaded:');
console.log('  - /api/auth (register, login, profile)');
console.log('  - /api/accounts (CRUD + process)');

// Serve index.html for root path
app.get('/', (req, res) => {
    res.sendFile(path.resolve(__dirname, '../public/index.html'));
});

// Create HTTP server and WebSocket
const server = createServer(app);
const wsService = new WebSocketService(server);

// Start the server
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log(`WebSocket available on ws://localhost:${PORT}/ws`);
});