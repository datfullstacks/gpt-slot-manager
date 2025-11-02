// API Base URL

const API_BASE_URL = `${window.location.origin}/api`;

const WS_PROTOCOL = window.location.protocol === "https:" ? "wss:" : "ws:";
const WS_URL = `${WS_PROTOCOL}//${window.location.host}/ws`;

// State Management
let currentToken = localStorage.getItem("token");
let currentUser = null;
let ws = null;
let wsConnected = false;
let countdownInterval = null;
let countdownSeconds = 30;

// Initialize App
document.addEventListener("DOMContentLoaded", () => {
  if (currentToken) {
    loadUserProfile();
  } else {
    showAuthSection();
  }

  // Start countdown timer
  startCountdownTimer();
});

// Show/Hide Sections
function showAuthSection() {
  document.getElementById("authSection").style.display = "flex";
  document.getElementById("dashboardSection").style.display = "none";
}

function showDashboard() {
  document.getElementById("authSection").style.display = "none";
  document.getElementById("dashboardSection").style.display = "block";
}

// Auth Tab Switching
function showLogin() {
  document.getElementById("loginForm").style.display = "block";
  document.getElementById("registerForm").style.display = "none";
  document.querySelectorAll(".tab-btn")[0].classList.add("active");
  document.querySelectorAll(".tab-btn")[1].classList.remove("active");
}

function showRegister() {
  document.getElementById("loginForm").style.display = "none";
  document.getElementById("registerForm").style.display = "block";
  document.querySelectorAll(".tab-btn")[0].classList.remove("active");
  document.querySelectorAll(".tab-btn")[1].classList.add("active");
}

// Toast Notification
function showToast(message, type = "success") {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.className = `toast ${type}`;
  toast.classList.add("show");

  setTimeout(() => {
    toast.classList.remove("show");
  }, 3000);
}

// Handle Register
async function handleRegister(event) {
  event.preventDefault();

  const username = document.getElementById("registerUsername").value;
  const email = document.getElementById("registerEmail").value;
  const password = document.getElementById("registerPassword").value;
  const passwordConfirm = document.getElementById(
    "registerPasswordConfirm"
  ).value;

  if (password !== passwordConfirm) {
    showToast("Mật khẩu xác nhận không khớp!", "error");
    return;
  }

  if (password.length < 6) {
    showToast("Mật khẩu phải có ít nhất 6 ký tự!", "error");
    return;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/auth/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ username, email, password }),
    });

    const data = await response.json();

    if (response.ok) {
      showToast("Đăng ký thành công! Đang đăng nhập...", "success");
      currentToken = data.token;
      localStorage.setItem("token", data.token);
      setTimeout(() => {
        loadUserProfile();
      }, 1000);
    } else {
      showToast(data.message || "Đăng ký thất bại!", "error");
    }
  } catch (error) {
    showToast("Lỗi kết nối server!", "error");
    console.error("Register error:", error);
  }
}

