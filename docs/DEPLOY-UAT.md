# UAT deployment – chanyewleather.majutech.com.sg

How to run the `uat` branch on the AWS EC2 server (Ubuntu 24.04, Singapore) behind nginx with HTTPS. `main` is kept for a future live environment.

| Item | Value |
|---|---|
| Server | EC2 t3.small, ap-southeast-1, Elastic IP `3.1.198.0`, SSH user `ubuntu`, key pair `CYL-UAT` |
| Repository | `git@github.com:Majutech-Dev/chanyew-erp.git`, branch `uat` |
| App | `/opt/chanyew-erp`, runs as Linux user `chanyew`, service `chanyew-erp`, port 3120 (internal only) |
| Data | `/var/lib/chanyew-erp` (db.json, backups, uploaded photos) – outside the code folder |

> **The app has no sign-in (local demo mode, see DEFERRED D-01).** Anyone who reaches it can pick any user, including Super Admin, and change the data. The step 7 site password is the only control in front of UAT, so keep it on for the whole of UAT. Real customer data may be loaded only while it is on (section 11), and only with the client's agreement.

## 1. Server and firewall (AWS console) – done

- t3.small, Ubuntu 24.04 (x86), 20 GiB gp3 encrypted, Elastic IP `3.1.198.0` associated.
- **Security group:** 22 (SSH) from the office IP only; 80 and 443 from anywhere. Port 3120 stays closed – nginx passes traffic to the app internally.

## 2. DNS

The UAT site is **`chanyewleather.majutech.com.sg`**, with one A record pointing at `3.1.198.0`. Checked 25 Nov 2026:

```bash
nslookup chanyewleather.majutech.com.sg 8.8.8.8
```

> **`chanyew.majutech.com.sg` is not the UAT address.** It was the name used when the server was set up on 2 Nov 2026, but it still resolves to the old `157.245.194.93` record (a different app) and does not answer. Checked 25 Nov 2026. Repoint it at `3.1.198.0` or remove it; until it resolves to this server, do not put it in a certificate, a tester invitation or step 8.

## 3. Connect and install software

From the folder holding `CYL-UAT.pem`:

```bash
ssh -i CYL-UAT.pem ubuntu@3.1.198.0
```

On the server:

```bash
sudo apt-get update && sudo apt-get -y upgrade && curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash - && sudo apt-get install -y nodejs nginx git apache2-utils certbot python3-certbot-nginx && node -v
```

## 4. Read-only access to the private repo (deploy key)

```bash
sudo useradd --system --create-home --shell /bin/bash chanyew && sudo -u chanyew ssh-keygen -t ed25519 -N "" -C "chanyew-uat" -f /home/chanyew/.ssh/id_ed25519 && sudo cat /home/chanyew/.ssh/id_ed25519.pub
```

Copy the printed line into GitHub: **Majutech-Dev/chanyew-erp → Settings → Deploy keys → Add deploy key**, title `UAT server`, "Allow write access" **unticked**. Then clone the `uat` branch:

```bash
sudo mkdir -p /opt/chanyew-erp /var/lib/chanyew-erp && sudo chown chanyew:chanyew /opt/chanyew-erp /var/lib/chanyew-erp && sudo -u chanyew ssh -o StrictHostKeyChecking=accept-new -T git@github.com; sudo -u chanyew git clone -b uat git@github.com:Majutech-Dev/chanyew-erp.git /opt/chanyew-erp
```

(The `ssh -T` line prints "successfully authenticated … does not provide shell access" – that is expected.)

## 5. App settings

```bash
sudo -u chanyew tee /opt/chanyew-erp/.env > /dev/null <<'EOF'
PORT=3120
CRM_DATA_DIR=/var/lib/chanyew-erp
EMAIL_TRANSPORT=demo-sink
EOF
```

`.env` is excluded from git, so `git pull` never overwrites it. Demo data is created on first start.

## 6. Keep the app running (systemd)

```bash
sudo tee /etc/systemd/system/chanyew-erp.service > /dev/null <<'EOF'
[Unit]
Description=Chan Yew ERP (UAT)
After=network.target

[Service]
User=chanyew
WorkingDirectory=/opt/chanyew-erp
ExecStart=/usr/bin/node server/server.js
Restart=always
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload && sudo systemctl enable --now chanyew-erp && sleep 2 && curl -sI http://127.0.0.1:3120 | head -1
```

Expect `HTTP/1.1 200 OK`. Logs: `sudo journalctl -u chanyew-erp -n 50`.

## 7. Subdomain and password (nginx)

Create the testers' login for the site (you will be asked to type a password twice; give it to the testers separately):

```bash
sudo htpasswd -c /etc/nginx/.chanyew-htpasswd uat
```

