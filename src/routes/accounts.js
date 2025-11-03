import express from 'express';
import AccountsController from '../controllers/accountsController.js';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { codeVerificationMiddleware } from '../middleware/codeVerificationMiddleware.js';

const router = express.Router();
const accountsController = new AccountsController();

// All routes require authentication AND code verification
router.use(authMiddleware);
router.use(codeVerificationMiddleware);

// Routes are already mounted at /api/accounts in app.js
// So these paths are relative to /api/accounts
router.post('/', accountsController.createAccount.bind(accountsController));
router.get('/', accountsController.getAccounts.bind(accountsController));
router.post('/process', accountsController.processAccounts.bind(accountsController));
router.put('/:id/allowed-members', accountsController.updateAllowedMembers.bind(accountsController));
router.post('/:id/send-invites', accountsController.sendInvites.bind(accountsController));
router.post('/send-invites-all', accountsController.sendInvitesToAll.bind(accountsController));
router.post('/:accountId/auto-cleanup', accountsController.autoCleanupMembers.bind(accountsController));
router.post('/auto-cleanup-all', accountsController.autoCleanupAllAccounts.bind(accountsController));

// Pending invites routes
router.get('/:id/pending-invites', accountsController.getPendingInvites.bind(accountsController));
router.post('/:id/cleanup-pending-invites', accountsController.cleanupPendingInvites.bind(accountsController));
router.post('/cleanup-all-pending-invites', accountsController.cleanupAllPendingInvites.bind(accountsController));

router.delete('/:accountId/members/:userId', accountsController.deleteMember.bind(accountsController));
router.delete('/:id', accountsController.deleteAccount.bind(accountsController));

export default router;
