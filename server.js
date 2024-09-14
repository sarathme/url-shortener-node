// REQUIRE dotenv package to access the variables in the external .env file.

const dotenv = require("dotenv");

// Setting the path .env file as the .env.
dotenv.config();

// Requiring the express app object.

const app = require("./app");

// Defining the port and as fallback add default port.

const port = process.env.PORT || 3000;

// Start the webser and listen for requests.

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
