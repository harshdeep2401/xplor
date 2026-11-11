// Entry point: validate the configuration, connect to the database and listen.
// The app itself (routes, middleware) is built in app.ts.
//
// Load and validate the configuration FIRST: a bad .env stops the server here,
// with a message naming the variable, before anything else starts.
import { env } from './config/env'
import { connectDB } from './config/db'
import { createApp } from './app'

void connectDB()

createApp().listen(env.PORT, () => {
  // eslint-disable-next-line no-console -- replaced by the logger in step 6
  console.log(`Server running on port ${env.PORT}`)
})
