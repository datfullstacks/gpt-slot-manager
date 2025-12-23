#!/bin/bash

# ============================================
# GPT Slot Manager - VPS Setup Script
# ============================================
# Tự động cài đặt và cấu hình VPS cho dự án
# Support: Ubuntu 20.04+, Debian 11+
# ============================================

set -e  # Exit on error

echo "🚀 Starting VPS setup for GPT Slot Manager..."
echo "=============================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Functions
print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    print_error "Please run as root (use sudo)"
    exit 1
fi

# Get current user (who invoked sudo)
ACTUAL_USER=${SUDO_USER:-$USER}
print_info "Current user: $ACTUAL_USER"

echo ""
echo "======================================"
echo "STEP 1: System Update"
echo "======================================"
apt update -y
apt upgrade -y
print_success "System updated"

echo ""
echo "======================================"
echo "STEP 2: Install Node.js 18.x"
echo "======================================"
if command -v node &> /dev/null; then
    print_warning "Node.js already installed: $(node --version)"
else
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
    apt install -y nodejs
    print_success "Node.js installed: $(node --version)"
fi

if command -v npm &> /dev/null; then
    print_success "npm installed: $(npm --version)"
fi

echo ""
echo "======================================"
echo "STEP 3: Install Git"
echo "======================================"
if command -v git &> /dev/null; then
    print_warning "Git already installed: $(git --version)"
else
    apt install -y git
    print_success "Git installed: $(git --version)"
fi

echo ""
echo "======================================"
echo "STEP 4: Install PM2"
echo "======================================"
if command -v pm2 &> /dev/null; then
    print_warning "PM2 already installed: $(pm2 --version)"
else
    npm install -g pm2
    print_success "PM2 installed: $(pm2 --version)"
fi

echo ""
echo "======================================"
echo "STEP 5: Install Nginx"
echo "======================================"
if command -v nginx &> /dev/null; then
    print_warning "Nginx already installed: $(nginx -v 2>&1)"
else
    apt install -y nginx
    systemctl enable nginx
    systemctl start nginx
    print_success "Nginx installed and started"
fi

echo ""
echo "======================================"
echo "STEP 6: Install Certbot (SSL)"
echo "======================================"
if command -v certbot &> /dev/null; then
    print_warning "Certbot already installed: $(certbot --version 2>&1 | head -n1)"
else
    apt install -y certbot python3-certbot-nginx
    print_success "Certbot installed"
fi

echo ""
echo "======================================"
echo "STEP 7: Configure Firewall (UFW)"
echo "======================================"
if command -v ufw &> /dev/null; then
    # Configure UFW
    ufw --force reset
    ufw default deny incoming
    ufw default allow outgoing
    ufw allow 22/tcp comment 'SSH'
    ufw allow 80/tcp comment 'HTTP'
    ufw allow 443/tcp comment 'HTTPS'
    ufw --force enable
    print_success "Firewall configured"
    ufw status verbose
else
    apt install -y ufw
    print_success "UFW installed"
fi

echo ""
echo "======================================"
echo "STEP 8: Create Project Directory"
echo "======================================"
PROJECT_DIR="/var/www/gpt-slot-manager"

if [ -d "$PROJECT_DIR" ]; then
    print_warning "Project directory already exists: $PROJECT_DIR"
else
    mkdir -p "$PROJECT_DIR"
    chown -R "$ACTUAL_USER":"$ACTUAL_USER" "$PROJECT_DIR"
    print_success "Project directory created: $PROJECT_DIR"
fi

