const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const { prisma } = require('../config/db')
const admin = require('../config/firebaseAdmin')

const signAppToken = (user) =>
  jwt.sign(
    {
      id: user.id,
      email: user.email,
    },
    process.env.JWT_SECRET,
    {
      expiresIn: '7d',
    }
  )

const registerUser = async (req, res) => {
  const {
    name,
    email,
    countryCode,
    phone,
    password,
  } = req.body

  // Password Validation: At least 6 characters and 1 capital letter
  const passwordRegex = /^(?=.*[A-Z]).{6,}$/
  if (!passwordRegex.test(password)) {
    return res.status(400).json({
      message: 'Password must be at least 6 characters long and contain at least one capital letter.',
    })
  }

  try {
    const existingUser = await prisma.user.findUnique({ where: { email } })

    if (existingUser) {
      return res.status(400).json({
        message: 'User already exists',
      })
    }

    const hashedPassword = await bcrypt.hash(password, 10)

    const user = await prisma.user.create({
      data: {
        name,
        email,
        countryCode,
        phone,
        password: hashedPassword,
        authProvider: 'local',
      }
    })

    const appToken = signAppToken(user)

    return res.status(201).json({
      message: 'Account created successfully',
      token: appToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
      },
    })
  } catch (error) {
    return res.status(500).json({
      message: error.message,
    })
  }
}

const googleLogin = async (req, res) => {
  const { token } = req.body

  try {
    const decodedToken = await admin.auth().verifyIdToken(token)

    const uid = decodedToken.uid
    const email = decodedToken.email
    const name = decodedToken.name
    const picture = decodedToken.picture

    console.log('Google User:', {
      uid,
      email,
      name,
      picture,
    })

    let user = await prisma.user.findUnique({ where: { email } })

    if (!user) {
      user = await prisma.user.create({
        data: {
          name,
          email,
          googleId: uid,
          profileImage: picture,
          authProvider: 'google',
        }
      })

      console.log('New Google user created:', user)
    } else {
      const updates = {}

      if (!user.googleId) {
        updates.googleId = uid
      }

      if (!user.profileImage && picture) {
        updates.profileImage = picture
      }

      if (!user.name && name) {
        updates.name = name
      }

      if (Object.keys(updates).length > 0 || user.authProvider !== 'google') {
        updates.authProvider = user.password ? 'local-google' : 'google'

        user = await prisma.user.update({
          where: { id: user.id },
          data: updates,
        })
      }

      console.log('Existing user found:', user)
    }

    const appToken = signAppToken(user)

    return res.status(200).json({
      message: 'Google login successful',
      token: appToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        profileImage: user.profileImage,
      },
    })
  } catch (error) {
    console.log('Google Login Error:', error)

    return res.status(500).json({
      message: error.message,
    })
  }
}

const loginUser = async (req, res) => {
  const { email, password } = req.body

  try {
    const user = await prisma.user.findUnique({ where: { email } })

    if (!user) {
      return res.status(404).json({ message: 'User not found' })
    }

    if (!user.password) {
      return res.status(400).json({ message: 'Please login with Google' })
    }

    const isMatch = await bcrypt.compare(password, user.password)

    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid credentials' })
    }

    const appToken = signAppToken(user)

    return res.status(200).json({
      message: 'Login successful',
      token: appToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        profileImage: user.profileImage,
      },
    })
  } catch (error) {
    return res.status(500).json({
      message: error.message,
    })
  }
}

module.exports = {
  registerUser,
  googleLogin,
  loginUser,
}