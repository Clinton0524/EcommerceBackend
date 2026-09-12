const express = require("express");
const mongoose = require("mongoose");

const { Order, ORDER_STATUSES } = require("../models/Order");
const Product = require("../models/Product");
const { protect, authorize } = require("../middleware/authMiddleware");

const router = express.Router();

const PAYMENT_METHODS = ["COD", "UPI", "Card"];

// =====================================================
// CREATE ORDER / CHECKOUT
// POST /api/orders/checkout
// =====================================================

router.post("/checkout", protect, async (req, res) => {
  try {
    const {
      items,
      shippingAddress,
      paymentMethod = "COD",
      paymentId = null,
    } = req.body;

    // -------------------------------------------------
    // VALIDATE PAYMENT METHOD
    // -------------------------------------------------

    if (!PAYMENT_METHODS.includes(paymentMethod)) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment method",
      });
    }

    // -------------------------------------------------
    // VALIDATE ITEMS
    // -------------------------------------------------

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Cart is empty",
      });
    }

    // -------------------------------------------------
    // VALIDATE ADDRESS
    // -------------------------------------------------

    if (
      !shippingAddress ||
      !shippingAddress.fullName ||
      !shippingAddress.phone ||
      !shippingAddress.addressLine ||
      !shippingAddress.city ||
      !shippingAddress.pincode
    ) {
      return res.status(400).json({
        success: false,
        message: "Complete shipping address is required",
      });
    }

    // -------------------------------------------------
    // ONLINE PAYMENT VALIDATION
    // -------------------------------------------------

    if (paymentMethod !== "COD" && !paymentId) {
      return res.status(400).json({
        success: false,
        message: "Payment ID is required",
      });
    }

    // -------------------------------------------------
    // PREPARE ORDER ITEMS
    // -------------------------------------------------

    const orderItems = [];

    let subtotal = 0;

    for (const item of items) {
      if (!item.productId || !mongoose.Types.ObjectId.isValid(item.productId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid product ID",
        });
      }

      const quantity = Number(item.quantity);

      if (!Number.isInteger(quantity) || quantity < 1) {
        return res.status(400).json({
          success: false,
          message: "Invalid product quantity",
        });
      }

      const product = await Product.findById(item.productId);

      if (!product) {
        return res.status(404).json({
          success: false,
          message: "Product not found",
        });
      }

      // -------------------------------------------------
      // STOCK CHECK
      // -------------------------------------------------

      if (product.stock < quantity) {
        return res.status(400).json({
          success: false,
          message: `${product.name} has only ${product.stock} item(s) available`,
        });
      }

      // -------------------------------------------------
      // PRICE ALWAYS COMES FROM DATABASE
      // -------------------------------------------------

      const itemTotal = product.price * quantity;

      subtotal += itemTotal;

      orderItems.push({
        productId: product._id,
        quantity,
        price: product.price,
      });
    }

    // -------------------------------------------------
    // CALCULATE TAX
    // -------------------------------------------------

    subtotal = Number(subtotal.toFixed(2));

    const tax = Number((subtotal * 0.05).toFixed(2));

    const totalAmount = Number((subtotal + tax).toFixed(2));

    // -------------------------------------------------
    // REDUCE STOCK
    // -------------------------------------------------

    const updatedProducts = [];

    try {
      for (const item of orderItems) {
        const updatedProduct = await Product.findOneAndUpdate(
          {
            _id: item.productId,
            stock: {
              $gte: item.quantity,
            },
          },
          {
            $inc: {
              stock: -item.quantity,
            },
          },
          {
            new: true,
          },
        );

        if (!updatedProduct) {
          throw new Error("Stock changed. Please try again.");
        }

        updatedProducts.push({
          productId: item.productId,
          quantity: item.quantity,
        });
      }
    } catch (stockError) {
      // Roll back stock
      for (const item of updatedProducts) {
        await Product.findByIdAndUpdate(item.productId, {
          $inc: {
            stock: item.quantity,
          },
        });
      }

      return res.status(400).json({
        success: false,
        message: stockError.message,
      });
    }

    // -------------------------------------------------
    // PAYMENT STATUS
    // -------------------------------------------------

    const paymentStatus = paymentMethod === "COD" ? "Pending" : "Paid";

    // -------------------------------------------------
    // CREATE ORDER
    // -------------------------------------------------

    const order = await Order.create({
      userId: req.user._id,

      items: orderItems,

      shippingAddress: {
        fullName: shippingAddress.fullName.trim(),

        phone: shippingAddress.phone.trim(),

        addressLine: shippingAddress.addressLine.trim(),

        city: shippingAddress.city.trim(),

        pincode: shippingAddress.pincode.trim(),
      },

      subtotal,
      tax,
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
      paymentId: paymentMethod === "COD" ? null : paymentId,
    });

    // -------------------------------------------------
    // POPULATE PRODUCTS
    // -------------------------------------------------

    const populatedOrder = await Order.findById(order._id).populate(
      "items.productId",
    );

    return res.status(201).json({
      success: true,
      message: "Order placed successfully",
      order: populatedOrder,
    });
  } catch (error) {
    console.error("Checkout Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to place order",
    });
  }
});

