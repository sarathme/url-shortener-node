// Global error handling middleware for entire express app.

module.exports = (err, req, res, next) => {
  // This if block is to send generic error for errors outside the express app like mongodb errors.
  if (!err.isOperational) {
    return res.status(500).json({
      status: "error",
      message: "Something went wrong",
    });
  }

  // Setting the error status according to the status code
  err.statusCode = err.statusCode || 500;
  err.status = err.status || "error";

  // Sending the error response.
  res.status(err.statusCode).json({
    status: err.status,
    message: err.message,
  });
};
