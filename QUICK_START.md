# Quick Start - TaskFlow Real-Time Dashboard

## 🚀 3-Step Quick Start

### 1️⃣ Create Demo Account
```bash
npm run seed
```

### 2️⃣ Start Dev Server
```bash
npm run dev
```

### 3️⃣ Login
- Go to http://localhost:3000
- Email: `testing@gmail.com`
- Password: `testing@123`
- **Click "Fill in demo credentials" in blue box** ← Easiest way!

---

## 🎯 What You'll See

✅ Dashboard with live stats  
✅ 🟢 "Live" badge showing when data was last updated  
✅ Real-time project updates (no refresh needed!)  
✅ Everything updates automatically every few seconds  

---

## 📚 Documentation

- **Full Setup:** `REALTIME_SETUP.md` (complete guide with code examples)
- **Features:** `DEMO_ACCOUNT_README.md` (what was added and why)
- **This File:** `QUICK_START.md` (you are here)

---

## 🔧 Commands

```bash
npm run dev           # Start development server
npm run build         # Build for production  
npm run seed          # Create demo data
npm run test          # Run tests
npm run test:watch    # Watch tests
npm run type-check    # Check TypeScript
```

---

## 🎪 Demo Credentials (Always Available)

📧 Email: `testing@gmail.com`  
🔑 Password: `testing@123`  
👑 Role: Admin (full access)

---

## ⚙️ How Real-Time Works

Your dashboard automatically:
- Fetches project updates every **5 seconds**
- Fetches task updates every **4 seconds**
- Fetches notifications every **3 seconds**

No manual refresh needed! Just keep the page open and watch it update.

---

## 🎨 Real-Time Status Badge

In top-right of dashboard:

```
🟢 Live • 2m ago      ← Data is current, last updated 2 min ago
🟡 Offline • updating ← Connection issue, attempting refresh
```

---

## 💻 Use Real-Time in Your Code

```tsx
import { useRealtimeProjects } from '@/hooks/useRealtimeData'

export function MyComponent() {
  const { projects, isLoading } = useRealtimeProjects()
  
  return (
    <div>
      {projects.map(p => <div key={p._id}>{p.title}</div>)}
    </div>
  )
}
```

That's it! Data updates automatically. No extra code needed.

---

## ❓ Stuck?

1. Did you run `npm run seed`?
2. Is your `.env.local` set up with `MONGODB_URI`?
3. Is the dev server running on `localhost:3000`?
4. Can you see the blue demo credentials box on login?
5. Did you click "Fill in demo credentials"?

If all ✓, you're good to go!

---

## 🔐 Security Note

The demo account (`testing@gmail.com`) is **for testing only**:
- Has full admin access
- Visible in source code & documentation
- Use for development/demos only
- Create real user accounts for actual use

---

## 📁 Key New Files

```
✅ src/hooks/useRealtimeData.ts
   → Real-time update hooks

✅ src/components/ui/RealtimeStatus.tsx
   → Live status badge

✅ scripts/seed-demo-account.js
   → Create demo account without reset
```

---

## 🎓 Next: Learn More

- Need code examples? → See `REALTIME_SETUP.md`
- Want to customize polling? → Check `REALTIME_SETUP.md` Configuration section
- Building a new feature? → Use hooks from `useRealtimeData.ts`

---

**Happy building! 🚀**
