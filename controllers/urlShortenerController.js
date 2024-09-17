const { nanoid } = require("nanoid");
const { MongoClient } = require("mongodb");

const { catchAsync } = require("../utils/catchAsync");
const AppError = require("../utils/appError");

// Establishing MongoDB connection.

const URL = process.env.DB_CONNECTION.replace(
  "<PASSWORD>",
  process.env.DB_PASSWORD
);

// Creating a MongoDB client instance.

const client = new MongoClient(URL);

exports.shortenUrl = catchAsync(async (req, res, next) => {
  const { originalUrl } = req.body;

  if (!originalUrl) {
    await client.close();
    return next(new AppError("Please provide a url", 400));
  }

  const shortId = nanoid(10);
  const shortUrl = `${req.protocol}://${req.get("host")}/${shortId}`;

  // Connecting database and selecting users collection.

  await client.connect();
  const database = client.db("url_shortener");
  const urlCollection = database.collection("urls");

  const newUrl = await urlCollection.insertOne({
    originalUrl,
    shortId,
    userId: req.user._id,
    shortUrl,
  });

  const url = await urlCollection.findOne({ _id: newUrl.insertedId });

  await client.close();

  res.status(201).json({
    status: "success",
    data: {
      url,
    },
  });
});

exports.getUrls = catchAsync(async (req, res, next) => {
  // Connecting database and selecting users collection.

  await client.connect();
  const database = client.db("url_shortener");
  const urlCollection = database.collection("urls");

  const urls = await urlCollection
    .find({ userId: req.user._id }, { projection: { userId: 0 } })
    .toArray();

  res.status(200).json({
    status: "success",
    data: {
      urls,
    },
  });
});

exports.redirectUrl = catchAsync(async (req, res, next) => {
  const { shortId } = req.params;

  // Connecting database and selecting users collection.

  await client.connect();
  const database = client.db("url_shortener");
  const urlCollection = database.collection("urls");

  const url = await urlCollection.findOne({ shortId });

  if (!url) {
    await client.close();
    return next(new AppError("Invalid Url. Cannot redirect", 404));
  }

  res.status(301).redirect(url.originalUrl);
});
