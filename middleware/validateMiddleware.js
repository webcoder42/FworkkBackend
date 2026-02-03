import { validationResult } from "express-validator";

export const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (errors.isEmpty()) {
    return next();
  }

  // Extract first error message for a cleaner response
  const firstError = errors.array()[0].msg;

  return res.status(400).json({
    success: false,
    message: firstError,
    errors: errors.array().map((err) => ({
      field: err.path,
      message: err.msg,
    })),
  });
};
