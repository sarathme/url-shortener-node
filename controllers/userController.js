const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const { MongoClient, ObjectId } = require("mongodb");
const jwt = require("jsonwebtoken");

const sendEmail = require("../utils/email");
const { catchAsync } = require("../utils/catchAsync");
const AppError = require("../utils/appError");
const { promisify } = require("util");

// Establishing MongoDB connection.

const URL = process.env.DB_CONNECTION.replace(
  "<PASSWORD>",
  process.env.DB_PASSWORD
);

// Creating a MongoDB client instance.

const client = new MongoClient(URL);

// Handler function for signup route.

exports.signup = catchAsync(async (req, res, next) => {
  // Destructuring the request body thereby creating a shallow copy of the body fields.

  const { name, email, password } = req.body;

  // Check for the required fields present in the body if not call the global error handler.

  if (!name || !email || !password) {
    next(new AppError("Please provide the required fields", 400));
    return;
  }

  // Connecting and selecting the database and collections.

  await client.connect();
  const database = client.db("url_shortener");
  const userCollection = database.collection("users");

  // Check if the provided email already exists in the user collection.

  const existingUser = await userCollection.findOne({ email });

  // If the user already exists call the global error handling middleware.

  if (existingUser) {
    next(new AppError(`User with the email already exists`, 400));
    await client.close();
    return;
  }

  const newUser = { name, email, active: false };

  // If the user is new user then encrypt the password.

  newUser.password = await bcrypt.hash(password, 12);

  // Store the created user in the user collection.

  const created = await userCollection.insertOne(newUser);

  // Retrieve the created user for sending as a response.

  const user = await userCollection.findOne(
    { _id: created.insertedId },
    { projection: { password: 0 } }
  );

  // Generate password reset token using builtin crypto package.

  const verifyToken = crypto.randomBytes(32).toString("hex");

  // Create the hash of the verify token to store in the database.

  const verifyTokenHash = crypto
    .createHash("sha256")
    .update(verifyToken)
    .digest("hex");

  // Store verify token in database

  await userCollection.findOneAndUpdate(
    { _id: user._id },
    {
      $set: {
        verificationToken: verifyTokenHash,
      },
    }
  );

  // Constuct a verify url to be sent through email. The verify token is not the hashed token.

  const verifyURL = `${req.protocol}://${req.get(
    "host"
  )}/api/v1/users/verify-account/${verifyToken}`;

  // Construct a message to send through the email with the verify url.

  const message = `Please verify your account by clicking the below link \n ${verifyURL}`;

  // Send the email using node-mailer package. Please resfer email.js file in utils folder for node-mailer implementation.

  try {
    await sendEmail({
      email: user.email,
      subject: "Verify your Account",
      message,
    });

    // Close the DB connection.

    await client.close();
    // Sending a success response when the email is sent successfully.

    res.status(200).json({
      status: "success",
      message: "Email sent successfully",
    });
  } catch (err) {
    // Clearing the verify token in the user document if the email is not sent.

    await userCollection.findOneAndUpdate(
      { _id: user._id },
      {
        $set: {
          verifyTokenHash: undefined,
        },
      }
    );
    await client.close();

    // Call the global error handling middleware to send error response.
    console.log("Error:💥", err);
    return next(new AppError("Problem sending email. Please try again", 500));
  }
});

// handler function for verifying newly created account account

exports.verifyAccount = catchAsync(async (req, res, next) => {
  const { verifyToken } = req.params;
  console.log(verifyToken);
  // Create the hash of the verify token to check for the hashed token in database.

  const verifyTokenHash = crypto
    .createHash("sha256")
    .update(verifyToken)
    .digest("hex");

  // Connecting and selecting the database and collections.

  await client.connect();
  const database = client.db("url_shortener");
  const userCollection = database.collection("users");

  // Finding the user with the hashed verify token,

  const checkUser = await userCollection.findOne(
    {
      verificationToken: verifyTokenHash,
    },
    {
      projection: { password: 0 },
    }
  );

  // If no user is found then send Bad request response.

  if (!checkUser) {
    await client.close();
    return next(
      new AppError("Unable to verify account Please provide a valid token", 400)
    );
  }

  // Check if the user is already verified.

  if (checkUser.active) {
    await client.close();
    return res
      .status(301)
      .redirect(`${process.env.FRONTEND_DOMAIN}/alreadyVerified`);
  }

  // If user is not activated then activate the user.

  const user = await userCollection.findOneAndUpdate(
    {
      _id: checkUser._id,
    },
    { $set: { active: true } },
    {
      projection: { password: 0, active: 0 },
      returnDocument: "after",
    }
  );

  await client.close();

  // Sign a JWT token.

  const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN,
  });

  res
    .status(301)
    .redirect(`${process.env.FRONTEND_DOMAIN}/verify-account/${token}`);
});

// handler function for logging in users.

exports.login = catchAsync(async (req, res, next) => {
  // Destructuring the request body and get the value.

  const { email, password } = req.body;

  // Check if the required fields exists. If not call the global error handler.

  if (!email || !password) {
    next(new AppError("Please provide email and password", 400));
    return;
  }

  // Connecting and selecting the database and collections.

  await client.connect();
  const database = client.db("url_shortener");
  const userCollection = database.collection("users");

  // Query the user using provided email.
  const user = await userCollection.findOne({ email });

  // If there is no user and the password is incorrect call the global error handler.

  if (!user || !(await bcrypt.compare(password, user.password))) {
    next(new AppError("Invalid email or password", 401));
    await client.close();
    return;
  }

  // Check if the user is active.

  if (!user.active) {
    await client.close();
    return next(
      new AppError("Account not verified. Please verify your account", 401)
    );
  }

  user.password = undefined;
  user.active = undefined;

  // Sign a JWT token.
  const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN,
  });

  // Sending success response with the token and the user.

  res.status(200).json({
    status: "success",
    token,
    data: {
      user,
    },
  });
});

