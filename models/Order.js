const mongoose = require("mongoose");

const ORDER_STATUSES = [
  "Pending",
  "Confirmed",
  "Processing",
  "Packed",
  "Shipped",
  "Out for Delivery",
  "Delivered",
  "Cancelled",
];

const PAYMENT_METHODS = ["COD", "UPI", "Card"];

const PAYMENT_STATUSES = ["Pending", "Paid", "Failed"];

// =====================================================
// ORDER ITEM
// =====================================================

const orderItemSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },

    quantity: {
      type: Number,
      required: true,
      min: 1,
      integer: true,
    },

    price: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  {
    _id: false,
  },
);

// =====================================================
// STATUS HISTORY
// =====================================================

const statusHistorySchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: ORDER_STATUSES,
      required: true,
    },

    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    _id: false,
  },
);

// =====================================================
// SHIPPING ADDRESS
// =====================================================

const shippingAddressSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      required: true,
      trim: true,
    },

    phone: {
      type: String,
      required: true,
      trim: true,
    },

    addressLine: {
      type: String,
      required: true,
      trim: true,
    },

    city: {
      type: String,
      required: true,
      trim: true,
    },

    pincode: {
      type: String,
      required: true,
      trim: true,
    },
  },
  {
    _id: false,
  },
);

// =====================================================
// ORDER
// =====================================================

const orderSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    items: {
      type: [orderItemSchema],
      required: true,
      validate: {
        validator: (items) => Array.isArray(items) && items.length > 0,
        message: "Order must contain at least one item",
      },
    },

    shippingAddress: {
      type: shippingAddressSchema,
      required: true,
    },

    subtotal: {
      type: Number,
      required: true,
      min: 0,
    },
    promoCode: {
      type: String,
      trim: true,
      default: null,
    },

    promoDiscount: {
      type: Number,
      default: 0,
      min: 0,
    },

    tax: {
      type: Number,
      required: true,
      min: 0,
    },

    totalAmount: {
      type: Number,
      required: true,
      min: 0,
    },

    status: {
      type: String,
      enum: ORDER_STATUSES,
      default: "Pending",
    },

    statusHistory: {
      type: [statusHistorySchema],
      default: [],
    },

    paymentMethod: {
      type: String,
      enum: PAYMENT_METHODS,
      default: "COD",
    },

    paymentStatus: {
      type: String,
      enum: PAYMENT_STATUSES,
      default: "Pending",
    },

    paymentId: {
      type: String,
      trim: true,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

const Order = mongoose.model("Order", orderSchema);

module.exports = {
  Order,
  ORDER_STATUSES,
};
