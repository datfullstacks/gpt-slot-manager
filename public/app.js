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

// Pagination State
let currentPage = 1;
let totalPages = 1;
let totalAccounts = 0;
let currentSearch = '';
let currentSortBy = 'createdAt';
let currentSortOrder = 'desc';

// Date Filter State
let currentDateFrom = '';
let currentDateTo = '';
let currentDateField = 'createdAt';

// Row Status Management
const rowStatuses = new Map(); // accountId -> status object
const rowNextCheck = new Map(); // accountId -> next check timestamp

// Status helper functions
function setRowStatus(accountId, status, message = '') {
  rowStatuses.set(accountId, { status, message, timestamp: Date.now() });
  updateStatusBadge(accountId);
}

function getRowStatus(accountId) {
  return rowStatuses.get(accountId) || { status: 'idle', message: '' };
}

function clearRowStatus(accountId) {
  rowStatuses.delete(accountId);
  updateStatusBadge(accountId);
}

function setNextCheckTime(accountId, seconds) {
  const nextTime = Date.now() + (seconds * 1000);
  rowNextCheck.set(accountId, nextTime);
  console.log(`⏱️ Set next check for ${accountId}: ${seconds}s (${new Date(nextTime).toLocaleTimeString()})`);
  updateNextCheckDisplay(accountId);
}

function getNextCheckTime(accountId) {
  return rowNextCheck.get(accountId) || null;
}

function updateNextCheckDisplay(accountId) {
  const row = document.querySelector(`tr[data-account-id="${accountId}"]`);
  if (!row) {
    console.log(`⚠️ Row not found for accountId: ${accountId}`);
    return;
  }

  const nextCheckCell = row.querySelector('td:nth-last-child(3)'); // Next Check column
  if (!nextCheckCell) {
    console.log(`⚠️ Next Check cell not found for accountId: ${accountId}`);
    return;
  }

  const nextTime = getNextCheckTime(accountId);
  if (!nextTime) {
    nextCheckCell.innerHTML = '<span style="color: #9ca3af;">-</span>';
    return;
  }

  const now = Date.now();
  const diff = nextTime - now;
  
  if (diff <= 0) {
    nextCheckCell.innerHTML = '<span style="color: #10b981; font-weight: bold;">⏰ Now</span>';
    return;
  }

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  
  const timeText = minutes > 0 
    ? `${minutes}m ${remainingSeconds}s`
    : `${seconds}s`;
  
  nextCheckCell.innerHTML = `
    <span style="color: #f59e0b; font-weight: bold;">
      ⏱️ ${timeText}
    </span>
  `;
}

