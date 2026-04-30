const mongoose = require('mongoose')

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },

    email: {
      type: String,
      required: true,
      unique: true,
    },

    countryCode: {
      type: String,
      default: '',
    },

    phone: {
      type: String,
      default: '',
    },

    password: {
      type: String,
      default: '',
    },

    googleId: {
      type: String,
      default: '',
    },

    profileImage: {
      type: String,
      default: '',
    },

    authProvider: {
      type: String,
      default: 'email',
    },
  },
  {
    timestamps: true,
  }
)

module.exports = mongoose.model('User', userSchema)