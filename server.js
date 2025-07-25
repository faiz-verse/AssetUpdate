const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
const crypto = require("crypto");

const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// Serve static frontend
app.use(express.static(path.join(__dirname, "public")));

app.get("/assets", async (req, res) => {
  try {
    // 1. Get Access Token
    const tokenResponse = await axios.post(
      "https://cloud.uipath.com/identity_/connect/token",
      new URLSearchParams({
        grant_type: "client_credentials",
        client_id: "aa38df26-cc6c-4e12-b2f8-4eed9c7574f0",
        client_secret: "vlF_BIfY0VCCBDzM",
        scope: "OR.Assets.Read OR.Folders.Read",
      }),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );

    const accessToken = tokenResponse.data.access_token;

    // 2. Get Assets
    const assetsResponse = await axios.get(
      "https://cloud.uipath.com/faizanorg/DefaultTenant/odata/Assets",
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "X-UIPATH-OrganizationUnitId": "98475",
        },
      }
    );

    const assetNames = assetsResponse.data.value.map((asset) => asset.Name);
    res.json(assetNames);
  } catch (err) {
    console.error(
      "❌ Failed to fetch assets",
      err.response?.data || err.message
    );
    res.status(500).json({ error: "Failed to fetch assets" });
  }
});

// Start Server
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