echo ""
echo "======================================"
echo "STEP 9: Clone Repository (Optional)"
echo "======================================"
read -p "Do you want to clone the repository now? (y/n): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    cd /var/www
    if [ -d "$PROJECT_DIR/.git" ]; then
        print_warning "Repository already cloned"
        cd "$PROJECT_DIR"
        sudo -u "$ACTUAL_USER" git pull origin main
        print_success "Repository updated"
    else
        sudo -u "$ACTUAL_USER" git clone https://github.com/datfullstacks/gpt-slot-manager.git "$PROJECT_DIR"
        print_success "Repository cloned"
    fi
    
    # Install dependencies
    cd "$PROJECT_DIR"
    print_info "Installing npm packages..."
    sudo -u "$ACTUAL_USER" npm install --production
    print_success "Dependencies installed"
else
    print_info "Skipped repository clone. You can clone manually later."
fi

echo ""
echo "======================================"
echo "STEP 10: Install Additional Tools"
echo "======================================"
apt install -y curl wget unzip htop nano vim

print_success "Additional tools installed"

echo ""
echo "======================================"
echo "STEP 11: Configure Nginx Reverse Proxy"
echo "======================================"
read -p "Enter primary domain (leave blank to skip): " DOMAIN_NAME
if [ -n "$DOMAIN_NAME" ]; then
    read -p "Enter secondary domain (optional, e.g. www.$DOMAIN_NAME): " DOMAIN_ALT
    read -p "Enter application port [3001]: " APP_PORT_INPUT
    APP_PORT=${APP_PORT_INPUT:-3001}

    SERVER_NAMES="$DOMAIN_NAME"
    if [ -n "$DOMAIN_ALT" ]; then
        SERVER_NAMES="$SERVER_NAMES $DOMAIN_ALT"
    fi

    NGINX_CONFIG="/etc/nginx/sites-available/gpt-slot-manager"
    cat <<EOF > "$NGINX_CONFIG"
server {
    listen 80;
    listen [::]:80;
    server_name $SERVER_NAMES;

    location / {
        proxy_pass http://127.0.0.1:$APP_PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }
}
EOF

    ln -sf "$NGINX_CONFIG" /etc/nginx/sites-enabled/gpt-slot-manager
    nginx -t
    systemctl reload nginx
    print_success "Nginx configured for $SERVER_NAMES"
else
    print_info "Skipped Nginx domain configuration"
fi

echo ""
echo "======================================"
echo "STEP 12: Configure SSL (Certbot)"
echo "======================================"
if [ -n "$DOMAIN_NAME" ]; then
    read -p "Run Certbot now for $DOMAIN_NAME? (y/n): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        if [ -n "$DOMAIN_ALT" ]; then
            certbot --nginx -d "$DOMAIN_NAME" -d "$DOMAIN_ALT"
        else
            certbot --nginx -d "$DOMAIN_NAME"
        fi
        print_success "SSL certificate configured"
    else
        print_info "Skipped automatic Certbot run. You can execute it later."
    fi
else
    print_info "No domain provided, skipping Certbot configuration."
fi

echo ""
echo "=============================================="
echo "✅ VPS SETUP COMPLETED SUCCESSFULLY!"
echo "=============================================="
echo ""
echo "📋 NEXT STEPS:"
echo ""
echo "1️⃣  Clone repository (if not done):"
echo "   cd /var/www"
echo "   git clone https://github.com/datfullstacks/gpt-slot-manager.git"
echo ""
echo "2️⃣  Configure environment:"
echo "   cd /var/www/gpt-slot-manager"
echo "   nano .env"
echo ""
echo "3️⃣  Create admin account:"
echo "   node create-admin.js"
echo ""
echo "4️⃣  Start application:"
echo "   pm2 start src/app.js --name gpt-slot-manager"
echo "   pm2 save"
echo "   pm2 startup"
echo ""
echo "5️⃣  Configure Nginx:"
echo "   sudo nano /etc/nginx/sites-available/gpt-slot-manager"
echo "   (Script created a reverse proxy if you entered a domain)"
echo ""
echo "6️⃣  Setup SSL:"
echo "   sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com"
echo ""
echo "📚 Full guide: /var/www/gpt-slot-manager/DEPLOY_GUIDE.md"
echo ""
echo "🎉 Happy deploying!"
echo ""
