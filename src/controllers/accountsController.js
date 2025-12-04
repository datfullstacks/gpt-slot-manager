import Account from "../models/accountModel.js";
import CurlService from "../services/curlService.js";
import InviteService from "../services/inviteService.js";

class AccountsController {
  constructor() {
    this.curlService = new CurlService();
    this.inviteService = new InviteService();
  }

  async createAccount(req, res) {
    try {
      console.log("Creating account with data:", req.body);
      const {
        name,
        email,
        accountId,
        accessToken,
        additionalHeaders,
        allowedMembers,
        maxMembers,
      } = req.body;
      const userId = req.userId; // From auth middleware

      // If accountId not provided, try to extract from token or use email
      const finalAccountId = accountId || email.split("@")[0] || "unknown";

      // Validate and filter allowed members (excluding admin email)
      const validAllowedMembers = (allowedMembers || []).filter(
        (m) => m && m.toLowerCase() !== email.toLowerCase() && m.includes("@")
      );

      const account = new Account({
        userId,
        name: name || 'Unnamed Account',
        email,
        accountId: finalAccountId,
        accessToken,
        additionalHeaders: additionalHeaders || {},
        allowedMembers: validAllowedMembers,
        maxMembers: maxMembers || 7,
      });

      await account.save();
      console.log("Account saved successfully:", email, "for user:", userId);
      res.status(201).json({ message: "Account created", account });
    } catch (error) {
      console.error("Error creating account:", error);
      res
        .status(500)
        .json({ message: "Error creating account", error: error.message });
    }
  }

