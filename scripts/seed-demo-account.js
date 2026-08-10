#!/usr/bin/env node

const mongoose = require('mongoose')
const bcrypt = require('bcryptjs')
require('dotenv').config({ path: '.env.local' })

const DEMO_ACCOUNT = {
  name: 'Demo Admin',
  email: 'testing@gmail.com',
  password: 'testing@123',
  role: 'admin',
  status: 'active',
}

const UserSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true, select: false },
    role: {
      type: String,
      enum: ['admin', 'team_leader', 'developer'],
      default: 'developer',
    },
    status: { type: String, enum: ['active', 'invited', 'suspended'], default: 'active' },
    profilePicture: { type: String, default: '' },
    resetTokenHash: { type: String, select: false },
    resetTokenExpires: { type: Date, select: false },
  },
  { timestamps: true }
)

const User = mongoose.model('User', UserSchema, 'users')

async function seedDemoAccount() {
  try {
    const mongoUri = process.env.MONGODB_URI
    if (!mongoUri) {
      throw new Error('MONGODB_URI environment variable not found in .env.local')
    }

    console.log('📊 Connecting to MongoDB...')
    await mongoose.connect(mongoUri)
    console.log('✅ Connected to MongoDB')

    // Check if demo account already exists
    const existingUser = await User.findOne({ email: DEMO_ACCOUNT.email })
    if (existingUser) {
      console.log('⚠️  Demo account already exists')
      console.log(`   Email: ${DEMO_ACCOUNT.email}`)
      console.log(`   Password: ${DEMO_ACCOUNT.password}`)

      // Update password if needed
      const hashedPassword = await bcrypt.hash(DEMO_ACCOUNT.password, 10)
      await User.updateOne(
        { email: DEMO_ACCOUNT.email },
        { password: hashedPassword, role: 'admin', status: 'active' }
      )
      console.log('   Password and role updated')
    } else {
      // Create demo account
      console.log('🔐 Creating demo admin account...')
      const hashedPassword = await bcrypt.hash(DEMO_ACCOUNT.password, 10)

      const newUser = new User({
        ...DEMO_ACCOUNT,
        password: hashedPassword,
      })

      await newUser.save()
      console.log('✅ Demo account created successfully!')
      console.log(`   Email: ${DEMO_ACCOUNT.email}`)
      console.log(`   Password: ${DEMO_ACCOUNT.password}`)
      console.log(`   Role: ${DEMO_ACCOUNT.role}`)
    }

    console.log('\n🎉 Done! You can now use these credentials to login:')
    console.log(`   📧 testing@gmail.com`)
    console.log(`   🔑 testing@123`)
  } catch (error) {
    console.error('❌ Error seeding database:', error.message)
    process.exit(1)
  } finally {
    await mongoose.disconnect()
    console.log('\n✅ Disconnected from MongoDB')
  }
}

seedDemoAccount()
