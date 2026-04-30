const express = require('express')
const cors = require('cors')
const dotenv = require('dotenv')
const { connectDB } = require('./config/db')

dotenv.config()
connectDB()

const app = express()

app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:5173', 'http://localhost:5174', 'http://localhost:5175'],
  credentials: true
}))
app.use(express.json())

app.get('/', (req, res) => {
  res.send('XPLOR API Running')
})

app.use('/api/auth', require('./routes/authRoutes'))
app.use('/api/projects', require('./routes/projectRoutes'))

const PORT = process.env.PORT || 5000

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})
// nodemon restart trigger