# Furnish Creations — hosting and editor setup

The whole site runs on your cPanel hosting and nothing else. No Firebase, no EmailJS, no
external CDN, no third-party account of any kind. Everything below uses features your
hosting plan already includes.

| What | Where it lives |
|---|---|
| The website | `public_html` |
| Page wording, photo choices, reviews, tabs | `data/content.json` |
| Photos and videos you upload | `Assets/uploads/` |
| Visitor stats and enquiries | MySQL database |
| Your login | PHP session, password hashed in `api/config.php` |
| Enquiry emails | cPanel's own mail server |
| Fonts and animation library | `Fonts/` and `Scripts/`, served from your domain |

You only do this once.

---

## 1. Upload the site

Upload everything in this folder into **`public_html`**, so that `index.html` sits at the
top level — not inside a subfolder.

Do **not** upload `.git/`, `SETUP.md`, or `api/config.local.php`.

Afterwards `public_html` should contain:

```
index.html   policy.html   404.html   styles.css   .htaccess
cms-loader.js   analytics-tracker.js
admin/   api/   Assets/   data/   Fonts/   Scripts/   shared/
```

Make sure hidden files came across — cPanel's File Manager hides them by default
(Settings → **Show Hidden Files**). The site will not work without `.htaccess`.

### Permissions

Three folders must be writable by the web server:

| Folder | Permission | Why |
|---|---|---|
| `data/` | `755` | saves your page content |
| `data/sessions/` | `700` | your login session (created automatically) |
| `Assets/uploads/` | `755` | saves uploaded photos |

Right-click each in File Manager → **Change Permissions**. If `data/sessions` does not
exist yet, the site creates it on first sign-in — just make sure `data/` itself is
writable.

### PHP version

cPanel → **Select PHP Version** → choose **7.4 or newer** (8.1+ preferred), and make sure
these extensions are ticked:

- `pdo_mysql` — visitor stats and enquiries
- `fileinfo` — checks an uploaded file is really a photo
- `mbstring` — handles non-English characters correctly

## 2. Create the database

cPanel → **MySQL® Databases**:

1. **Create a New Database** — name it `cms`. cPanel prefixes it, giving something like
   `furnish_cms`.
2. **Add a New User** — pick a username and let cPanel generate a strong password.
   **Copy that password now**, it is not shown again.
3. **Add User To Database** — select both, then tick **ALL PRIVILEGES**.

Open `api/config.php` and fill in the four values:

```php
define('DB_HOST', 'localhost');
define('DB_NAME', 'furnish_cms');       // exactly as cPanel shows it
define('DB_USER', 'furnish_cmsuser');   // exactly as cPanel shows it
define('DB_PASS', 'the password you copied');
```

The tables create themselves on first use — there is no schema to import.

While you are in that file, change `IP_SALT` to any random string. It is what keeps
visitor IP addresses out of your database; only a salted hash is ever stored, purely to
stop one source flooding the stats.

## 3. Set your login

Still in `api/config.php`:

```php
define('ADMIN_EMAIL', 'mohsinxaifi@gmail.com');
define('ADMIN_PASSWORD_HASH', '$2y$10$…');
```

A password has already been set for you — see the note that came with this build. To
change it, run this anywhere PHP is available (including cPanel → **Terminal**):

```sh
php -r "echo password_hash('your new password', PASSWORD_DEFAULT), PHP_EOL;"
```

Paste the result as `ADMIN_PASSWORD_HASH`. The old password stops working immediately,
and so does any session that was signed in with it.

**The password itself is never stored** — only this one-way hash. Someone who obtained a
copy of `config.php` still could not sign in.

## 4. Set where enquiries are emailed

```php
define('ENQUIRY_TO', 'mohsinxaifi@gmail.com');
```

Any address you can read. Every enquiry is **also** saved in the database, so nothing is
lost even if an email fails to arrive.

For the best delivery, create a real mailbox on your own domain in cPanel → **Email
Accounts** (for example `enquiries@furnishcreations.in`) and use that address here. Mail
sent from your domain to an address at the same domain almost never lands in spam.

## 5. Point the domain at the hosting

In **GoDaddy → DNS**:

- Delete the old GitHub Pages `A` records: `185.199.108.153`, `185.199.109.153`,
  `185.199.110.153`, `185.199.111.153`
- Delete the `www` `CNAME` pointing at `techstitch.github.io`
- Add an `A` record for `@` → the IP address BigRock gives you in cPanel
- Add a `CNAME` for `www` → `furnishcreations.in`

DNS takes anywhere from a few minutes to a few hours to spread.

## 6. Turn on HTTPS