  async getAccounts(req, res) {
    try {
      const userId = req.userId; // From auth middleware
      
      // Pagination parameters
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 20;
      const skip = (page - 1) * limit;
      
      // Search parameters
      const search = req.query.search || '';
      
      // Date filter parameters
      const dateFrom = req.query.dateFrom; // ISO string or date string
      const dateTo = req.query.dateTo;
      const dateField = req.query.dateField || 'createdAt'; // 'createdAt' or 'updatedAt'
      
      // Sort parameters
      const sortBy = req.query.sortBy || 'createdAt';
      const sortOrder = req.query.sortOrder || 'desc';
      
      // Build query
      let query = { userId };
      
      // Add search filter
      if (search) {
        query.$or = [
          { name: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } },
          { accountId: { $regex: search, $options: 'i' } }
        ];
      }
      
      // Add date range filter
      if (dateFrom || dateTo) {
        query[dateField] = {};
        
        if (dateFrom) {
          const fromDate = new Date(dateFrom);
          fromDate.setHours(0, 0, 0, 0); // Start of day
          query[dateField].$gte = fromDate;
        }
        
        if (dateTo) {
          const toDate = new Date(dateTo);
          toDate.setHours(23, 59, 59, 999); // End of day
          query[dateField].$lte = toDate;
        }
      }
      
      // Build sort object
      const sortObject = {};
      sortObject[sortBy] = sortOrder === 'desc' ? -1 : 1;
      
      // Execute query with pagination
      const accounts = await Account.find(query)
        .select("-accessToken") // Don't expose tokens
        .sort(sortObject)
        .limit(limit)
        .skip(skip);
      
      // Get total count for pagination
      const totalAccounts = await Account.countDocuments(query);
      const totalPages = Math.ceil(totalAccounts / limit);
      
      // Response with pagination metadata
      res.status(200).json({
        success: true,
        data: accounts,
        pagination: {
          currentPage: page,
          totalPages: totalPages,
          totalAccounts: totalAccounts,
          limit: limit,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1
        }
      });
    } catch (error) {
      res
        .status(500)
        .json({ 
          success: false,
          message: "Error retrieving accounts", 
          error: error.message 
        });
    }
  }

  // Get single account by ID (for row updates)
  async getAccountById(req, res) {
    try {
      const { id } = req.params;
      const userId = req.userId;

      const account = await Account.findOne({ _id: id, userId });

      if (!account) {
        return res.status(404).json({
          success: false,
          message: 'Account not found'
        });
      }

      res.status(200).json(account);
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error retrieving account',
        error: error.message
      });
    }
  }

  async processAccounts(req, res) {
    try {
      const userId = req.userId; // From auth middleware
      const accounts = await Account.find({ userId });

      if (accounts.length === 0) {
        return res
          .status(404)
          .json({ message: "No accounts found for this user" });
      }

      const accountsData = accounts.map((acc) => ({
        id: acc.accountId,
        email: acc.email,
        accountId: acc.accountId,
        accessToken: acc.accessToken,
        additionalHeaders: acc.additionalHeaders,
      }));

      console.log(
        `Processing ${accounts.length} accounts for user ${userId}...`
      );
      const results = await this.curlService.executeMultipleCurls(accountsData);

      res.status(200).json({
        message: `Processed ${accounts.length} accounts`,
        results,
      });
    } catch (error) {
      res
        .status(500)
        .json({ message: "Error processing accounts", error: error.message });
    }
  }

  async deleteAccount(req, res) {
    try {
      const userId = req.userId;
      const accountId = req.params.id;

      const account = await Account.findOneAndDelete({
        _id: accountId,
        userId,
      });
      if (!account) {
        return res.status(404).json({ message: "Account not found" });
      }

      res.status(200).json({ message: "Account deleted successfully" });
    } catch (error) {
      res
        .status(500)
        .json({ message: "Error deleting account", error: error.message });
    }
  }

  async updateAllowedMembers(req, res) {
    try {
      const userId = req.userId;
      const accountId = req.params.id;
      const { allowedMembers } = req.body;

      // Find account and get admin email
      const account = await Account.findOne({ _id: accountId, userId });
      if (!account) {
        return res.status(404).json({ message: "Account not found" });
      }

      // Validate and filter allowed members (excluding admin email)
      const validAllowedMembers = (allowedMembers || []).filter(
        (m) =>
          m &&
          m.toLowerCase() !== account.email.toLowerCase() &&
          m.includes("@")
      );

      account.allowedMembers = validAllowedMembers;
      account.updatedAt = Date.now();
      await account.save();

      res.status(200).json({
        message: "Allowed members updated successfully",
        allowedMembers: validAllowedMembers,
      });
    } catch (error) {
      res
        .status(500)
        .json({
          message: "Error updating allowed members",
          error: error.message,
        });
    }
  }

  async sendInvites(req, res) {
    try {
      const userId = req.userId;
      const accountId = req.params.id;
      const { emails, autoCleanup = true } = req.body; // Array of emails to invite + auto cleanup flag

      // Find account
      const account = await Account.findOne({ _id: accountId, userId });
      if (!account) {
        return res.status(404).json({ message: "Account not found" });
      }

      // AUTO CLEANUP: Clean unauthorized pending invites BEFORE sending new ones
      let cleanupResult = null;
      if (autoCleanup) {
        try {
          console.log(`🧹 Auto-cleaning pending invites before sending new invites...`);
          cleanupResult = await this.inviteService.cleanupPendingInvites(
            account.accountId,
            account.accessToken,
            account.allowedMembers
          );
          console.log(`✅ Cleanup completed: ${cleanupResult.deleted?.length || 0} deleted`);
        } catch (error) {
          console.warn(`⚠️  Auto-cleanup failed (continuing anyway):`, error.message);
        }
      }

      // Get current allowed members
      let currentAllowedMembers = account.allowedMembers || [];
      const adminEmail = account.email.toLowerCase();

      // Emails to invite (from request or from allowed members)
      let emailsToInvite = [];

      if (emails && emails.length > 0) {
        // New emails from request
        const newEmails = emails
          .map((e) => e.trim().toLowerCase())
          .filter((e) => e && e !== adminEmail && e.includes("@"));

        // Check for duplicates across ALL accounts
        const allAccounts = await Account.find({ userId });
        const allExistingEmails = new Set();
        allAccounts.forEach((acc) => {
          (acc.allowedMembers || []).forEach((email) => {
            allExistingEmails.add(email.toLowerCase());
          });
        });

        // Filter out duplicates
        const duplicates = [];
        const validNewEmails = [];

        newEmails.forEach((email) => {
          if (allExistingEmails.has(email)) {
            duplicates.push(email);
          } else {
            validNewEmails.push(email);
          }
        });

        if (duplicates.length > 0) {
          return res.status(400).json({
            message: "Some emails already exist in other accounts",
            duplicates: duplicates,
          });
        }

        // Check limit: max 7 members per account
        const totalAfterAdd =
          currentAllowedMembers.length + validNewEmails.length;
        if (totalAfterAdd > 7) {
          return res.status(400).json({
            message: `Cannot add ${validNewEmails.length} emails. Current: ${
              currentAllowedMembers.length
            }, Max: 7, Available: ${7 - currentAllowedMembers.length}`,
          });
        }

        emailsToInvite = validNewEmails;

        // Add to allowed members
        currentAllowedMembers = [...currentAllowedMembers, ...validNewEmails];
        account.allowedMembers = currentAllowedMembers;
        await account.save();
      } else {
        // No new emails, use existing allowed members
        emailsToInvite = currentAllowedMembers;

        if (emailsToInvite.length === 0) {
          return res
            .status(400)
            .json({
              message:
                "No emails to invite. Please provide emails or set allowed members first.",
            });
        }
      }

      // ✅ Send invites to ChatGPT API FIRST
      console.log(`📧 Sending invites to ChatGPT API for ${emailsToInvite.length} email(s)...`);
      
      let result;
      try {
        result = await this.inviteService.sendInvites(
          account.accountId,
          account.accessToken,
          emailsToInvite,
          true
        );
        console.log(`✅ ChatGPT API accepted invites successfully`);
      } catch (inviteError) {
        // ❌ If invite fails, DO NOT save to DB
        console.error(`❌ Failed to send invites to ChatGPT:`, inviteError.message);
        
        // Rollback: Remove emails from allowedMembers if they were added
        const emailsToRemove = emailsToInvite.filter(e => 
          !currentAllowedMembers.includes(e)
        );
        
        if (emailsToRemove.length > 0) {
          account.allowedMembers = account.allowedMembers.filter(
            e => !emailsToRemove.includes(e)
          );
          await account.save();
          console.log(`🔄 Rolled back ${emailsToRemove.length} emails from allowedMembers`);
        }
        
        // Return specific error
        if (inviteError.message.includes('403')) {
          return res.status(403).json({
            message: "Access forbidden. Please check your access token.",
            error: inviteError.message
          });
        } else if (inviteError.message.includes('429')) {
          return res.status(429).json({
            message: "Rate limit exceeded. Please try again later.",
            error: inviteError.message
          });
        } else {
          return res.status(500).json({
            message: "Failed to send invites to ChatGPT",
            error: inviteError.message
          });
        }
      }

      // ✅ ONLY save to DB if ChatGPT API succeeded
      const newEmailsToAdd = emailsToInvite.filter(e => 
        !currentAllowedMembers.includes(e)
      );
      
      if (newEmailsToAdd.length > 0) {
        console.log(`💾 Saving ${newEmailsToAdd.length} emails to allowedMembers...`);
        account.allowedMembers = [...new Set([...account.allowedMembers, ...newEmailsToAdd])];
        await account.save();
        console.log(`✅ Emails saved to database`);
      }

      res.status(200).json({
        message: "Invites sent successfully",
        account: account.email,
        invited_count: result.invited_count,
        total_allowed_members: account.allowedMembers.length,
        remaining_slots: 7 - account.allowedMembers.length,
        cleanup: cleanupResult ? {
          deleted: cleanupResult.deleted?.length || 0,
          failed: cleanupResult.failed?.length || 0,
          emails_deleted: cleanupResult.deleted || []
        } : null,
        data: result.data,
        protected_emails: emailsToInvite, // Show which emails were added to allowedMembers
      });
    } catch (error) {
      console.error("Error sending invites:", error);
      res
        .status(500)
        .json({ message: "Error sending invites", error: error.message });
    }
  }

  async sendInvitesToAll(req, res) {
    try {
      const userId = req.userId;
      const { autoCleanup = true } = req.body; // Auto cleanup flag

      // Get all accounts
      const accounts = await Account.find({ userId });

      if (accounts.length === 0) {
        return res.status(404).json({ message: "No accounts found" });
      }

      // AUTO CLEANUP ALL if requested
      let totalCleaned = 0;
      if (autoCleanup) {
        console.log(`🧹 Auto-cleaning pending invites for all accounts before sending...`);
        for (const account of accounts) {
          try {
            const cleanupResult = await this.inviteService.cleanupPendingInvites(
              account.accountId,
              account.accessToken,
              account.allowedMembers
            );
            totalCleaned += cleanupResult.deleted?.length || 0;
            console.log(`  ✅ ${account.email}: ${cleanupResult.deleted?.length || 0} cleaned`);
            // Small delay between cleanups
            await new Promise(resolve => setTimeout(resolve, 500));
          } catch (error) {
            console.warn(`  ⚠️  ${account.email}: cleanup failed -`, error.message);
          }
        }
        console.log(`✅ Total cleaned: ${totalCleaned} pending invites`);
      }

      // Send invites to all accounts
      console.log(`📧 Sending invites for ${accounts.length} accounts...`);
      const results = await this.inviteService.sendInvitesToMultipleAccounts(
        accounts,
        5
      );

      const successCount = results.filter((r) => r.success).length;
      const totalInvited = results.reduce((sum, r) => sum + r.invited_count, 0);

      res.status(200).json({
        message: `Invites sent to ${successCount}/${accounts.length} accounts`,
        total_invited: totalInvited,
        total_cleaned: autoCleanup ? totalCleaned : null,
        results: results,
      });
    } catch (error) {
      console.error("Error sending invites to all:", error);
      res
        .status(500)
        .json({ message: "Error sending invites", error: error.message });
    }
  }

  // Delete member from account
  async deleteMember(req, res) {
    try {
      const { accountId, userId } = req.params;
      const requestUserId = req.userId; // From auth middleware

      console.log(
        `Delete member request - Account: ${accountId}, User: ${userId}`
      );

      // Find account
      const account = await Account.findOne({
        _id: accountId,
        userId: requestUserId,
      });

      if (!account) {
        return res.status(404).json({ message: "Account not found" });
      }

      // IMPORTANT: Fetch current members BEFORE deleting to get member's email
      let deletedMemberEmail = null;
      let removedFromAllowed = false;

      try {
        const membersData = await this.curlService.executeCurl(
          account.accountId,
          account.accessToken
        );
        console.log(
          "📋 Members data structure:",
          JSON.stringify(membersData).substring(0, 200)
        );

        // Handle both possible response structures
        const usersList =
          membersData.users || membersData.items || membersData.data || [];
        const deletedMember = usersList.find((u) => u.id === userId);

        if (deletedMember && deletedMember.email) {
          deletedMemberEmail = deletedMember.email;
          console.log(`📧 Found member email: ${deletedMemberEmail}`);

          // Check if this email is in allowedMembers
          const emailLower = deletedMemberEmail.toLowerCase();
          if (
            account.allowedMembers.some((e) => e.toLowerCase() === emailLower)
          ) {
            account.allowedMembers = account.allowedMembers.filter(
              (email) => email.toLowerCase() !== emailLower
            );
            await account.save();
            removedFromAllowed = true;
            console.log(`✅ Removed ${deletedMemberEmail} from allowedMembers`);
          }
        }
      } catch (error) {
        console.warn(
          "⚠️  Could not fetch member data before deletion:",
          error.message
        );
      }

      // Now delete member from ChatGPT
      const result = await this.curlService.deleteMember(
        account.accountId,
        userId,
        account.accessToken
      );

      res.status(200).json({
        message: "Member deleted successfully",
        userId: userId,
        accountId: account.accountId,
        memberEmail: deletedMemberEmail,
        removed_from_allowed: removedFromAllowed,
        result: result,
      });
    } catch (error) {
      console.error("Error deleting member:", error);
      res
        .status(500)
        .json({ message: "Error deleting member", error: error.message });
    }
  }

  // Auto cleanup unauthorized members (members not in allowedMembers list)
  async autoCleanupMembers(req, res) {
    try {
      const { accountId } = req.params;
      const userId = req.userId;

      console.log(`🧹 Auto cleanup request for account: ${accountId}`);

      // Find account
      const account = await Account.findOne({ _id: accountId, userId });

      if (!account) {
        return res.status(404).json({ message: "Account not found" });
      }

      // Get current members from ChatGPT
      const membersData = await this.curlService.executeCurl(
        account.accountId,
        account.accessToken
      );

      console.log("📋 Members data structure:", membersData);

      // Handle response structure
      const usersList = membersData.users || membersData.items || [];

      // Filter out admin email
      const adminEmail = account.email.toLowerCase();
      const members = usersList.filter(
        (m) => m.email && m.email.toLowerCase() !== adminEmail
      );

      console.log(`👥 Found ${members.length} members (excluding admin)`);

      // Get allowed members (case-insensitive)
      const allowedEmailsLower = (account.allowedMembers || []).map((e) =>
        e.toLowerCase()
      );

      console.log(
        `✅ Allowed members: ${allowedEmailsLower.length} [${allowedEmailsLower.join(", ")}]`
      );

      // Find unauthorized members (not in allowedMembers)
      const unauthorizedMembers = members.filter((m) => {
        const memberEmail = m.email.toLowerCase();
        return !allowedEmailsLower.includes(memberEmail);
      });

      console.log(
        `🚫 Found ${unauthorizedMembers.length} unauthorized members:`,
        unauthorizedMembers.map((m) => m.email)
      );

      if (unauthorizedMembers.length === 0) {
        return res.status(200).json({
          message: "No unauthorized members found",
          total_members: members.length,
          allowed_members: allowedEmailsLower.length,
          deleted_count: 0,
        });
      }

      // Delete unauthorized members
      const deleteResults = [];
      for (const member of unauthorizedMembers) {
        try {
          console.log(`🗑️  Deleting unauthorized member: ${member.email}`);
          const result = await this.curlService.deleteMember(
            account.accountId,
            member.id,
            account.accessToken
          );
          deleteResults.push({
            email: member.email,
            userId: member.id,
            success: true,
            result,
          });
        } catch (error) {
          console.error(
            `❌ Failed to delete ${member.email}:`,
            error.message
          );
          deleteResults.push({
            email: member.email,
            userId: member.id,
            success: false,
            error: error.message,
          });
        }
      }

      const successCount = deleteResults.filter((r) => r.success).length;

      res.status(200).json({
        message: `Auto cleanup completed: ${successCount}/${unauthorizedMembers.length} members deleted`,
        total_members: members.length,
        allowed_members: allowedEmailsLower.length,
        unauthorized_found: unauthorizedMembers.length,
        deleted_count: successCount,
        results: deleteResults,
      });
    } catch (error) {
      console.error("Error in auto cleanup:", error);
      res
        .status(500)
        .json({ message: "Error in auto cleanup", error: error.message });
    }
  }

  // Auto cleanup for all accounts
  async autoCleanupAllAccounts(req, res) {
    try {
      const userId = req.userId;

      console.log(`🧹 Auto cleanup ALL accounts for user: ${userId}`);

      const accounts = await Account.find({ userId });

      if (accounts.length === 0) {
        return res.status(404).json({ message: "No accounts found" });
      }

      const allResults = [];
      let totalDeleted = 0;

      for (const account of accounts) {
        try {
          console.log(`\n🔍 Processing account: ${account.email}`);

          // Get current members
          const membersData = await this.curlService.executeCurl(
            account.accountId,
            account.accessToken
          );

          const usersList = membersData.users || membersData.items || [];
          const adminEmail = account.email.toLowerCase();
          const members = usersList.filter(
            (m) => m.email && m.email.toLowerCase() !== adminEmail
          );

          const allowedEmailsLower = (account.allowedMembers || []).map((e) =>
            e.toLowerCase()
          );

          const unauthorizedMembers = members.filter((m) => {
            const memberEmail = m.email.toLowerCase();
            return !allowedEmailsLower.includes(memberEmail);
          });

          console.log(
            `   👥 Members: ${members.length} | Allowed: ${allowedEmailsLower.length} | Unauthorized: ${unauthorizedMembers.length}`
          );

          const deleteResults = [];

          for (const member of unauthorizedMembers) {
            try {
              await this.curlService.deleteMember(
                account.accountId,
                member.id,
                account.accessToken
              );
              deleteResults.push({
                email: member.email,
                success: true,
              });
              totalDeleted++;
            } catch (error) {
              deleteResults.push({
                email: member.email,
                success: false,
                error: error.message,
              });
            }
          }

          allResults.push({
            account: account.email,
            total_members: members.length,
            unauthorized_found: unauthorizedMembers.length,
            deleted: deleteResults.filter((r) => r.success).length,
            results: deleteResults,
          });
        } catch (error) {
          console.error(`❌ Error processing ${account.email}:`, error.message);
          allResults.push({
            account: account.email,
            error: error.message,
          });
        }
      }

      res.status(200).json({
        message: `Auto cleanup completed for ${accounts.length} accounts`,
        total_accounts: accounts.length,
        total_deleted: totalDeleted,
        results: allResults,
      });
    } catch (error) {
      console.error("Error in auto cleanup all:", error);
      res
        .status(500)
        .json({ message: "Error in auto cleanup all", error: error.message });
    }
  }

  async getPendingInvites(req, res) {
    try {
      const { id } = req.params; // Account MongoDB _id
      const userId = req.userId;

      const account = await Account.findOne({ _id: id, userId });
      
      if (!account) {
        return res.status(404).json({ message: "Account not found" });
      }

      console.log(`📋 Getting pending invites for account: ${account.email}`);

      const result = await this.inviteService.getPendingInvites(
        account.accountId,
        account.accessToken
      );

      res.status(200).json({
        success: true,
        account: {
          email: account.email,
          accountId: account.accountId,
          name: account.name
        },
        invites: result.invites,
        total: result.total
      });
    } catch (error) {
      console.error("Error getting pending invites:", error);
      res.status(500).json({
        message: "Error getting pending invites",
        error: error.message
      });
    }
  }

  async cleanupPendingInvites(req, res) {
    try {
      const { id } = req.params; // Account MongoDB _id
      const userId = req.userId;

      const account = await Account.findOne({ _id: id, userId });
      
      if (!account) {
        return res.status(404).json({ message: "Account not found" });
      }

      console.log(`🧹 Cleaning up pending invites for account: ${account.email}`);

      const result = await this.inviteService.cleanupPendingInvites(
        account.accountId,
        account.accessToken,
        account.allowedMembers
      );

      res.status(200).json({
        success: true,
        account: {
          email: account.email,
          accountId: account.accountId,
          name: account.name
        },
        ...result
      });
    } catch (error) {
      console.error("Error cleaning up pending invites:", error);
      res.status(500).json({
        message: "Error cleaning up pending invites",
        error: error.message
      });
    }
  }

  async cleanupAllPendingInvites(req, res) {
    try {
      const userId = req.userId;
      const accounts = await Account.find({ userId });

      if (accounts.length === 0) {
        return res.status(404).json({ message: "No accounts found for this user" });
      }

      console.log(`🧹 Starting cleanup of pending invites for ${accounts.length} accounts...`);

      const allResults = [];

      for (const account of accounts) {
        try {
          console.log(`\n📋 Processing account: ${account.email}`);

          const result = await this.inviteService.cleanupPendingInvites(
            account.accountId,
            account.accessToken,
            account.allowedMembers
          );

          allResults.push({
            account: account.email,
            name: account.name,
            accountId: account.accountId,
            ...result
          });

          // Add 1 second delay between accounts
          await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (error) {
          console.error(`❌ Error processing ${account.email}:`, error.message);
          allResults.push({
            account: account.email,
            name: account.name,
            accountId: account.accountId,
            success: false,
            error: error.message
          });
        }
      }

      const totalDeleted = allResults.reduce((sum, r) => sum + (r.deleted?.length || 0), 0);
      const totalFailed = allResults.reduce((sum, r) => sum + (r.failed?.length || 0), 0);

      res.status(200).json({
        message: `Cleanup completed for ${accounts.length} accounts`,
        total_accounts: accounts.length,
        total_deleted: totalDeleted,
        total_failed: totalFailed,
        results: allResults
      });
    } catch (error) {
      console.error("Error in cleanup all pending invites:", error);
      res.status(500).json({
        message: "Error in cleanup all pending invites",
        error: error.message
      });
    }
  }

  // Resend invite for a specific email
  async resendInvite(req, res) {
    try {
      const { id } = req.params;
      const { email } = req.body;
      const userId = req.userId;

      if (!email) {
        return res.status(400).json({
          success: false,
          message: 'Email is required'
        });
      }

      // Get account from database
      const account = await Account.findOne({ _id: id, userId });

      if (!account) {
        return res.status(404).json({
          success: false,
          message: 'Account not found'
        });
      }

      console.log(`📧 Resending invite to ${email} for account ${account.email}`);

      // Use InviteService to resend invite
      const result = await this.inviteService.sendInvites(
        account.accountId,
        account.accessToken,
        [email],
        true // resend_emails = true
      );

      res.status(200).json({
        success: true,
        message: `Invite resent to ${email}`,
        data: result
      });
    } catch (error) {
      console.error("Error resending invite:", error);
      res.status(500).json({
        success: false,
        message: "Error resending invite",
        error: error.message
      });
    }
  }

  // Verify pending invites - sync DB with actual ChatGPT data
  async verifyPendingInvites(req, res) {
    try {
      const { id } = req.params;
      const userId = req.userId;

      const account = await Account.findOne({ _id: id, userId });

      if (!account) {
        return res.status(404).json({
          success: false,
          message: 'Account not found'
        });
      }

      console.log(`🔍 Verifying pending invites for account ${account.email}...`);

      // Fetch actual pending invites from ChatGPT
      const result = await this.inviteService.getPendingInvites(
        account.accountId,
        account.accessToken
      );

      if (!result.success) {
        return res.status(500).json({
          success: false,
          message: 'Failed to fetch pending invites from ChatGPT'
        });
      }

      const actualPendingEmails = result.invites.map(inv => inv.email_address || inv.email);
      const dbAllowedEmails = account.allowedMembers || [];

      // Find emails that are NOT in pending anymore (might be accepted or rejected)
      const notPendingAnymore = dbAllowedEmails.filter(
        email => !actualPendingEmails.includes(email)
      );

      // Find emails in pending but NOT in allowedMembers (orphan invites)
      const orphanInvites = actualPendingEmails.filter(
        email => !dbAllowedEmails.includes(email)
      );

      console.log(`📊 Verification results:
        - Actual pending: ${actualPendingEmails.length}
        - DB allowed members: ${dbAllowedEmails.length}
        - Not pending anymore: ${notPendingAnymore.length}
        - Orphan invites: ${orphanInvites.length}
      `);

      res.status(200).json({
        success: true,
        message: `Verified pending invites for ${account.email}`,
        data: {
          actualPending: actualPendingEmails,
          actualPendingCount: actualPendingEmails.length,
          dbAllowedMembers: dbAllowedEmails,
          notPendingAnymore: notPendingAnymore,
          orphanInvites: orphanInvites,
          syncStatus: orphanInvites.length === 0 && notPendingAnymore.length === 0 ? 'synced' : 'out-of-sync'
        }
      });
    } catch (error) {
      console.error("Error verifying pending invites:", error);
      res.status(500).json({
        success: false,
        message: "Error verifying pending invites",
        error: error.message
      });
    }
  }
}

export default AccountsController;
