const express = require("express");

// Require the userController.

const userController = require("./../controllers/userController");

// Creating the router instance.

const router = express.Router();

// Creating routes and add handler functions for the coresponding routes.

// ROUTES TO SIGNUP AND LOGIN.

router.route("/signup").post(userController.signup);
router.route("/verify-account/:verifyToken").get(userController.verifyAccount);
router.route("/login").post(userController.login);

// ROUTES TO RESET PASSWORD.

router.route("/forgotPassword").post(userController.forgotPassword);
router.route("/resetPassword/:token").patch(userController.resetPassword);

// Exporting the router instance.

module.exports = router;
