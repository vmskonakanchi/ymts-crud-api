import express from "express";
import mongoose from "mongoose";
import sqlite3 from "sqlite3";
import crypto from "crypto"; // for encrypting sensitive data
import cors from "cors";

const app = express();
const port = process.env.PORT || 3000;
const mongoURI =
  process.env.MONGO_URI || "mongodb://localhost:27017/dynamic-api";
const corsConfig = {
  origin: "*.ymtsindia.net",
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
};

const ALLOWED_TYPES = ["string", "number", "boolean", "array", "object"];

// SQLite Database Setup
const sqliteDb = new sqlite3.Database("db.sqlite");

sqliteDb.all(
  'CREATE TABLE IF NOT EXISTS "db_users" ( "database_name" TEXT, "username" TEXT, "password" TEXT )',
  (err) => {
    if (err) {
      console.error("Error creating database table", err);
    }
  }
);

// Middleware
app.use(express.json());
app.use(cors(corsConfig));

// genearate random key for encryption with 32 bytes
const key = crypto.randomBytes(16).toString("hex");

// Encryption Utilities
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || key; // Make sure to use a strong key
const IV_LENGTH = 16;

function encryptData(data: string) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(
    "aes-256-cbc",
    Buffer.from(ENCRYPTION_KEY),
    iv
  );
  let encrypted = cipher.update(data);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString("hex") + ":" + encrypted.toString("hex");
}

function decryptData(data: string) {
  const textParts = data.split(":");
  const iv = Buffer.from(textParts.shift()!, "hex");
  const encryptedText = Buffer.from(textParts.join(":"), "hex");
  const decipher = crypto.createDecipheriv(
    "aes-256-cbc",
    Buffer.from(ENCRYPTION_KEY),
    iv
  );
  let decrypted = decipher.update(encryptedText);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString();
}

// Utility to create MongoDB users and databases
async function createMongoDBUserAndDatabase(
  database: string,
  username: string,
  password: string
) {
  const createdDb = mongoose.connection.useDb(database);

  if (!createdDb) {
    throw new Error("Failed to get admin database");
  }

  await createdDb.db?.command({
    createUser: username,
    pwd: password,
    roles: [
      {
        role: "dbOwner",
        db: database,
      },
    ],
  });

  console.log(
    `Created MongoDB User ${username} with dbOwner role on ${database}`
  );
}

function handleSingleItemValidation(
  key: string,
  item: any,
  type: string
): string {
  const errors: string[] = [];
  if (type == "number") {
    if (isNaN(item.value)) {
      errors.push(`Value ${item.value} is not a number for ${key}`);
    }
    if (item.min && item.value < item.min) {
      errors.push(
        `Value ${item.value} is less than minimum value ${item.min} for ${key}`
      );
    }
    if (item.max && item.value > item.max) {
      errors.push(
        `Value ${item.value} is greater than maximum value ${item.max} for ${key}`
      );
    }

    if (item.pattern && !item.pattern.test(item.value)) {
      errors.push(
        `Value ${item.value} does not match pattern ${item.pattern} for ${key}`
      );
    }

    // if (item.enum && !item.enum.includes(item.value)) {
    //   errors.push(`Value ${item.value} is not in enum ${item.enum}`);
    // }
  } else if (type == "string") {
    if (item.required && !item.value) {
      errors.push(`Value is required for ${key}`);
    }

    if (item.min && item.value.length < item.min) {
      errors.push(
        `Value ${item.value} is less than minimum length ${item.min} for ${key}`
      );
    }

    if (item.max && item.value.length > item.max) {
      errors.push(
        `Value ${item.value} is greater than maximum length ${item.max} for ${key}`
      );
    }

    if (item.pattern && !item.pattern.test(item.value)) {
      errors.push(
        `Value ${item.value} does not match pattern ${item.pattern} for ${key}`
      );
    }

    // if (item.enum && !item.enum.includes(item.value)) {
    //   errors.push(`Value ${item.value} is not in enum ${item.enum}`);
    // }
  }

  return errors.join("\n");
}

// Initialize MongoDB Connection
mongoose
  .connect(mongoURI)
  .then(() => {
    app.listen(port, () => {
      console.log(`Dynamic API Server is running on port ${port}`);
    });
  })
  .catch((err) => {
    console.log(`Error connecting to MongoDB: ${err}`);
  });

