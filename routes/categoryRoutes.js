const express = require("express");

const Category = require("../models/Category");
const { protect, authorize } = require("../middleware/authMiddleware");

const router = express.Router();

// =====================================================
// GET ALL CATEGORIES
// Public - anyone can view categories
// =====================================================
router.get("/", async (req, res) => {
  try {
    let { page, limit } = req.query;

    page = parseInt(page, 10) || 1;
    limit = parseInt(limit, 10) || 8;

    // Prevent invalid pagination values
    if (page < 1) {
      page = 1;
    }

    if (limit < 1) {
      limit = 8;
    }

    // Don't allow extremely large requests
    if (limit > 50) {
      limit = 50;
    }

    const skip = (page - 1) * limit;

    const [categories, totalCategories] = await Promise.all([
      Category.find()
        .sort({ name: 1 })
        .skip(skip)
        .limit(limit),

      Category.countDocuments(),
    ]);

    res.status(200).json({
      success: true,
      page,
      limit,
      totalPages: Math.ceil(totalCategories / limit),
      totalCategories,
      categories,
    });
  } catch (error) {
    console.error("Get Categories Error:", error.message);

    res.status(500).json({
      success: false,
      message: "Failed to fetch categories",
    });
  }
});

// =====================================================
// CREATE CATEGORY
// Admin only
// =====================================================
router.post(
  "/",
  protect,
  authorize("admin"),
  async (req, res) => {
    try {
      const { name, slug } = req.body;

      // Validate name
      if (!name || !name.trim()) {
        return res.status(400).json({
          success: false,
          message: "Category name is required",
        });
      }

      // Validate slug
      if (!slug || !slug.trim()) {
        return res.status(400).json({
          success: false,
          message: "Category slug is required",
        });
      }

      const cleanName = name.trim();
      const cleanSlug = slug
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "-");

      // Check duplicate slug
      const existingCategory = await Category.findOne({
        slug: cleanSlug,
      });

      if (existingCategory) {
        return res.status(400).json({
          success: false,
          message: "Category slug already exists",
        });
      }

      // Check duplicate name
      const existingName = await Category.findOne({
        name: cleanName,
      });

      if (existingName) {
        return res.status(400).json({
          success: false,
          message: "Category name already exists",
        });
      }

      const newCategory = new Category({
        name: cleanName,
        slug: cleanSlug,
      });

      const savedCategory = await newCategory.save();

      res.status(201).json({
        success: true,
        message: "Category created successfully",
        category: savedCategory,
      });
    } catch (error) {
      console.error("Create Category Error:", error.message);

      // Handle duplicate key error
      if (error.code === 11000) {
        return res.status(400).json({
          success: false,
          message: "Category slug already exists",
        });
      }

      res.status(500).json({
        success: false,
        message: "Failed to create category",
      });
    }
  }
);

module.exports = router;