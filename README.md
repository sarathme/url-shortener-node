# URL Shortener

## Table of content

1. [Utlity Functions](#utility-functions)
2. [Route Definitions](#route-definitions)
3. [Handler functions](#controller-functions)
4. [Protect Middleware](#protect-middleware)
5. [Global Error handling Middleware](#global-error-handling-middleware)

### Route definitions

```js
const express = require("express");

// Require the userController.

const userController = require("./../controllers/userController");

// Creating the router instance.

const router = express.Router();

// Creating routes and add handler functions for the coresponding routes.

// ROUTES TO SIGNUP AND LOGIN.

router.route("/signup").post(userController.signup);
router.route("/login").post(userController.login);

// ROUTES TO RESET PASSWORD.

router.route("/forgotPassword").post(userController.forgotPassword);
router.route("/resetPassword/:token").patch(userController.resetPassword);

// router.route("/:userId").get(userController.protect, userController.getUser);

// USING THE PROTECT MIDDLEWARE TO CHECK FOR THE USER LOGGEDIN STATUS.

router.route("/protect").get(userController.protect, (req, res, next) => {
  // Sending the success response if the user is Authenticated.

  res.status(200).json({
    status: "success",
    data: {
      user: req.user,
    },
  });
});

// Exporting the router instance.

module.exports = router;
```

### Controller Functions

#### Signup handler

```js
// userController.js file

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
  const database = client.db("Password_Reset");
  const userCollection = database.collection("users");

  // Check if the provided email already exists in the user collection.

  const existingUser = await userCollection.findOne({ email });

  // If the user already exists call the global error handling middleware.

  if (existingUser) {
    next(new AppError(`User with the email already exists`, 400));
    await client.close();
    return;
  }

  const newUser = { name, email };

  // If the user is new user then encrypt the password.

  newUser.password = await bcrypt.hash(password, 12);

  // Store the created user in the user collection.

  const created = await userCollection.insertOne(newUser);

  // Retrieve the created user for sending as a response.

  const user = await userCollection.findOne(
    { _id: created.insertedId },
    { projection: { password: 0 } }
  );

  // Close the DB connection.

  await client.close();

  // Sign a JWT token.

  const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN,
  });

  // Setting the cookies.

  res.cookie("jtoken", token, {
    httpOnly: true,
    maxAge: process.env.COOKIE_EXPIRES_IN * 24 * 60 * 60 * 1000,
    sameSite: "None",
    secure: true,
  });

  // Send the success response with the token and created user.

  res.status(200).json({
    status: "success",
    token,
    data: {
      user,
    },
  });
});
```

#### Login handler

```js
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
  const database = client.db("Password_Reset");
  const userCollection = database.collection("users");

  // Query the user using provided email.

  const user = await userCollection.findOne({ email });

  // If there is no user and the password is incorrect call the global error handler.

  if (!user || !(await bcrypt.compare(password, user.password))) {
    next(new AppError("Invalid email or password", 401));
    await client.close();
    return;
  }

  user.password = undefined;

  // Sign a JWT token.
  const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN,
  });

  // Setting the cookies
  res.cookie("jtoken", token, {
    httpOnly: true,
    maxAge: process.env.COOKIE_EXPIRES_IN * 24 * 60 * 60 * 1000,
    secure: true,
    sameSite: "None",
    path: "/",
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
```

### Forgot password handler

```js
// Handler function for forgot password route and to send email.

exports.forgotPassword = catchAsync(async (req, res, next) => {
  // Read the email sent through the request body.

  const { email } = req.body;

  // If no email is present call the global erro handler.

  if (!email) {
    return next(new AppError("Please provide a email", 400));
  }

  // Connecting and selecting the database and collections.

  await client.connect();

  const db = client.db("Password_Reset");
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

    return next(new AppError("Problem sending email. Please try again", 500));
  }
});
```

#### Reset password handler

```js
// Handler function for resetting the password.

exports.resetPassword = catchAsync(async (req, res, next) => {
  // Connect to the database and selecting the collection.

  await client.connect();
  const database = client.db("Password_Reset");
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

  // Sign a JWT token.

  const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN,
  });

  // Send a success response with the jwt token and user.

  res.status(200).json({
    status: "success",
    token,
    user,
  });
});
```

#### Shorten Url handler

```js
// HANDLER FUNCTION FOR SHORTENING URL

exports.shortenUrl = catchAsync(async (req, res, next) => {
  // GET THE ORIGINAL URL FROM REQUEST BODY
  const { originalUrl } = req.body;

  // ERROR RESPONSE WHEN NO URL FOUND
  if (!originalUrl) {
    await client.close();
    return next(new AppError("Please provide a url", 400));
  }

  // CHECK IF THE PROVIDED URL IS VALID
  // IF NOT SEND ERROR RESPONSE

  if (!validUrl.isUri(originalUrl)) {
    await client.close();
    return next(new AppError("Please provide a valid URL", 400));
  }

  // GENERATE SHORT ID

  const shortId = nanoid(10);

  // CONSTRUCT A SHORT URL

  const shortUrl = `${req.protocol}://${req.get("host")}/${shortId}`;

  // Connecting database and selecting users collection.

  await client.connect();
  const database = client.db("url_shortener");
  const urlCollection = database.collection("urls");

  // ADD THE CREATED SHORT URL TO THE DATABASE

  const newUrl = await urlCollection.insertOne({
    originalUrl,
    shortId,
    userId: req.user._id,
    shortUrl,
    visited: 0,
  });

  // RETRIEVE THE INSERTED DOCUMENT

  const url = await urlCollection.findOne({ _id: newUrl.insertedId });

  // CLOSE THE CONNECTION TO DATABASE

  await client.close();

  // SEND SUCCESS RESPONSE

  res.status(201).json({
    status: "success",
    data: {
      url,
    },
  });
});
```

#### Get All User Specifc Created Short Urls

```js
// HANDLER FUNCTION FOR GETTING USER SPECIFIC CREATED SHORT URLS

exports.getUrls = catchAsync(async (req, res, next) => {
  // Connecting database and selecting users collection.

  await client.connect();
  const database = client.db("url_shortener");
  const urlCollection = database.collection("urls");

  // RETRIEVE ALL THE SHORT URL CREATED BY A LOGGEG IN USER

  const urls = await urlCollection
    .find({ userId: req.user._id }, { projection: { userId: 0 } })
    .toArray();

  // SEND SUCCESS RESPONSE

  res.status(200).json({
    status: "success",
    data: {
      urls,
      user: req.user,
    },
  });
});
```

#### Redirect handler to the original url

```js
// HANDLER FUNCTION TO REDIRECT THE SHORT URL TO ORIGINAL URL

exports.redirectUrl = catchAsync(async (req, res, next) => {
  // GET THE SHORTID FROM THE URL

  const { shortId } = req.params;

  // Connecting database and selecting users collection.

  await client.connect();
  const database = client.db("url_shortener");
  const urlCollection = database.collection("urls");

  // FIND THE DOCUMENT RELATED TO THE SHORT ID IN THE URL PARAMETER

  const url = await urlCollection.findOneAndUpdate(
    { shortId },
    { $inc: { visited: 1 } },
    {
      returnDocument: "after",
    }
  );

  // IF NO DOCUMENT FOUND SEND ERROR RESPONSE

  if (!url) {
    await client.close();
    return next(new AppError("Invalid Url. Cannot redirect", 404));
  }

  // REDIRECT TO THE CORRESPONDING ORIGINAL URL OF SHORT URL

  res.status(301).redirect(url.originalUrl);
});
```

### Utility Functions

#### Send email function to send email using nodemailer package

```js
// SENDING MAIL USING nodemailer package

const nodemailer = require("nodemailer");

// Defining a function to send an email.

const sendEmail = async (options) => {
  // Create a transporter object with the SMTP credentials.

  const transporter = nodemailer.createTransport({
    host: "sandbox.smtp.mailtrap.io",
    port: 587,
    secure: false,
    auth: {
      user: process.env.EMAIL_USERNAME,
      pass: process.env.EMAIL_PASSWORD,
    },
  });

  // Define email options

  const mailOptions = {
    from: "Sarasraman <hello@sarasraman.io>",
    to: options.email,
    subject: options.subject,
    text: options.message,
  };

  // Send the email

  await transporter.sendMail(mailOptions);
};

module.exports = sendEmail;
```

#### Global error catching function for async functions

```js
// UTILITY FUNCTION TO ACT AS COMMON ERROR CATCHING PLACE FOR THE ASYNC FUNCTIONS.

exports.catchAsync = (fn) => {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
};
```

#### AppError class to define custom error object

```js
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
```

### Protect Middleware

```js
// handler function to protect a route for checking the user is logged in.

exports.protect = catchAsync(async (req, res, next) => {
  let token;

  // Reading the token from the header or cookie.

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    token = req.headers.authorization.split(" ")[1];
  }

  if (req.cookies.jtoken) {
    token = req.cookies.jtoken;
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
  const database = client.db("Password_Reset");
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
```

### Global Error handling Middleware

```js
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
```