// Handle Login
async function handleLogin(event) {
  event.preventDefault();

  const username = document.getElementById("loginUsername").value;
  const password = document.getElementById("loginPassword").value;

  try {
    const response = await fetch(`${API_BASE_URL}/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ username, password }),
    });

    const data = await response.json();

    if (response.ok) {
      showToast("Đăng nhập thành công!", "success");
      currentToken = data.token;
      localStorage.setItem("token", data.token);
      loadUserProfile();
    } else {
      showToast(data.message || "Đăng nhập thất bại!", "error");
    }
  } catch (error) {
    showToast("Lỗi kết nối server!", "error");
    console.error("Login error:", error);
  }
}

// Handle Logout
function handleLogout() {
  if (confirm("Bạn có chắc muốn đăng xuất?")) {
    // Disconnect WebSocket
    disconnectWebSocket();

    currentToken = null;
    currentUser = null;
    localStorage.removeItem("token");
    showAuthSection();
    showToast("Đã đăng xuất!", "success");
  }
}

// Load User Profile
async function loadUserProfile() {
  try {
    const response = await fetch(`${API_BASE_URL}/auth/profile`, {
      headers: {
        Authorization: `Bearer ${currentToken}`,
      },
    });

    if (response.ok) {
      currentUser = await response.json();
      document.getElementById("username").textContent = currentUser.username;
      document.getElementById("userEmail").textContent = currentUser.email;
      showDashboard();

      // Check if user needs to verify code
      if (!currentUser.isCodeVerified) {
        showCodeVerificationSection();
      } else {
        showAccountsSection();
        loadAccounts();
      }
    } else {
      // Token invalid
      handleLogout();
    }
  } catch (error) {
    showToast("Lỗi tải thông tin người dùng!", "error");
    console.error("Profile error:", error);
  }
}

// Show Code Verification Section
function showCodeVerificationSection() {
  document.getElementById("codeVerificationSection").style.display = "block";
  document.getElementById("accountsSection").style.display = "none";
}

// Show Accounts Section (after code verified)
function showAccountsSection() {
  document.getElementById("codeVerificationSection").style.display = "none";
  document.getElementById("accountsSection").style.display = "block";
}

// Handle Verify Code
async function handleVerifyCode(event) {
  event.preventDefault();

  const code = document.getElementById("accessCodeInput").value.trim();

  if (!code) {
    showToast("Vui lòng nhập mã code!", "error");
    return;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/auth/verify-code`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${currentToken}`,
      },
      body: JSON.stringify({ code }),
    });

    const data = await response.json();

    if (response.ok) {
      showToast("Xác thực thành công! 🎉", "success");
      currentUser.isCodeVerified = true;
      showAccountsSection();
      loadAccounts();
    } else {
      showToast(data.message || "Mã code không đúng!", "error");
    }
  } catch (error) {
    showToast("Lỗi kết nối server!", "error");
    console.error("Verify code error:", error);
  }
}

// Copy API Key
function copyApiKey() {
  const apiKey = document.getElementById("apiKeyDisplay").textContent;
  navigator.clipboard.writeText(apiKey).then(() => {
    showToast("Đã copy API key!", "success");
  });
}

// Load Accounts
async function loadAccounts() {
  const tbody = document.getElementById("accountsTableBody");
  tbody.innerHTML =
    '<tr><td colspan="7" class="loading-cell">Đang tải danh sách accounts...</td></tr>';

  try {
    const response = await fetch(`${API_BASE_URL}/accounts`, {
      headers: {
        Authorization: `Bearer ${currentToken}`,
      },
    });

    const accounts = await response.json();

    console.log("Loaded accounts:", accounts); // Debug

    if (accounts.length === 0) {
      tbody.innerHTML =
        '<tr><td colspan="7" class="loading-cell">Chưa có account nào. Hãy thêm account đầu tiên!</td></tr>';
      document.getElementById("totalAccountsCount").textContent = "0";
      document.getElementById("totalMembersCount").textContent = "0";
      document.getElementById("successAccountsCount").textContent = "0";
      document.getElementById("failedAccountsCount").textContent = "0";
      return;
    }

    // Display accounts with pending status initially
    tbody.innerHTML = accounts
      .map((account, index) => {
        const allowedMembersDisplay =
          account.allowedMembers && account.allowedMembers.length > 0
            ? account.allowedMembers
                .map((email) => `<span class="member-email">${email}</span>`)
                .join("")
            : '<span style="color: #9ca3af;">Chưa cài đặt</span>';

        const mongoId = account._id || "";
        const buttonId = `edit-btn-load-${index}`;

        return `
                <tr>
                    <td>${index + 1}</td>
                    <td style="font-weight: 500; color: #60a5fa;">${
                      account.email
                    }</td>
                    <td style="text-align: center;">-</td>
                    <td><span style="color: #9ca3af;">Đang chờ cập nhật...</span></td>
                    <td>
                        <div class="member-list">${allowedMembersDisplay}</div>
                        <button id="${buttonId}"
                                class="btn-table edit-allowed-btn" 
                                data-account-id="${mongoId}"
                                data-admin-email="${account.email}"
                                data-allowed-members='${JSON.stringify(
                                  account.allowedMembers || []
                                )}'
                                style="margin-top: 8px; background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); color: white;">
                            ✏️ Edit
                        </button>
                    </td>
                    <td><span class="status-badge status-pending">⏳ Pending</span></td>
                    <td>
                        <button onclick="showSendInviteModal('${mongoId}', '${
          account.email
        }', ${(account.allowedMembers || []).length})" class="btn-table" 
                                style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; margin-right: 5px;"
                                title="Gửi invite đến member cố định">
                            📧 Invite
                        </button>
                        <button onclick="deleteAccount('${mongoId}')" class="btn-table btn-delete">
                            🗑️ Delete
                        </button>
                    </td>
                </tr>
            `;
      })
      .join("");

    // Add event listeners to edit buttons
    setTimeout(() => {
      document.querySelectorAll(".edit-allowed-btn").forEach((btn) => {
        btn.addEventListener("click", function () {
          const accountId = this.dataset.accountId;
          const adminEmail = this.dataset.adminEmail;
          const allowedMembers = JSON.parse(
            this.dataset.allowedMembers || "[]"
          );
          console.log("Edit button clicked:", {
            accountId,
            adminEmail,
            allowedMembers,
          });
          showEditAllowedMembersModal(accountId, adminEmail, allowedMembers);
        });
      });
    }, 0);

    document.getElementById("totalAccountsCount").textContent = accounts.length;

    // Start WebSocket connection after loading accounts
    connectWebSocket();
  } catch (error) {
    tbody.innerHTML =
      '<tr><td colspan="6" class="loading-cell">Lỗi tải danh sách accounts!</td></tr>';
    showToast("Lỗi tải danh sách accounts!", "error");
    console.error("Load accounts error:", error);
  }
}

// Show Add Account Modal
function showAddAccountModal() {
  document.getElementById("addAccountModal").style.display = "flex";
  document.getElementById("newAccountEmail").value = "";
  document.getElementById("newAccountId").value = "";
  document.getElementById("newAccessToken").value = "";
}

// Close Add Account Modal
function closeAddAccountModal() {
  document.getElementById("addAccountModal").style.display = "none";
  // Reset form
  document.getElementById("newAccountEmail").value = "";
  document.getElementById("newAccessToken").value = "";
  document.getElementById("newAccountId").value = "";
  document.getElementById("newAllowedMembers").value = "";
}

// Handle Add Account
async function handleAddAccount(event) {
  event.preventDefault();

  const email = document.getElementById("newAccountEmail").value;
  const accountId = document.getElementById("newAccountId").value.trim(); // Optional
  const accessToken = document.getElementById("newAccessToken").value.trim();
  const allowedMembersText = document
    .getElementById("newAllowedMembers")
    .value.trim();

  // Validate access token
  if (!accessToken || accessToken.length < 20) {
    showToast("Access token không hợp lệ!", "error");
    return;
  }

  // Parse allowed members (one email per line, excluding admin email)
  const allowedMembers = allowedMembersText
    .split("\n")
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e && e !== email.toLowerCase() && e.includes("@"));

  try {
    const payload = {
      email,
      accessToken,
      allowedMembers,
    };

    // Only include accountId if provided
    if (accountId) {
      payload.accountId = accountId;
    }

    const response = await fetch(`${API_BASE_URL}/accounts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${currentToken}`,
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (response.ok) {
      showToast("Thêm account thành công!", "success");
      closeAddAccountModal();
      loadAccounts();
    } else {
      showToast(data.message || "Thêm account thất bại!", "error");
    }
  } catch (error) {
    showToast("Lỗi kết nối server!", "error");
    console.error("Add account error:", error);
  }
}

// Delete Account
async function deleteAccount(accountId) {
  if (!confirm("Bạn có chắc muốn xóa account này?")) {
    return;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/accounts/${accountId}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${currentToken}`,
      },
    });

    if (response.ok) {
      showToast("Xóa account thành công!", "success");
      loadAccounts();
    } else {
      const data = await response.json();
      showToast(data.message || "Xóa account thất bại!", "error");
    }
  } catch (error) {
    showToast("Lỗi kết nối server!", "error");
    console.error("Delete account error:", error);
  }
}

