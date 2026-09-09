const express = require("express");
const mongoose = require("mongoose");

const Order = require("../models/Order");
const Cart = require("../models/Cart");
const Product = require("../models/Product");

const {
  protect,
  authorize,
} = require("../middleware/authMiddleware");

const router = express.Router();

// =====================================================
// ORDER STATUS OPTIONS
// =====================================================

const VALID_STATUSES = [
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

// =====================================================
// CHECKOUT / PLACE ORDER
// Logged-in users only
// =====================================================

router.post("/checkout", protect, async (req, res) => {
  try {
    // IMPORTANT:
    // We DO NOT accept userId from the frontend.
    // The authenticated user's ID comes from the JWT.
    const userId = req.user._id;

    const {
      paymentMethod = "COD",
      paymentId = null,
    } = req.body;

    // -------------------------------------------------
    // Validate payment method
    // -------------------------------------------------

    if (!PAYMENT_METHODS.includes(paymentMethod)) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment method",
      });
    }

    // -------------------------------------------------
    // Payment validation
    // -------------------------------------------------

    if (paymentMethod !== "COD" && !paymentId) {
      return res.status(400).json({
        success: false,
        message: "Payment must be completed before placing the order",
      });
    }

    // -------------------------------------------------
    // Find user's cart
    // -------------------------------------------------

    const cart = await Cart.findOne({ userId }).populate(
      "items.productId"
    );

    if (!cart || cart.items.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Cart is empty",
      });
    }

    // -------------------------------------------------
    // Validate cart items and stock
    // -------------------------------------------------

    let totalAmount = 0;

    for (const item of cart.items) {
      const product = item.productId;

      if (!product) {
        return res.status(400).json({
          success: false,
          message: "One or more products in your cart no longer exist",
        });
      }

      if (!Number.isInteger(item.quantity) || item.quantity < 1) {
        return res.status(400).json({
          success: false,
          message: `Invalid quantity for ${product.name}`,
        });
      }

      if (product.stock < item.quantity) {
        return res.status(400).json({
          success: false,
          message: `Not enough stock for ${product.name}. Available: ${product.stock}`,
        });
      }

      totalAmount += product.price * item.quantity;
    }

    // Round total to 2 decimal places
    totalAmount = Number(totalAmount.toFixed(2));

    // -------------------------------------------------
    // Reduce stock safely
    // -------------------------------------------------

    const updatedProducts = [];

    for (const item of cart.items) {
      const product = item.productId;

      const updatedProduct = await Product.findOneAndUpdate(
        {
          _id: product._id,
          stock: { $gte: item.quantity },
        },
        {
          $inc: {
            stock: -item.quantity,
          },
        },
        {
          new: true,
        }
      );

      // Another customer may have purchased the stock
      // between our first check and this update.
      if (!updatedProduct) {
        // Restore stock already deducted during this checkout
        for (const previousItem of updatedProducts) {
          await Product.findByIdAndUpdate(
            previousItem.productId,
            {
              $inc: {
                stock: previousItem.quantity,
              },
            }
          );
        }

        return res.status(400).json({
          success: false,
          message: `Sorry, stock for ${product.name} is no longer available`,
        });
      }

      updatedProducts.push({
        productId: product._id,
        quantity: item.quantity,
      });
    }

    // -------------------------------------------------
    // Payment status
    // -------------------------------------------------

    // COD remains Pending.
    // Our current Card/UPI system is a mock payment system,
    // so a supplied paymentId means the mock payment succeeded.
    const paymentStatus =
      paymentMethod === "COD" ? "Pending" : "Paid";

    // -------------------------------------------------
    // Create order
    // -------------------------------------------------

    const order = new Order({
      userId,

      items: cart.items.map((item) => ({
        productId: item.productId._id,
        quantity: item.quantity,
        price: item.productId.price,
      })),

      totalAmount,

      status: "Pending",

      statusHistory: [
        {
          status: "Pending",
          updatedAt: new Date(),
        },
      ],

      paymentMethod,

      paymentStatus,

      paymentId,
    });

    await order.save();

    // -------------------------------------------------
    // Clear cart
    // -------------------------------------------------

    await Cart.findOneAndDelete({ userId });

    // Populate products before returning order
    const populatedOrder = await Order.findById(order._id).populate(
      "items.productId"
    );

    res.status(201).json({
      success: true,
      message: "Order placed successfully",
      order: populatedOrder,
    });
  } catch (error) {
    console.error("Checkout Error:", error.message);

    res.status(500).json({
      success: false,
      message: "Failed to place order",
    });
  }
});

// =====================================================
// GET USER ORDERS
// Logged-in users only
// =====================================================

