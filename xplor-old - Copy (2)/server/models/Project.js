const mongoose = require('mongoose')

const ElementSchema = new mongoose.Schema({
  id: String,
  type: String,
  x: Number,
  y: Number,
  startX: Number,
  startY: Number,
  endX: Number,
  endY: Number,
  width: Number,
  height: Number,
  thickness: Number
}, { _id: false, strict: false })

const projectSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    type: {
      type: String,
      enum: ['2d', '3d'],
      default: '2d',
    },
    canvasWidth: {
      type: Number,
      default: 2000,
    },
    canvasHeight: {
      type: Number,
      default: 2000,
    },
    canvas: {
      elements: {
        type: [ElementSchema],
        default: [],
      },
    },
  },
  {
    timestamps: true,
  }
)

module.exports = mongoose.model('Project', projectSchema)
