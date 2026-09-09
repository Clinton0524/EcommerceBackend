const express = require("express");
const mongoose = require("mongoose");

const Product = require("../models/Product");
const Category = require("../models/Category");
const { protect, authorize } = require("../middleware/authMiddleware");

const router = express.Router();

// =====================================================
// GET ALL PRODUCTS
// Public - anyone can view products
// =====================================================

router.get("/", async (req, res) => {
  try {
    const {
      category,
      name,
      minPrice,
      maxPrice,
      inStock,
      sort,
    } = req.query;

    const filter = {};

    // -------------------------------------------------
    // Filter by category
    // -------------------------------------------------

    if (category) {
      if (!mongoose.Types.ObjectId.isValid(category)) {
        return res.status(400).json({
          success: false,
          message: "Invalid category ID",
        });
      }

      filter.category = category;
    }

    // -------------------------------------------------
    // Search by product name
    // -------------------------------------------------

    if (name && name.trim()) {
      // Escape regex special characters.
      // This prevents users from sending dangerous regex patterns.
      const escapedName = name
        .trim()
        .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

      filter.name = {
        $regex: escapedName,
        $options: "i",
      };
    }

    // -------------------------------------------------
    // Price filtering
    // -------------------------------------------------

    if (minPrice !== undefined || maxPrice !== undefined) {
      filter.price = {};

      if (minPrice !== undefined) {
        const minimum = Number(minPrice);

        if (!Number.isFinite(minimum) || minimum < 0) {
          return res.status(400).json({
            success: false,
            message: "Invalid minimum price",
          });
        }

        filter.price.$gte = minimum;
      }

      if (maxPrice !== undefined) {
        const maximum = Number(maxPrice);

        if (!Number.isFinite(maximum) || maximum < 0) {
          return res.status(400).json({
            success: false,
            message: "Invalid maximum price",
          });
        }

        filter.price.$lte = maximum;
      }

      // Make sure minimum isn't greater than maximum
      if (
        filter.price.$gte !== undefined &&
        filter.price.$lte !== undefined &&
        filter.price.$gte > filter.price.$lte
      ) {
        return res.status(400).json({
          success: false,
          message: "Minimum price cannot be greater than maximum price",
        });
      }
    }

    // -------------------------------------------------
    // Stock filtering
    // -------------------------------------------------

    if (inStock === "true") {
      filter.stock = {
        $gt: 0,
      };
    } else if (inStock === "false") {
      filter.stock = 0;
    }

    // -------------------------------------------------
    // Safe sorting
    // -------------------------------------------------

    const allowedSortFields = [
      "price",
      "name",
      "stock",
      "createdAt",
    ];

    let sortOptions = {};

    if (sort) {
      const [field, order] = sort.split("_");

      if (!allowedSortFields.includes(field)) {
        return res.status(400).json({
          success: false,
          message: "Invalid sort field",
        });
      }

      if (order !== "asc" && order !== "desc") {
        return res.status(400).json({
          success: false,
          message: "Invalid sort order",
        });
      }

      sortOptions[field] = order === "desc" ? -1 : 1;
    } else {
      // Default: newest products first
      sortOptions = {
        createdAt: -1,
      };
    }

    // -------------------------------------------------
    // Get products
    // -------------------------------------------------

    const products = await Product.find(filter)
      .populate("category")
      .sort(sortOptions);

    res.status(200).json({
      success: true,
      count: products.length,
      products,
    });
  } catch (error) {
    console.error("Get Products Error:", error.message);

    res.status(500).json({
      success: false,
      message: "Failed to fetch products",
    });
  }
});

// =====================================================
// GET EXCLUSIVE PRODUCTS
// Public
// =====================================================

router.get("/exclusive", async (req, res) => {
  try {
    const exclusiveProducts = await Product.find({
      isExclusive: true,
    })
      .populate("category")
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: exclusiveProducts.length,
      products: exclusiveProducts,
    });
  } catch (error) {
    console.error(
      "Get Exclusive Products Error:",
      error.message
    );

    res.status(500).json({
      success: false,
      message: "Failed to fetch exclusive products",
    });
  }
});

// =====================================================
// GET SINGLE PRODUCT
// Public
// =====================================================

