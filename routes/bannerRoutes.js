const express = require("express");
const mongoose = require("mongoose");

const Banner = require("../models/Banner");
const { protect, authorize } = require("../middleware/authMiddleware");

const router = express.Router();

// =====================================================
// GET ALL BANNERS
// Public - anyone can view banners
// =====================================================
router.get("/", async (req, res) => {
  try {
    const banners = await Banner.find().sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: banners.length,
      banners,
    });
  } catch (error) {
    console.error("Get Banners Error:", error.message);

    res.status(500).json({
      success: false,
      message: "Failed to fetch banners",
    });
  }
});

// =====================================================
// GET SINGLE BANNER
// Public - anyone can view a banner
// =====================================================
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // Check MongoDB ObjectId
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid banner ID",
      });
    }

    const banner = await Banner.findById(id);

    if (!banner) {
      return res.status(404).json({
        success: false,
        message: "Banner not found",
      });
    }

    res.status(200).json({
      success: true,
      banner,
    });
  } catch (error) {
    console.error("Get Banner Error:", error.message);

    res.status(500).json({
      success: false,
      message: "Failed to fetch banner",
    });
  }
});

// =====================================================
// CREATE BANNER
// Admin only
// =====================================================
router.post(
  "/",
  protect,
  authorize("admin"),
  async (req, res) => {
    try {
      const { title, imageUrl, description } = req.body;

      // Validate required fields
      if (!title || !imageUrl) {
        return res.status(400).json({
          success: false,
          message: "Title and imageUrl are required",
        });
      }

      const newBanner = new Banner({
        title: title.trim(),
        imageUrl: imageUrl.trim(),
        description: description?.trim() || "",
      });

      const savedBanner = await newBanner.save();

      res.status(201).json({
        success: true,
        message: "Banner created successfully",
        banner: savedBanner,
      });
    } catch (error) {
      console.error("Create Banner Error:", error.message);

      res.status(500).json({
        success: false,
        message: "Failed to create banner",
      });
    }
  }
);

// =====================================================
// UPDATE BANNER
// Admin only
// =====================================================
router.put(
  "/:id",
  protect,
  authorize("admin"),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { title, imageUrl, description } = req.body;

      // Check MongoDB ObjectId
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid banner ID",
        });
      }

      // Build update object
      const updateData = {};

      if (title !== undefined) {
        if (!title.trim()) {
          return res.status(400).json({
            success: false,
            message: "Title cannot be empty",
          });
        }

        updateData.title = title.trim();
      }

      if (imageUrl !== undefined) {
        if (!imageUrl.trim()) {
          return res.status(400).json({
            success: false,
            message: "Image URL cannot be empty",
          });
        }

        updateData.imageUrl = imageUrl.trim();
      }

      if (description !== undefined) {
        updateData.description = description.trim();
      }

      // Don't allow an empty update
      if (Object.keys(updateData).length === 0) {
        return res.status(400).json({
          success: false,
          message: "No valid fields provided for update",
        });
      }

      const updatedBanner = await Banner.findByIdAndUpdate(
        id,
        updateData,
        {
          new: true,
          runValidators: true,
        }
      );

      if (!updatedBanner) {
        return res.status(404).json({
          success: false,
          message: "Banner not found",
        });
      }

      res.status(200).json({
        success: true,
        message: "Banner updated successfully",
        banner: updatedBanner,
      });
    } catch (error) {
      console.error("Update Banner Error:", error.message);

      res.status(500).json({
        success: false,
        message: "Failed to update banner",
      });
    }
  }
);

// =====================================================
// DELETE BANNER
// Admin only
// =====================================================
router.delete(
  "/:id",
  protect,
  authorize("admin"),
  async (req, res) => {
    try {
      const { id } = req.params;

      // Check MongoDB ObjectId
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid banner ID",
        });
      }

      const deletedBanner = await Banner.findByIdAndDelete(id);

      if (!deletedBanner) {
        return res.status(404).json({
          success: false,
          message: "Banner not found",
        });
      }

      res.status(200).json({
        success: true,
        message: "Banner deleted successfully",
      });
    } catch (error) {
      console.error("Delete Banner Error:", error.message);

      res.status(500).json({
        success: false,
        message: "Failed to delete banner",
      });
    }
  }
);

module.exports = router;