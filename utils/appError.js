// CUSTOM APPERROR CLASS EXTENDING THE ERROR CLASS FOR CUSTOM ERROR RESPONSES.

class AppError extends Error {
  constructor(message, statusCode) {
    // CALLING THE Error class.

    super(message);

    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith("4") ? "fail" : "error";

    // THIS isOperational field is used to indicate the errors which are handled by us.
    // Other errors donot have this field so we can distinguish the errors.

    this.isOperational = true;
  }
}

// Exporting the AppError class.

module.exports = AppError;