router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid product ID",
      });
    }

    const product = await Product.findById(id).populate(
      "category"
    );

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    res.status(200).json({
      success: true,
      product,
    });
  } catch (error) {
    console.error("Get Product Error:", error.message);

    res.status(500).json({
      success: false,
      message: "Failed to fetch product",
    });
  }
});

// =====================================================
// CREATE PRODUCT
// Admin only
// =====================================================

router.post(
  "/",
  protect,
  authorize("admin"),
  async (req, res) => {
    try {
      const {
        name,
        price,
        oldprice,
        category,
        description,
        stock,
        imageUrl,
        weight,
        isExclusive,
      } = req.body;

      // -------------------------------------------------
      // Required fields
      // -------------------------------------------------

      if (!name || !name.trim()) {
        return res.status(400).json({
          success: false,
          message: "Product name is required",
        });
      }

      if (price === undefined || price === null) {
        return res.status(400).json({
          success: false,
          message: "Product price is required",
        });
      }

      if (!category) {
        return res.status(400).json({
          success: false,
          message: "Product category is required",
        });
      }

      // -------------------------------------------------
      // Validate category ID
      // -------------------------------------------------

      if (!mongoose.Types.ObjectId.isValid(category)) {
        return res.status(400).json({
          success: false,
          message: "Invalid category ID",
        });
      }

      // Make sure category actually exists
      const categoryExists = await Category.findById(category);

      if (!categoryExists) {
        return res.status(404).json({
          success: false,
          message: "Category not found",
        });
      }

      // -------------------------------------------------
      // Validate price
      // -------------------------------------------------

      const numericPrice = Number(price);

      if (!Number.isFinite(numericPrice) || numericPrice < 0) {
        return res.status(400).json({
          success: false,
          message: "Invalid product price",
        });
      }

      // -------------------------------------------------
      // Validate old price if provided
      // -------------------------------------------------

      let numericOldPrice;

      if (oldprice !== undefined && oldprice !== null && oldprice !== "") {
        numericOldPrice = Number(oldprice);

        if (
          !Number.isFinite(numericOldPrice) ||
          numericOldPrice < 0
        ) {
          return res.status(400).json({
            success: false,
            message: "Invalid old price",
          });
        }
      }

      // -------------------------------------------------
      // Validate stock
      // -------------------------------------------------

      let numericStock = 0;

      if (stock !== undefined && stock !== null && stock !== "") {
        numericStock = Number(stock);

        if (
          !Number.isInteger(numericStock) ||
          numericStock < 0
        ) {
          return res.status(400).json({
            success: false,
            message: "Stock must be a whole number greater than or equal to 0",
          });
        }
      }

      // -------------------------------------------------
      // Create product
      // -------------------------------------------------

      const newProduct = new Product({
        name: name.trim(),
        price: numericPrice,
        oldprice: numericOldPrice,
        category,
        description: description?.trim() || "",
        stock: numericStock,
        imageUrl: imageUrl?.trim() || "",
        weight: weight?.trim() || "",
        isExclusive: Boolean(isExclusive),
      });

      const savedProduct = await newProduct.save();

      // Return populated category
      const populatedProduct = await Product.findById(
        savedProduct._id
      ).populate("category");

      res.status(201).json({
        success: true,
        message: "Product created successfully",
        product: populatedProduct,
      });
    } catch (error) {
      console.error("Create Product Error:", error.message);

      if (error.name === "ValidationError") {
        const messages = Object.values(error.errors).map(
          (err) => err.message
        );

        return res.status(400).json({
          success: false,
          message: messages.join(", "),
        });
      }

      res.status(500).json({
        success: false,
        message: "Failed to create product",
      });
    }
  }
);

// =====================================================
// UPDATE PRODUCT
// Admin only
// =====================================================