function updateStatusBadge(accountId) {
  const row = document.querySelector(`tr[data-account-id="${accountId}"]`);
  if (!row) return;

  const statusCell = row.querySelector('td:nth-last-child(2)'); // Status column
  if (!statusCell) return;

  const rowStatus = getRowStatus(accountId);
  let badgeHTML = '';

  switch (rowStatus.status) {
    case 'updating':
      const actionText = rowStatus.message || 'UPDATING';
      badgeHTML = `
        <span class="status-badge status-updating">
          <span class="spinner-small"></span>
          ${actionText}
        </span>
      `;
      break;
    case 'success':
      badgeHTML = `
        <span class="status-badge status-success">
          ✓ SUCCESS
        </span>
      `;
      // Auto clear after 3 seconds
      setTimeout(() => clearRowStatus(accountId), 3000);
      break;
    case 'error':
      const errorMsg = rowStatus.message ? `: ${rowStatus.message}` : '';
      badgeHTML = `
        <span class="status-badge status-failed" title="${rowStatus.message}">
          ✗ ERROR${errorMsg.length > 30 ? '' : errorMsg}
        </span>
      `;
      // Auto clear after 5 seconds
      setTimeout(() => clearRowStatus(accountId), 5000);
      break;
    default:
      // Idle - show account status
      const account = row.dataset;
      const isFailed = account.isFailed === 'true';
      const statusClass = isFailed ? 'status-failed' : 'status-success';
      const statusText = isFailed ? '✗ Failed' : '✓ Active';
      badgeHTML = `<span class="status-badge ${statusClass}">${statusText}</span>`;
  }

  statusCell.innerHTML = badgeHTML;
}

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
      showToast("✅ Đăng ký thành công!", "success");
      
      // Show notice about contacting admin for access code
      if (data.notice) {
        setTimeout(() => {
          showToast(data.notice, "info", 10000);
        }, 1500);
      }
      
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
      // Check if user is banned
      if (data.user && data.user.isBanned) {
        showToast(
          `🚫 ${data.message || 'Tài khoản đã bị khóa vĩnh viễn'}\n\nLý do: ${data.user.banReason || data.banReason || 'Nhập sai mã truy cập 3 lần'}`,
          "error",
          8000
        );
        return;
      }

      showToast("Đăng nhập thành công!", "success");
      currentToken = data.token;
      localStorage.setItem("token", data.token);
      
      // Show remaining attempts if not verified yet
      if (data.user && !data.user.isCodeVerified && data.user.failedAttempts > 0) {
        const remaining = data.user.remainingAttempts || 0;
        if (remaining > 0) {
          showToast(
            `⚠️ Lưu ý: Bạn đã nhập sai mã ${data.user.failedAttempts} lần. Còn ${remaining} lần thử!`,
            "warning",
            6000
          );
        }
      }
      
      loadUserProfile();
    } else {
      // Check for ban status in error response
      if (data.isBanned) {
        showToast(
          `🚫 ${data.message}\n\nBanned at: ${new Date(data.bannedAt).toLocaleString('vi-VN')}`,
          "error",
          8000
        );
      } else {
        showToast(data.message || "Đăng nhập thất bại!", "error");
      }
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
      const data = await response.json();
      currentUser = data.user || data;
      
      document.getElementById("username").textContent = currentUser.username;
      document.getElementById("userEmail").textContent = currentUser.email;
      showDashboard();

      // Check if user is banned
      if (currentUser.isBanned) {
        showToast(
          `🚫 Tài khoản đã bị khóa vĩnh viễn!\n\nLý do: ${currentUser.banReason || 'Nhập sai mã truy cập 3 lần'}\nThời gian: ${new Date(currentUser.bannedAt).toLocaleString('vi-VN')}`,
          "error",
          10000
        );
        
        // Auto logout after 5 seconds
        setTimeout(() => {
          handleLogout();
        }, 5000);
        return;
      }

      // Check if user needs to verify code
      if (!currentUser.isCodeVerified) {
        showCodeVerificationSection();
        
        // Show warning if has failed attempts
        const failedAttempts = currentUser.codeAttempts?.failed || 0;
        const remainingAttempts = currentUser.remainingAttempts || (3 - failedAttempts);
        
        if (failedAttempts > 0) {
          const helpText = document.querySelector("#codeVerificationSection .help-text");
          if (helpText) {
            helpText.innerHTML = `⚠️ Bạn đã nhập sai ${failedAttempts} lần. Còn lại <strong style="color: #ef4444">${remainingAttempts}/3</strong> lần thử!`;
            helpText.style.color = remainingAttempts === 1 ? "#ef4444" : "#f59e0b";
            helpText.style.fontWeight = "bold";
          }
          
          if (remainingAttempts === 1) {
            showToast(
              `🚨 CẢNH BÁO: Bạn chỉ còn 1 lần thử cuối!\n\nNhập sai sẽ bị khóa tài khoản vĩnh viễn!`,
              "warning",
              10000
            );
          }
        }
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

// Handle Verify Code (NEW: Secure Access Code System)
async function handleVerifyCode(event) {
  event.preventDefault();

  const code = document.getElementById("accessCodeInput").value.trim();
  const submitBtn = event.target.querySelector('button[type="submit"]');

  if (!code) {
    showToast("Vui lòng nhập mã code!", "error");
    return;
  }

  // Validate code format (16 characters)
  if (code.length !== 16) {
    showToast("Mã code phải có 16 ký tự!", "error");
    return;
  }

  // Disable button during verification
  submitBtn.disabled = true;
  submitBtn.textContent = "Đang xác thực...";

  try {
    // NEW ENDPOINT: /api/access-codes/verify
    const response = await fetch(`${API_BASE_URL}/access-codes/verify`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${currentToken}`,
      },
      body: JSON.stringify({ code }),
    });

    const data = await response.json();

    if (response.ok) {
      // Success
      showToast("✅ " + (data.message || "Xác thực thành công!"), "success");
      currentUser.isCodeVerified = true;
      showAccountsSection();
      loadAccounts();
      
      // Clear input
      document.getElementById("accessCodeInput").value = "";
    } else {
      // Failed attempt
      const errorMessage = data.message || "Mã code không đúng!";
      
      // Check if banned
      if (data.isBanned) {
        showToast(
          `🚫 ${errorMessage}\n\nTài khoản đã bị khóa vĩnh viễn vào ${new Date(data.bannedAt).toLocaleString('vi-VN')}`,
          "error",
          8000
        );
        
        // Auto logout after 3 seconds
        setTimeout(() => {
          showToast("Đang đăng xuất...", "info");
          handleLogout();
        }, 3000);
        
        submitBtn.disabled = true;
        submitBtn.textContent = "🚫 Tài khoản bị khóa";
        return;
      }
      
      // Show remaining attempts
      if (data.remainingAttempts !== undefined) {
        const remainingText = `\n\n⚠️ Còn lại: ${data.remainingAttempts}/3 lần thử`;
        
        // Warning for last attempt
        if (data.remainingAttempts === 1) {
          showToast(
            `❌ ${errorMessage}${remainingText}\n\n🚨 CẢNH BÁO: Nhập sai lần nữa sẽ bị khóa tài khoản vĩnh viễn!`,
            "error",
            10000
          );
        } else if (data.remainingAttempts === 0) {
          showToast(
            `🚫 ${errorMessage}\n\nTài khoản đã bị khóa vĩnh viễn do nhập sai 3 lần!`,
            "error",
            8000
          );
          
          // Auto logout
          setTimeout(() => {
            handleLogout();
          }, 3000);
        } else {
          showToast(`❌ ${errorMessage}${remainingText}`, "error", 5000);
        }
      } else {
        showToast(errorMessage, "error");
      }
      
      // Update help text with remaining attempts
      if (data.remainingAttempts > 0) {
        const helpText = document.querySelector("#codeVerificationSection .help-text");
        if (helpText) {
          helpText.innerHTML = `⚠️ Còn lại <strong style="color: #ef4444">${data.remainingAttempts}/3</strong> lần thử. Nhập sai ${data.remainingAttempts} lần nữa sẽ bị khóa vĩnh viễn!`;
          helpText.style.color = data.remainingAttempts === 1 ? "#ef4444" : "#f59e0b";
          helpText.style.fontWeight = "bold";
        }
      }
    }
  } catch (error) {
    showToast("Lỗi kết nối server!", "error");
    console.error("Verify code error:", error);
  } finally {
    // Re-enable button
    submitBtn.disabled = false;
    submitBtn.textContent = "Xác Thực";
  }
}

// Copy API Key
function copyApiKey() {
  const apiKey = document.getElementById("apiKeyDisplay").textContent;
  navigator.clipboard.writeText(apiKey).then(() => {
    showToast("Đã copy API key!", "success");
  });
}

// Pagination Helper Functions
function nextPage() {
  if (currentPage < totalPages) {
    loadAccounts(currentPage + 1);
  }
}

function prevPage() {
  if (currentPage > 1) {
    loadAccounts(currentPage - 1);
  }
}

function goToPage(page) {
  if (page >= 1 && page <= totalPages) {
    loadAccounts(page);
  }
}

// Search with debounce
let searchTimeout;
function handleSearch(searchValue) {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    currentSearch = searchValue.trim();
    currentPage = 1; // Reset to first page on new search
    loadAccounts(1);
  }, 500); // 500ms debounce
}

// Sort change handler
function handleSortChange(sortBy, sortOrder) {
  currentSortBy = sortBy;
  currentSortOrder = sortOrder;
  currentPage = 1; // Reset to first page
  loadAccounts(1);
}

// Handle sort dropdown change
function handleSortFromDropdown(value) {
  const [sortBy, sortOrder] = value.split('_');
  handleSortChange(sortBy, sortOrder);
}

// Date Filter Functions
function handleDateFilterChange() {
  const dateFrom = document.getElementById('dateFromInput').value;
  const dateTo = document.getElementById('dateToInput').value;
  const dateField = document.getElementById('dateFieldSelect').value;
  
  currentDateFrom = dateFrom;
  currentDateTo = dateTo;
  currentDateField = dateField;
  currentPage = 1; // Reset to first page
  
  updateDateFilterInfo();
  loadAccounts(1);
}

function clearDateFilter() {
  document.getElementById('dateFromInput').value = '';
  document.getElementById('dateToInput').value = '';
  document.getElementById('dateFieldSelect').value = 'createdAt';
  
  currentDateFrom = '';
  currentDateTo = '';
  currentDateField = 'createdAt';
  currentPage = 1;
  
  updateDateFilterInfo();
  loadAccounts(1);
}

function updateDateFilterInfo() {
  const infoElement = document.getElementById('dateFilterInfo');
  
  if (!currentDateFrom && !currentDateTo) {
    infoElement.textContent = '';
    return;
  }
  
  const fieldName = currentDateField === 'createdAt' ? 'Ngày tạo' : 'Ngày cập nhật';
  let infoText = `✓ Lọc ${fieldName}: `;
  
  if (currentDateFrom && currentDateTo) {
    const fromDate = new Date(currentDateFrom).toLocaleDateString('vi-VN');
    const toDate = new Date(currentDateTo).toLocaleDateString('vi-VN');
    infoText += `${fromDate} → ${toDate}`;
  } else if (currentDateFrom) {
    const fromDate = new Date(currentDateFrom).toLocaleDateString('vi-VN');
    infoText += `từ ${fromDate}`;
  } else if (currentDateTo) {
    const toDate = new Date(currentDateTo).toLocaleDateString('vi-VN');
    infoText += `đến ${toDate}`;
  }
  
  infoElement.textContent = infoText;
  infoElement.style.color = '#10b981'; // Green color
  infoElement.style.fontWeight = '500';
}

// Render Pagination Controls
function renderPagination() {
  const paginationContainer = document.getElementById('paginationControls');
  
  if (!paginationContainer) {
    console.warn('Pagination container not found');
    return;
  }

  if (totalPages <= 1) {
    paginationContainer.innerHTML = '';
    return;
  }

  let paginationHTML = '<div class="pagination">';
  
  // Previous button
  paginationHTML += `
    <button 
      onclick="prevPage()" 
      ${currentPage === 1 ? 'disabled' : ''}
      class="btn-pagination">
      ← Trước
    </button>
  `;

  // Page numbers (show max 5 pages)
  const maxVisiblePages = 5;
  let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
  let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);
  
  if (endPage - startPage < maxVisiblePages - 1) {
    startPage = Math.max(1, endPage - maxVisiblePages + 1);
  }

  if (startPage > 1) {
    paginationHTML += `<button onclick="goToPage(1)" class="btn-pagination">1</button>`;
    if (startPage > 2) {
      paginationHTML += `<span style="padding: 0 8px;">...</span>`;
    }
  }

  for (let i = startPage; i <= endPage; i++) {
    paginationHTML += `
      <button 
        onclick="goToPage(${i})" 
        class="btn-pagination ${i === currentPage ? 'active' : ''}">
        ${i}
      </button>
    `;
  }

  if (endPage < totalPages) {
    if (endPage < totalPages - 1) {
      paginationHTML += `<span style="padding: 0 8px;">...</span>`;
    }
    paginationHTML += `<button onclick="goToPage(${totalPages})" class="btn-pagination">${totalPages}</button>`;
  }

  // Next button
  paginationHTML += `
    <button 
      onclick="nextPage()" 
      ${currentPage === totalPages ? 'disabled' : ''}
      class="btn-pagination">
      Tiếp →
    </button>
  `;

  // Page info
  paginationHTML += `
    <span style="margin-left: 16px; color: #9ca3af;">
      Trang ${currentPage} / ${totalPages} (${totalAccounts} tài khoản)
    </span>
  `;

  paginationHTML += '</div>';
  paginationContainer.innerHTML = paginationHTML;
}

// Update single account row (without reloading entire table)
async function updateAccountRow(accountId) {
  try {
    console.log('📝 Updating single row for account:', accountId);
    
    // Set status to UPDATING with detailed message
    setRowStatus(accountId, 'updating', '🔍 Checking users');
    
    // Find the row in the table first
    const row = document.querySelector(`tr[data-account-id="${accountId}"]`);
    
    if (!row) {
      console.warn('Row not found in current page, skipping update');
      clearRowStatus(accountId);
      return;
    }

    // Add loading state to row
    row.classList.add('updating');
    
    // Set next check time (30 seconds from now)
    setNextCheckTime(accountId, 30);
    
    // Fetch only this account data
    const response = await fetch(`${API_BASE_URL}/accounts/${accountId}`, {
      headers: {
        Authorization: `Bearer ${currentToken}`,
      },
    });

    if (!response.ok) {
      console.error('Failed to fetch account data');
      row.classList.remove('updating');
      setRowStatus(accountId, 'error', 'Fetch failed');
      return;
    }

    const account = await response.json();

    // Get row index
    const rowIndex = Array.from(row.parentElement.children).indexOf(row);
    const startIndex = (currentPage - 1) * 20;
    const displayIndex = startIndex + rowIndex + 1;

    // Rebuild row HTML
    const accountName = account.accountName || "Unnamed Account";
    const adminEmail = account.adminEmail || "N/A";
    const currentMembers = account.members.length;
    const maxMembers = account.maxMembers || 7;
    const totalSlots = maxMembers + 1;
    const allowedMembers = account.allowedMembers || [];
    const pendingInvites = account.pendingInvites || [];

    const activeMembers = account.members.filter(
      (m) => m.email !== adminEmail && m.status !== "pending"
    );

    const createdDate = account.createdAt
      ? new Date(account.createdAt).toLocaleDateString("vi-VN")
      : "N/A";
    const updatedDate = account.updatedAt
      ? new Date(account.updatedAt).toLocaleDateString("vi-VN")
      : "N/A";

    const statusClass = account.isFailed ? "status-failed" : "status-success";
    const statusText = account.isFailed
      ? `✗ Failed${account.errorMessage ? ": " + account.errorMessage : ""}`
      : "✓ Active";

    row.innerHTML = `
      <td>${displayIndex}</td>
      <td>
        <div style="font-weight: 600; color: #60a5fa; font-size: 14px;">
          ${accountName}
        </div>
        <div class="member-email" style="margin-top: 4px;">
          ${adminEmail}
        </div>
      </td>
      <td style="text-align: center;">
        <div style="font-weight: bold; font-size: 16px; color: ${
          currentMembers >= maxMembers ? "#ef4444" : "#10b981"
        };">
          ${currentMembers}/${maxMembers}
        </div>
        <div style="font-size: 10px; color: #9ca3af; margin-top: 2px;">
          Total: ${currentMembers + 1}/${totalSlots}
        </div>
      </td>
      <td>
        <div class="member-list" style="max-height: 100px; overflow-y: auto;">
          ${
            activeMembers.length > 0
              ? activeMembers
                  .map(
                    (m) =>
                      `<div class="member-email">${m.email}${
                        m.name ? ` (${m.name})` : ""
                      }</div>`
                  )
                  .join("")
              : '<span style="color: #9ca3af;">Chưa có member</span>'
          }
        </div>
      </td>
      <td>
        <div class="member-list" style="max-height: 100px; overflow-y: auto;">
          ${
            allowedMembers.length > 0
              ? allowedMembers
                  .map((email) => `<div class="member-email">${email}</div>`)
                  .join("")
              : '<span style="color: #9ca3af;">Chưa có</span>'
          }
        </div>
      </td>
      <td style="text-align: center;">
        ${
          pendingInvites.length > 0
            ? `<span style="background: #fbbf24; color: #78350f; padding: 4px 8px; border-radius: 4px; font-weight: bold; font-size: 14px;">${pendingInvites.length}</span>`
            : '<span style="color: #9ca3af;">0</span>'
        }
      </td>
      <td style="font-size: 11px;">
        <div style="color: #10b981; margin-bottom: 4px;">
          📅 ${createdDate}
        </div>
        <div style="color: #9ca3af;">
          🔄 ${updatedDate}
        </div>
      </td>
      <td style="text-align: center;">
        <span style="color: #9ca3af;">-</span>
      </td>
      <td>
        <span class="status-badge ${statusClass}">${statusText}</span>
      </td>
      <td>
        <button onclick="showEditAllowedMembersModal('${account._id}')" class="btn-table" style="background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); color: white; margin-bottom: 5px;">
          ✏️ Edit Members
        </button>
        <button onclick="showSendInviteModal('${account._id}')" class="btn-table" style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; margin-bottom: 5px;">
          📧 Send Invite
        </button>
        <button onclick="deleteAccount('${account._id}')" class="btn-table btn-delete">
          🗑️ Delete
        </button>
      </td>
    `;

    // Store account status in dataset for status badge
    row.dataset.isFailed = account.isFailed || false;
    row.dataset.errorMessage = account.errorMessage || '';

    // Remove loading state and add flash animation
    row.classList.remove('updating');
    row.classList.add('flash-update');
    setTimeout(() => {
      row.classList.remove('flash-update');
    }, 800);

    // Set status to SUCCESS
    setRowStatus(accountId, 'success');

    console.log('✅ Row updated successfully');
  } catch (error) {
    console.error('Error updating row:', error);
    
    // Remove loading state
    const row = document.querySelector(`tr[data-account-id="${accountId}"]`);
    if (row) {
      row.classList.remove('updating');
    }
    
    // Set status to ERROR
    setRowStatus(accountId, 'error', error.message);
    
    // Fallback to full reload if update fails
    console.log('Falling back to full reload');
    loadAccounts();
  }
}

// Load Accounts with Pagination & Search
async function loadAccounts(page = 1) {
  const tbody = document.getElementById("accountsTableBody");
  tbody.innerHTML =
    '<tr><td colspan="10" class="loading-cell">Đang tải danh sách accounts...</td></tr>';

  try {
    // Build query parameters
    const params = new URLSearchParams({
      page: page,
      limit: 20,
      search: currentSearch,
      sortBy: currentSortBy,
      sortOrder: currentSortOrder
    });

    // Add date filter parameters if set
    if (currentDateFrom) {
      params.append('dateFrom', currentDateFrom);
    }
    if (currentDateTo) {
      params.append('dateTo', currentDateTo);
    }
    if (currentDateFrom || currentDateTo) {
      params.append('dateField', currentDateField);
    }

    const response = await fetch(`${API_BASE_URL}/accounts?${params}`, {
      headers: {
        Authorization: `Bearer ${currentToken}`,
      },
    });

    const result = await response.json();

    if (!result.success) {
      throw new Error(result.message || 'Failed to load accounts');
    }

    const accounts = result.data;
    const pagination = result.pagination;

    // Update pagination state
    currentPage = pagination.currentPage;
    totalPages = pagination.totalPages;
    totalAccounts = pagination.totalAccounts;

    console.log("Loaded accounts:", accounts); // Debug
    console.log("Pagination:", pagination); // Debug

    // Update stats
    document.getElementById("totalAccountsCount").textContent = totalAccounts;

    // Show search results info
    if (currentSearch) {
      document.getElementById("filteredAccountsCount").textContent = 
        `(${totalAccounts} kết quả)`;
    } else {
      document.getElementById("filteredAccountsCount").textContent = "";
    }

    if (accounts.length === 0) {
      tbody.innerHTML = currentSearch 
        ? '<tr><td colspan="10" class="loading-cell">🔍 Không tìm thấy kết quả phù hợp</td></tr>'
        : '<tr><td colspan="10" class="loading-cell">Chưa có account nào. Hãy thêm account đầu tiên!</td></tr>';
      
      document.getElementById("totalMembersCount").textContent = "0";
      document.getElementById("successAccountsCount").textContent = "0";
      document.getElementById("failedAccountsCount").textContent = "0";
      renderPagination();
      return;
    }

    // Display accounts with data from database
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
        const accountName = account.name || 'Unnamed Account';
        const accountEmail = account.email;
        const maxMembers = account.maxMembers || 7;

        // Calculate global index
        const globalIndex = (currentPage - 1) * 20 + index + 1;

        // Format dates
        const createdDate = account.createdAt ? new Date(account.createdAt).toLocaleDateString('vi-VN', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric'
        }) : 'N/A';
        const updatedDate = account.updatedAt ? new Date(account.updatedAt).toLocaleDateString('vi-VN', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric'
        }) : 'N/A';

        // Get member count and status from database
        const memberCount = account.members?.length || 0;
        const memberDisplay = memberCount > 0 
          ? `<span style="color: #10b981; font-weight: bold;">${memberCount}/${maxMembers}</span>`
          : `<span style="color: #9ca3af;">0/${maxMembers}</span>`;
        
        // Show member emails or "No data"
        const membersEmailDisplay = account.members && account.members.length > 0
          ? account.members.map(m => `<span class="member-email">${m.email}</span>`).join('')
          : '<span style="color: #9ca3af;">Chưa có dữ liệu</span>';
        
        // Determine initial status
        let statusBadge = '<span class="status-badge status-idle">⚪ Idle</span>';
        if (account.isFailed) {
          statusBadge = '<span class="status-badge status-error">❌ Error</span>';
        } else if (memberCount > 0) {
          statusBadge = '<span class="status-badge status-success">✅ Success</span>';
        }

        return `
                <tr data-account-id="${mongoId}">
                    <td>${globalIndex}</td>
                    <td>
                        <div style="font-weight: 600; color: #60a5fa; font-size: 14px;">${accountName}</div>
                        <div style="font-size: 11px; color: #9ca3af; margin-top: 2px;">${accountEmail}</div>
                    </td>
                    <td style="text-align: center;">${memberDisplay}</td>
                    <td>
                        <div class="member-list">${membersEmailDisplay}</div>
                    </td>
                    <td>
                        <div class="member-list">${allowedMembersDisplay}</div>
                        <button id="${buttonId}"
                                class="btn-table edit-allowed-btn" 
                                data-account-id="${mongoId}"
                                data-admin-email="${accountEmail}"
                                data-allowed-members='${JSON.stringify(
                                  account.allowedMembers || []
                                )}'
                                style="margin-top: 8px; background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); color: white;">
                            ✏️ Edit
                        </button>
                    </td>
                    <td style="text-align: center;">
                        <button onclick="viewPendingInvites('${mongoId}')" class="btn-table" 
                                style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: white; padding: 4px 8px; font-size: 12px;"
                                title="Xem pending invites">
                            👁️ View
                        </button>
                    </td>
                    <td style="text-align: center; font-size: 11px;">
                        <div style="color: #10b981;">📅 ${createdDate}</div>
                        <div style="color: #f59e0b; margin-top: 2px;">🔄 ${updatedDate}</div>
                    </td>
                    <td style="text-align: center;">
                        <span style="color: #9ca3af;">-</span>
                    </td>
                    <td>${statusBadge}</td>
                    <td>
                        <button onclick="showSendInviteModal('${mongoId}', '${accountEmail}', 0, ${maxMembers})" class="btn-table" 
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

    // Render pagination controls
    renderPagination();
    
    // Calculate stats from loaded accounts
    const totalMembers = accounts.reduce((sum, acc) => sum + (acc.members?.length || 0), 0);
    const successAccounts = accounts.filter(acc => acc.members && acc.members.length > 0 && !acc.isFailed).length;
    const failedAccounts = accounts.filter(acc => acc.isFailed).length;
    
    document.getElementById("totalMembersCount").textContent = totalMembers;
    document.getElementById("successAccountsCount").textContent = successAccounts;
    document.getElementById("failedAccountsCount").textContent = failedAccounts;
    
    // Restore status badges for rows that are currently updating/success/error
    setTimeout(() => {
      accounts.forEach(account => {
        const accountId = account._id;
        if (rowStatuses.has(accountId)) {
          updateStatusBadge(accountId);
        }
      });
    }, 100);

    // Start WebSocket connection after loading accounts (only once)
    if (!window.wsConnected) {
      connectWebSocket();
      window.wsConnected = true;
    }
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
  document.getElementById("newAccountName").value = "";
  document.getElementById("newAccountEmail").value = "";
  document.getElementById("newAccessToken").value = "";
  document.getElementById("newAccountId").value = "";
  document.getElementById("newAllowedMembers").value = "";
  document.getElementById("newMaxMembers").value = "7";
}

// Handle Add Account
async function handleAddAccount(event) {
  event.preventDefault();

  const name = document.getElementById("newAccountName").value.trim() || 'Unnamed Account';
  const email = document.getElementById("newAccountEmail").value;
  const accountId = document.getElementById("newAccountId").value.trim(); // Optional
  const accessToken = document.getElementById("newAccessToken").value.trim();
  const maxMembers = parseInt(document.getElementById("newMaxMembers").value) || 7;
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
      name,
      email,
      accessToken,
      allowedMembers,
      maxMembers,
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

      // Auto cleanup pending invites immediately after deleting member
      console.log("🧹 Auto-cleanup pending invites after member deletion");
      cleanupPendingInvitesForAccount(accountId).catch(err => {
        console.warn("Auto-cleanup failed:", err);
      });

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

    case "account_update":
      // Handle per-account update (real-time)
      updateSingleAccountDisplay(message.accountId, message.data);
      break;

    case "account_error":
      // Handle per-account error
      handleAccountError(message.accountId, message.error);
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
  console.log("Sample account data:", data.accounts[0]); // Debug: xem cấu trúc data

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

  // Check if any unauthorized members or pending invites were deleted
  let totalDeleted = 0;
  let totalPendingCleaned = 0;
  data.accounts.forEach(account => {
    if (account.unauthorized_deleted) {
      totalDeleted += account.unauthorized_deleted;
    }
    if (account.pending_invites_cleaned) {
      totalPendingCleaned += account.pending_invites_cleaned;
    }
  });

  // Update table
  updateAccountsTable(data.accounts);

  // Show notification with cleanup info
  let notificationMsg = `📊 Cập nhật: ${successCount}/${data.total_accounts} accounts | ${data.total_members} members`;
  if (totalDeleted > 0) {
    notificationMsg += ` | 🧹 Đã xóa ${totalDeleted} members không được phép`;
  }
  if (totalPendingCleaned > 0) {
    notificationMsg += ` | 🧹 Đã xóa ${totalPendingCleaned} pending invites`;
  }
  
  console.log(notificationMsg);
  
  // Show toast if cleanup happened
  if (totalDeleted > 0 || totalPendingCleaned > 0) {
    showToast(`🧹 Auto-cleanup: ${totalDeleted} members + ${totalPendingCleaned} pending invites đã xóa`, 'info');
  }
}

/**
 * Get status badge HTML for an account
 */
function getStatusBadgeHTML(accountId) {
  const rowStatus = getRowStatus(accountId);
  let badgeHTML = '';

  switch (rowStatus.status) {
    case 'updating':
      const actionText = rowStatus.message || 'UPDATING';
      badgeHTML = `
        <span class="status-badge status-updating">
          <span class="spinner-small"></span>
          ${actionText}
        </span>
      `;
      break;
    case 'success':
      badgeHTML = `
        <span class="status-badge status-success">
          ✓ SUCCESS
        </span>
      `;
      break;
    case 'error':
      const errorMsg = rowStatus.message ? `: ${rowStatus.message}` : '';
      badgeHTML = `
        <span class="status-badge status-failed" title="${rowStatus.message}">
          ✗ ERROR${errorMsg.length > 30 ? '' : errorMsg}
        </span>
      `;
      break;
    default:
      badgeHTML = `<span class="status-badge status-success">✓ Active</span>`;
  }

  return badgeHTML;
}

/**
 * Get Next Check HTML for an account
 */
function getNextCheckHTML(accountId) {
  const nextCheck = rowNextCheck.get(accountId);
  
  if (!nextCheck || nextCheck <= 0) {
    return `<span class="next-check-display">-</span>`;
  }

  const minutes = Math.floor(nextCheck / 60);
  const seconds = nextCheck % 60;
  const timeStr = minutes > 0 
    ? `${minutes}m ${seconds}s` 
    : `${seconds}s`;

  return `<span class="next-check-display">${timeStr}</span>`;
}

/**
 * Update single account display in real-time
 * Called when receiving per-account WebSocket updates
 */
function updateSingleAccountDisplay(accountId, accountData) {
  console.log(`🔄 Updating single account: ${accountId}`, accountData);

  // Find the row by accountId
  const row = document.querySelector(`tr[data-account-id="${accountId}"]`);
  if (!row) {
    console.warn(`⚠️  Row not found for account: ${accountId}`);
    return;
  }

  // Set status to SUCCESS or ERROR
  if (accountData.success) {
    setRowStatus(accountId, 'success', 'Cập nhật thành công');
    
    // Flash update effect
    row.classList.add('flash-update');
    setTimeout(() => row.classList.remove('flash-update'), 1000);
  } else {
    setRowStatus(accountId, 'error', accountData.error || 'Lỗi không xác định');
  }

  // Set next check timer (30 seconds from now)
  if (accountData.nextCheckIn) {
    setNextCheckTime(accountId, accountData.nextCheckIn);
  }

  // Update the row content
  updateSingleAccountRow(row, accountData);

  // Update statistics (recalculate from all visible rows)
  updateStatistics();
}

/**
 * Update a single account row with new data
 */
function updateSingleAccountRow(row, accountData) {
  // Members list
  const membersList = accountData.members && accountData.members.length > 0 ? accountData.members : [];
  const currentMemberCount = (membersList || []).filter((m) => m.id !== 'admin').length;

  const memberEmails =
    membersList.length > 0
      ? membersList
          .map((m) => {
            if (m.id === "admin") {
              return `<div class="member-email" data-member-id="${m.id}">
                        <span class="admin-badge">👑 ADMIN</span>
                        <strong>${m.email}</strong>
                      </div>`;
            }
            return `<div class="member-email" data-member-id="${m.id}">
                      ${m.email}
                      <button class="delete-btn" onclick="deleteMember('${accountData._id}', '${m.id}', '${m.email}')" title="Xóa member">❌</button>
                    </div>`;
          })
          .join("")
      : '<div class="no-members">Chưa có member</div>';

  const allowedMembersList =
    accountData.allowedMembers && accountData.allowedMembers.length > 0
      ? accountData.allowedMembers.join(", ")
      : "Chưa có";

  const maxMembers = accountData.maxMembers || 7;
  const memberCountColor =
    currentMemberCount >= maxMembers
      ? "color: red; font-weight: bold;"
      : currentMemberCount >= maxMembers - 1
      ? "color: orange; font-weight: bold;"
      : "";

  const statusBadgeHTML = getStatusBadgeHTML(accountData._id);
  const nextCheckHTML = getNextCheckHTML(accountData._id);

  // Find cells and update them
  const cells = row.querySelectorAll('td');
  
  // Update Members count (index 2)
  cells[2].innerHTML = `<span style="${memberCountColor}">${currentMemberCount}</span> / ${maxMembers}`;
  
  // Update Member Emails (index 3)
  cells[3].innerHTML = memberEmails;
  
  // Update Member Cố Định (index 4)
  cells[4].innerHTML = allowedMembersList;
  
  // Update Pending Invites (index 5) - keep existing functionality
  // cells[5] - not updated here, handled separately
  
  // Update Next Check (index 7)
  cells[7].innerHTML = nextCheckHTML;
  
  // Update Status (index 8)
  cells[8].innerHTML = statusBadgeHTML;
  
  console.log(`✅ Updated row for account: ${accountData.email}`);
}

/**
 * Handle account error
 */
function handleAccountError(accountId, errorMessage) {
  console.error(`❌ Account error for ${accountId}:`, errorMessage);
  
  setRowStatus(accountId, 'error', errorMessage);
  
  // Set next retry in 30 seconds
  setNextCheckTime(accountId, 30);
}

/**
 * Update statistics from visible rows
 */
function updateStatistics() {
  const rows = document.querySelectorAll('#accountsTableBody tr[data-account-id]');
  
  let totalAccounts = rows.length;
  let totalMembers = 0;
  let successCount = 0;
  let failedCount = 0;

  rows.forEach(row => {
    const accountId = row.dataset.accountId;
    const status = rowStatuses.get(accountId);
    
    // Count members from the members column (index 2: "X / 7")
    const membersCell = row.querySelectorAll('td')[2];
    if (membersCell) {
      const membersText = membersCell.textContent.trim();
      const match = membersText.match(/^(\d+)/);
      if (match) {
        totalMembers += parseInt(match[1], 10);
      }
    }
    
    // Count success/failed
    if (status?.status === 'success') {
      successCount++;
    } else if (status?.status === 'error') {
      failedCount++;
    }
  });

  // Update UI
  document.getElementById('totalAccountsCount').textContent = totalAccounts;
  document.getElementById('totalMembersCount').textContent = totalMembers;
  document.getElementById('successAccountsCount').textContent = successCount;
  document.getElementById('failedAccountsCount').textContent = failedCount;
}

function updateAccountsTable(accounts) {
  const tbody = document.getElementById("accountsTableBody");

  if (accounts.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="10" class="loading-cell">Chưa có dữ liệu</td></tr>';
    return;
  }

  tbody.innerHTML = accounts
    .map((account, index) => {
      // Members list provided by backend includes admin as first member (id='admin')
      const membersList =
        account.members && account.members.length > 0 ? account.members : [];
      // Count members excluding the admin entry (we mark admin with id === 'admin')
      const currentMemberCount = (membersList || []).filter((m) => m.id !== 'admin').length;

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
      const accountName = account.name || 'Unnamed Account';
      const accountEmail = account.email;

      // Format dates
      const createdDate = account.createdAt ? new Date(account.createdAt).toLocaleDateString('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      }) : 'N/A';
      const updatedDate = account.updatedAt ? new Date(account.updatedAt).toLocaleDateString('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      }) : 'N/A';

      // Create unique button ID for this row
      const buttonId = `edit-btn-${index}`;
      const maxMembers = account.maxMembers || 7;
      
      // Calculate total including admin
      const totalMembers = currentMemberCount + 1; // +1 for admin
      const totalLimit = maxMembers + 1; // +1 for admin (8 total)
      const remaining = maxMembers - currentMemberCount;

      return `
            <tr data-account-id="${mongoId}">
                <td>${index + 1}</td>
                <td>
                    <div style="font-weight: 600; color: #60a5fa; font-size: 14px;">${accountName}</div>
                    <div style="font-size: 11px; color: #9ca3af; margin-top: 2px;">${accountEmail}</div>
                </td>
                <td style="text-align: center;">
                    <div style="font-weight: bold; font-size: 16px; color: ${
                      account.success ? "#10b981" : "#ef4444"
                    };">
                        ${currentMemberCount}/${maxMembers}
                    </div>
                    <div style="font-size: 10px; color: #9ca3af; margin-top: 2px;">
                        Tổng: ${totalMembers}/${totalLimit}
                    </div>
                    <div style="font-size: 10px; color: ${remaining > 0 ? '#10b981' : '#ef4444'}; margin-top: 2px;">
                        Còn: ${remaining} slot${remaining !== 1 ? 's' : ''}
                    </div>
                </td>
                <td>
                    <div class="member-list">${memberEmails}</div>
                </td>
                <td>
                    <div class="member-list">${allowedMembersDisplay}</div>
                    <button id="${buttonId}" 
                            class="btn-table edit-allowed-btn" 
                            data-account-id="${mongoId}"
                            data-admin-email="${accountEmail}"
                            data-allowed-members='${JSON.stringify(
                              account.allowedMembers || []
                            )}'
                            style="margin-top: 8px; background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); color: white;">
                        ✏️ Edit
                    </button>
                </td>
                <td style="text-align: center;">
                    <button onclick="viewPendingInvites('${mongoId}')" class="btn-table" 
                            style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: white; padding: 4px 8px; font-size: 12px;"
                            title="Xem pending invites">
                        👁️ View
                    </button>
                    <button onclick="cleanupPendingInvites('${mongoId}')" class="btn-table" 
                            style="background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); color: white; padding: 4px 8px; font-size: 12px; margin-top: 4px;"
                            title="Cleanup pending invites">
                        🧹 Cleanup
                    </button>
                </td>
                <td style="text-align: center; font-size: 11px;">
                    <div style="color: #10b981;">📅 ${createdDate}</div>
                    <div style="color: #f59e0b; margin-top: 2px;">🔄 ${updatedDate}</div>
                </td>
                <td style="text-align: center;">
                    <span style="color: #9ca3af;">-</span>
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
                    <button onclick="showSendInviteModal('${mongoId}', '${accountEmail}', ${currentMemberCount}, ${maxMembers})" class="btn-table" 
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
    
    // Update all Next Check displays
    rowNextCheck.forEach((nextTime, accountId) => {
      updateNextCheckDisplay(accountId);
    });
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
      
      // Auto cleanup pending invites immediately after updating allowed members
      console.log("🧹 Auto-cleanup pending invites for account:", accountId);
      cleanupPendingInvitesForAccount(accountId).catch(err => {
        console.warn("Auto-cleanup failed:", err);
      });
      
      // Update only the specific row instead of reloading entire table
      updateAccountRow(accountId);
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
  showSendInviteModal(accountId, adminEmail, currentAllowedMembers, 7);
}

function showSendInviteModal(accountId, adminEmail, currentMemberCount, maxMembers = 7) {
  document.getElementById("inviteAccountId").value = accountId;
  document.getElementById("inviteAdminEmail").value = adminEmail;
  document.getElementById("inviteEmails").value = "";

  // Store current member count and maxMembers for validation
  document.getElementById("inviteAccountId").dataset.currentMembers = currentMemberCount || 0;
  document.getElementById("inviteAccountId").dataset.maxMembers = maxMembers || 7;

  // Calculate slots: maxMembers is for USER members only (not including admin)
  // ChatGPT limit: 8 total (1 admin + 7 user members)
  const remaining = Math.max(0, maxMembers - currentMemberCount);
  const totalMembers = currentMemberCount + 1; // +1 for admin
  const totalLimit = maxMembers + 1; // +1 for admin (8 total)
  
  const remainingSlotsEl = document.getElementById("remainingSlots");
  const remainingSlotsParent = remainingSlotsEl.parentElement;
  
  remainingSlotsParent.innerHTML = `
    <label>
      Slots còn lại: <span id="remainingSlots" style="color: ${remaining > 0 ? '#10b981' : '#ef4444'}; font-weight: bold;">${remaining}/${maxMembers}</span>
      <span style="color: #9ca3af;">(Tổng: ${totalMembers}/${totalLimit}, User Members: ${currentMemberCount}/${maxMembers})</span>
    </label>
  `;

  // Add real-time validation on input
  const inviteEmailsInput = document.getElementById("inviteEmails");
  inviteEmailsInput.oninput = function() {
    const emailsText = this.value.trim();
    const newEmails = emailsText
      .split("\n")
      .map((e) => e.trim().toLowerCase())
      .filter((e) => e && e.includes("@"));
    
    const currentCount = parseInt(document.getElementById("inviteAccountId").dataset.currentMembers) || 0;
    const maxMembersLimit = parseInt(document.getElementById("inviteAccountId").dataset.maxMembers) || 7;
    
    // Check for duplicates in input
    const uniqueEmails = [...new Set(newEmails)];
    const hasDuplicates = uniqueEmails.length !== newEmails.length;
    
    const afterAdd = currentCount + uniqueEmails.length;
    const remainingAfter = Math.max(0, maxMembersLimit - afterAdd);
    
    const totalAfterAdd = afterAdd + 1; // +1 for admin
    const totalLimit = maxMembersLimit + 1; // +1 for admin (8 total)
    
    const remainingSlotsEl = document.getElementById("remainingSlots");
    const remainingSlotsParent = remainingSlotsEl.parentElement;
    
    if (hasDuplicates) {
      const duplicates = newEmails.filter((email, index) => newEmails.indexOf(email) !== index);
      const uniqueDuplicates = [...new Set(duplicates)];
      remainingSlotsParent.innerHTML = `
        <label style="color: #ef4444;">
          ⚠️ EMAIL BỊ TRÙNG LẶP! 
          <span style="font-weight: bold;">${uniqueDuplicates.join(", ")}</span>
          <br><small>Vui lòng xóa email trùng. Tổng: ${newEmails.length} emails (${uniqueEmails.length} unique)</small>
        </label>
      `;
    } else if (afterAdd > maxMembersLimit) {
      remainingSlotsParent.innerHTML = `
        <label style="color: #ef4444;">
          ⚠️ VƯỢT QUÁ GIỚI HẠN! 
          <span style="font-weight: bold;">Đang nhập: ${uniqueEmails.length}</span>, 
          User Members hiện có: ${currentCount}, 
          Tổng User Members sẽ là: <span style="font-weight: bold;">${afterAdd}/${maxMembersLimit}</span>
          (Tổng tất cả: ${totalAfterAdd}/${totalLimit})
        </label>
      `;
    } else {
      remainingSlotsParent.innerHTML = `
        <label>
          Slots còn lại sau khi thêm: <span id="remainingSlots" style="color: ${remainingAfter > 0 ? '#10b981' : '#f59e0b'}; font-weight: bold;">${remainingAfter}/${maxMembersLimit}</span>
          <span style="color: #9ca3af;">(Đang nhập: ${uniqueEmails.length} unique, Tổng sẽ là: ${totalAfterAdd}/${totalLimit})</span>
        </label>
      `;
    }
  };

  document.getElementById("sendInviteModal").style.display = "flex";
}

function closeSendInviteModal() {
  document.getElementById("sendInviteModal").style.display = "none";
  // Remove event listener
  const inviteEmailsInput = document.getElementById("inviteEmails");
  inviteEmailsInput.oninput = null;
}

async function handleSendInvite(event) {
  event.preventDefault();

  const accountId = document.getElementById("inviteAccountId").value;
  const emailsText = document.getElementById("inviteEmails").value.trim();
  const currentMemberCount = parseInt(document.getElementById("inviteAccountId").dataset.currentMembers) || 0;
  const maxMembers = parseInt(document.getElementById("inviteAccountId").dataset.maxMembers) || 7;

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

  // Check for duplicate emails in the input
  const uniqueEmails = [...new Set(emails)];
  if (uniqueEmails.length !== emails.length) {
    const duplicates = emails.filter((email, index) => emails.indexOf(email) !== index);
    const uniqueDuplicates = [...new Set(duplicates)];
    showToast(
      `❌ Email bị trùng lặp trong danh sách: ${uniqueDuplicates.join(", ")}`,
      "error"
    );
    return;
  }

  // Validate total members limit
  const totalAfterAdd = currentMemberCount + uniqueEmails.length;
  
  if (totalAfterAdd > maxMembers) {
    showToast(
      `❌ VƯỢT QUÁ GIỚI HẠN! Hiện có ${currentMemberCount} members, thêm ${uniqueEmails.length} sẽ thành ${totalAfterAdd}/${maxMembers}. Vui lòng giảm số lượng email!`,
      "error"
    );
    return;
  }

  console.log("Sending invites:", { accountId, emails: uniqueEmails, currentMemberCount, maxMembers, totalAfterAdd });

  // Get submit button and add loading state
  const submitBtn = event.target.querySelector('button[type="submit"]');
  const originalBtnText = submitBtn.innerHTML;
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<span class="loading-spinner"></span> Đang gửi...';

  // Mark row as updating
  const row = document.querySelector(`tr[data-account-id="${accountId}"]`);
  if (row) {
    row.classList.add('updating');
  }
  
  // Set status to UPDATING with detailed message
  setRowStatus(accountId, 'updating', '📧 Sending invites');
  setNextCheckTime(accountId, 30);

  try {
    const response = await fetch(
      `${API_BASE_URL}/accounts/${accountId}/send-invites`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${currentToken}`,
        },
        body: JSON.stringify({ emails: uniqueEmails }),
      }
    );

    const data = await response.json();

    console.log("Invite response:", data);

    if (response.ok) {
      const remainingSlots = maxMembers - totalAfterAdd;
      let message = `✅ Đã gửi ${uniqueEmails.length} lời mời thành công! Còn ${remainingSlots}/${maxMembers} slots (${totalAfterAdd} members)`;
      
      // Show protected emails notification
      if (data.protected_emails && data.protected_emails.length > 0) {
        message += `\n🛡️ ${data.protected_emails.length} email được bảo vệ tự động trong Member Cố Định`;
      }
      
      // Check if auto-cleanup happened
      if (data.cleanup && data.cleanup.deleted > 0) {
        message += `\n🧹 Auto-cleanup: ${data.cleanup.deleted} pending invites đã xóa`;
      }
      
      // Show grace period info if available
      if (data.cleanup && data.cleanup.gracePeriod) {
        message += `\n⏳ Grace period: ${data.cleanup.gracePeriod} phút`;
      }
      
      showToast(message, "success");
      closeSendInviteModal();
      
      // Set status to SUCCESS (will auto-clear after 3s)
      setRowStatus(accountId, 'success');
      
      // Update only this row instead of reloading entire table
      updateAccountRow(accountId);
    } else {
      // Remove updating state on error
      if (row) {
        row.classList.remove('updating');
      }
      
      // Set status to ERROR
      setRowStatus(accountId, 'error', data.message || 'Send failed');
      
      if (data.duplicates && data.duplicates.length > 0) {
        showToast(`❌ Email bị trùng với account khác: ${data.duplicates.join(", ")}`, "error");
      } else {
        showToast(data.message || "Gửi invite thất bại!", "error");
      }
    }
  } catch (error) {
    // Remove updating state on error
    const row = document.querySelector(`tr[data-account-id="${accountId}"]`);
    if (row) {
      row.classList.remove('updating');
    }
    
    // Set status to ERROR
    setRowStatus(accountId, 'error', 'Connection error');
    
    showToast("Lỗi kết nối server!", "error");
    console.error("Send invite error:", error);
  } finally {
    // Restore button state
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalBtnText;
    }
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

// View Pending Invites
async function viewPendingInvites(accountId) {
  try {
    showToast("📋 Đang tải pending invites...", "info");

    const response = await fetch(`${API_BASE_URL}/accounts/${accountId}/pending-invites`, {
      headers: {
        Authorization: `Bearer ${currentToken}`,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      showToast(data.message || "Lỗi tải pending invites!", "error");
      return;
    }

    if (data.invites.length === 0) {
      showToast("Không có pending invites nào!", "info");
      return;
    }

    // Show modal with pending invites
    const invitesList = data.invites.map((invite, index) => {
      const email = invite.email_address || invite.email || 'N/A';
      const createdTime = invite.created_time ? new Date(invite.created_time).toLocaleString('vi-VN') : 'N/A';
      return `${index + 1}. ${email}\n   Role: ${invite.role || 'standard-user'}\n   Created: ${createdTime}`;
    }).join('\n\n');

    alert(`📧 Pending Invites cho ${data.account.name || data.account.email}:\n\nTổng số: ${data.total}\n\n${invitesList}`);
    showToast(`✅ Tìm thấy ${data.total} pending invites`, "success");
  } catch (error) {
    showToast("Lỗi kết nối server!", "error");
    console.error("View pending invites error:", error);
  }
}

// Cleanup Pending Invites for Single Account
async function cleanupPendingInvites(accountId) {
  if (!confirm('🧹 Xóa tất cả pending invites KHÔNG nằm trong "Member Cố Định"?\n\nCảnh báo: Hành động này không thể hoàn tác!')) {
    return;
  }

  await cleanupPendingInvitesForAccount(accountId, true);
}

// Helper function to cleanup pending invites (with or without confirmation)
async function cleanupPendingInvitesForAccount(accountId, showNotification = false) {
  try {
    if (showNotification) {
      showToast("🧹 Đang cleanup pending invites...", "info");
    }

    const response = await fetch(`${API_BASE_URL}/accounts/${accountId}/cleanup-pending-invites`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${currentToken}`,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      if (showNotification) {
        showToast(data.message || "Cleanup thất bại!", "error");
      }
      return;
    }

    if (showNotification && data.deleted && data.deleted.length > 0) {
      showToast(`✅ ${data.message} - Đã xóa ${data.deleted.length} pending invites!`, "success");
    }
    
    if (data.failed && data.failed.length > 0) {
      console.warn(`⚠️ Failed to delete ${data.failed.length} invites:`, data.failed);
    }

    return data;
  } catch (error) {
    if (showNotification) {
      showToast("Lỗi kết nối server!", "error");
    }
    console.error("Cleanup pending invites error:", error);
    throw error;
  }
}

// Cleanup All Pending Invites (for all accounts)
async function cleanupAllPendingInvites() {
  if (!confirm('🧹 TỰ ĐỘNG XÓA tất cả pending invites KHÔNG nằm trong "Member Cố Định" cho TẤT CẢ accounts?\n\nCảnh báo: Hành động này không thể hoàn tác!')) {
    return;
  }

  try {
    showToast("🧹 Đang cleanup pending invites cho tất cả accounts...", "info");

    const response = await fetch(`${API_BASE_URL}/accounts/cleanup-all-pending-invites`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${currentToken}`,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      showToast(data.message || "Cleanup thất bại!", "error");
      return;
    }

    showToast(`✅ ${data.message} - Đã xóa ${data.total_deleted} pending invites!`, "success");
    
    // Show detailed results
    console.log("Cleanup all pending invites results:", data.results);

    // Show summary
    const summary = data.results
      .map((r) => `${r.name || r.account}: ${r.deleted?.length || 0} deleted, ${r.failed?.length || 0} failed`)
      .join("\n");

    console.log("📊 Cleanup Pending Invites Summary:\n" + summary);
  } catch (error) {
    showToast("Lỗi kết nối server!", "error");
    console.error("Cleanup all pending invites error:", error);
  }
}
