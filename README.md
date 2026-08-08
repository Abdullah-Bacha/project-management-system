# TaskFlow Dashboard

A professional, production-ready task management dashboard application with real-time collaboration features built with Next.js 14, React 18, TypeScript, MongoDB, and Socket.io.

## 🚀 Features Implemented (Phase 1)

### ✅ Project Setup
- Next.js 14+ with App Router
- TypeScript in strict mode
- Tailwind CSS v4 for styling
- Complete folder structure and configuration
- Environment variables setup

### ✅ Authentication System
- **Login/Register Pages** with form validation
- **JWT Authentication** with access and refresh tokens
- **Secure Password Hashing** using bcryptjs
- **Protected Routes** with auth middleware
- **Auth Hooks** for easy integration in components
- **Zustand Store** for global auth state management

### ✅ Database
- MongoDB Atlas connection configured
- Mongoose schemas for all collections:
  - Users
  - Projects
  - Tasks
  - Comments
  - Notifications
- Database indexes for performance

### ✅ API Endpoints (Authentication)
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `POST /api/auth/logout` - User logout
- `POST /api/auth/refresh-token` - Token refresh
- `GET /api/auth/me` - Get current user

### ✅ UI Components
- Button component with variants (primary, secondary, danger)
- Input component with validation
- Toast notification system
- Login/Register forms with full validation

## 📋 Project Structure

```
src/
├── app/
│   ├── api/auth/          # Authentication API routes
│   ├── auth/              # Login/Register pages
│   ├── dashboard/         # Dashboard pages (protected)
│   └── globals.css        # Global styles
├── components/
│   ├── auth/              # Auth components (LoginForm, RegisterForm)
│   ├── ui/                # Reusable UI components
│   ├── dashboard/         # Dashboard components
│   └── common/            # Common components
├── lib/
│   ├── auth/              # JWT, password, validation, middleware
│   └── db/                # MongoDB connection and models
├── hooks/                 # Custom React hooks (useAuth, etc.)
├── store/                 # Zustand stores (authStore)
├── types/                 # TypeScript type definitions
└── utils/                 # Utility functions
```

## 🔧 Tech Stack

### Frontend
- Next.js 14.0.0
- React 19.2.4
- TypeScript 5.3.0
- Tailwind CSS 3.3.0
- Zustand 5.0.14
- React Query 5.101.4

### Backend
- Next.js API Routes
- Node.js
- TypeScript

### Database
- MongoDB Atlas
- Mongoose 9.9.1

### Authentication
- jsonwebtoken 9.0.3
- bcryptjs 3.0.3

### Validation
- Zod 4.4.3

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- MongoDB Atlas account (configured)
- npm or yarn

### Installation

1. **Navigate to project directory**
   ```bash
   cd "E:\TaskFlow Dashboard"
   ```

2. **Install dependencies** (if not already installed)
   ```bash
   npm install --legacy-peer-deps
   ```

3. **Environment is already configured**
   - `.env.local` is already set up with MongoDB URI
   - JWT secrets are configured
   - Ready to run!

### Running the Development Server

```bash
npm run dev
```

The application will start at `http://localhost:3000`

### Building for Production

```bash
npm run build
npm start
```

## 📝 Usage

### 1. Register
1. Navigate to `http://localhost:3000/auth/register`
2. Fill in name, email, password
3. Click "Create Account"
4. You'll be redirected to the dashboard

### 2. Login
1. Navigate to `http://localhost:3000/auth/login`
2. Enter email and password
3. Click "Sign In"
4. Access your dashboard

### 3. Authenticated Routes
- Dashboard: `http://localhost:3000/dashboard` (protected)
- All dashboard routes require valid JWT token

## 🔐 Security Features

✅ Password hashing with bcryptjs (10 salt rounds)
✅ JWT tokens with 1-hour expiration
✅ Refresh tokens with 7-day expiration
✅ Secure HTTP-only cookies
✅ Input validation with Zod
✅ XSS prevention (React auto-escaping)
✅ Protected API routes with middleware
✅ Environment variables for sensitive data

## 📊 Database Schema

### Users Collection
```javascript
{
  _id: ObjectId,
  name: String,
  email: String (unique),
  password: String (hashed),
  profilePicture: String,
  role: "owner" | "admin" | "member" | "viewer",
  status: "online" | "offline",
  createdAt: Date,
  updatedAt: Date
}
```

### Projects, Tasks, Comments, Notifications
See database models in `src/lib/db/models/`

## 🧪 Testing

To test the authentication flow:

1. **Register**: Create a new account at `/auth/register`
2. **Login**: Sign in at `/auth/login`
3. **Dashboard**: Access protected routes at `/dashboard`
4. **Logout**: Click logout to clear tokens

## 📦 API Documentation

### Authentication Endpoints

#### Register
```bash
POST /api/auth/register
Content-Type: application/json

{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "password123",
  "confirmPassword": "password123"
}

Response: {
  "user": { _id, name, email, role, ... },
  "token": "jwt_token",
  "refreshToken": "refresh_token"
}
```

#### Login
```bash
POST /api/auth/login
Content-Type: application/json

{
  "email": "john@example.com",
  "password": "password123"
}

Response: {
  "user": { _id, name, email, role, ... },
  "token": "jwt_token",
  "refreshToken": "refresh_token"
}
```

#### Get Current User
```bash
GET /api/auth/me
Authorization: Bearer {token}

Response: {
  "user": { _id, name, email, role, ... }
}
```

#### Refresh Token
```bash
POST /api/auth/refresh-token
Content-Type: application/json

{
  "refreshToken": "refresh_token"
}

Response: {
  "token": "new_jwt_token",
  "refreshToken": "new_refresh_token"
}
```

## 🗓️ Development Roadmap

### Phase 1: ✅ COMPLETED
- Project setup, TypeScript, Tailwind
- Database connection with MongoDB
- Authentication system (login, register, JWT)
- Protected routes
- Basic UI components
- Zustand auth store

### Phase 2 (Next): Projects & Dashboard
- Projects CRUD operations
- Dashboard home with stats cards
- Project list and detail views
- Member management

### Phase 3: Tasks Core Features
- Task creation, editing, deletion
- Task detail page
- Task filters and sorting
- Priority and status management

### Phase 4: Kanban Board
- 4-column Kanban layout
- Drag-drop functionality
- Real-time column sync
- Task ordering persistence

### Phases 5-10: Advanced Features
- Subtasks, comments, attachments
- Socket.io real-time updates
- Notifications system
- Analytics and reports
- Testing and deployment

## 🎯 Next Steps

1. **Run the server**: `npm run dev`
2. **Test authentication**: Create account and login
3. **Phase 2**: Implement projects and dashboard
4. **Continue**: Follow the roadmap for advanced features

## 🤝 Contributing

This is a single-developer project. Follow the code standards:
- Use TypeScript strict mode
- Follow ESLint rules
- Keep components small and focused
- Add meaningful comments only when necessary
- Test edge cases

## 📄 License

MIT License

## 🆘 Troubleshooting

### MongoDB Connection Error
- Verify `MONGODB_URI` in `.env.local`
- Check MongoDB Atlas IP whitelist
- Ensure database user has proper permissions

### Port Already in Use
- Change port: `npm run dev -p 3001`

### Build Errors
- Run `npm run build` to check TypeScript errors
- Clear `.next` folder: `rm -rf .next`
- Reinstall: `npm install --legacy-peer-deps`

---

**Built with ❤️ using Next.js, React, TypeScript, and MongoDB**
