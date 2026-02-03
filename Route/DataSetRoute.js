import express from "express";
import { isAdmin, requireSignIn } from "./../middleware/UserMiddleware.js";
import { addDataSet, upload } from "../Controller.js/DataSetController.js";

const router = express.Router();

router.post(
  "/add",
  requireSignIn,
  isAdmin,
  upload.fields([
    { name: "file", maxCount: 1 },
    { name: "images", maxCount: 5 },
  ]),
  addDataSet
);

export default router;
