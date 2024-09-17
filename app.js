const express = require("express");
const cors = require("cors");

const globalErrorHandler = require("./controllers/errorController");
const AppError = require("./utils/appError");

const userRouter = require("./routes/userRoutes");
const urlShortenerRouter = require("./routes/urlShortenerRoutes");

const urlController = require("./controllers/urlShortenerController");

// Calling the express function.

const app = express();

// Enabling cors for the frontend domain.

app.use(
  cors({
    origin: process.env.FRONTEND_DOMAIN,
    credentials: true,
  })
);

// Middleware to attach body to request object and parse JSON.
app.use(express.json());

// ROUTES FOR THE USERS.

app.use("/api/v1/users", userRouter);

// ROUTES FOR THE SHORTENING URLs.
app.use("/api/v1/shorten", urlShortenerRouter);

app.use("/:shortId", urlController.redirectUrl);

// FALLBACK ROUTE FOR THE UNDEFINED ROUTES.

app.use("*", (req, res, next) => {
  next(new AppError("This route is not defined", 404));
});

// MIDDLEWARE TO ESTABLISH THE GLOBAL ERROR HANDLER.

app.use(globalErrorHandler);

// EXPORTING THE express app.

module.exports = app;