```bash
sudo tee /etc/nginx/sites-available/chanyew-erp > /dev/null <<'EOF'
server {
    listen 80;
    server_name chanyewleather.majutech.com.sg;
    client_max_body_size 10m;            # photos up to 5 MB are sent base64-encoded

    auth_basic "Chan Yew ERP UAT";
    auth_basic_user_file /etc/nginx/.chanyew-htpasswd;

    location / {
        proxy_pass http://127.0.0.1:3120;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF
sudo ln -sf /etc/nginx/sites-available/chanyew-erp /etc/nginx/sites-enabled/ && sudo rm -f /etc/nginx/sites-enabled/default && sudo nginx -t && sudo systemctl reload nginx
```

**The site password is on.** Checked 25 Nov 2026: the site answers `401 Unauthorized` with `WWW-Authenticate: Basic realm="Chan Yew ERP UAT"`, the realm set above. It was removed on request on 2 Nov 2026 (README log row 11) and has since been put back – when, and by whom, is not recorded. Keep it on while the app has no sign-in, and never remove it while real customer data is loaded (section 11).

Check it from your PC at any time:

```bash
curl -sS -I https://chanyewleather.majutech.com.sg | head -3
```

To remove it – only on a site holding invented demo data:

```bash
sudo sed -i '/auth_basic/d' /etc/nginx/sites-available/chanyew-erp && sudo nginx -t && sudo systemctl reload nginx
```

To put it back, add the two `auth_basic` lines inside the `server { … }` block(s) of `/etc/nginx/sites-available/chanyew-erp` again, then `sudo nginx -t && sudo systemctl reload nginx`.

## 8. HTTPS (Let's Encrypt, renews automatically)

Only once step 2 shows this server's address for the name you are certifying:

```bash
sudo certbot --nginx -d chanyewleather.majutech.com.sg --redirect --agree-tos -m <admin email> --no-eff-email
```

The site is then at https://chanyewleather.majutech.com.sg and asks for the step 7 login. Testers start with **Test guide** in the top bar.

## 9. Updating after a push to `uat`

```bash
sudo -u chanyew git -C /opt/chanyew-erp pull --ff-only && sudo systemctl restart chanyew-erp
```

## 10. Data

- **Back up:** `sudo tar czf ~/chanyew-data-$(date +%F).tgz -C /var/lib chanyew-erp`
- **Reset to fresh demo data** (backs up `db.json` first):

```bash
sudo systemctl stop chanyew-erp && sudo -u chanyew bash -c 'cd /opt/chanyew-erp && npm run seed' && sudo systemctl start chanyew-erp
```

## 11. Load the client's data (Access or Sage CRM export)

The export file holds real customer data: copy it straight to the server, **never through git**, and keep the site password on (step 7).

On your PC (PowerShell), with the key in `%USERPROFILE%\.ssh`:

```bash
scp -i "$env:USERPROFILE\.ssh\CYL-UAT.pem" "<path>\kl-access-export-2025-10-01.json" ubuntu@3.1.198.0:/tmp/kl.json
```

On the server – replaces all data with the imported branch only (current data is backed up first) and deletes the upload:

```bash
sudo -u chanyew git -C /opt/chanyew-erp pull --ff-only && sudo chmod 644 /tmp/kl.json && sudo systemctl stop chanyew-erp && sudo -u chanyew node /opt/chanyew-erp/tools/import-access.js /tmp/kl.json MY && sudo systemctl start chanyew-erp && sudo rm /tmp/kl.json
```

Add `--keep-demo` after `MY` to keep the invented Singapore and Bangkok demo records.

### Singapore (Sage CRM)

The Sage CRM export is a **folder** of files, not a single file – see `docs/SAGE-CRM-MIGRATION.md` for what to export and how it is mapped.

```bash
scp -i "$env:USERPROFILE\.ssh\CYL-UAT.pem" -r "<path>\sage-export" ubuntu@3.1.198.0:/tmp/sage
```

On the server, `--check` first and read everything it reports it had to guess (unknown stages, admin users taken as technicians, duplicate customer names, totals that differ) against Sage before loading:

```bash
sudo chmod -R a+rX /tmp/sage && sudo -u chanyew node /opt/chanyew-erp/tools/import-sage.js /tmp/sage --check
```

Then load, replacing only Singapore and backing up `db.json` first:

```bash
sudo systemctl stop chanyew-erp && sudo -u chanyew node /opt/chanyew-erp/tools/import-sage.js /tmp/sage --from 2025-10-01 && sudo systemctl start chanyew-erp && sudo rm -rf /tmp/sage
```

`--from` loads a recent period plus every work order still open; the full history since 2016 does not fit the current JSON storage (DEFERRED **D-17**, measured in `docs/SAGE-CRM-MIGRATION.md` section 5).

**Order matters if both branches are loaded.** The Access import above replaces *all* data with the branch it imports, while the Sage import replaces only Singapore. Load Access (KL) first, then Sage (SG); the other way round leaves no Singapore data.

