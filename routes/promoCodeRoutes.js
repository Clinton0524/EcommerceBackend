
const express = require("express");
const PromoCode = require("../models/PromoCode");
const { protect, authorize } = require("../middleware/authMiddleware");

const router = express.Router();

// =====================================================
// GET ALL PROMO CODES - ADMIN
// =====================================================

router.get(
  "/",
  protect,
  authorize("admin"),
  async (req, res) => {
    try {
      const promoCodes = await PromoCode.find().sort({
        createdAt: -1,
      });

      res.status(200).json({
        success: true,
        count: promoCodes.length,
        promoCodes,
      });
    } catch (error) {
      console.error("Get Promo Codes Error:", error);

      res.status(500).json({
        success: false,
        message: "Failed to fetch promo codes",
      });
    }
  }
);

// =====================================================
// GET ACTIVE PROMO CODES - CUSTOMER
// =====================================================

router.get("/active", async (req, res) => {
  try {
    const promoCodes = await PromoCode.find({
      isActive: true,
      expiryDate: {
        $gt: new Date(),
      },
    }).sort({
      createdAt: -1,
    });

    res.status(200).json({
      success: true,
      count: promoCodes.length,
      promoCodes,
    });
  } catch (error) {
    console.error("Get Active Promo Codes Error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch active promo codes",
    });
  }
});

// =====================================================
// CREATE PROMO CODE - ADMIN
// =====================================================

router.post(
  "/",
  protect,
  authorize("admin"),
  async (req, res) => {
    try {
      const {
        code,
        discountType,
        discountValue,
        minimumOrder,
        maximumDiscount,
        expiryDate,
        usageLimit,
        isActive,
      } = req.body;

      if (
        !code ||
        !discountType ||
        discountValue === undefined ||
        !expiryDate
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Code, discount type, discount value and expiry date are required",
        });
      }

      // Check if promo code already exists
      const existingPromoCode = await PromoCode.findOne({
        code: code.toUpperCase().trim(),
      });

      if (existingPromoCode) {
        return res.status(400).json({
          success: false,
          message: "Promo code already exists",
        });
      }

      // Percentage validation
      if (
        discountType === "percentage" &&
        Number(discountValue) > 100
      ) {
        return res.status(400).json({
          success: false,
          message: "Percentage discount cannot exceed 100%",
        });
      }

      const promoCode = await PromoCode.create({
        code: code.toUpperCase().trim(),
        discountType,
        discountValue,
        minimumOrder: minimumOrder || 0,
        maximumDiscount:
          maximumDiscount === ""
            ? null
            : maximumDiscount,
        expiryDate,
        usageLimit:
          usageLimit === "" ? null : usageLimit,
        isActive:
          isActive !== undefined ? isActive : true,
      });

      res.status(201).json({
        success: true,
        message: "Promo code created successfully",
        promoCode,
      });
    } catch (error) {
      console.error("Create Promo Code Error:", error);

      res.status(500).json({
        success: false,
        message: "Failed to create promo code",
      });
    }
  }
);

// =====================================================
// APPLY PROMO CODE - CUSTOMER
// =====================================================

