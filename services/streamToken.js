import { StreamClient } from "@stream-io/node-sdk";
import dotenv from "dotenv";
dotenv.config();

export const client = new StreamClient(
  process.env.STREAM_API_KEY,
  process.env.STREAM_API_SECRET,
  process.env.STREAM_APP_ID
);

// Middleware style token generator
export const generateTokenMiddleware = (req, res, next) => {
  const { caller } = req.body; // ya userId jo call start karega
  if (!caller) return res.status(400).json({ message: "caller is required" });

  try {
    const token = client.createToken(caller);
    // Attach token and public stream info so frontend can initialize client
    req.token = token; // token req object me attach kar diya
    req.streamApiKey = process.env.STREAM_API_KEY || null;
    req.streamAppId = process.env.STREAM_APP_ID || null;
    next();
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Token generation failed" });
  }
};
