export const successResponse = (res, data, message = "Success", statusCode = 200) => {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
  });
};

export const errorResponse = (res, message = "Something went wrong", statusCode = 500, code = null) => {
  const response = {
    success: false,
    message,
  };
  if (code) response.code = code;
  return res.status(statusCode).json(response);
};