// Delete Member from Account
async function deleteMemberFromAccount(
  accountId,
  accountUuid,
  userId,
  memberEmail
) {
  if (
    !confirm(`Bạn có chắc muốn xóa member "${memberEmail}" khỏi account này?`)
  ) {
    return;
  }

  console.log("Deleting member:", {
    accountId,
    accountUuid,
    userId,
    memberEmail,
  });

  try {
    const response = await fetch(
      `${API_BASE_URL}/accounts/${accountId}/members/${userId}`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${currentToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    const data = await response.json();

    if (response.ok) {
      showToast(`✅ Đã xóa member "${memberEmail}" thành công!`, "success");

      // Also remove from allowedMembers if exists
      if (data.removed_from_allowed) {
        showToast(`✅ Đã xóa khỏi "Member Cố Định"`, "info");
      }

      loadAccounts(); // Reload to refresh member list
    } else {
      showToast(data.message || "Xóa member thất bại!", "error");
    }
  } catch (error) {
    showToast("Lỗi kết nối server!", "error");
    console.error("Delete member error:", error);
  }
}

// Process All Accounts
async function processAllAccounts() {
  const btn = event.target;
  btn.disabled = true;
  btn.textContent = "⏳ Đang xử lý...";

  const resultsSection = document.getElementById("resultsSection");
  const resultsContainer = document.getElementById("resultsContainer");

  resultsSection.style.display = "block";
  resultsContainer.innerHTML =
    '<div class="loading">Đang gọi API từ tất cả accounts...</div>';

  try {
    const response = await fetch(`${API_BASE_URL}/accounts/process`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${currentToken}`,
      },
    });

    const data = await response.json();

    if (response.ok) {
      showToast("Xử lý thành công!", "success");
      displayResults(data.results);
    } else {
      showToast(data.message || "Xử lý thất bại!", "error");
      resultsContainer.innerHTML = `<div class="loading">❌ ${data.message}</div>`;
    }
  } catch (error) {
    showToast("Lỗi kết nối server!", "error");
    resultsContainer.innerHTML =
      '<div class="loading">❌ Lỗi kết nối server!</div>';
    console.error("Process accounts error:", error);
  } finally {
    btn.disabled = false;
    btn.textContent = "🚀 Lấy Dữ Liệu Từ Tất Cả Accounts";
  }
}

// Display Results
function displayResults(results) {
  const resultsContainer = document.getElementById("resultsContainer");

  if (!results || results.length === 0) {
    resultsContainer.innerHTML = '<div class="loading">Không có kết quả</div>';
    return;
  }

  resultsContainer.innerHTML = results
    .map((result) => {
      if (result.error) {
        return `
                <div class="result-item">
                    <h4>❌ Account ID: ${result.accountId}</h4>
                    <p style="color: #ef4444;">Lỗi: ${result.error}</p>
                </div>
            `;
      }

      const users = result.data?.users || [];
      const total = result.data?.total || 0;

      return `
            <div class="result-item">
                <h4>✅ Account ID: ${result.accountId}</h4>
                <p><strong>Tổng số members:</strong> ${total}</p>
                ${
                  users.length > 0
                    ? `
                    <div class="member-list">
                        <h5>Danh sách members (${users.length}):</h5>
                        ${users
                          .map(
                            (user) => `
                            <div class="member-item">
                                <strong>${user.name || "N/A"}</strong> - ${
                              user.email || "N/A"
                            }
                                <br>
                                <small>Role: ${user.role || "N/A"} | ID: ${
                              user.id || "N/A"
                            }</small>
                            </div>
                        `
                          )
                          .join("")}
                    </div>
                `
                    : "<p>Không có members</p>"
                }
            </div>
        `;
    })
    .join("");
}

// Close modal when clicking outside
window.onclick = function (event) {
  const addModal = document.getElementById("addAccountModal");
  const editModal = document.getElementById("editAllowedMembersModal");
  const inviteModal = document.getElementById("sendInviteModal");

  if (event.target === addModal) {
    closeAddAccountModal();
  }
  if (event.target === editModal) {
    closeEditAllowedMembersModal();
  }
  if (event.target === inviteModal) {
    closeSendInviteModal();
  }
};

// WebSocket Functions
function connectWebSocket() {
  if (ws && wsConnected) {
    console.log("WebSocket already connected");
    return;
  }

  console.log("Connecting to WebSocket...");
  ws = new WebSocket(WS_URL);

  ws.onopen = () => {
    console.log("✅ WebSocket connected");
    wsConnected = true;

    // Subscribe to auto-refresh
    ws.send(
      JSON.stringify({
        type: "subscribe",
        token: currentToken,
      })
    );

    showToast("🔄 Đã bật auto-refresh (mỗi 30s)", "success");
  };

  ws.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data);
      handleWebSocketMessage(message);
    } catch (error) {
      console.error("WebSocket message error:", error);
    }
  };

  ws.onerror = (error) => {
    console.error("WebSocket error:", error);
    wsConnected = false;
  };

  ws.onclose = () => {
    console.log("WebSocket disconnected");
    wsConnected = false;

    // Reconnect after 5 seconds
    setTimeout(() => {
      if (currentToken && currentUser?.isCodeVerified) {
        connectWebSocket();
      }
    }, 5000);
  };
}

function handleWebSocketMessage(message) {
  console.log("WebSocket message:", message);

  switch (message.type) {
    case "subscribed":
      console.log("✅ Subscribed to auto-refresh");
      break;

    case "members_update":
      updateMembersDisplay(message.data);
      break;

    case "error":
      console.error("WebSocket error:", message.message);
      if (message.message === "Invalid token") {
        showToast("Phiên đăng nhập hết hạn!", "error");
        handleLogout();
      }
      break;

    default:
      console.log("Unknown message type:", message.type);
  }
}

function updateMembersDisplay(data) {
  console.log("Updating members display:", data);

  // Update statistics
  document.getElementById("totalAccountsCount").textContent =
    data.total_accounts;
  document.getElementById("totalMembersCount").textContent = data.total_members;

  const successCount = data.accounts.filter((a) => a.success).length;
  const failedCount = data.accounts.filter((a) => !a.success).length;

  document.getElementById("successAccountsCount").textContent = successCount;
  document.getElementById("failedAccountsCount").textContent = failedCount;

  // Reset countdown
  countdownSeconds = 30;

  // Update table
  updateAccountsTable(data.accounts);

  // Show notification
  console.log(
    `📊 Đã cập nhật: ${successCount}/${data.total_accounts} accounts | ${data.total_members} members`
  );
}

function updateAccountsTable(accounts) {
  const tbody = document.getElementById("accountsTableBody");

  if (accounts.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="7" class="loading-cell">Chưa có dữ liệu</td></tr>';
    return;
  }

  tbody.innerHTML = accounts
    .map((account, index) => {
      // Members list provided by backend includes admin as first member (id='admin')
      const membersList =
        account.members && account.members.length > 0 ? account.members : [];

      const memberEmails =
        membersList.length > 0
          ? membersList
              .map((m) => {
                // If this is the admin representation (we set id === 'admin' in backend), show admin label and no delete button
                if (m.id === "admin") {
                  return `
                        <div class="member-item" style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px; padding: 4px; border-radius: 4px; background: rgba(255,255,255,0.03);">
                            <span class="member-email" style="flex: 1; font-weight: 600; color: #60a5fa;">${
                              m.email || "Admin"
                            } (Admin)</span>
                        </div>
                    `;
                }

                return `
                    <div class="member-item" style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px; padding: 4px; border-radius: 4px; background: rgba(255,255,255,0.05);">
                        <span class="member-email" style="flex: 1;">${
                          m.email || m.name || "N/A"
                        }</span>
                        <button class="btn-delete-member" 
                                data-account-id="${account._id}"
                                data-account-uuid="${account.accountId || ""}"
                                data-user-id="${m.id || ""}"
                                data-user-email="${m.email || m.name || ""}"
                                style="margin-left: 8px; padding: 2px 8px; font-size: 11px; background: #ef4444; color: white; border: none; border-radius: 4px; cursor: pointer; transition: all 0.2s;"
                                title="Xóa member này">
                            🗑️
                        </button>
                    </div>
                `;
              })
              .join("")
          : '<span style="color: #9ca3af;">No members</span>';

      const allowedMembersDisplay =
        account.allowedMembers && account.allowedMembers.length > 0
          ? account.allowedMembers
              .map((email) => `<span class="member-email">${email}</span>`)
              .join("")
          : '<span style="color: #9ca3af;">Chưa cài đặt</span>';

      const statusClass = account.success ? "status-success" : "status-failed";
      const statusText = account.success ? "✓ Success" : "✗ Failed";

      // Use _id for database operations
      const mongoId = account._id || "";
      const displayAccountId = account.accountId || account._id || "";

      // Create unique button ID for this row
      const buttonId = `edit-btn-${index}`;

      return `
            <tr>
                <td>${index + 1}</td>
                <td style="font-weight: 500; color: #60a5fa;">${
                  account.email
                }</td>
                <td style="text-align: center; font-weight: bold; color: ${
                  account.success ? "#10b981" : "#ef4444"
                };">
                    ${
                      account.members && account.members.length
                        ? account.members.length
                        : 0
                    }
                </td>
                <td>
                    <div class="member-list">${memberEmails}</div>
                </td>
                <td>
                    <div class="member-list">${allowedMembersDisplay}</div>
                    <button id="${buttonId}" 
                            class="btn-table edit-allowed-btn" 
                            data-account-id="${mongoId}"
                            data-admin-email="${account.email}"
                            data-allowed-members='${JSON.stringify(
                              account.allowedMembers || []
                            )}'
                            style="margin-top: 8px; background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); color: white;">
                        ✏️ Edit
                    </button>
                </td>
                <td>
                    <span class="status-badge ${statusClass}">${statusText}</span>
                    ${
                      !account.success
                        ? `<br><small style="color: #ef4444; font-size: 11px;">${
                            account.error || "Unknown error"
                          }</small>`
                        : ""
                    }
                </td>
                <td>
                    <button onclick="sendInvite('${mongoId}')" class="btn-table" 
                            style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; margin-right: 5px;"
                            title="Gửi invite đến member cố định">
                        📧 Invite
                    </button>
                    <button onclick="deleteAccount('${mongoId}')" class="btn-table btn-delete">
                        🗑️ Delete
                    </button>
                </td>
            </tr>
        `;
    })
    .join("");

  // Add event listeners to edit buttons after rendering
  setTimeout(() => {
    document.querySelectorAll(".edit-allowed-btn").forEach((btn) => {
      btn.addEventListener("click", function () {
        const accountId = this.dataset.accountId;
        const adminEmail = this.dataset.adminEmail;
        const allowedMembers = JSON.parse(this.dataset.allowedMembers || "[]");
        showEditAllowedMembersModal(accountId, adminEmail, allowedMembers);
      });
    });

    // Add event listeners to delete member buttons
    document.querySelectorAll(".btn-delete-member").forEach((btn) => {
      btn.addEventListener("click", function () {
        const accountId = this.dataset.accountId;
        const accountUuid = this.dataset.accountUuid;
        const userId = this.dataset.userId;
        const userEmail = this.dataset.userEmail;
        deleteMemberFromAccount(accountId, accountUuid, userId, userEmail);
      });
    });
  }, 0);
}

function startCountdownTimer() {
  if (countdownInterval) {
    clearInterval(countdownInterval);
  }

  countdownInterval = setInterval(() => {
    countdownSeconds--;

    if (countdownSeconds <= 0) {
      countdownSeconds = 30;
    }

    const timerEl = document.getElementById("countdownTimer");
    if (timerEl) {
      timerEl.textContent = `${countdownSeconds}s`;

      // Change color based on time remaining
      if (countdownSeconds <= 5) {
        timerEl.style.color = "#ef4444"; // Red
      } else if (countdownSeconds <= 10) {
        timerEl.style.color = "#f59e0b"; // Orange
      } else {
        timerEl.style.color = "#10b981"; // Green
      }
    }
  }, 1000);
}

function disconnectWebSocket() {
  if (ws) {
    ws.send(
      JSON.stringify({
        type: "unsubscribe",
        token: currentToken,
      })
    );
    ws.close();
    ws = null;
    wsConnected = false;
    showToast("⏸️ Đã tắt auto-refresh", "info");
  }
}

// Show/Close Edit Allowed Members Modal
function showEditAllowedMembersModal(accountId, adminEmail, allowedMembers) {
  console.log("Opening edit modal:", { accountId, adminEmail, allowedMembers });

  document.getElementById("editAccountId").value = accountId;
  document.getElementById("editAdminEmail").value = adminEmail;
  document.getElementById("editAllowedMembers").value = (
    allowedMembers || []
  ).join("\n");
  document.getElementById("editAllowedMembersModal").style.display = "flex";

  console.log("Modal should be visible now");
}

function closeEditAllowedMembersModal() {
  document.getElementById("editAllowedMembersModal").style.display = "none";
}

// Handle Update Allowed Members
async function handleUpdateAllowedMembers(event) {
  event.preventDefault();

  const accountId = document.getElementById("editAccountId").value;
  const adminEmail = document.getElementById("editAdminEmail").value;
  const allowedMembersText = document
    .getElementById("editAllowedMembers")
    .value.trim();

  console.log("Updating allowed members for:", accountId, adminEmail);
  console.log("Raw text:", allowedMembersText);

  // Parse allowed members (one email per line, excluding admin email)
  const allowedMembers = allowedMembersText
    .split("\n")
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e && e !== adminEmail.toLowerCase() && e.includes("@"));

  console.log("Parsed allowed members:", allowedMembers);

  try {
    const response = await fetch(
      `${API_BASE_URL}/accounts/${accountId}/allowed-members`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${currentToken}`,
        },
        body: JSON.stringify({ allowedMembers }),
      }
    );

    const data = await response.json();

    console.log("Update response:", data);

    if (response.ok) {
      showToast("Cập nhật member cố định thành công!", "success");
      closeEditAllowedMembersModal();
      loadAccounts();
    } else {
      showToast(data.message || "Cập nhật thất bại!", "error");
    }
  } catch (error) {
    showToast("Lỗi kết nối server!", "error");
    console.error("Update allowed members error:", error);
  }
}

