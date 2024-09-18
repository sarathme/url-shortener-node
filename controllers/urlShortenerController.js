const { nanoid } = require("nanoid");
const { MongoClient } = require("mongodb");
const validUrl = require("valid-url");

const { catchAsync } = require("../utils/catchAsync");
const AppError = require("../utils/appError");

// Establishing MongoDB connection.

const URL = process.env.DB_CONNECTION.replace(
  "<PASSWORD>",
  process.env.DB_PASSWORD
);

// Creating a MongoDB client instance.

const client = new MongoClient(URL);

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
