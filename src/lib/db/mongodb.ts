import mongoose from 'mongoose'

const MONGODB_URI = process.env.MONGODB_URI

if (!MONGODB_URI) {
  throw new Error('Please define the MONGODB_URI environment variable in .env.local')
}

const uri: string = MONGODB_URI

interface MongooseCache {
  conn: typeof mongoose | null
  promise: Promise<typeof mongoose> | null
}

declare global {
  var _mongooseCache: MongooseCache | undefined
}

const cached: MongooseCache = global._mongooseCache ?? { conn: null, promise: null }
global._mongooseCache = cached

export async function connectToDatabase(): Promise<typeof mongoose> {
  if (cached.conn) {
    return cached.conn
  }

  if (!cached.promise) {
    const opts = {
      bufferCommands: false,
      serverSelectionTimeoutMS: 10000,
      maxPoolSize: 10,
    }

    cached.promise = mongoose
      .connect(uri, opts)
      .then((m) => {
        console.log('[MongoDB] Connected successfully')
        return m
      })
      .catch((err) => {
        cached.promise = null
        console.error('[MongoDB] Connection error:', err.message)
        throw err
      })
  }

  try {
    cached.conn = await cached.promise
  } catch (err) {
    cached.promise = null
    throw err
  }

  return cached.conn
}

export default connectToDatabase