router.get("/:userId", protect, async (req, res) => {
  try {
    const { userId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID",
      });
    }

    // Normal users can ONLY see their own orders.
    // Admins can access another user's orders if needed.
    if (
      req.user.role !== "admin" &&
      req.user._id.toString() !== userId
    ) {
      return res.status(403).json({
        success: false,
        message: "You can only access your own orders",
      });
    }

    const orders = await Order.find({ userId })
      .populate("items.productId")
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      orders,
    });
  } catch (error) {
    console.error("Get User Orders Error:", error.message);

    res.status(500).json({
      success: false,
      message: "Failed to fetch orders",
    });
  }
});

// =====================================================
// GET SINGLE ORDER
// Logged-in users only
// =====================================================

router.get("/order/:orderId", protect, async (req, res) => {
  try {
    const { orderId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid order ID",
      });
    }

    const order = await Order.findById(orderId).populate(
      "items.productId"
    );

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    // Only the owner or admin can view the order
    if (
      req.user.role !== "admin" &&
      order.userId.toString() !== req.user._id.toString()
    ) {
      return res.status(403).json({
        success: false,
        message: "You are not allowed to view this order",
      });
    }

    res.status(200).json({
      success: true,
      order,
    });
  } catch (error) {
    console.error("Get Order Error:", error.message);

    res.status(500).json({
      success: false,
      message: "Failed to fetch order",
    });
  }
});

// =====================================================
// CANCEL ORDER
// Logged-in users only
// =====================================================

router.put("/cancel/:orderId", protect, async (req, res) => {
  try {
    const { orderId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid order ID",
      });
    }

    const order = await Order.findById(orderId);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    // User can only cancel their own order
    if (
      order.userId.toString() !== req.user._id.toString()
    ) {
      return res.status(403).json({
        success: false,
        message: "You are not allowed to cancel this order",
      });
    }

    // Only pending orders can currently be cancelled
    if (order.status !== "Pending") {
      return res.status(400).json({
        success: false,
        message:
          "Only pending orders can be cancelled",
      });
    }

    // -------------------------------------------------
    // Restore product stock
    // -------------------------------------------------

    for (const item of order.items) {
      await Product.findByIdAndUpdate(
        item.productId,
        {
          $inc: {
            stock: item.quantity,
          },
        }
      );
    }

    // -------------------------------------------------
    // Update order status
    // -------------------------------------------------

    order.status = "Cancelled";

    order.statusHistory.push({
      status: "Cancelled",
      updatedAt: new Date(),
    });

    // -------------------------------------------------
    // Payment status
    // -------------------------------------------------

    // For mock online payments, mark the payment as failed/
    // refunded later when a real gateway is connected.
    // We don't claim an actual refund here.
    if (order.paymentMethod !== "COD") {
      order.paymentStatus = "Pending";
    }

    await order.save();

    const updatedOrder = await Order.findById(order._id).populate(
      "items.productId"
    );

    res.status(200).json({
      success: true,
      message: "Order cancelled successfully",
      order: updatedOrder,
    });
  } catch (error) {
    console.error("Cancel Order Error:", error.message);

    res.status(500).json({
      success: false,
      message: "Failed to cancel order",
    });
  }
});

// =====================================================
// UPDATE ORDER STATUS
// ADMIN ONLY
// =====================================================

router.put(
  "/update/:orderId",
  protect,
  authorize("admin"),
  async (req, res) => {
    try {
      const { orderId } = req.params;
      const { status } = req.body;

      if (!mongoose.Types.ObjectId.isValid(orderId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid order ID",
        });
      }

      // Validate status
      if (!VALID_STATUSES.includes(status)) {
        return res.status(400).json({
          success: false,
          message: "Invalid order status",
        });
      }

      const order = await Order.findById(orderId);

      if (!order) {
        return res.status(404).json({
          success: false,
          message: "Order not found",
        });
      }

      // Don't update if status is already the same
      if (order.status === status) {
        return res.status(400).json({
          success: false,
          message: `Order is already ${status}`,
        });
      }

      // -------------------------------------------------
      // If admin cancels an order, restore stock
      // -------------------------------------------------

      if (
        status === "Cancelled" &&
        order.status !== "Cancelled"
      ) {
        for (const item of order.items) {
          await Product.findByIdAndUpdate(
            item.productId,
            {
              $inc: {
                stock: item.quantity,
              },
            }
          );
        }

        if (order.paymentMethod !== "COD") {
          order.paymentStatus = "Pending";
        }
      }

      // -------------------------------------------------
      // Update status
      // -------------------------------------------------

      order.status = status;

      // Add status history
      order.statusHistory.push({
        status,
        updatedAt: new Date(),
      });

      await order.save();

      const updatedOrder = await Order.findById(order._id).populate(
        "items.productId"
      );

      res.status(200).json({
        success: true,
        message: "Order status updated successfully",
        order: updatedOrder,
      });
    } catch (error) {
      console.error("Update Order Status Error:", error.message);

      res.status(500).json({
        success: false,
        message: "Failed to update order status",
      });
    }
  }
);

module.exports = router;