router.put(
  "/:id",
  protect,
  authorize("admin"),
  async (req, res) => {
    try {
      const { id } = req.params;

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid product ID",
        });
      }

      const {
        name,
        price,
        oldprice,
        category,
        description,
        stock,
        imageUrl,
        weight,
        isExclusive,
      } = req.body;

      const updateData = {};

      // -------------------------------------------------
      // Name
      // -------------------------------------------------

      if (name !== undefined) {
        if (!name.trim()) {
          return res.status(400).json({
            success: false,
            message: "Product name cannot be empty",
          });
        }

        updateData.name = name.trim();
      }

      // -------------------------------------------------
      // Price
      // -------------------------------------------------

      if (price !== undefined) {
        const numericPrice = Number(price);

        if (
          !Number.isFinite(numericPrice) ||
          numericPrice < 0
        ) {
          return res.status(400).json({
            success: false,
            message: "Invalid product price",
          });
        }

        updateData.price = numericPrice;
      }

      // -------------------------------------------------
      // Old price
      // -------------------------------------------------

      if (oldprice !== undefined) {
        if (oldprice === null || oldprice === "") {
          updateData.oldprice = undefined;
        } else {
          const numericOldPrice = Number(oldprice);

          if (
            !Number.isFinite(numericOldPrice) ||
            numericOldPrice < 0
          ) {
            return res.status(400).json({
              success: false,
              message: "Invalid old price",
            });
          }

          updateData.oldprice = numericOldPrice;
        }
      }

      // -------------------------------------------------
      // Category
      // -------------------------------------------------

      if (category !== undefined) {
        if (!mongoose.Types.ObjectId.isValid(category)) {
          return res.status(400).json({
            success: false,
            message: "Invalid category ID",
          });
        }

        const categoryExists = await Category.findById(category);

        if (!categoryExists) {
          return res.status(404).json({
            success: false,
            message: "Category not found",
          });
        }

        updateData.category = category;
      }

      // -------------------------------------------------
      // Description
      // -------------------------------------------------

      if (description !== undefined) {
        updateData.description = description.trim();
      }

      // -------------------------------------------------
      // Stock
      // -------------------------------------------------

      if (stock !== undefined) {
        const numericStock = Number(stock);

        if (
          !Number.isInteger(numericStock) ||
          numericStock < 0
        ) {
          return res.status(400).json({
            success: false,
            message:
              "Stock must be a whole number greater than or equal to 0",
          });
        }

        updateData.stock = numericStock;
      }

      // -------------------------------------------------
      // Image URL
      // -------------------------------------------------

      if (imageUrl !== undefined) {
        updateData.imageUrl = imageUrl.trim();
      }

      // -------------------------------------------------
      // Weight
      // -------------------------------------------------

      if (weight !== undefined) {
        updateData.weight = weight.trim();
      }

      // -------------------------------------------------
      // Exclusive product
      // -------------------------------------------------

      if (isExclusive !== undefined) {
        updateData.isExclusive = Boolean(isExclusive);
      }

      // -------------------------------------------------
      // Make sure something is being updated
      // -------------------------------------------------

      if (Object.keys(updateData).length === 0) {
        return res.status(400).json({
          success: false,
          message: "No valid fields provided for update",
        });
      }

      // -------------------------------------------------
      // Update product
      // -------------------------------------------------

      const updatedProduct = await Product.findByIdAndUpdate(
        id,
        updateData,
        {
          new: true,
          runValidators: true,
        }
      ).populate("category");

      if (!updatedProduct) {
        return res.status(404).json({
          success: false,
          message: "Product not found",
        });
      }

      res.status(200).json({
        success: true,
        message: "Product updated successfully",
        product: updatedProduct,
      });
    } catch (error) {
      console.error("Update Product Error:", error.message);

      if (error.name === "ValidationError") {
        const messages = Object.values(error.errors).map(
          (err) => err.message
        );

        return res.status(400).json({
          success: false,
          message: messages.join(", "),
        });
      }

      res.status(500).json({
        success: false,
        message: "Failed to update product",
      });
    }
  }
);

// =====================================================
// DELETE PRODUCT
// Admin only
// =====================================================

router.delete(
  "/:id",
  protect,
  authorize("admin"),
  async (req, res) => {
    try {
      const { id } = req.params;

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid product ID",
        });
      }

      const deletedProduct = await Product.findByIdAndDelete(id);

      if (!deletedProduct) {
        return res.status(404).json({
          success: false,
          message: "Product not found",
        });
      }

      res.status(200).json({
        success: true,
        message: "Product deleted successfully",
      });
    } catch (error) {
      console.error("Delete Product Error:", error.message);

      res.status(500).json({
        success: false,
        message: "Failed to delete product",
      });
    }
  }
);

module.exports = router;