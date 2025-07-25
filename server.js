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

// FOR AES-265 Authentication
const ENCRYPTION_KEY = crypto
  .createHash("sha256")
  .update("HPCL_Encryption_2025_Secret")
  .digest(); // 32 chars
const IV = Buffer.from("hpcl.com@1234567"); // 16 chars

// function to encrypt the values using the key and initial vector
function encrypt(text, key, iv) {
  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
  let encrypted = cipher.update(text, "utf8", "base64");
  encrypted += cipher.final("base64");
  return encrypted;
}

// Form submission endpoint
app.post("/submit", async (req, res) => {
  const { employeeId, asset, username, newPassword } = req.body;

  console.log("📥 Form submitted. Sending to UiPath Queue...");

  try {
    // 1. Get OAuth Token
    const tokenResponse = await axios.post(
      "https://cloud.uipath.com/identity_/connect/token",
      new URLSearchParams({
        grant_type: "client_credentials",
        client_id: "aa38df26-cc6c-4e12-b2f8-4eed9c7574f0",
        client_secret: "vlF_BIfY0VCCBDzM",
        scope: "OR.Queues.Write OR.Folders.Read",
      }),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    const accessToken = tokenResponse.data.access_token;

    // 2. Push to UiPath Queue
    const queueResponse = await axios.post(
      "https://cloud.uipath.com/faizanorg/DefaultTenant/odata/Queues/UiPathODataSvc.AddQueueItem",
      {
        itemData: {
          Name: "User Credentials Update Queue",
          Priority: "Normal",
          Reference: `${employeeId} request to update ${asset}`,
          SpecificContent: {
            DateTime: new Date().toISOString(),
            AssetToUpdate: asset,
            Username: encrypt(username, ENCRYPTION_KEY, IV),
            Password: encrypt(newPassword, ENCRYPTION_KEY, IV),
            EmployeeID: employeeId,
          },
        },
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "X-UIPATH-OrganizationUnitId": "98475",
        },
      }
    );

    console.log("✅ Queue Item Added Successfully!");

    res.send("✅ Queue Item Added Successfully!");
  } catch (error) {
    console.error(
      "❌ Error while submitting:",
      error.response?.data || error.message
    );
    res.status(500).send(error.response?.data || error.message);
  }
});

// Start Server
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