router.post("/apply", async (req, res) => {
  try {
    const { code, cartTotal } = req.body;

    if (!code) {
      return res.status(400).json({
        success: false,
        message: "Promo code is required",
      });
    }

    if (
      cartTotal === undefined ||
      Number(cartTotal) < 0
    ) {
      return res.status(400).json({
        success: false,
        message: "Valid cart total is required",
      });
    }

    const promoCode = await PromoCode.findOne({
      code: code.toUpperCase().trim(),
    });

    if (!promoCode) {
      return res.status(404).json({
        success: false,
        message: "Invalid promo code",
      });
    }

    // Check active status
    if (!promoCode.isActive) {
      return res.status(400).json({
        success: false,
        message: "This promo code is inactive",
      });
    }

    // Check expiry
    if (new Date() > new Date(promoCode.expiryDate)) {
      return res.status(400).json({
        success: false,
        message: "This promo code has expired",
      });
    }

    // Check usage limit
    if (
      promoCode.usageLimit !== null &&
      promoCode.usedCount >= promoCode.usageLimit
    ) {
      return res.status(400).json({
        success: false,
        message: "This promo code usage limit has been reached",
      });
    }

    // Check minimum order
    if (
      Number(cartTotal) < Number(promoCode.minimumOrder)
    ) {
      return res.status(400).json({
        success: false,
        message: `Minimum order amount is ₹${promoCode.minimumOrder}`,
      });
    }

    let discount = 0;

    // Percentage discount
    if (promoCode.discountType === "percentage") {
      discount =
        (Number(cartTotal) *
          Number(promoCode.discountValue)) /
        100;

      // Maximum discount
      if (
        promoCode.maximumDiscount !== null &&
        discount > Number(promoCode.maximumDiscount)
      ) {
        discount = Number(promoCode.maximumDiscount);
      }
    }

    // Fixed discount
    if (promoCode.discountType === "fixed") {
      discount = Number(promoCode.discountValue);
    }

    // Discount cannot exceed cart total
    if (discount > Number(cartTotal)) {
      discount = Number(cartTotal);
    }

    const finalTotal =
      Number(cartTotal) - discount;

    res.status(200).json({
      success: true,
      message: "Promo code applied successfully",
      promoCode: promoCode.code,
      discount: Number(discount.toFixed(2)),
      finalTotal: Number(finalTotal.toFixed(2)),
    });
  } catch (error) {
    console.error("Apply Promo Code Error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to apply promo code",
    });
  }
});

// =====================================================
// UPDATE PROMO CODE - ADMIN
// =====================================================

router.put(
  "/:id",
  protect,
  authorize("admin"),
  async (req, res) => {
    try {
      const {
        code,
        discountType,
        discountValue,
        minimumOrder,
        maximumDiscount,
        expiryDate,
        usageLimit,
        isActive,
      } = req.body;

      const promoCode = await PromoCode.findById(
        req.params.id
      );

      if (!promoCode) {
        return res.status(404).json({
          success: false,
          message: "Promo code not found",
        });
      }

      if (code !== undefined) {
        promoCode.code = code.toUpperCase().trim();
      }

      if (discountType !== undefined) {
        promoCode.discountType = discountType;
      }

      if (discountValue !== undefined) {
        promoCode.discountValue = discountValue;
      }

      if (minimumOrder !== undefined) {
        promoCode.minimumOrder =
          minimumOrder === "" ? 0 : minimumOrder;
      }

      if (maximumDiscount !== undefined) {
        promoCode.maximumDiscount =
          maximumDiscount === ""
            ? null
            : maximumDiscount;
      }

      if (expiryDate !== undefined) {
        promoCode.expiryDate = expiryDate;
      }

      if (usageLimit !== undefined) {
        promoCode.usageLimit =
          usageLimit === "" ? null : usageLimit;
      }

      if (isActive !== undefined) {
        promoCode.isActive = isActive;
      }

      // Percentage validation
      if (
        promoCode.discountType === "percentage" &&
        Number(promoCode.discountValue) > 100
      ) {
        return res.status(400).json({
          success: false,
          message: "Percentage discount cannot exceed 100%",
        });
      }

      const updatedPromoCode =
        await promoCode.save();

      res.status(200).json({
        success: true,
        message: "Promo code updated successfully",
        promoCode: updatedPromoCode,
      });
    } catch (error) {
      console.error("Update Promo Code Error:", error);

      res.status(500).json({
        success: false,
        message: "Failed to update promo code",
      });
    }
  }
);

// =====================================================
// DELETE PROMO CODE - ADMIN
// =====================================================

router.delete(
  "/:id",
  protect,
  authorize("admin"),
  async (req, res) => {
    try {
      const promoCode =
        await PromoCode.findByIdAndDelete(
          req.params.id
        );

      if (!promoCode) {
        return res.status(404).json({
          success: false,
          message: "Promo code not found",
        });
      }

      res.status(200).json({
        success: true,
        message: "Promo code deleted successfully",
      });
    } catch (error) {
      console.error("Delete Promo Code Error:", error);

      res.status(500).json({
        success: false,
        message: "Failed to delete promo code",
      });
    }
  }
);

module.exports = router;