// Send Invites Functions
async function sendInvite(accountId, adminEmail, currentAllowedMembers) {
  // Show modal to input emails
  showSendInviteModal(accountId, adminEmail, currentAllowedMembers);
}

function showSendInviteModal(accountId, adminEmail, currentAllowedMembers) {
  document.getElementById("inviteAccountId").value = accountId;
  document.getElementById("inviteAdminEmail").value = adminEmail;
  document.getElementById("inviteEmails").value = "";

  const remaining = 7 - (currentAllowedMembers || []).length;
  document.getElementById("remainingSlots").textContent = remaining;
  document.getElementById("remainingSlots").style.color =
    remaining > 0 ? "#10b981" : "#ef4444";

  document.getElementById("sendInviteModal").style.display = "flex";
}

function closeSendInviteModal() {
  document.getElementById("sendInviteModal").style.display = "none";
}

async function handleSendInvite(event) {
  event.preventDefault();

  const accountId = document.getElementById("inviteAccountId").value;
  const emailsText = document.getElementById("inviteEmails").value.trim();

  if (!emailsText) {
    showToast("Vui lòng nhập ít nhất 1 email!", "error");
    return;
  }

  // Parse emails
  const emails = emailsText
    .split("\n")
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e && e.includes("@"));

  if (emails.length === 0) {
    showToast("Không có email hợp lệ!", "error");
    return;
  }

  console.log("Sending invites:", { accountId, emails });

  try {
    const response = await fetch(
      `${API_BASE_URL}/accounts/${accountId}/send-invites`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${currentToken}`,
        },
        body: JSON.stringify({ emails }),
      }
    );

    const data = await response.json();

    console.log("Invite response:", data);

    if (response.ok) {
      showToast(
        `✅ Đã gửi ${data.invited_count} lời mời! Còn ${data.remaining_slots}/7 slots`,
        "success"
      );
      closeSendInviteModal();
      loadAccounts();
    } else {
      if (data.duplicates && data.duplicates.length > 0) {
        showToast(`❌ Email bị trùng: ${data.duplicates.join(", ")}`, "error");
      } else {
        showToast(data.message || "Gửi invite thất bại!", "error");
      }
    }
  } catch (error) {
    showToast("Lỗi kết nối server!", "error");
    console.error("Send invite error:", error);
  }
}

async function sendInvitesToAll() {
  if (!confirm("Gửi lời mời đến tất cả member cố định của TẤT CẢ accounts?")) {
    return;
  }

  showToast("Đang gửi invites...", "info");

  try {
    const response = await fetch(`${API_BASE_URL}/accounts/send-invites-all`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${currentToken}`,
      },
    });

    const data = await response.json();

    if (response.ok) {
      showToast(
        `✅ ${data.message} - Tổng ${data.total_invited} lời mời!`,
        "success"
      );

      // Show detailed results
      console.log("Invite results:", data.results);

      loadAccounts();
    } else {
      showToast(data.message || "Gửi invites thất bại!", "error");
    }
  } catch (error) {
    showToast("Lỗi kết nối server!", "error");
    console.error("Send invites to all error:", error);
  }
}

