// require("dotenv").config(); // optional, if you're using a .env file
const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
const multer = require("multer");
const path = require("path");

const upload = multer({ storage: multer.memoryStorage() });
const app = express();

const PORT = process.env.PORT || 3000;
const ORCH_BASE =
  process.env.UIPATH_ORCH_BASE ||
  "https://cloud.uipath.com/faizanorg/DefaultTenant";
const TENANT_FOLDER_ID = process.env.UIPATH_FOLDER_ID || "98475";
const CLIENT_ID = process.env.CLIENT_ID || process.env.UIPATH_CLIENT_ID;
const CLIENT_SECRET =
  process.env.CLIENT_SECRET || process.env.UIPATH_CLIENT_SECRET;
const SCOPES =
  "OR.Administration OR.Administration.Read OR.Administration.Write OR.Assets OR.Assets.Read OR.Assets.Write OR.Folders OR.Folders.Read OR.Folders.Write OR.Queues OR.Queues.Read OR.Queues.Write";

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.warn("WARNING: CLIENT_ID or CLIENT_SECRET not set in env.");
}

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));

// Get Access Token
// Simple token cache
// let cachedToken = null;
// let tokenExpiry = 0;

// async function getAccessToken() {
//   const now = Date.now();
//   if (cachedToken && now < tokenExpiry - 5000) {
//     return cachedToken;
//   }

//   const tokenUrl = `${ORCH_BASE.replace(/\/+$/, "")}/identity_/connect/token`;
//   const resp = await axios.post(
//     tokenUrl,
//     new URLSearchParams({
//       grant_type: "client_credentials",
//       client_id: CLIENT_ID,
//       client_secret: CLIENT_SECRET,
//       scope: SCOPES,
//     }),
//     { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
//   );

//   const data = resp.data;
//   cachedToken = data.access_token;
//   tokenExpiry = Date.now() + (data.expires_in || 3600) * 1000;
//   return cachedToken;
// }

async function getBucketKey(bucketName, accessToken) {
  const filter = `$filter=Name eq '${bucketName.replace(/'/g, "''")}'`;
  const url = `${ORCH_BASE}/odata/Buckets?${filter}`;
  const resp = await axios.get(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "X-UIPATH-OrganizationUnitId": TENANT_FOLDER_ID,
    },
  });
  const buckets = resp.data.value;
  if (!buckets || buckets.length === 0) {
    throw new Error(`Storage bucket '${bucketName}' not found`);
  }
  return buckets[0].Key;
}

// Getting asset names for the dropdown
app.get("/assets", async (req, res) => {
  try {
    // 1. Get Access Token
    const tokenResponse = await axios.post(
      "https://cloud.uipath.com/identity_/connect/token",
      new URLSearchParams({
        grant_type: "client_credentials",
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        scope: SCOPES,
      }),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );

    console.log("Token response data:", tokenResponse.data);
    const accessToken = tokenResponse.data.access_token;
    if (!accessToken) {
      return res.status(500).json({ error: "Did not receive access token" });
    }

    // 2. Get Assets
    const assetsResponse = await axios.get(`${ORCH_BASE}/odata/Assets`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "X-UIPATH-OrganizationUnitId": TENANT_FOLDER_ID,
      },
    });

    const assetNames = assetsResponse.data.value.map((asset) => asset.Name);
    res.json(assetNames);
  } catch (err) {
    console.error("❌ Failed to fetch assets", {
      status: err.response?.status,
      data: err.response?.data,
      message: err.message,
    });
    res.status(500).json({
      error: "Failed to fetch assets",
      details: err.response?.data || err.message,
    });
  }
});

// Upload-to-bucket route (no query in path; bucket passed as ?bucket=)
app.post("/upload-to-bucket", upload.single("file"), async (req, res) => {
  const bucketName = req.query.bucket;
  if (!bucketName) {
    return res.status(400).json({ error: "Missing ?bucket= parameter" });
  }
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }

  try {
    // 1. Get Access Token
    const tokenResponse = await axios.post(
      "https://cloud.uipath.com/identity_/connect/token",
      new URLSearchParams({
        grant_type: "client_credentials",
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        scope: SCOPES,
      }),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );

    console.log("Token response data:", tokenResponse.data);
    const accessToken = tokenResponse.data.access_token;
    if (!accessToken) {
      return res.status(500).json({ error: "Did not receive access token" });
    }

    // Resolve bucket key from name
    const bucketKey = await getBucketKey(bucketName, accessToken);
    console.log("Got the bucket key: ", bucketKey);

    // 2. Get signed PUT URI for the file
    const fileName = req.file.originalname;
    const contentType = req.file.mimetype || "application/octet-stream";

    const writeUriResp = await axios.get(
      `${ORCH_BASE}/odata/Buckets(${bucketKey})/UiPath.Server.Configuration.OData.GetWriteUri`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "X-UIPATH-OrganizationUnitId": TENANT_FOLDER_ID,
        },
        params: {
          path: fileName,
          contentType,
        },
      }
    );

    const { Uri: writeUri, Verb } = writeUriResp.data;
    if (!writeUri || !Verb) throw new Error("Invalid write URI response");

    // 3. Upload binary to the write URI
    await axios.put({
      url: writeUri,
      headers: {
        "x-ms-blob-type": "BlockBlob", // ✅ Required by Azure Blob
        "Content-Type": contentType,
        "Content-Length": req.file.buffer.length,
      },
      data: req.file.buffer,
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    });

    // 4. (Optional) Get read URI for download
    // const readUriResp = await axios.get(
    //   `${ORCH_BASE}/odata/Buckets(${bucketKey})/UiPath.Server.Configuration.OData.GetReadUri`,
    //   {
    //     headers: {
    //       Authorization: `Bearer ${accessToken}`,
    //       "X-UIPATH-OrganizationUnitId": TENANT_FOLDER_ID,
    //     },
    //     params: {
    //       path: fileName,
    //       expiryInMinutes: 60,
    //     },
    //   }
    // );

    // const { Uri: readUri } = readUriResp.data;
    // if (!readUri) throw new Error("Invalid read URI response");

    res.json({
      message: `✅ File '${fileName}' uploaded to bucket '${bucketName}' successfully.`,
      downloadUrl: readUri,
    });
  } catch (err) {
    console.error("❌ Upload failed", err.response?.data || err.message);
    const details =
      err.response?.data?.error?.message ||
      err.response?.data ||
      err.message ||
      "Unknown error";
    res.status(500).json({ error: "Upload failed", details });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