// =====================================================
// GET SINGLE ORDER
// IMPORTANT: MUST BE BEFORE /:userId
// GET /api/orders/order/:orderId
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

    const order = await Order.findById(orderId).populate("items.productId");

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    const isOwner = order.userId.toString() === req.user._id.toString();

    const isAdmin = req.user.role === "admin";

    if (!isOwner && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    return res.status(200).json({
      success: true,
      order,
    });
  } catch (error) {
    console.error("Get Order Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch order",
    });
  }
});

// =====================================================
// GET USER ORDERS
// GET /api/orders/:userId
// =====================================================

// =====================================================
// GET ALL ORDERS - ADMIN
// GET /api/orders
// =====================================================

router.get("/", protect, authorize("admin"), async (req, res) => {
  try {
    const orders = await Order.find()
      .populate("userId", "name email")
      .populate("items.productId")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      orders,
    });
  } catch (error) {
    console.error("Get All Orders Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch orders",
    });
  }
});

router.get("/:userId", protect, async (req, res) => {
  try {
    const { userId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID",
      });
    }

    const isOwner = req.user._id.toString() === userId;

    const isAdmin = req.user.role === "admin";

    if (!isOwner && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    const orders = await Order.find({ userId })
      .populate("items.productId")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      orders,
    });
  } catch (error) {
    console.error("Get Orders Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch orders",
    });
  }
});

// =====================================================
// CANCEL ORDER
// PUT /api/orders/cancel/:orderId
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

    if (order.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    if (order.status !== "Pending") {
      return res.status(400).json({
        success: false,
        message: "Only pending orders can be cancelled",
      });
    }

    // Restore stock
    for (const item of order.items) {
      await Product.findByIdAndUpdate(item.productId, {
        $inc: {
          stock: item.quantity,
        },
      });
    }

    order.status = "Cancelled";

    order.statusHistory.push({
      status: "Cancelled",
      updatedAt: new Date(),
    });

    if (order.paymentMethod !== "COD") {
      order.paymentStatus = "Pending";
    }

    await order.save();

    const updatedOrder = await Order.findById(order._id).populate(
      "items.productId",
    );

    return res.status(200).json({
      success: true,
      message: "Order cancelled successfully",
      order: updatedOrder,
    });
  } catch (error) {
    console.error("Cancel Order Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to cancel order",
    });
  }
});

// =====================================================
// ADMIN UPDATE ORDER
// PUT /api/orders/update/:orderId
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

      if (!ORDER_STATUSES.includes(status)) {
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

      if (order.status === status) {
        return res.status(400).json({
          success: false,
          message: "Order already has this status",
        });
      }

      if (status === "Cancelled" && order.status !== "Cancelled") {
        for (const item of order.items) {
          await Product.findByIdAndUpdate(item.productId, {
            $inc: {
              stock: item.quantity,
            },
          });
        }

        if (order.paymentMethod !== "COD") {
          order.paymentStatus = "Pending";
        }
      }

      order.status = status;

      // Mark payment as paid when the order is delivered
      if (status === "Delivered") {
        order.paymentStatus = "Paid";
      }

      order.statusHistory.push({
        status,
        updatedAt: new Date(),
      });
      await order.save();

      const updatedOrder = await Order.findById(order._id).populate(
        "items.productId",
      );

      return res.status(200).json({
        success: true,
        message: "Order updated successfully",
        order: updatedOrder,
      });
    } catch (error) {
      console.error("Update Order Error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to update order",
      });
    }
  },
);

module.exports = router;
