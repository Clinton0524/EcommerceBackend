const express = require("express");
const mongoose = require("mongoose");

const Cart = require("../models/Cart");
const Product = require("../models/Product");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

// =====================================================
// ADD PRODUCT TO CART
// Authenticated users only
// =====================================================
router.post("/add", protect, async (req, res) => {
  try {
    const { productId, quantity } = req.body;
    const userId = req.user._id;

    // Validate product ID
    if (!productId || !mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid product ID",
      });
    }

    // Validate quantity
    if (!Number.isInteger(quantity) || quantity < 1) {
      return res.status(400).json({
        success: false,
        message: "Quantity must be a whole number greater than 0",
      });
    }

    // Find product
    const product = await Product.findById(productId);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    // Check whether product is available
    if (product.stock <= 0) {
      return res.status(400).json({
        success: false,
        message: "This product is currently out of stock",
      });
    }

    // Find user's cart
    let cart = await Cart.findOne({ userId });

    if (!cart) {
      // New cart
      if (quantity > product.stock) {
        return res.status(400).json({
          success: false,
          message: `Only ${product.stock} item(s) are available`,
        });
      }

      cart = new Cart({
        userId,
        items: [
          {
            productId,
            quantity,
          },
        ],
      });
    } else {
      // Check whether product already exists in cart
      const item = cart.items.find((item) =>
        item.productId.equals(productId)
      );

      if (item) {
        const newQuantity = item.quantity + quantity;

        // Don't allow cart quantity to exceed stock
        if (newQuantity > product.stock) {
          return res.status(400).json({
            success: false,
            message: `Only ${product.stock} item(s) are available. You already have ${item.quantity} in your cart.`,
          });
        }

        item.quantity = newQuantity;
      } else {
        if (quantity > product.stock) {
          return res.status(400).json({
            success: false,
            message: `Only ${product.stock} item(s) are available`,
          });
        }

        cart.items.push({
          productId,
          quantity,
        });
      }
    }

    await cart.save();

    // Return populated cart
    const populatedCart = await Cart.findOne({ userId }).populate(
      "items.productId"
    );

    res.status(200).json({
      success: true,
      message: "Cart updated successfully",
      cart: populatedCart,
    });
  } catch (error) {
    console.error("Add To Cart Error:", error.message);

    res.status(500).json({
      success: false,
      message: "Failed to update cart",
    });
  }
});

// =====================================================
// GET CART
// Authenticated users only
// =====================================================
router.get("/", protect, async (req, res) => {
  try {
    const userId = req.user._id;

    const cart = await Cart.findOne({ userId }).populate(
      "items.productId"
    );

    // If user doesn't have a cart yet
    if (!cart) {
      return res.status(200).json({
        success: true,
        cart: {
          items: [],
        },
      });
    }

    res.status(200).json({
      success: true,
      cart,
    });
  } catch (error) {
    console.error("Get Cart Error:", error.message);

    res.status(500).json({
      success: false,
      message: "Failed to fetch cart",
    });
  }
});

// =====================================================
// REMOVE PRODUCT FROM CART
// Authenticated users only
// =====================================================
router.delete("/remove", protect, async (req, res) => {
  try {
    const { productId } = req.body;
    const userId = req.user._id;

    if (!productId || !mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid product ID",
      });
    }

    const cart = await Cart.findOne({ userId });

    if (!cart) {
      return res.status(404).json({
        success: false,
        message: "Cart not found",
      });
    }

    const itemExists = cart.items.some((item) =>
      item.productId.equals(productId)
    );

    if (!itemExists) {
      return res.status(404).json({
        success: false,
        message: "Item not found in cart",
      });
    }

    cart.items = cart.items.filter(
      (item) => !item.productId.equals(productId)
    );

    await cart.save();

    const populatedCart = await Cart.findOne({ userId }).populate(
      "items.productId"
    );

    res.status(200).json({
      success: true,
      message: "Item removed from cart",
      cart: populatedCart,
    });
  } catch (error) {
    console.error("Remove From Cart Error:", error.message);

    res.status(500).json({
      success: false,
      message: "Failed to remove item from cart",
    });
  }
});

// =====================================================
// CLEAR ENTIRE CART
// Authenticated users only
// =====================================================
router.delete("/clear", protect, async (req, res) => {
  try {
    const userId = req.user._id;

    await Cart.findOneAndDelete({ userId });

    res.status(200).json({
      success: true,
      message: "Cart cleared successfully",
    });
  } catch (error) {
    console.error("Clear Cart Error:", error.message);

    res.status(500).json({
      success: false,
      message: "Failed to clear cart",
    });
  }
});

// =====================================================
// INCREASE / DECREASE CART QUANTITY
// Authenticated users only
// =====================================================
router.put("/update", protect, async (req, res) => {
  try {
    const { productId, action } = req.body;
    const userId = req.user._id;

    // Validate product ID
    if (!productId || !mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid product ID",
      });
    }

    // Validate action
    if (!["increase", "decrease"].includes(action)) {
      return res.status(400).json({
        success: false,
        message: "Invalid action",
      });
    }

    // Find cart
    const cart = await Cart.findOne({ userId });

    if (!cart) {
      return res.status(404).json({
        success: false,
        message: "Cart not found",
      });
    }

    // Find item
    const item = cart.items.find((item) =>
      item.productId.equals(productId)
    );

    if (!item) {
      return res.status(404).json({
        success: false,
        message: "Item not found in cart",
      });
    }

    // ================================================
    // INCREASE QUANTITY
    // ================================================
    if (action === "increase") {
      const product = await Product.findById(productId);

      if (!product) {
        return res.status(404).json({
          success: false,
          message: "Product not found",
        });
      }

      if (product.stock <= 0) {
        return res.status(400).json({
          success: false,
          message: "This product is out of stock",
        });
      }

      if (item.quantity >= product.stock) {
        return res.status(400).json({
          success: false,
          message: `Only ${product.stock} item(s) are available`,
        });
      }

      item.quantity += 1;
    }

    // ================================================
    // DECREASE QUANTITY
    // ================================================
    if (action === "decrease") {
      if (item.quantity > 1) {
        item.quantity -= 1;
      } else {
        // If quantity is 1 and user clicks decrease,
        // remove the product from the cart.
        cart.items = cart.items.filter(
          (cartItem) => !cartItem.productId.equals(productId)
        );
      }
    }

    await cart.save();

    // Return updated populated cart
    const populatedCart = await Cart.findOne({ userId }).populate(
      "items.productId"
    );

    res.status(200).json({
      success: true,
      message: "Cart updated successfully",
      cart: populatedCart || { items: [] },
    });
  } catch (error) {
    console.error("Update Cart Error:", error.message);

    res.status(500).json({
      success: false,
      message: "Failed to update cart",
    });
  }
});

module.exports = router;