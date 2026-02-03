import jwt from "jsonwebtoken";
import UserModel from "../Model/UserModel.js";

export const requireSignIn = async (req, res, next) => {
  try {
    // Get token ONLY from Authorization header (ignoring cookies to avoid third-party issues)
    const token = req.headers.authorization && req.headers.authorization.startsWith("Bearer") 
      ? req.headers.authorization.split(" ")[1] 
      : null;

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Authentication required. Please login.",
        code: "TOKEN_MISSING",
      });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);



    // Find user in database to ensure they still exist and get fresh data
    const user = await UserModel.findById(decoded.id).select('_id email role username accountStatus suspensionEndDate');
    if (!user) {
      return res.status(401).json({
        success: false,
        message: "User not found or deleted",
      });
    }

    // Check if user account is suspended or banned
    if (user.accountStatus === "banned") {
      return res.status(403).json({
        success: false,
        message: "Your account has been permanently banned. Please contact support if you believe this is an error.",
        code: "ACCOUNT_BANNED",
      });
    }

    if (user.accountStatus === "suspended") {
      const now = new Date();
      if (user.suspensionEndDate && user.suspensionEndDate > now) {
        const remainingTime = Math.ceil((user.suspensionEndDate - now) / (1000 * 60 * 60 * 24));
        return res.status(403).json({
          success: false,
          message: `Your account is temporarily suspended. It will be reactivated in ${remainingTime} day(s).`,
          code: "ACCOUNT_SUSPENDED",
          suspensionEndDate: user.suspensionEndDate,
        });
      } else {
        // Suspension period has ended, reactivate user
        await UserModel.findByIdAndUpdate(user._id, {
          accountStatus: "active",
          suspensionEndDate: null,
        });
        user.accountStatus = "active";
      }
    }

    // Attach user to request
    req.user = {
      _id: user._id,
      id: user._id,
      email: user.email,
      role: user.role,
      username: user.username,
      accountStatus: user.accountStatus,
    };



    next();
  } catch (error) {
    console.error("JWT Verification Error:", {
      name: error.name,
      message: error.message,
      expiredAt: error.expiredAt,
      stack: error.stack,
    });

    if (error.name === "TokenExpiredError") {
      return res.status(401).json({
        success: false,
        message: "Session expired. Please login again.",
        code: "TOKEN_EXPIRED",
      });
    }

    if (error.name === "JsonWebTokenError") {
      return res.status(401).json({
        success: false,
        message: "Invalid authentication token",
        code: "INVALID_TOKEN",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Authentication failed",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
      code: "AUTH_ERROR",
    });
  }
};

export const isAdmin = async (req, res, next) => {
  try {
    // First check the token payload
    if (req.user?.role === "admin") {
      return next();
    }

    // Fallback to database check
    const user = await UserModel.findById(req.user.id).select("role");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
        code: "USER_NOT_FOUND",
      });
    }

    if (user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Admin privileges required",
        code: "ADMIN_REQUIRED",
      });
    }

    // Update request user with fresh data
    req.user.role = user.role;
    next();
  } catch (error) {
    console.error("Admin Check Error:", error);
    return res.status(500).json({
      success: false,
      message: "Authorization check failed",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
      code: "ADMIN_CHECK_ERROR",
    });
  }
};