// Auto cleanup unauthorized members
async function autoCleanupAll() {
  if (
    !confirm(
      '🧹 TỰ ĐỘNG XÓA tất cả members KHÔNG nằm trong "Member Cố Định"?\n\nCảnh báo: Hành động này không thể hoàn tác!'
    )
  ) {
    return;
  }

  showToast("🧹 Đang kiểm tra và xóa members không hợp lệ...", "info");

  try {
    const response = await fetch(`${API_BASE_URL}/accounts/auto-cleanup-all`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${currentToken}`,
      },
    });

    const data = await response.json();

    if (response.ok) {
      showToast(
        `✅ ${data.message} - Đã xóa ${data.total_deleted} members!`,
        "success"
      );

      // Show detailed results
      console.log("Auto cleanup results:", data.results);

      // Show summary
      const summary = data.results
        .map(
          (r) =>
            `${r.account}: ${r.deleted || 0} deleted / ${
              r.unauthorized_found || 0
            } unauthorized`
        )
        .join("\n");

      console.log("📊 Cleanup Summary:\n" + summary);

      loadAccounts();
    } else {
      showToast(data.message || "Auto cleanup thất bại!", "error");
    }
  } catch (error) {
    showToast("Lỗi kết nối server!", "error");
    console.error("Auto cleanup error:", error);
  }
}
