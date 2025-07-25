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
        client_id: "18466bdc-9274-46aa-b6f9-66e281ab4b83",
        client_secret:
          "OS?p!nHpoIuZsd!%tm@RDv~7X!uev0(BkleCoWNHL6gLa94I)k7OYt@nv?REo96M",
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

app.post("/submit", async (req, res) => {
  const { asset, username, newPassword } = req.body;

  if (!asset || !username || !newPassword) {
    return res.status(400).send("Missing fields");
  }

  try {
    // Step 1: Get Token
    const tokenResponse = await axios.post(
      "https://cloud.uipath.com/identity_/connect/token",
      new URLSearchParams({
        grant_type: "client_credentials",
        client_id: "18466bdc-9274-46aa-b6f9-66e281ab4b83",
        client_secret:
          "OS?p!nHpoIuZsd!%tm@RDv~7X!uev0(BkleCoWNHL6gLa94I)k7OYt@nv?REo96M",
        scope: "OR.Assets.Write OR.Folders.Read",
      }),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );

    const accessToken = tokenResponse.data.access_token;

    // Step 2: Get all assets to find selected asset's ID
    const assetsResponse = await axios.get(
      "https://cloud.uipath.com/faizanorg/DefaultTenant/odata/Assets",
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "X-UIPATH-OrganizationUnitId": "98475",
        },
      }
    );

    const selectedAsset = assetsResponse.data.value.find(
      (a) => a.Name === asset && a.Type === "Credential"
    );

    if (!selectedAsset) {
      return res.status(404).send("Asset not found or not a Credential type");
    }

    // Step 3: Update the asset
    await axios.put(
      `https://cloud.uipath.com/faizanorg/DefaultTenant/odata/Assets(${selectedAsset.Id})`,
      {
        Name: selectedAsset.Name,
        ValueScope: selectedAsset.ValueScope || "PerRobot",
        CredentialUsername: username,
        CredentialPassword: newPassword,
        Description: "Updated via web form",
        Type: "Credential",
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "X-UIPATH-OrganizationUnitId": "98475",
        },
      }
    );

    res.send("✅ Asset updated successfully");
  } catch (err) {
    console.error(
      "❌ Error updating asset:",
      err.response?.data || err.message
    );
    res.status(500).send("Server error while updating asset");
  }
});

// Start Server
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
