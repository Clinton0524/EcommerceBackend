require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

const { protect, authorize } = require("./middleware/authMiddleware");

const app = express();

// =====================================================
// SECURITY MIDDLEWARE
// =====================================================

// Add common security headers
app.use(helmet());

// Parse JSON requests
app.use(
  express.json({
    limit: "1mb",
  }),
);

// Parse cookies
app.use(cookieParser());

// =====================================================
// CORS CONFIGURATION
// =====================================================

// Add your deployed frontend URL to FRONTEND_URL
// in Render environment variables.
//
// Example:
// FRONTEND_URL=https://your-frontend.onrender.com
//
// For local development:
// FRONTEND_URL=http://localhost:5173

const allowedOrigins = [
  process.env.FRONTEND_URL,
  "http://localhost:5173",
  "http://localhost:3000",
  "http://localhost:3001",
  "http://192.168.8.102:3001",
  "http://192.168.8.102:3000",
  "https://glistening-platypus-4c4f46.netlify.app",
   "http://192.168.137.1:3000"
].filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests without an origin
      // (Postman, server-to-server requests, etc.)
      if (!origin) {
        return callback(null, true);
      }

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error("Not allowed by CORS"));
    },

    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],

    allowedHeaders: ["Content-Type", "Authorization"],

    credentials: true,
  }),
);

// =====================================================
// RATE LIMITING
// =====================================================

// General API rate limiter
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes

  max: 300,

  standardHeaders: true,
  legacyHeaders: false,

  message: {
    success: false,
    message: "Too many requests. Please try again later.",
  },
});

app.use("/api", apiLimiter);

// Stricter limiter for authentication routes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,

  standardHeaders: true,
  legacyHeaders: false,

  message: {
    success: false,
    message: "Too many login or registration attempts. Please try again later.",
  },
});
// =====================================================
// HEALTH CHECK
// =====================================================

app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "API is running...",
  });
});

// =====================================================
// MONGODB CONNECTION
// =====================================================

const connectDB = async () => {
  try {
    if (!process.env.MONGO_URI) {
      throw new Error("MONGO_URI is missing from environment variables");
    }

    if (!process.env.JWT_SECRET) {
      throw new Error("JWT_SECRET is missing from environment variables");
    }

    await mongoose.connect(process.env.MONGO_URI);

    console.log("MongoDB Connected");
  } catch (error) {
    console.error("MongoDB Connection Error:", error.message);

    process.exit(1);
  }
};

// =====================================================
// ROUTES
// =====================================================

const categoryRoutes = require("./routes/categoryRoutes");
const productRoutes = require("./routes/productRoutes");
const bannerRoutes = require("./routes/bannerRoutes");
const cartRoutes = require("./routes/cartRoutes");
const orderRoutes = require("./routes/orderRoutes");
const authRoutes = require("./routes/authRoutes");
const promoCodeRoutes = require("./routes/promoCodeRoutes");

app.use("/api/categories", categoryRoutes);

app.use("/api/products", productRoutes);

app.use("/api/banners", bannerRoutes);

app.use("/api/cart", cartRoutes);

app.use("/api/orders", orderRoutes);
app.use("/api/promo-codes", promoCodeRoutes);

// Authentication routes get stricter rate limiting
app.use("/api/auth", authLimiter, authRoutes);

// =====================================================
// PROTECTED ADMIN TEST ROUTE
// =====================================================

app.get("/api/admin", protect, authorize("admin"), (req, res) => {
  res.status(200).json({
    success: true,
    message: "Welcome Admin! This is a protected route.",
  });
});

// =====================================================
// 404 HANDLER
// =====================================================

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
  });
});

// =====================================================
// GLOBAL ERROR HANDLER
// =====================================================

app.use((error, req, res, next) => {
  console.error("Global Error:", error.message);

  // CORS error
  if (error.message === "Not allowed by CORS") {
    return res.status(403).json({
      success: false,
      message: "CORS policy blocked this request",
    });
  }

  res.status(error.status || 500).json({
    success: false,
    message:
      process.env.NODE_ENV === "production"
        ? "Internal server error"
        : error.message,
  });
});

// =====================================================
// START SERVER AFTER DATABASE CONNECTION
// =====================================================

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  await connectDB();

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
};

startServer();