// Initialize Route to Create Database and User
app.post("/api/v1/initialize", async (req, res) => {
  const { database, username, password, data } = req.body;

  // Validate input
  if (!database || !username || !password) {
    res.status(400).json({ msg: "Missing required fields" });
    return;
  }

  // Encrypt password before storing it in SQLite

  try {
    const encryptedPassword = encryptData(password);

    const existQuery = `SELECT database_name FROM db_users WHERE database_name = ?`;
    const existParams = [database];

    sqliteDb.all(existQuery, existParams, (err, rows) => {
      if (err) {
        return res
          .status(500)
          .json({ msg: "Error occurred during database check", details: err });
      }
      if (rows.length > 0) {
        return res.status(400).json({ msg: "Database already exists" });
      }
    });

    // Store the database, username, and encrypted password in SQLite
    const insertQuery = `INSERT INTO db_users (database_name, username, password) VALUES (?, ?, ?)`;
    const insertParams = [database, username, encryptedPassword];

    sqliteDb.run(insertQuery, insertParams, (err) => {
      if (err) {
        console.error(err);
        return res.status(500).json({
          msg: "Error occurred during database creation",
          details: err,
        });
      }
    });

    await createMongoDBUserAndDatabase(database, username, password);

    const db = mongoose.connection.useDb(database);

    // insert into settings collection
    const settingsCollection = db.collection("settings");
    await settingsCollection.insertOne(data);

    res.json({
      msg: "Database and User created successfully",
    });
  } catch (error) {
    res
      .status(500)
      .json({ msg: "Error occurred during initialization", details: error });
  }
});

app.post("/api/v1/:database/:collection", async (req, res) => {
  try {
    const { database, collection } = req.params;
    const { data } = req.body;

    if (!data) {
      res.status(400).json({ error: "Missing data to insert" });
      return;
    }

    let errors: string[] = [];

    // run the validatons logic here
    for (const item of data) {
      for (const key in item) {
        if (!item[key].type) {
          errors.push(`Type is required for ${key}`);
          break;
        }
        if (!ALLOWED_TYPES.includes(item[key].type)) {
          errors.push(`Type ${item[key].type} is not allowed for ${key}`);
          break;
        }
        const singleItemError = handleSingleItemValidation(
          key,
          item[key],
          item[key].type
        );
        if (singleItemError) {
          errors.push(singleItemError);
        }
      }
    }

    if (errors.length > 0) {
      res.status(400).json({ errors });
      return;
    }

    // Switching the database
    const db = mongoose.connection.useDb(database);

    const refinedData = data.map((item: any) => {
      const newItem: any = {};
      for (const key in item) {
        newItem[key] = item[key].value;
      }
      return newItem;
    });

    const result = await db.collection(collection).insertMany(refinedData);

    res.json({ message: "Data inserted successfully", result });
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .json({ error: "Error occurred during data insertion", details: error });
  }
});

app.post("/api/v1/:database/:collection/login", async (req, res) => {
  try {
    const { database, collection } = req.params;
    const { data } = req.body;

    if (!data) {
      res.status(400).json({ error: "Missing data to check" });
      return;
    }

    let errors: string[] = [];

    // run the validatons logic here
    for (const item of data) {
      for (const key in item) {
        if (!item[key].type) {
          errors.push(`Type is required for ${key}`);
          break;
        }
        if (!ALLOWED_TYPES.includes(item[key].type)) {
          errors.push(`Type ${item[key].type} is not allowed for ${key}`);
          break;
        }
        const singleItemError = handleSingleItemValidation(
          key,
          item[key],
          item[key].type
        );
        if (singleItemError) {
          errors.push(singleItemError);
        }
      }
    }

    if (errors.length > 0) {
      res.status(400).json({ errors });
      return;
    }

    // Switching the database
    const db = mongoose.connection.useDb(database);

    const refinedData = data.map((item: any) => {
      const newItem: any = {};
      for (const key in item) {
        newItem[key] = item[key].value;
      }
      return newItem;
    });

    const result = await db.collection(collection).findOne(refinedData[0]);

    if (!result) {
      res
        .status(400)
        .json({ error: `${refinedData[0]} in ${collection} not found` });
      return;
    }

    // TODO : Implement JWT token generation and return it in response

    res.json({ message: "Data Found successfully", result });
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .json({ error: "Error occurred during data insertion", details: error });
  }
});

// Error Handling Middleware
app.use((err: any, req: any, res: any, next: any) => {
  console.error(err.stack);
  res.status(500).send({
    error: "An unexpected error occurred",
    message: err.message,
  });
});

function handleExit() {
  mongoose.connection.close();
  sqliteDb.close();
}

process.on("SIGINT", handleExit);
process.on("SIGTERM", handleExit);