cPanel → **SSL/TLS Status** → tick both `furnishcreations.in` and
`www.furnishcreations.in` → **Run AutoSSL**. Wait until both show a valid certificate.

Do this *after* step 5 — AutoSSL can only issue a certificate once the domain resolves to
the hosting. The `.htaccess` already forces every visitor onto `https://`.

This matters for more than the padlock: the login cookie is marked **Secure** as soon as
the site is on HTTPS, which stops it ever being sent over a plain connection.

## 7. Copy your website content into the editor

Go to **https://furnishcreations.in/admin/**, sign in, and click the one-time banner
**"Copy website content in"**.

This copies everything currently on your homepage — all the wording, all 83 gallery
photos, the reviews, the tabs, the map locations — into the editor so every section opens
with real content instead of blank boxes. You only ever do this once.

---

## How the pieces fit together

```
visitor  →  index.html  →  data/content.json      (a file on your server)
                        →  api/track.php          →  MySQL   (records the visit)
                        →  api/enquiry.php        →  MySQL + email  (the lead form)

admin    →  /admin/  →  api/auth.php  →  session cookie
                     →  api/content.php   (writes data/content.json)
                     →  api/upload.php    (writes Assets/uploads/)
                     →  api/stats.php     (reads MySQL)
```

Every `api/` endpoint except `track.php` and `enquiry.php` requires a signed-in session,
and every write also requires a CSRF token that only the real editor page has.

## Using it day to day

- **Editing** — pick a section in the left menu, change what you want, click **Save
  changes**. Your website updates immediately.
- **Photos and videos** — click *Choose file* or *Add photos* on any image field. Upload
  from your computer or reuse any photo already on the site. Big photos are shrunk
  automatically, and uploads go live straight away.
- **Hiding things** — tabs and gallery categories have a *Show this on the site* switch.
- **Undo** — every section has **Reset section**, which puts it back to how the site
  launched.
- **Dashboard** — visitor numbers, WhatsApp clicks, call clicks and form submissions,
  with day/week/month filters. Days are counted in India time.
- **Enquiries** — emailed to you, and every one is kept in the `enquiries` table. To read
  them directly: cPanel → **phpMyAdmin** → your database → `enquiries`.

## Changing the built-in wording or layout

The editor covers everything on the page. Editing the HTML is only needed for structural
changes, and `git push` does **not** publish anything — edit the file, then upload it
over the old one.

Keep the hardcoded wording and photos in `index.html` intact. They are what the page
falls back to if `data/content.json` is ever missing or unreadable.

## Backups

cPanel can do all of this:

- **`data/content.json`** — all your wording and photo choices. Tiny; download it now and
  then.
- **The database** — visitor history and every enquiry. cPanel → **Backup** → *Download a
  MySQL Database Backup*.
- **`Assets/`** — your photos, included in any full cPanel backup.

## If something goes wrong

**The website never breaks.** If `data/content.json` is missing or unreadable, the page
falls back to its original built-in wording and photos. The worst case is that an edit
doesn't show — never a broken or empty page.

| Problem | Fix |
|---|---|
| "Wrong email or password" | Check `ADMIN_EMAIL` in `api/config.php`; reset the hash per step 3 |
| "Too many sign-in attempts" | Deliberate lockout after 8 failures. Wait 15 minutes |
| "The server could not start a session" | `data/` is not writable — step 1 |
| Signed out again immediately after signing in | Same as above: the session could not be saved |
| "Your session expired or the page is stale" | Reload `/admin/` — the CSRF token is refreshed on load |
| "Could not reach the database" | Step 2 — check the four values in `api/config.php` |
| "Could not save. Check that the data folder is writable" | Step 1 — set `data/` to `755` |
| "Could not save the file. Check permissions" | Step 1 — set `Assets/uploads/` to `755` |
| Enquiry emails not arriving | Step 4 — use an address on your own domain; check the `enquiries` table, the data is still there |
| "That file was too large" | cPanel → Select PHP Version → Options → raise `upload_max_filesize` |
| "That file does not look like a real image" | Tick `fileinfo` in cPanel → Select PHP Version |
| An iPhone photo is refused | It's a HEIC file; export it as JPEG and upload again |
| Site shows "Not secure" | Step 6 — run AutoSSL |
| Dashboard shows zeros | Normal until visitors arrive after the site goes live |

## What still talks to the outside world

Only three things, all of them optional and none required for the site to work:

- **Google Tag Manager** and **Microsoft Clarity** — marketing analytics in `index.html`.
  Delete those `<script>` blocks if you don't want them; your own dashboard is separate
  and unaffected.
- **Google Maps** — the map embeds on the contact section.
- **wa.me** links — your own WhatsApp.

Fonts, the animation library, the editor, the database and email are all served from your
own hosting.