exports.forgotPassword = catchAsync(async (req, res, next) => {
  // Read the email sent through the request body.

  const { email } = req.body;

  // If no email is present call the global erro handler.

  if (!email) {
    return next(new AppError("Please provide a email", 400));
  }

  // Connecting and selecting the database and collections.

  await client.connect();

  const db = client.db("url_shortener");
  const userCollection = db.collection("users");

  // Query the user with the provided email.

  const user = await userCollection.findOne({ email });

  // If no user exists with the email call the global error handler.

  if (!user) {
    next(new AppError("No user found with the email", 404));
    await client.close();
    return;
  }

  // Generate password reset token using builtin crypto package.

  const resetToken = crypto.randomBytes(32).toString("hex");

  // Create the hash of the reset token to store in the database.

  const passwordResetToken = crypto
    .createHash("sha256")
    .update(resetToken)
    .digest("hex");

  // Set the reset token expiry.

  const resetTokenExpiresAt = new Date(Date.now() + 10 * 60 * 1000);

  // Store the expiry and the hashed reset token in the user document.

  await userCollection.findOneAndUpdate(
    { _id: user._id },
    {
      $set: {
        passwordResetToken,
        resetTokenExpiresAt,
      },
    }
  );

  // Constuct a reset url to be sent through email. The reset token is not the hashed token.

  const resetURL = `${req.headers["x-frontend-url"]}/resetPassword/${resetToken}`;

  // Construct a message to send through the email with the reset url.

  const message = `Forget your password? Please send a request with your new password ${resetURL}`;

  // Send the email using node-mailer package. Please resfer email.js file in utils folder for node-mailer implementation.

  try {
    await sendEmail({
      email: user.email,
      subject: "Password reset Token (valid for 10 mins)",
      message,
    });

    // Sending a success response when the email is sent successfully.

    res.status(200).json({
      status: "success",
      message: "Email sent successfully",
    });
  } catch (err) {
    // Clearing the reset token and expiry in the user document if the email is not sent.

    await userCollection.findOneAndUpdate(
      { _id: user._id },
      {
        $set: {
          passwordResetToken: undefined,
          resetTokenExpiresAt: undefined,
        },
      }
    );
    await client.close();

    // Call the global error handling middleware to send error response.
    console.log("Error:💥", err);
    return next(new AppError("Problem sending email. Please try again", 500));
  }
});

// Handler function for resetting the password.

exports.resetPassword = catchAsync(async (req, res, next) => {
  // Connect to the database and selecting the collection.

  await client.connect();
  const database = client.db("url_shortener");
  const userCollection = database.collection("users");

  // Create the hash using crypto package for the reset token reiced through the url.
  // Inorder to compare with the hash in the database user document.

  const hashedToken = crypto
    .createHash("sha256")
    .update(req.params.token)
    .digest("hex");

  // Check for the user with the hashed reset token in the user document and also check if the token is expired.

  let user = await userCollection.findOne({
    passwordResetToken: hashedToken,
    resetTokenExpiresAt: { $gt: new Date(Date.now()) },
  });

  // If no user is found send an error response using global error handler.

  if (!user) {
    await client.close();
    return next(new AppError("Token is invalid or expired", 400));
  }

  // If the user exists encrypt the password using bcrypt package.

  const password = await bcrypt.hash(req.body.password, 12);

  // Save the updated password in the user document and clear the reset token and expiry.

  user = await userCollection.findOneAndUpdate(
    { _id: user._id },
    {
      $set: {
        password,
        passwordResetToken: undefined,
        resetTokenExpiresAt: undefined,
      },
    },
    {
      returnDocument: "after",
      projection: {
        passwordResetToken: 0,
        resetTokenExpiresAt: 0,
        password: 0,
      },
    }
  );

  // Send a success response with the jwt token and user.

  res.status(200).json({
    status: "success",
    user,
  });
});

exports.protect = catchAsync(async (req, res, next) => {
  let token;

  // Reading the token from the authorization header

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    token = req.headers.authorization.split(" ")[1];
  }

  // Check if the token exists if not call the global error handling middleware.

  if (!token) {
    return next(
      new AppError("You are not logged in. Please login to continue", 401)
    );
  }

  // Verify the token if it is expired send error response using global error handling middleware.

  let decoded;
  try {
    decoded = await promisify(jwt.verify)(token, process.env.JWT_SECRET);
  } catch (err) {
    return next(
      new AppError("Session expired. Please login again to continue", 401)
    );
  }

  // Connecting database and selecting users collection.

  await client.connect();
  const database = client.db("url_shortener");
  const userCollection = database.collection("users");

  // Check if the user exists
  const currentUser = await userCollection.findOne({
    _id: new ObjectId(decoded.id),
  });

  // If the user doen't exists send an error response using the global error handler.

  if (!currentUser) {
    await client.close();
    return next(new AppError("User doesn't exists or invalid token", 401));
  }

  // Setting the user in the request.

  req.user = currentUser;

  // Call the next middleware in the stack.

  next();
});
