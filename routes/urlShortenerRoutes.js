const express = require("express");
const userController = require("./../controllers/userController");
const urlShortenerController = require("./../controllers/urlShortenerController");

// Creating the router instance.

const router = express.Router();

router
  .route("/")
  .post(userController.protect, urlShortenerController.shortenUrl)
  .get(userController.protect, urlShortenerController.getUrls);

// Exporting the router instance.

module.exports = router;
