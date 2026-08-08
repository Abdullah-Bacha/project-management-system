# MongoDB Setup & DNS Fix Guide

## Problem Summary
Your MongoDB Atlas cluster is healthy, but your local machine cannot resolve the MongoDB SRV DNS record. This causes `querySrv ECONNREFUSED` errors during registration/login.

**Root Cause:** Local DNS resolution issue, not Atlas configuration.

---

## Step 1: Verify DNS Resolution (Required)

Run this from PowerShell or Command Prompt:

```powershell
nslookup -type=SRV _mongodb._tcp.cluster0.acgtflq.mongodb.net
```

**Expected output:** Should list SRV records pointing to `shard-00-0X.acgtflq.mongodb.net` hosts.

**If it times out or fails:** Your ISP/router DNS doesn't support SRV records, or a firewall is blocking UDP port 53.

---

## Step 2: Fix DNS Resolution (Choose One)

### Option A: Use Google/Cloudflare DNS (Recommended for most users)

**Windows:**
1. Right-click network icon → Open Network & Internet settings
2. Click "Advanced network settings"
3. Select your active network → click "Edit"
4. Under "DNS servers (IPv4)," toggle "Automatic" OFF
5. Enter DNS servers: `8.8.8.8` and `8.8.4.4` (Google) OR `1.1.1.1` and `1.0.0.1` (Cloudflare)
6. Click "Save"
7. Restart your dev server

Then test again:
```powershell
nslookup -type=SRV _mongodb._tcp.cluster0.acgtflq.mongodb.net
```

### Option B: Disconnect from VPN/Corporate Network

If you're behind a corporate VPN or firewall, disconnect and retest. Many block UDP DNS lookups required for SRV records.

### Option C: Use Direct Connection String (Bypass SRV)

If Options A & B don't work, use MongoDB Atlas's **non-SRV connection string**:

1. In MongoDB Atlas: Drivers → select **Node.js**
2. Look for "I prefer to connect to a replica set directly" toggle
3. Copy the direct connection string (looks like: `mongodb://shard-00-00.acgtflq.mongodb.net:27017,shard-00-01.acgtflq.mongodb.net:27017,...`)
4. Update `.env.local`:

```env
MONGODB_URI=mongodb://<username>:<password>@shard-00-00.acgtflq.mongodb.net:27017,shard-00-01.acgtflq.mongodb.net:27017,shard-00-02.acgtflq.mongodb.net:27017/TFDashboard?authSource=admin&replicaSet=atlas-xxxxx&retryWrites=true&w=majority
```

---

## Step 3: Update Your Project (Already Done)

All these files have been created/updated:

✅ `src/lib/db/models.ts` — Complete User, Project, Task schemas
✅ `src/lib/db/mongodb.ts` — Improved connection utility
✅ `src/app/api/auth/register/route.ts` — Better error handling
✅ `src/app/api/auth/login/route.ts` — Better error handling
✅ `src/lib/db/seed.ts` — Test data script
✅ `package.json` — Added seed script

---

## Step 4: Verify Connection & Seed Data

1. **Install dependencies (if needed):**
   ```bash
   npm install
   ```

2. **Restart dev server:**
   ```bash
   npm run dev
   ```

3. **Watch server logs for:**
   ```
   [MongoDB] Connected successfully
   ```

   If you see this, the DNS fix worked! ✅

4. **Load test data (in a new terminal):**
   ```bash
   npm run seed
   ```

   **Output should show:**
   ```
   [Seed] Connected to database
   [Seed] Cleared existing data
   [Seed] Created users: { admin: 'admin@taskflow.dev', member: 'member@taskflow.dev' }
   [Seed] Created project: Website Redesign
   [Seed] Created tasks
   [Seed] Complete! Test credentials: admin@taskflow.dev / Password123!
   ```

---

## Step 5: Test Registration & Login

1. Open `http://localhost:3000/auth/register`
2. Create a new account with any email/password
3. Should redirect to `/dashboard` on success
4. Verify in MongoDB Atlas → Collections → users that your user exists

**Or test with seeded credentials:**
- Email: `admin@taskflow.dev`
- Password: `Password123!`

---

## Error Codes After Fix

| Error | Status | Meaning |
|-------|--------|---------|
| `Database temporarily unavailable` | 503 | MongoDB not reachable (DNS/network issue) |
| `Email already registered` | 409 | User exists |
| `Invalid email or password` | 401 | Auth failed |
| `Validation failed` | 400 | Missing/invalid fields |
| `Internal server error` | 500 | Unexpected server error |

---

## Database Structure

### Users Collection
```javascript
{
  _id: ObjectId,
  name: "John Doe",
  email: "john@example.com",
  password: "hashed",
  role: "admin" | "manager" | "member",
  status: "active" | "invited" | "suspended",
  profilePicture: "url",
  createdAt: Date,
  updatedAt: Date
}
```

### Projects Collection
```javascript
{
  _id: ObjectId,
  name: "Website Redesign",
  description: "...",
  owner: ObjectId,
  members: [ObjectId, ObjectId],
  status: "active" | "archived" | "completed",
  createdAt: Date,
  updatedAt: Date
}
```

### Tasks Collection
```javascript
{
  _id: ObjectId,
  title: "Design homepage",
  description: "...",
  status: "todo" | "in-progress" | "review" | "done",
  priority: "low" | "medium" | "high" | "urgent",
  assignee: ObjectId,
  dueDate: Date,
  project: ObjectId,
  createdAt: Date,
  updatedAt: Date
}
```

---

## Security Note

**Rotate your MongoDB password immediately:**
1. In Atlas: Security → Database Access
2. Find user `bacha141998_db_user`
3. Click "Edit" → "Edit Password"
4. Generate a new password
5. Update `.env.local` with the new password
6. Restart dev server

---

## Troubleshooting

**Still seeing `querySrv ECONNREFUSED`?**
- Check you restarted dev server after DNS change
- Try clearing Node cache: `npm cache clean --force`
- Try Option C (direct connection string)

**Getting `MongoError` instead?**
- Check credentials are correct in `.env.local`
- Verify IP whitelist still shows `0.0.0.0/0` in Atlas

**Database exists but seed fails?**
- Run `npm install` to ensure dependencies are installed
- Check `.env.local` MONGODB_URI is set correctly

---

## Next Steps

Once MongoDB is working:
1. Build out dashboard components
2. Create task CRUD endpoints
3. Add real-time updates with Socket.io
4. Implement project management features
